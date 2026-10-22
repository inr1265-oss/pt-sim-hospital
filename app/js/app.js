// 앱 셸: 화면 전환, 홈(내 과목·모드 선택), HUD, 층 이동, 결과(AI 코치), 내 기록
window.App = (() => {
  const { h, $, $$, toast } = U;
  const FLOOR = {
    1: { icon: '🩺', name: '임상의사결정 문진실', short: '임상의사결정', desc: '문진(S) → 검사(O) → 평가(A) → 의뢰·계획(P). 적색신호와 감별 판단' },
    2: { icon: '🏃', name: '운동치료실', short: '운동치료', desc: '정형·신경계 재활 운동 처방과 단계별 진행 기준' },
    3: { icon: '🧒', name: '소아물리치료실', short: '소아물리치료', desc: '뇌성마비 유형·증후군·발달지연 아동의 평가와 중재' },
    4: { icon: '⚡', name: '물리적인자치료실', short: '물리적인자치료', desc: '전기·광선·열·수치료의 선택, 매개변수, 금기' }
  };
  const MODE = { full: '종합 순회', floor: '층별', practice: '연습' };
  const TINT = { 1: '#E3F3EA', 2: '#E1EEFF', 3: '#FDE8F1', 4: '#FFF3DD' };
  let user = null, curFloor = 1, engine = null, view3d = false;
  const eng = () => Hospital3D;

  async function boot() {
    await Store.init();
    [1, 2, 3, 4].forEach(f => (PT_CASES[f] || []).forEach(c => c.floor = f));
    if (Admin.loadHandle) Admin.loadHandle();
    view3d = true;
    document.title = Store.settings.appName; $('#brand-name').textContent = Store.settings.appName;
    $$('[data-nav]').forEach(b => b.addEventListener('click', () => nav(b.dataset.nav)));
    $$('.dpad button').forEach(b => b.addEventListener('pointerdown', e => { e.preventDefault(); const d = b.dataset.dir; if (d === 'ok') window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); else eng().move(d); }));
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
    // VR 스테이지 도구
    const helpBtn = $('#vr-help'); if (helpBtn) helpBtn.onclick = showHelp;
    const shotBtn = $('#vr-shot'); if (shotBtn) shotBtn.onclick = () => { const url = engine && engine.snapshot ? engine.snapshot() : null; if (!url) return toast('캡처할 화면이 없어요.', 'err'); const a = h('a', { href: url, download: `PT_sim_${Date.now()}.png` }); document.body.append(a); a.click(); a.remove(); toast('화면을 저장했어요.', 'ok'); };
    const micBtn = $('#vr-mic'); if (micBtn) micBtn.onclick = () => { const inp = [...document.querySelectorAll('#case-panel .ask-row input')].find(i => i.offsetParent); if (!inp) return toast('차트를 열고 문진(S) 또는 검사(O) 단계에서 사용하세요.', 'info'); if (!U.speechOK()) return toast('이 브라우저는 음성 인식을 지원하지 않아요 (Chrome/Edge 권장).', 'err'); U.listen(txt => { inp.value = txt; inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); }, on => micBtn.classList.toggle('rec', on)); };
    const s = Store.getSession(); if (s) { user = s; show('home'); } else show('auth');
  }
  function nav(id) { if (id === 'hospital' && !Session.active) { toast('홈에서 평가 모드를 먼저 선택하세요.', 'info'); return show('home'); } if (id !== 'admin' && !user) return show('auth'); show(id); }
  function show(id) {
    $$('.screen').forEach(s => s.classList.toggle('active', s.id === 's-' + id));
    $$('[data-nav]').forEach(b => b.classList.toggle('active', b.dataset.nav === id));
    document.body.dataset.screen = id;
    const prof = $('#profile'); prof.innerHTML = '';
    if (user && id !== 'auth' && id !== 'admin') U.append(prof, h('span', { class: 'chip-user' }, `${user.name} · ${user.studentId}`), h('button', { class: 'btn ghost small', onClick: logout }, '로그아웃'));
    if (id === 'auth') Auth.render($('#s-auth'));
    if (id === 'home') renderHome();
    if (id === 'admin') Admin.render($('#s-admin'));
    if (id === 'records') renderRecords();
    if (id === 'hospital') setTimeout(() => eng().resize(), 0);
    window.scrollTo(0, 0);
  }
  async function logout() {
    if (Session.active && !(await U.confirm('진행 중인 평가가 있습니다. 로그아웃하면 진행 상황이 사라집니다. 계속할까요?'))) return;
    Session.end(); user = null; Auth.logout();
  }
  function onLogin(u) { user = u; show('home'); toast(`${u.name} 님, 환영합니다!`, 'ok'); }

  // ---- 내 과목(층) 선택: 학생별로 이 브라우저에 기억 ----
  const prefKey = () => 'subject:' + (user ? user.studentId : 'anon');
  const getSubject = () => Number(Store.getPref(prefKey(), 0)) || 0;
  const setSubject = f => { Store.setPref(prefKey(), f); renderHome(); };

  async function renderHome() {
    const el = $('#s-home'); el.innerHTML = '';
    const target = Store.settings.questionTarget || 40, passScore = Store.settings.passScore || 70;
    const my = (await Store.getResults(user.studentId)).filter(r => r.mode !== 'practice').sort((a, b) => b.date.localeCompare(a.date));
    const best = my.length ? Math.max(...my.map(r => r.score)) : null;
    const subject = getSubject();
    const st = PTProgress.stats(my, { passScore });
    const statusLine = st.attempts ? h('div', { class: 'hero-status', onClick: () => show('records') }, h('span', { class: 'status-badge ' + st.levelCls }, st.level), h('span', {}, st.diagnosis.split('. ')[0] + '.'), h('span', { class: 'hero-link' }, '학업 상태 보기 →')) : null;
    const modeCard = (title, desc, icon, onClick, badge, tint) => h('button', { class: 'card mode', onClick }, h('div', { class: 'mode-icon', style: tint ? { background: tint } : null }, icon), h('div', { class: 'mode-body' }, h('b', { text: title }), h('div', { class: 'muted small', text: desc })), badge ? h('span', { class: 'tag' }, badge) : null);
    const p = Session.active ? Session.progress() : null;
    const ai = Store.geminiAvailable();
    const subjectBar = h('div', { class: 'subject-bar' }, h('span', { class: 'lbl' }, '내 과목'),
      [1, 2, 3, 4].map(f => h('button', { class: 'subj' + (subject === f ? ' active' : ''), onClick: () => setSubject(f) }, `${FLOOR[f].icon} ${FLOOR[f].short}`)),
      h('button', { class: 'subj' + (subject === 0 ? ' active' : ''), onClick: () => setSubject(0) }, '전체'));
    const avatarBar = h('div', { class: 'subject-bar' }, h('span', { class: 'lbl' }, '내 치료사 캐릭터'), ['여', '남'].map(v => h('button', { class: 'subj' + (avatarSex() === v ? ' active' : ''), onClick: () => setAvatarSex(v) }, v === '여' ? '👩‍⚕️ 여자 치료사' : '👨‍⚕️ 남자 치료사')), h('span', { class: 'tiny muted' }, playerInfo().glb ? '외부 3D 아바타 사용 중' : '병원에서 내 이름표를 단 캐릭터로 보여요'));
    const quick = subject ? h('div', { class: 'card quick' },
      h('div', {}, h('div', { class: 'q-title' }, `${FLOOR[subject].icon} ${subject}F ${FLOOR[subject].name}`), h('div', { class: 'muted small' }, FLOOR[subject].desc), h('div', { class: 'tiny muted' }, `케이스 ${Store.casesForFloor(subject).length}개 · 평가는 ${target}문항, 연습은 무제한`)),
      h('div', { class: 'q-actions' }, h('button', { class: 'btn primary', onClick: () => startMode('floor', subject) }, `📝 평가 시작`), h('button', { class: 'btn soft', onClick: () => startMode('practice', subject) }, '🎮 연습하기')))
      : null;
    U.append(el,
      h('div', { class: 'hero' }, h('h2', {}, `안녕하세요, ${user.name} 님 👋`), h('p', { class: 'muted' }, `${Store.settings.schoolName} 시뮬레이션 병원입니다. 환자를 SOAP로 평가하고 중재를 선택하세요. ${target}문항 중 ${passScore}점 이상이면 합격입니다.`),
        h('div', { class: 'row wrap' }, best != null ? h('span', { class: 'tag soft' }, `최고 ${best}점`) : null, my.length ? h('span', { class: 'tag soft' }, `응시 ${my.length}회`) : null, my.some(r => r.pass) ? h('span', { class: 'tag ok' }, '✓ 통과') : null, h('span', { class: 'tag ' + (ai ? 'ai' : 'soft') }, ai ? '🤖 AI 튜터 켜짐' : 'AI 튜터 꺼짐')), statusLine),
      p ? h('div', { class: 'card resume' }, h('div', {}, h('b', { text: '진행 중인 평가가 있습니다' }), h('div', { class: 'muted small' }, `${MODE[Session.cfg.mode]} ${Session.cfg.floors.join('·')}F · ${p.answered}${isFinite(p.target) ? ' / ' + p.target : ''} 문항 답변`)), h('div', { class: 'row' }, h('button', { class: 'btn primary', onClick: () => show('hospital') }, '이어하기'), h('button', { class: 'btn ghost', onClick: async () => { if (await U.confirm('진행 중인 평가를 취소할까요? 답변 기록은 저장되지 않습니다.')) { Session.end(); renderHome(); } } }, '취소'))) : null,
      subjectBar, quick,
      h('h3', { text: '🏥 종합 모드' }), modeCard(`종합 순회 평가 (${target}문항)`, '1층 문진실부터 4층까지 모든 층을 돌며 평가합니다. 층마다 5명의 환자가 랜덤 배정됩니다.', '🏥', () => startMode('full'), '정식 평가'),
      h('details', { class: 'more', open: !subject }, h('summary', {}, subject ? '다른 층(과목) 보기' : '🚪 층별 집중 모드'), h('div', { class: 'grid2' }, [1, 2, 3, 4].filter(f => f !== subject).map(f => modeCard(`${f}F ${FLOOR[f].name}`, FLOOR[f].desc, FLOOR[f].icon, () => startMode('floor', f), null, TINT[f])))),
      h('h3', { text: '🎮 연습 모드' }), modeCard('자유 탐색 (점수 미저장)', '모든 층을 자유롭게 오가며 환자를 만나 보세요. 정답·해설은 보여주지만 성적은 저장되지 않습니다.', '🎮', () => startMode('practice', subject || 1)),
      my.length ? h('div', { class: 'mt' }, h('h3', { text: '📈 최근 결과' }), my.slice(0, 3).map(r => h('div', { class: 'list-row' }, h('div', {}, h('b', { text: `${r.score}점 · ${r.pass ? '합격' : '불합격'}` }), h('div', { class: 'tiny muted' }, `${U.fmtDate(r.date)} · ${MODE[r.mode]} ${r.floors}F · ${r.correct}/${r.total}`)), h('span', { class: 'tag ' + (r.pass ? 'ok' : 'bad') }, r.pass ? 'PASS' : 'FAIL'))), h('button', { class: 'link-btn', onClick: () => show('records') }, '전체 기록 보기 →')) : null
    );
  }
  async function startMode(mode, floor) {
    if (Session.active && !(await U.confirm('진행 중인 평가가 있습니다. 새로 시작하면 기존 진행 상황이 사라집니다. 계속할까요?'))) return;
    const target = mode === 'practice' ? Infinity : (Store.settings.questionTarget || 40);
    const floors = mode === 'floor' ? [floor] : [1, 2, 3, 4];
    const prev = mode === 'practice' ? 0 : (await Store.getResults(user.studentId)).filter(r => r.mode === mode && r.floors === floors.join('+')).length;
    await Store.syncMastered(user.studentId);
    Session.start({ mode, floors, target, user, attempt: prev + 1 });
    curFloor = (mode === 'practice' && floor) ? floor : floors[0]; mountHospital(); eng().setFloor(curFloor); show('hospital'); updateHUD();
    const perStep = Math.max(1, Math.min(5, Number(Store.settings.questionsPerStep) || 3)); const rpf = Session.cfg.roomsPerFloor || 5;
    const ai = Store.geminiAvailable();
    U.modal({ title: mode === 'practice' ? '🎮 연습 모드' : '📝 평가 시작', body: h('div', {},
      h('p', {}, mode === 'full' ? `1층 문진실부터 시작합니다. 층마다 ${rpf}개 병실의 환자를 치료한 뒤 층 이동으로 다음 층에 가세요.` : mode === 'floor' ? `${floor}F ${FLOOR[floor].name}에서 ${target}문항이 출제됩니다. 환자 ${rpf}명을 모두 치료하면 새 환자가 배정됩니다.` : `${curFloor}F에서 시작합니다. 층 이동 버튼으로 어느 층이든 자유롭게 오갈 수 있고 점수는 저장되지 않습니다.`),
      h('ul', { class: 'tips' }, h('li', {}, `각 환자당 최대 ${perStep * 2}문항(평가 ${perStep} + 중재 ${perStep}), 즉시 채점·해설`), h('li', {}, '🧊 1인칭 3D 병원: ↑↓(W/S) 걷기, ←→ 돌기, 화면 드래그로 둘러보기. 병실을 클릭하면 침대까지 자동 이동'), h('li', {}, '👆 침대의 환자를 클릭하면 평가 시작 · 병실은 01호부터 순서대로 진행'), ai ? h('li', {}, '🤖 AI 튜터가 해설을 보충하고, 문진에서 환자에게 직접 질문할 수 있어요') : null, h('li', {}, `합격 ${Store.settings.passScore || 70}점 이상 · 실패 시 재도전 가능`))), actions: [{ label: '시작!', cls: 'primary' }] });
  }
  // 치료사 캐릭터(성별·외부 GLB)
  const avatarSex = () => Store.getPref('avatar:' + (user ? user.studentId : 'anon'), null) || (user && user.sex) || '여'; // 본인이 고른 값(가입 시 저장) 우선, 없으면 계정 성별
  const PUB = () => window.PT_CONFIG || {};
  const patientGlbInfo = () => { const S = Store.settings, C = PUB(); const g = k => S[k] || C[k] || ''; return { F: g('patientGlbF'), M: g('patientGlbM'), child: g('patientGlbChild'), childF: g('patientGlbChildF'), childM: g('patientGlbChildM'), elderF: g('patientGlbElderF'), elderM: g('patientGlbElderM') }; };
  const playerInfo = () => { const sex = avatarSex(); const glb = sex === '남' ? (Store.settings.avatarGlbM || PUB().avatarGlbM || '') : (Store.settings.avatarGlbF || PUB().avatarGlbF || ''); return { name: user ? user.name : '치료사', sex, glb }; };
  function setAvatarSex(v) { Store.setPref('avatar:' + user.studentId, v); if (engine && engine.setPlayer) engine.setPlayer(); renderHome(); }
  // 순서대로 진행: 아직 치료하지 않은 가장 앞 병실만 평가 가능
  const nextRoom = () => (Session.state.rooms[curFloor] || []).findIndex(r => !r.done);
  function hospitalOpts() { return { floor: curFloor, enabled: () => document.body.dataset.screen === 'hospital' && !document.body.classList.contains('panel-open') && !$('#modal-root').children.length, getRoom: i => Object.assign(Session.roomInfo(curFloor, i), { next: i === nextRoom() }), player: playerInfo, patientGlb: patientGlbInfo, publicModels: PUB().publicModels !== false, onDoor: showPatientCard, onEnterRoom: enterRoom, onElevator: elevator, onFail: () => toast('3D 병원을 불러오지 못했습니다. 인터넷 연결을 확인한 뒤 새로고침하세요.', 'err') }; }
  function mountHospital() { if (engine) return; engine = Hospital3D; engine.mount($('#map3d'), hospitalOpts()); }
  // 명판 가까이에서 Enter/클릭 → 큰 환자 정보 카드
  function showPatientCard(i) {
    const rooms = Session.state.rooms[curFloor] || []; const rm = rooms[i]; if (!rm) return toast('빈 치료실입니다.', 'info');
    const c = rm.case, p = c.patient; const nx = nextRoom(); const isNext = i === nx; const done = rm.done;
    const m = U.modal({ title: `${curFloor}0${i + 1}호 · ${FLOOR[curFloor].short}`, body: h('div', { class: 'pcard' },
      h('div', { class: 'pcard-name' }, h('b', { text: p.name }), ` · ${p.ageText || p.age + '세'} · ${p.sex}` + (p.pediatric ? ' · 소아' : '')),
      h('div', { class: 'muted small' }, p.job + (p.informant ? ` · 정보 제공: ${p.informant}` : '')),
      h('div', { class: 'pcard-cc' }, '💬 ', c.S.chief),
      h('div', { class: 'row wrap mt' }, h('span', { class: 'tag ' + (done ? 'ok' : isNext ? '' : 'soft') }, done ? '✓ 평가·중재 완료' : isNext ? `▶ 과제 ${i + 1}/${rooms.length} · 지금 수행` : `순서 대기 (먼저 ${curFloor}0${nx + 1}호)`), h('span', { class: 'tag soft' }, `문항 ${rm.questions.length}개`)),
      h('p', { class: 'tiny muted mt' }, done ? '이미 마친 과제입니다. 다음 치료실로 이동하세요.' : isNext ? '치료실로 들어가 환자를 클릭하면 SOAP 평가가 시작됩니다.' : '퀘스트는 번호 순서대로 진행합니다.')),
      actions: [{ label: '닫기', cls: 'ghost' }, (!done && isNext) ? { label: '🚶 치료실로 들어가기', cls: 'primary', onClick: () => { if (engine && engine.goToRoom) engine.goToRoom(i); } } : null].filter(Boolean) });
  }
  function questText() {
    const rooms = Session.state.rooms[curFloor] || []; const nx = rooms.findIndex(r => !r.done); if (nx < 0) return { title: `${curFloor}F 과제 완료 🎉`, body: Session.cfg.mode === 'full' ? '층 이동 버튼으로 다음 층에 가세요.' : '새 환자가 배정됩니다.' };
    const rm = rooms[nx]; const p = rm.case.patient; const answered = rm.questions.filter(q => q.chosen != null).length;
    const step = answered === 0 ? `${curFloor}0${nx + 1}호 명판을 찾아가 환자 정보를 확인하고, 안으로 들어가 환자를 클릭하세요.` : `환자 평가·중재 진행 중 (${answered}/${rm.questions.length} 문항)`;
    return { title: `퀘스트 ${nx + 1}/${rooms.length} · ${p.name} (${p.ageText || p.age + '세'}, ${p.sex})`, body: step };
  }
  function showHelp() { U.modal({ title: '🎮 조작법', body: h('ul', { class: 'tips' }, h('li', {}, '이동: ↑↓ 또는 W/S 걷기, ←→ 또는 Q/E 돌기, A/D 옆걸음'), h('li', {}, '둘러보기: 화면을 드래그(터치 스와이프)'), h('li', {}, '빠른 이동: 복도 바닥이나 병실을 클릭하면 자동으로 걸어가요'), h('li', {}, '평가 시작: 침대의 환자를 클릭(또는 Enter). 병실은 01호부터 순서대로'), h('li', {}, '🎤 음성: 문진·검사 단계에서 말로 질문/지시 (Chrome/Edge)'), h('li', {}, '📷 캡처: 현재 3D 화면을 PNG로 저장'), h('li', {}, '🛗 층 이동: 상단 버튼 또는 복도 왼쪽 끝 엘리베이터')), actions: [{ label: '확인', cls: 'primary' }] }); }
  function enterRoom(i) {
    const info = Session.roomInfo(curFloor, i);
    if (info.status === 'empty') return toast('빈 병실입니다.', 'info');
    if (info.status === 'done') return toast('이미 치료를 마친 환자입니다. 다른 병실로 이동하세요.', 'info');
    const nx = nextRoom(); if (nx >= 0 && i !== nx) return toast(`순서대로 진행해 주세요. 먼저 ${curFloor}0${nx + 1}호 환자를 평가하세요.`, 'info');
    if (engine && engine.focus) engine.focus(i);
    Session.open(curFloor, i, afterRoom);
  }
  async function afterRoom() {
    if (engine && engine.focus) engine.focus(null);
    updateHUD(); const prog = Session.progress();
    if (prog.answered >= prog.target) return finish();
    if (!Session.floorDone(curFloor)) return;
    if (Session.cfg.mode === 'full') {
      if (Session.allDone()) return finish();
      const next = Session.cfg.floors.find(f => !Session.floorDone(f));
      U.modal({ title: '🎉 이 층 치료 완료!', body: h('p', {}, `${curFloor}층 환자를 모두 치료했습니다. ${next}층으로 이동하세요.`), actions: [{ label: `${next}층으로 이동`, cls: 'primary', onClick: () => goFloor(next) }, { label: '복도에 남기', cls: 'ghost' }] });
    } else { Session.assign(curFloor); toast('🛎️ 새 환자 5명이 도착했습니다!', 'ok'); updateHUD(); }
  }
  function elevator() {
    const mode = Session.cfg.mode;
    const m = U.modal({ title: '🛗 층 이동', body: h('div', {}, mode === 'floor' ? h('p', { class: 'muted small' }, '층별 평가 중입니다. 다른 층을 고르면 지금 평가를 끝내고 그 층의 새 평가를 시작합니다.') : null,
      h('div', { class: 'elev' }, [4, 3, 2, 1].map(f => {
        const inExam = Session.cfg.floors.includes(f); const done = inExam && Session.floorDone(f); const cnt = (Session.state.rooms[f] || []).filter(r => r.done).length;
        const here = f === curFloor;
        return h('button', { class: 'elev-btn' + (here ? ' here' : '') + (!inExam ? ' switch' : ''), disabled: here, onClick: () => { m.close(); if (inExam) goFloor(f); else switchFloor(f); } },
          h('b', {}, `${f}F`), h('span', {}, `${FLOOR[f].icon} ${FLOOR[f].name}`), h('small', { class: 'muted' }, here ? '현재 층' : !inExam ? '이 층 평가로 전환' : done ? '✓ 완료' : `${cnt}/${(Session.state.rooms[f] || []).length || 5} 완료`));
      }))), actions: [{ label: '닫기', cls: 'ghost' }] });
  }
  async function switchFloor(f) {
    if (!(await U.confirm(`지금 평가를 끝내고 ${f}F ${FLOOR[f].name} 평가를 새로 시작할까요? (지금까지의 답변은 채점되지 않습니다)`))) return;
    Session.end(); startMode('floor', f);
  }
  function goFloor(f) { curFloor = f; eng().setFloor(f); updateHUD(); const rooms = Session.state.rooms[f] || []; const nx = rooms.findIndex(r => !r.done); toast(nx >= 0 ? `${f}층 ${FLOOR[f].name}에 도착. 과제 ${nx + 1}번: ${f}0${nx + 1}호 ${rooms[nx].case.patient.name} 환자부터 시작하세요.` : `${f}층 ${FLOOR[f].name}에 도착했습니다.`, 'info'); }
  function updateHUD() {
    if (!Session.active) return; const p = Session.progress(); const pct = isFinite(p.target) ? Math.min(100, Math.round(p.answered / p.target * 100)) : 0;
    $('#hud-floor').textContent = `${curFloor}F ${FLOOR[curFloor].name} ▾`; $('#hud-floor').onclick = elevator;
    $('#hud-prog').textContent = isFinite(p.target) ? `${p.answered} / ${p.target} 문항` : `${p.answered} 문항 (연습)`;
    $('#hud-bar').style.width = pct + '%';
    $('#hud-score').textContent = p.answered ? `정답률 ${Math.round(p.correct / p.answered * 100)}%` : '정답률 -';
    $('#hud-rooms').textContent = `이 층 ${(Session.state.rooms[curFloor] || []).filter(r => r.done).length}/${(Session.state.rooms[curFloor] || []).length} 완료`;
    const vm = $('#vr-module'); if (vm) { const rooms = Session.state.rooms[curFloor] || []; const nx = rooms.findIndex(r => !r.done); vm.textContent = nx >= 0 ? `${FLOOR[curFloor].short} 모듈 ${nx + 1}/${rooms.length} · ${rooms[nx].case.title}` : `${curFloor}F 모든 과제 완료 🎉`; }
    const vq = $('#vr-quest'); if (vq) { const q = questText(); vq.innerHTML = ''; U.append(vq, h('div', { class: 'vq-title' }, '🎯 ', q.title), h('div', { class: 'vq-body' }, q.body)); }
    $('#btn-elev').onclick = elevator;
    $('#btn-quit').textContent = Session.cfg.mode === 'practice' ? '연습 종료' : '종료·채점';
    $('#btn-quit').onclick = async () => { if (Session.cfg.mode === 'practice') return finish(); if (await U.confirm('평가를 중단하고 지금까지의 답변으로 채점할까요? (미답변 문항은 포함되지 않으며 결과가 기록에 남습니다)')) finish(); };
  }
  async function finish() {
    const res = Session.result(); Session.end();
    if (res.mode !== 'practice' && res.total > 0) { await Store.addResult(res); if (Admin.autosave) Admin.autosave(); }
    showResult(res);
  }
  function showResult(r) {
    if (r.mode !== 'practice' && r.pass) { U.chime('pass'); U.confetti({ count: 240, origin: { x: .5, y: .35 } }); U.cheer('🏆 합격!', r.score + '점 · 축하합니다, ' + r.name + ' 치료사님', 3000); }
    show('result'); const el = $('#s-result'); el.innerHTML = ''; const pass = r.pass; const fb = Object.entries(r.byFloor || {});
    const trendCard = r.mode !== 'practice' ? h('div', { class: 'card' }, h('h3', { text: '📈 학습 성공률 변화 추이' }), h('div', { class: 'chart-host muted small' }, '불러오는 중…')) : null;
    const statusCard = r.mode !== 'practice' ? h('div', { class: 'card status-card' }, h('h3', { text: '📊 현재 학업 상태' }), h('div', { class: 'status-host muted small' }, '기록을 집계하는 중…')) : null;
    const aiBox = Store.geminiAvailable() && r.total > 0 ? h('div', { class: 'card' }, h('h3', { text: '🤖 AI 학습 코치' }), h('div', { class: 'ai-out muted' }, '결과를 분석하는 중…')) : null;
    const runCoach = summary => { if (!aiBox) return; Gemini.coach(r, summary).then(t => { aiBox.querySelector('.ai-out').textContent = t; aiBox.querySelector('.ai-out').classList.remove('muted'); if (summary && r.mode !== 'practice') Store.getResults(r.studentId).then(all => { const st = PTProgress.stats(all, { passScore: r.passScore }); Store.setPref('aiProgress:' + r.studentId, { key: PTProgress.aiKey(st, r.studentId), text: t, at: Date.now() }); }).catch(() => {}); }).catch(e => { aiBox.querySelector('.ai-out').textContent = 'AI 코치를 불러오지 못했어요: ' + e.message; }); };
    if (trendCard) Store.getResults(r.studentId).then(all => { const host = trendCard.querySelector('.chart-host'); host.classList.remove('muted'); PTChart.trend(host, all, r.passScore, r.id); const st = PTProgress.stats(all, { passScore: r.passScore }); const sh = statusCard.querySelector('.status-host'); sh.classList.remove('muted', 'small'); PTProgress.render(sh, st); runCoach(PTProgress.summaryText(st)); }).catch(() => runCoach(''));
    else runCoach('');
    U.append(el,
      h('div', { class: 'result-card ' + (r.mode === 'practice' ? 'practice' : pass ? 'pass' : 'fail') }, h('div', { class: 'result-emoji' }, r.mode === 'practice' ? '🎮' : pass ? '🎉' : '💪'), h('h2', {}, r.mode === 'practice' ? '연습 종료' : pass ? '합격입니다!' : '아쉽지만 불합격이에요'),
        h('div', { class: 'score' }, `${r.score}`, h('small', {}, '점')),
        h('p', { class: 'muted' }, `${r.total}문항 중 ${r.correct}문항 정답 · 소요 ${Math.floor(r.durationSec / 60)}분 ${r.durationSec % 60}초 · 합격 기준 ${r.passScore}점` + (r.mode !== 'practice' ? ` · ${r.attempt}차 시도` : '')),
        r.mode !== 'practice' && r.total > 0 ? h('p', { class: 'tiny muted' }, Store.remote ? '결과가 서버와 이 기기에 저장되었습니다.' : '결과가 이 기기(브라우저)에 저장되었습니다.') : null),
      aiBox, statusCard, trendCard,
      fb.length ? h('div', { class: 'card' }, h('h3', { text: '층별 결과' }), h('div', { class: 'floor-bars' }, fb.map(([f, v]) => h('div', { class: 'fb-row' }, h('span', {}, `${f}F ${FLOOR[f].name}`), h('div', { class: 'bar' }, h('i', { style: { width: (v.correct / v.total * 100) + '%' } })), h('b', {}, `${v.correct}/${v.total}`))))) : null,
      r.wrong.length ? h('div', { class: 'card' }, h('h3', { text: `오답 노트 (${r.wrong.length})` }), r.wrong.map(w => h('details', { class: 'wrong' }, h('summary', {}, h('span', { class: 'tag soft' }, `${w.floor}F`), ' ', w.caseTitle, ' · ', w.stem), h('p', {}, h('b', {}, '내 답: '), w.chosen), h('p', {}, h('b', {}, '정답: '), w.answer), h('p', { class: 'muted' }, w.expl)))) : (r.total ? h('div', { class: 'card' }, h('p', { text: '오답이 없습니다. 완벽해요! 🏆' })) : null),
      h('div', { class: 'row wrap mt' }, h('button', { class: 'btn primary', onClick: () => startMode(r.mode, Number(String(r.floors).split('+')[0])) }, pass ? '다시 도전' : '재도전하기'), h('button', { class: 'btn ghost', onClick: () => show('home') }, '홈으로'), r.mode !== 'practice' && r.total ? h('button', { class: 'btn ghost', onClick: () => Admin.exportXlsx([r]) }, '📥 내 결과 엑셀 저장') : null));
  }
  async function renderRecords() {
    const el = $('#s-records'); el.innerHTML = ''; const my = (await Store.getResults(user.studentId)).sort((a, b) => b.date.localeCompare(a.date));
    const nonP = my.filter(r => r.mode !== 'practice');
    const trend = nonP.length ? h('div', { class: 'card' }, h('h3', { text: '📈 학습 성공률 변화 추이' }), (() => { const host = h('div', { class: 'chart-host' }); setTimeout(() => PTChart.trend(host, nonP, Store.settings.passScore || 70), 0); return host; })()) : null;
    const st = PTProgress.stats(nonP, { passScore: Store.settings.passScore || 70 });
    const statusCard = h('div', { class: 'card status-card' }, h('h3', { text: '📊 현재 학업 상태' }), PTProgress.render(h('div', { class: 'status-host' }), st));
    if (st.attempts && Store.geminiAvailable()) {
      const key = PTProgress.aiKey(st, user.studentId); const cached = Store.getPref('aiProgress:' + user.studentId, null);
      const out = h('div', { class: 'ai-out' + (cached && cached.key === key ? '' : ' muted') }, cached && cached.key === key ? cached.text : 'AI가 누적 기록을 분석하는 중…');
      U.append(statusCard, h('div', { class: 'ai-box' }, h('div', { class: 'ai-head' }, '🤖 AI 학업 상태 피드백'), out));
      if (!(cached && cached.key === key)) Gemini.progressFeedback(PTProgress.summaryText(st), user.name).then(t => { out.textContent = t; out.classList.remove('muted'); Store.setPref('aiProgress:' + user.studentId, { key, text: t, at: Date.now() }); }).catch(e => { out.textContent = 'AI 피드백을 불러오지 못했어요: ' + e.message; });
    }
    const masteredCard = h('div', { class: 'card' }, h('h3', { text: '✅ 익힌 케이스' }), h('div', { class: 'mastered-host muted small' }, '불러오는 중…'));
    Store.getMastered(user.studentId).then(list => { const host = masteredCard.querySelector('.mastered-host'); host.innerHTML = ''; host.classList.remove('muted'); U.append(host, list.length ? [h('p', { class: 'tiny muted' }, `${list.length}개 케이스가 다음 출제에서 제외됩니다. 잘못 눌렀다면 교수님께 복원을 요청하세요.`), h('div', { class: 'row wrap' }, list.map(m => h('span', { class: 'tag soft' }, `${m.floor}F ${m.caseTitle}`)))] : h('p', { class: 'muted small' }, '아직 없어요. 정답을 맞힌 뒤 "이 케이스 익혔어요"를 누르면 여기에 모입니다.')); }).catch(() => {});
    U.append(el, h('div', { class: 'page-head' }, h('h2', { text: '📈 내 기록' }), my.length ? h('button', { class: 'btn ghost small', onClick: () => Admin.exportXlsx(my) }, '엑셀 저장') : null), statusCard, trend, masteredCard,
      my.length ? my.map(r => h('div', { class: 'card rec' }, h('div', { class: 'row between' }, h('b', { text: `${r.score}점` }), h('span', { class: 'tag ' + (r.pass ? 'ok' : 'bad') }, r.pass ? '합격' : '불합격')), h('div', { class: 'muted small' }, `${U.fmtDate(r.date)} · ${MODE[r.mode]} ${r.floors}F · ${r.correct}/${r.total} · ${r.attempt || 1}차`), r.wrong && r.wrong.length ? h('details', {}, h('summary', {}, `오답 ${r.wrong.length}개 보기`), r.wrong.map(w => h('p', { class: 'small' }, `• [${w.floor}F] ${w.stem} → 정답: ${w.answer}`))) : null)) : h('p', { class: 'muted' }, '아직 기록이 없습니다. 홈에서 평가를 시작해 보세요.'));
  }
  document.addEventListener('DOMContentLoaded', boot);
  return { show, onLogin, startMode, updateHUD, showResult, goFloor, FLOOR };
})();