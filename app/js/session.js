// 시험 세션: 병실 배정, SOAP 흐름(문진 채팅 → 검사 → ICF 평가 → 중재 선택), 채점
window.Session = (() => {
  const { h, $, shuffle, pick, toast, circled } = U;
  const FLOOR_NAMES = { 1: '임상의사결정', 2: '운동치료', 3: '소아물리치료', 4: '물리적인자치료' };
  const S = { active: false, cfg: null, rooms: {}, answers: [], usedQ: new Set(), usedCase: new Set(), startedAt: 0, round: {}, currentRoom: null };

  function start(cfg) { S.active = true; S.cfg = cfg; S.rooms = {}; S.answers = []; S.usedQ = new Set(); S.usedCase = new Set(); S.startedAt = Date.now(); S.round = {}; cfg.floors.forEach(f => assign(f)); }
  function end() { S.active = false; S.currentRoom = null; }
  const qKey = (c, i) => c.id + '#' + i;
  function assign(floor) {
    const pool = Store.casesForFloor(floor).map(c => ({ ...c, floor }));
    const hasUnused = c => c.Q.some((q, i) => !S.usedQ.has(qKey(c, i)));
    const fresh = pool.filter(c => !S.usedCase.has(c.id) && hasUnused(c));
    const partial = pool.filter(c => S.usedCase.has(c.id) && hasUnused(c));
    let chosen = pick(fresh, 5);
    if (chosen.length < 5) chosen = chosen.concat(pick(partial, 5 - chosen.length));
    if (chosen.length < 5) chosen = chosen.concat(pick(pool.filter(c => !chosen.includes(c)), 5 - chosen.length));
    S.round[floor] = (S.round[floor] || 0) + 1;
    S.rooms[floor] = chosen.map(c => { S.usedCase.add(c.id); return { case: c, done: false, questions: pickQuestions(c), chatOpened: new Set(), testsDone: new Set(), step: 'S' }; });
  }
  function pickQuestions(c) {
    const list = step => c.Q.map((q, i) => ({ q, i })).filter(o => o.q.step === step);
    const unused = step => list(step).filter(o => !S.usedQ.has(qKey(c, o.i)));
    const a = pick(unused('A'), 1)[0] || pick(list('A'), 1)[0];
    const p = pick(unused('P'), 1)[0] || pick(list('P'), 1)[0];
    const qs = [a, p].filter(Boolean); qs.forEach(o => S.usedQ.add(qKey(c, o.i)));
    return qs.map(o => ({ idx: o.i, q: o.q, order: shuffle([0, 1, 2, 3, 4]), chosen: null, correct: null }));
  }
  const progress = () => ({ answered: S.answers.length, correct: S.answers.filter(a => a.correct).length, target: S.cfg ? S.cfg.target : 0 });
  function roomInfo(floor, i) {
    const r = S.rooms[floor] && S.rooms[floor][i]; if (!r) return { status: 'empty' };
    const p = r.case.patient; return { label: `${p.name} (${p.ageText || p.age + '세'}, ${p.sex})`, status: r.done ? 'done' : 'ready', pediatric: !!p.pediatric };
  }
  const floorDone = floor => (S.rooms[floor] || []).every(r => r.done);
  const allDone = () => S.cfg.floors.every(floorDone);

  function open(floor, i, onClose) {
    const room = S.rooms[floor][i]; S.currentRoom = room; const c = room.case, p = c.patient;
    const panel = $('#case-panel'); panel.innerHTML = ''; panel.classList.add('open'); document.body.classList.add('panel-open');
    const close = () => { panel.classList.remove('open'); document.body.classList.remove('panel-open'); S.currentRoom = null; if (onClose) onClose(room); };
    const patientBox = h('div', { class: 'patient-box' }); const pt = Patient.render(patientBox, p);
    const steps = ['S', 'O', 'A', 'P']; let step = room.step || 'S';
    const qA = room.questions.find(x => x.q.step === 'A'), qP = room.questions.find(x => x.q.step === 'P');
    const tabBtns = {};
    const tabs = h('div', { class: 'soap-tabs' }, steps.map(s => tabBtns[s] = h('button', { class: 'soap-tab', onClick: () => { if (canGo(s)) { step = s; room.step = s; renderStep(); } else toast('평가(A) 문항에 먼저 답해야 계획(P)으로 넘어갈 수 있어요.', 'info'); } }, h('b', { text: s }), h('span', { text: { S: '주관적', O: '객관적', A: '평가', P: '계획' }[s] }))));
    const body = h('div', { class: 'soap-body' });
    const header = h('div', { class: 'panel-head' },
      h('div', {}, h('div', { class: 'room-tag' }, `${floor}0${i + 1}호 · ${FLOOR_NAMES[floor]}`), h('h2', { text: `${p.name} · ${p.ageText || p.age + '세'} · ${p.sex}` }), h('div', { class: 'muted small' }, p.job + (p.informant ? ` · 정보 제공: ${p.informant}` : ''))),
      h('button', { class: 'icon-btn', 'aria-label': '닫기', onClick: () => { if (!room.done && S.cfg.mode !== 'practice' && (qA && qA.chosen == null || qP && qP.chosen == null)) { U.confirm('치료를 중단하고 복도로 나갈까요? (진행 상황은 유지되며 다시 들어올 수 있어요)').then(ok => { if (ok) close(); }); } else close(); } }, '✕'));
    U.append(panel, header, patientBox, tabs, body);
    function canGo(s) { return s !== 'P' || !qA || qA.chosen != null; }
    function renderStep() {
      steps.forEach(s => { tabBtns[s].classList.toggle('active', s === step); });
      tabBtns.S.classList.toggle('done', room.chatOpened.size >= 3); tabBtns.O.classList.toggle('done', room.testsDone.size >= c.O.length);
      tabBtns.A.classList.toggle('done', !!(qA && qA.chosen != null)); tabBtns.P.classList.toggle('done', !!(qP && qP.chosen != null));
      body.innerHTML = ''; ({ S: renderS, O: renderO, A: renderA, P: renderP })[step](); panel.scrollTop = 0;
    }
    const nextBtn = (label, s) => h('button', { class: 'btn primary block mt', onClick: () => { step = s; room.step = s; renderStep(); } }, label);
    function renderS() {
      const chat = h('div', { class: 'chat' }); const chips = h('div', { class: 'chips' });
      const addBubble = (who, text) => { U.append(chat, h('div', { class: 'bubble-row ' + who }, who === 'pt' ? h('div', { class: 'avatar' }, p.pediatric ? '🧒' : (p.sex === '여' ? '👩' : '👨')) : null, h('div', { class: 'bubble ' + who }, text))); chat.scrollTop = chat.scrollHeight; };
      addBubble('pt', c.S.chief);
      c.S.chat.forEach(([q, a], k) => {
        const chip = h('button', { class: 'chip', onClick: () => { chip.disabled = true; addBubble('me', q); setTimeout(() => addBubble('pt', a), 350); room.chatOpened.add(k); tabBtns.S.classList.toggle('done', room.chatOpened.size >= 3); } }, q);
        if (room.chatOpened.has(k)) { chip.disabled = true; addBubble('me', q); addBubble('pt', a); }
        U.append(chips, chip);
      });
      U.append(body, h('p', { class: 'guide' }, `💬 ${p.informant ? p.informant + '에게' : '환자에게'} 질문해 보세요. 질문 칩을 누르면 대답합니다.`), chat, chips, nextBtn('다음: 객관적 평가(O) →', 'O'));
    }
    function renderO() {
      const list = h('div', { class: 'tests' });
      c.O.forEach(([t, r], k) => {
        const res = h('div', { class: 'test-result' }, room.testsDone.has(k) ? r : '');
        const btn = h('button', { class: 'btn small', disabled: room.testsDone.has(k), onClick: () => { btn.disabled = true; btn.textContent = '시행 중…'; setTimeout(() => { res.textContent = r; btn.textContent = '완료'; room.testsDone.add(k); tabBtns.O.classList.toggle('done', room.testsDone.size >= c.O.length); }, 350); } }, room.testsDone.has(k) ? '완료' : '검사 시행');
        U.append(list, h('div', { class: 'test-card' }, h('div', { class: 'test-name' }, '🩺 ' + t), res, btn));
      });
      U.append(body, h('p', { class: 'guide' }, '🩺 필요한 검사를 시행하고 결과를 확인하세요.'), h('div', { class: 'row-end' }, h('button', { class: 'btn ghost small', onClick: () => list.querySelectorAll('button:not(:disabled)').forEach(b => b.click()) }, '모두 시행')), list, nextBtn('다음: 평가(A) →', 'A'));
    }
    function icfTable() {
      const rows = ['신체 구조와 기능', '활동', '참여'];
      return h('table', { class: 'icf' }, h('thead', {}, h('tr', {}, h('th', { text: 'ICF 단계' }), h('th', { text: '현재 상태' }), h('th', { text: '목표' }))),
        h('tbody', {}, c.A.icf.map((r, k) => h('tr', {}, h('td', { text: rows[k] }), h('td', { text: r[0] }), h('td', { text: r[1] })))));
    }
    function renderA() {
      U.append(body, h('p', { class: 'guide' }, '📋 평가와 목표 (ICF 기반)'), h('div', { class: 'stage-chip' }, '단계: ' + c.A.stage), icfTable());
      if (qA) { U.append(body, questionCard(qA, 'A')); if (qA.chosen != null) U.append(body, h('div', { class: 'impression' }, h('b', { text: '임상 인상' }), h('p', { text: c.A.impression })), nextBtn('다음: 계획·중재(P) →', 'P')); }
      else U.append(body, nextBtn('다음: 계획·중재(P) →', 'P'));
    }
    function renderP() {
      U.append(body, h('p', { class: 'guide' }, '🧰 중재를 선택하세요.' + (qP && qP.q.icons ? ' 선택한 장비가 환자에게 적용됩니다.' : '')));
      if (qP) { U.append(body, questionCard(qP, 'P')); if (qP.chosen != null) afterP(); } else afterP();
    }
    function afterP() {
      const ok = qP ? qP.correct : true;
      U.append(body, h('div', { class: 'plan-box ' + (ok ? 'ok' : 'bad') }, h('b', { text: '치료 계획(P)' }), h('p', { text: c.P.summary }),
        h('div', { class: 'eq-list' }, (c.P.equipment || []).map(id => h('span', { class: 'eq-pill' }, ((PT_EQUIP[id] && PT_EQUIP[id].emoji) || '') + ' ' + ((PT_EQUIP[id] && PT_EQUIP[id].name) || id))))),
        h('button', { class: 'btn primary block mt', onClick: () => { room.done = true; close(); } }, '치료 완료 → 복도로 나가기'));
    }
    function questionCard(qo, stepName) {
      const q = qo.q; const card = h('div', { class: 'qcard' }); const n = S.answers.length + 1;
      U.append(card, h('div', { class: 'q-meta' }, h('span', { class: 'tag' }, stepName === 'A' ? '평가·의사결정' : '중재 선택'), h('span', { class: 'tag soft' }, q.tag || ''), h('span', { class: 'muted small' }, qo.chosen != null ? '답변 완료' : `문항 ${n}${isFinite(S.cfg.target) ? ' / ' + S.cfg.target : ''}`)), h('div', { class: 'q-stem' }, q.stem));
      const choices = h('div', { class: 'choices' });
      qo.order.forEach((orig, k) => {
        const icon = q.icons ? ((PT_EQUIP[q.icons[orig]] && PT_EQUIP[q.icons[orig]].emoji) || '') : '';
        const btn = h('button', { class: 'choice', onClick: () => answer(qo, orig) }, h('span', { class: 'marker' }, circled[k]), icon ? h('span', { class: 'choice-icon' }, icon) : null, h('span', { class: 'choice-text' }, q.choices[orig]));
        if (qo.chosen != null) { btn.disabled = true; if (orig === q.answer) btn.classList.add(qo.chosen === orig ? 'correct' : 'reveal'); if (orig === qo.chosen && orig !== q.answer) btn.classList.add('wrong'); }
        U.append(choices, btn);
      });
      U.append(card, choices); if (qo.chosen != null) U.append(card, feedback(qo));
      return card;
    }
    function feedback(qo) {
      const q = qo.q;
      const box = h('div', { class: 'feedback ' + (qo.correct ? 'ok' : 'bad') }, h('div', { class: 'fb-title' }, qo.correct ? '⭕ 정답입니다!' : `❌ 오답입니다. 정답: ${circled[qo.order.indexOf(q.answer)]} ${q.choices[q.answer]}`), h('p', { text: q.expl }));
      if (Store.geminiAvailable()) {
        const out = h('div', { class: 'ai-out' });
        U.append(box, h('button', { class: 'btn ghost small', onClick: async e => { e.currentTarget.disabled = true; out.textContent = '🤖 AI 튜터가 생각 중…'; try { out.textContent = await Gemini.explain({ case: c, question: q, chosen: qo.chosen }); } catch (err) { out.textContent = 'AI 오류: ' + err.message; } } }, '🤖 AI 튜터에게 더 자세히 묻기'), out);
      }
      return box;
    }
    function answer(qo, orig) {
      if (qo.chosen != null) return; qo.chosen = orig; qo.correct = orig === qo.q.answer;
      S.answers.push({ floor, caseId: c.id, caseTitle: c.title, qIndex: qo.idx, step: qo.q.step, stem: qo.q.stem, chosen: qo.q.choices[orig], answer: qo.q.choices[qo.q.answer], correct: qo.correct, expl: qo.q.expl, at: Date.now() });
      if (qo.q.step === 'P') { const em = qo.q.icons ? (PT_EQUIP[qo.q.icons[orig]] && PT_EQUIP[qo.q.icons[orig]].emoji) : null; pt.clearEquipment(); pt.place(em || (qo.correct ? '✅' : '❌'), qo.correct ? '적절한 중재' : '부적절', qo.correct); }
      const per = isFinite(S.cfg.target) ? (100 / S.cfg.target).toFixed(1) : null;
      toast(qo.correct ? ('정답!' + (per ? ' +' + per + '점' : '')) : '오답입니다. 해설을 확인하세요.', qo.correct ? 'ok' : 'err');
      if (!qo.correct && navigator.vibrate) navigator.vibrate(80);
      App.updateHUD(); renderStep();
    }
    renderStep();
  }
  function result() {
    const total = S.answers.length, correct = S.answers.filter(a => a.correct).length;
    const score = total ? Math.round(correct / total * 1000) / 10 : 0; const passScore = Store.settings.passScore || 70;
    const byFloor = {}; S.answers.forEach(a => { byFloor[a.floor] = byFloor[a.floor] || { total: 0, correct: 0 }; byFloor[a.floor].total++; if (a.correct) byFloor[a.floor].correct++; });
    return { id: U.uid(), studentId: S.cfg.user.studentId, name: S.cfg.user.name, mode: S.cfg.mode, floors: S.cfg.floors.join('+'), date: new Date().toISOString(), total, correct, score, pass: score >= passScore, passScore, durationSec: Math.round((Date.now() - S.startedAt) / 1000), byFloor, attempt: S.cfg.attempt || 1,
      wrong: S.answers.filter(a => !a.correct).map(a => ({ floor: a.floor, caseTitle: a.caseTitle, stem: a.stem, chosen: a.chosen, answer: a.answer, expl: a.expl })) };
  }
  return { start, end, assign, open, progress, roomInfo, floorDone, allDone, result, get active() { return S.active; }, get cfg() { return S.cfg; }, get state() { return S; }, FLOOR_NAMES };
})();