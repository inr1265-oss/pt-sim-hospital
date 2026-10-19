// 앱 셸: 화면 전환, 홈(모드 선택), HUD, 엘리베이터, 결과, 내 기록
window.App = (() => {
  const { h, $, $$, toast } = U;
  const FLOOR = {
    1: { icon: '🩺', name: '임상의사결정 문진실', desc: '문진(S) → 검사(O) → 평가(A) → 의뢰·계획(P). 적색신호와 감별 판단' },
    2: { icon: '🏃', name: '운동치료실', desc: '정형·신경계 재활 운동 처방과 단계별 진행 기준' },
    3: { icon: '🧒', name: '소아물리치료실', desc: '뇌성마비 유형·증후군·발달지연 아동의 평가와 중재' },
    4: { icon: '⚡', name: '물리적인자치료실', desc: '전기·광선·열·수치료의 선택, 매개변수, 금기' }
  };
  const MODE = { full: '종합 순회', floor: '층별', practice: '연습' };
  let user = null, curFloor = 1, hospitalMounted = false;

  async function boot() {
    await Store.init();
    [1, 2, 3, 4].forEach(f => (PT_CASES[f] || []).forEach(c => c.floor = f));
    if (Admin.loadHandle) Admin.loadHandle();
    document.title = Store.settings.appName; $('#brand-name').textContent = Store.settings.appName;
    $$('[data-nav]').forEach(b => b.addEventListener('click', () => nav(b.dataset.nav)));
    $$('.dpad button').forEach(b => b.addEventListener('pointerdown', e => { e.preventDefault(); const d = b.dataset.dir; if (d === 'ok') window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); else Hospital.move(d); }));
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
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
    if (id === 'hospital') setTimeout(() => Hospital.resize(), 0);
    window.scrollTo(0, 0);
  }
  async function logout() {
    if (Session.active && !(await U.confirm('진행 중인 평가가 있습니다. 로그아웃하면 진행 상황이 사라집니다. 계속할까요?'))) return;
    Session.end(); user = null; Auth.logout();
  }
  function onLogin(u) { user = u; show('home'); toast(`${u.name} 님, 환영합니다!`, 'ok'); }

  async function renderHome() {
    const el = $('#s-home'); el.innerHTML = '';
    const target = Store.settings.questionTarget || 40, passScore = Store.settings.passScore || 70;
    const my = (await Store.getResults(user.studentId)).filter(r => r.mode !== 'practice').sort((a, b) => b.date.localeCompare(a.date));
    const best = my.length ? Math.max(...my.map(r => r.score)) : null;
    const modeCard = (title, desc, icon, onClick, badge) => h('button', { class: 'card mode', onClick }, h('div', { class: 'mode-icon' }, icon), h('div', { class: 'mode-body' }, h('b', { text: title }), h('div', { class: 'muted small', text: desc })), badge ? h('span', { class: 'tag' }, badge) : null);
    const p = Session.active ? Session.progress() : null;
    U.append(el, 
      h('div', { class: 'hero' }, h('h2', {}, `안녕하세요, ${user.name} 님 👋`), h('p', { class: 'muted' }, `${Store.settings.schoolName} 시뮬레이션 병원입니다. 병원을 돌며 환자를 SOAP로 평가하고 중재를 선택하세요. ${target}문항 중 ${passScore}점 이상이면 합격, 실패하면 재도전할 수 있어요.`),
        best != null ? h('div', { class: 'row' }, h('span', { class: 'tag ' + (best >= passScore ? 'ok' : '') }, `최고 ${best}점`), h('span', { class: 'tag soft' }, `응시 ${my.length}회`), my.some(r => r.pass) ? h('span', { class: 'tag ok' }, '✓ 통과') : null) : null),
      p ? h('div', { class: 'card resume' }, h('div', {}, h('b', { text: '진행 중인 평가가 있습니다' }), h('div', { class: 'muted small' }, `${MODE[Session.cfg.mode]} · ${p.answered}${isFinite(p.target) ? ' / ' + p.target : ''} 문항 답변`)), h('div', { class: 'row' }, h('button', { class: 'btn primary', onClick: () => show('hospital') }, '이어하기'), h('button', { class: 'btn ghost', onClick: async () => { if (await U.confirm('진행 중인 평가를 취소할까요? 답변 기록은 저장되지 않습니다.')) { Session.end(); renderHome(); } } }, '취소'))) : null,
      h('h3', { text: '🏥 종합 모드' }), modeCard(`종합 순회 평가 (${target}문항)`, '1층 문진실부터 4층까지 모든 층을 돌며 평가합니다. 층마다 5명의 환자가 랜덤 배정됩니다.', '🏥', () => startMode('full'), '정식 평가'),
      h('h3', { text: '🚪 층별 집중 모드' }), h('div', { class: 'grid2' }, [1, 2, 3, 4].map(f => modeCard(`${f}F ${FLOOR[f].name}`, FLOOR[f].desc, FLOOR[f].icon, () => startMode('floor', f)))),
      h('h3', { text: '🎮 연습 모드' }), modeCard('자유 탐색 (점수 미저장)', '부담 없이 병원을 돌아다니며 환자를 만나 보세요. 정답·해설은 보여주지만 성적은 저장되지 않습니다.', '🎮', () => startMode('practice')),
      my.length ? h('div', { class: 'mt' }, h('h3', { text: '📈 최근 결과' }), my.slice(0, 3).map(r => h('div', { class: 'list-row' }, h('div', {}, h('b', { text: `${r.score}점 · ${r.pass ? '합격' : '불합격'}` }), h('div', { class: 'tiny muted' }, `${U.fmtDate(r.date)} · ${MODE[r.mode]} ${r.floors}F · ${r.correct}/${r.total}`)), h('span', { class: 'tag ' + (r.pass ? 'ok' : 'bad') }, r.pass ? 'PASS' : 'FAIL'))), h('button', { class: 'link-btn', onClick: () => show('records') }, '전체 기록 보기 →')) : null
    );
  }
  async function startMode(mode, floor) {
    if (Session.active && !(await U.confirm('진행 중인 평가가 있습니다. 새로 시작하면 기존 진행 상황이 사라집니다. 계속할까요?'))) return;
    const target = mode === 'practice' ? Infinity : (Store.settings.questionTarget || 40);
    const floors = mode === 'floor' ? [floor] : [1, 2, 3, 4];
    const prev = mode === 'practice' ? 0 : (await Store.getResults(user.studentId)).filter(r => r.mode === mode && r.floors === floors.join('+')).length;
    Session.start({ mode, floors, target, user, attempt: prev + 1 });
    curFloor = floors[0]; mountHospital(); Hospital.setFloor(curFloor); show('hospital'); updateHUD();
    U.modal({ title: mode === 'practice' ? '🎮 연습 모드' : '📝 평가 시작', body: h('div', {},
      h('p', {}, mode === 'full' ? '1층 문진실부터 시작합니다. 각 층 5개 병실의 환자를 모두 치료한 뒤 엘리베이터로 다음 층으로 이동하세요.' : mode === 'floor' ? `${floor}F ${FLOOR[floor].name}에서 ${target}문항이 출제됩니다. 5명의 환자를 모두 치료하면 새 환자가 배정됩니다.` : '자유롭게 돌아다니며 환자를 만나 보세요. 점수는 저장되지 않습니다.'),
      h('ul', { class: 'tips' }, h('li', {}, '이동: 방향키 / WASD 또는 병실을 클릭(터치)'), h('li', {}, '입장: 문 앞에서 Enter 또는 병실을 다시 터치'), h('li', {}, '각 환자당 2문항(평가 1 + 중재 1), 즉시 채점·해설'), h('li', {}, `합격 ${Store.settings.passScore || 70}점 이상 · 실패 시 재도전 가능`))), actions: [{ label: '시작!', cls: 'primary' }] });
  }
  function mountHospital() {
    if (hospitalMounted) return;
    Hospital.mount($('#map'), { floor: curFloor, enabled: () => document.body.dataset.screen === 'hospital' && !document.body.classList.contains('panel-open') && !$('#modal-root').children.length, getRoom: i => Session.roomInfo(curFloor, i), onEnterRoom: enterRoom, onElevator: elevator });
    hospitalMounted = true;
  }
  function enterRoom(i) {
    const info = Session.roomInfo(curFloor, i);
    if (info.status === 'empty') return toast('빈 병실입니다.', 'info');
    if (info.status === 'done') return toast('이미 치료를 마친 환자입니다. 다른 병실로 이동하세요.', 'info');
    Session.open(curFloor, i, afterRoom);
  }
  async function afterRoom() {
    updateHUD(); const prog = Session.progress();
    if (prog.answered >= prog.target) return finish();
    if (!Session.floorDone(curFloor)) return;
    if (Session.cfg.mode === 'full') {
      if (Session.allDone()) return finish();
      const next = Session.cfg.floors.find(f => !Session.floorDone(f));
      U.modal({ title: '🎉 이 층 치료 완료!', body: h('p', {}, `${curFloor}층 환자를 모두 치료했습니다. 엘리베이터를 타고 ${next}층으로 이동하세요.`), actions: [{ label: `${next}층으로 이동`, cls: 'primary', onClick: () => goFloor(next) }, { label: '복도에 남기', cls: 'ghost' }] });
    } else { Session.assign(curFloor); toast('🛎️ 새 환자 5명이 도착했습니다!', 'ok'); updateHUD(); }
  }
  function elevator() {
    const m = U.modal({ title: '🛗 엘리베이터', body: h('div', { class: 'elev' }, [4, 3, 2, 1].map(f => {
      const inExam = Session.cfg.floors.includes(f); const done = inExam && Session.floorDone(f); const cnt = (Session.state.rooms[f] || []).filter(r => r.done).length;
      return h('button', { class: 'elev-btn' + (f === curFloor ? ' here' : '') + (!inExam ? ' off' : ''), disabled: !inExam || f === curFloor, onClick: () => { m.close(); goFloor(f); } }, h('b', {}, `${f}F`), h('span', {}, FLOOR[f].name), h('small', { class: 'muted' }, f === curFloor ? '현재 층' : !inExam ? '이번 평가 범위 아님' : done ? '✓ 완료' : `${cnt}/5 완료`));
    })), actions: [{ label: '닫기', cls: 'ghost' }] });
  }
  function goFloor(f) { curFloor = f; Hospital.setFloor(f); updateHUD(); toast(`${f}층 ${FLOOR[f].name}에 도착했습니다.`, 'info'); }
  function updateHUD() {
    if (!Session.active) return; const p = Session.progress(); const pct = isFinite(p.target) ? Math.min(100, Math.round(p.answered / p.target * 100)) : 0;
    $('#hud-floor').textContent = `${curFloor}F ${FLOOR[curFloor].name}`;
    $('#hud-prog').textContent = isFinite(p.target) ? `${p.answered} / ${p.target} 문항` : `${p.answered} 문항 (연습)`;
    $('#hud-bar').style.width = pct + '%';
    $('#hud-score').textContent = p.answered ? `정답률 ${Math.round(p.correct / p.answered * 100)}%` : '정답률 -';
    $('#hud-rooms').textContent = `이 층 ${(Session.state.rooms[curFloor] || []).filter(r => r.done).length}/5 완료`;
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
    show('result'); const el = $('#s-result'); el.innerHTML = ''; const pass = r.pass; const fb = Object.entries(r.byFloor || {});
    U.append(el, 
      h('div', { class: 'result-card ' + (r.mode === 'practice' ? 'practice' : pass ? 'pass' : 'fail') }, h('div', { class: 'result-emoji' }, r.mode === 'practice' ? '🎮' : pass ? '🎉' : '💪'), h('h2', {}, r.mode === 'practice' ? '연습 종료' : pass ? '합격입니다!' : '아쉽지만 불합격이에요'),
        h('div', { class: 'score' }, `${r.score}`, h('small', {}, '점')),
        h('p', { class: 'muted' }, `${r.total}문항 중 ${r.correct}문항 정답 · 소요 ${Math.floor(r.durationSec / 60)}분 ${r.durationSec % 60}초 · 합격 기준 ${r.passScore}점` + (r.mode !== 'practice' ? ` · ${r.attempt}차 시도` : '')),
        r.mode !== 'practice' && r.total > 0 ? h('p', { class: 'tiny muted' }, Store.remote ? '결과가 서버와 이 기기에 저장되었습니다.' : '결과가 이 기기(브라우저)에 저장되었습니다.') : null),
      fb.length ? h('div', { class: 'card' }, h('h3', { text: '층별 결과' }), h('div', { class: 'floor-bars' }, fb.map(([f, v]) => h('div', { class: 'fb-row' }, h('span', {}, `${f}F ${FLOOR[f].name}`), h('div', { class: 'bar' }, h('i', { style: { width: (v.correct / v.total * 100) + '%' } })), h('b', {}, `${v.correct}/${v.total}`))))) : null,
      r.wrong.length ? h('div', { class: 'card' }, h('h3', { text: `오답 노트 (${r.wrong.length})` }), r.wrong.map(w => h('details', { class: 'wrong' }, h('summary', {}, h('span', { class: 'tag soft' }, `${w.floor}F`), ' ', w.caseTitle, ' · ', w.stem), h('p', {}, h('b', {}, '내 답: '), w.chosen), h('p', {}, h('b', {}, '정답: '), w.answer), h('p', { class: 'muted' }, w.expl)))) : (r.total ? h('div', { class: 'card' }, h('p', { text: '오답이 없습니다. 완벽해요! 🏆' })) : null),
      h('div', { class: 'row wrap mt' }, h('button', { class: 'btn primary', onClick: () => startMode(r.mode, Number(String(r.floors).split('+')[0])) }, pass ? '다시 도전' : '재도전하기'), h('button', { class: 'btn ghost', onClick: () => show('home') }, '홈으로'), r.mode !== 'practice' && r.total ? h('button', { class: 'btn ghost', onClick: () => Admin.exportXlsx([r]) }, '📥 내 결과 엑셀 저장') : null));
  }
  async function renderRecords() {
    const el = $('#s-records'); el.innerHTML = ''; const my = (await Store.getResults(user.studentId)).sort((a, b) => b.date.localeCompare(a.date));
    U.append(el, h('div', { class: 'page-head' }, h('h2', { text: '📈 내 기록' }), my.length ? h('button', { class: 'btn ghost small', onClick: () => Admin.exportXlsx(my) }, '엑셀 저장') : null),
      my.length ? my.map(r => h('div', { class: 'card rec' }, h('div', { class: 'row between' }, h('b', { text: `${r.score}점` }), h('span', { class: 'tag ' + (r.pass ? 'ok' : 'bad') }, r.pass ? '합격' : '불합격')), h('div', { class: 'muted small' }, `${U.fmtDate(r.date)} · ${MODE[r.mode]} ${r.floors}F · ${r.correct}/${r.total} · ${r.attempt || 1}차`), r.wrong && r.wrong.length ? h('details', {}, h('summary', {}, `오답 ${r.wrong.length}개 보기`), r.wrong.map(w => h('p', { class: 'small' }, `• [${w.floor}F] ${w.stem} → 정답: ${w.answer}`))) : null)) : h('p', { class: 'muted' }, '아직 기록이 없습니다. 홈에서 평가를 시작해 보세요.'));
  }
  document.addEventListener('DOMContentLoaded', boot);
  return { show, onLogin, startMode, updateHUD, showResult, goFloor };
})();