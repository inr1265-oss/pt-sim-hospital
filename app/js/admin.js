// 관리자(교수) 콘솔: 승인, 성적, 설정, 데이터·AI 케이스
window.Admin = (() => {
  const { h, toast, fmtDate } = U;
  const FLOORS = { 1: '1F 임상의사결정', 2: '2F 운동치료', 3: '3F 소아물리치료', 4: '4F 물리적인자치료' };
  const modeName = m => ({ full: '종합 순회', floor: '단일 층', practice: '연습' }[m] || m);
  const clear = el => { el.innerHTML = ''; return el; };
  const backTarget = () => (Store.getSession() ? 'home' : 'auth');

  async function render(container) {
    container.innerHTML = '';
    if (!Store.adminPin) return gate(container);
    const tabs = ['승인 관리', '성적 관리', '학생 기록', '설정', '데이터 · AI 케이스']; let cur = 0;
    const tabBar = h('div', { class: 'tabs' }, tabs.map((t, i) => h('button', { class: 'tab' + (i === cur ? ' active' : ''), onClick: () => { cur = i; draw(); } }, t)));
    const body = h('div', { class: 'admin-body' });
    U.append(container, h('div', { class: 'page-head' }, h('h2', { text: '🔑 관리자(교수) 콘솔' }), h('div', { class: 'row' }, h('span', { class: 'tag soft' }, Store.remote ? '서버 모드' : '로컬(이 브라우저) 모드'), h('button', { class: 'btn ghost small', onClick: () => { Store.adminPin = null; App.show(backTarget()); } }, '나가기'))), tabBar, body);
    async function draw() { tabBar.querySelectorAll('.tab').forEach((b, i) => b.classList.toggle('active', i === cur)); body.innerHTML = ''; await [users, results, students, settings, data][cur](body); }
    draw();
  }
  function gate(container) {
    const first = !Store.remote && !Store.settings.adminPinHash;
    const pin = h('input', { class: 'input', type: 'password', inputmode: 'numeric', placeholder: first ? '사용할 관리자 PIN 설정 (숫자 4~8자리)' : '관리자 PIN', maxlength: '8' }); const msg = h('div', { class: 'form-msg' });
    const go = async () => { const v = pin.value.trim(); if (!/^\d{4,8}$/.test(v)) { msg.textContent = 'PIN은 숫자 4~8자리입니다.'; return; } const r = await Store.adminVerify(v); if (r === 'created') toast('관리자 PIN이 설정되었습니다. 꼭 기억해 두세요!', 'ok'); if (r) render(container); else msg.textContent = 'PIN이 올바르지 않습니다.'; };
    pin.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    U.append(container, h('div', { class: 'auth-wrap' }, h('div', { class: 'auth-logo' }, h('div', { class: 'logo-mark' }, '🔑'), h('h1', { text: '관리자 로그인' }), h('p', { class: 'muted' }, first ? '처음 실행입니다. 교수님이 사용할 관리자 PIN을 정해 입력하세요.' : '교수님 PIN을 입력하세요.')),
      h('div', { class: 'form' }, pin, msg, h('button', { class: 'btn primary block', onClick: go }, '입장')), h('button', { class: 'link-btn', onClick: () => App.show(backTarget()) }, '← 돌아가기')));
  }
  async function users(body) {
    const list = await Store.getUsers(); const pending = list.filter(u => u.status === 'pending'), others = list.filter(u => u.status !== 'pending');
    const row = u => h('div', { class: 'list-row' },
      h('div', {}, h('b', { text: u.name }), ' ', h('span', { class: 'muted' }, u.studentId), h('div', { class: 'tiny muted' }, '신청 ' + fmtDate(u.createdAt || Date.now()))),
      h('div', { class: 'row' },
        u.status !== 'approved' ? h('button', { class: 'btn small primary', onClick: async () => { await Store.setUserStatus(u.id, 'approved'); toast(u.name + ' 승인 완료', 'ok'); users(clear(body)); } }, '승인') : h('span', { class: 'tag ok' }, '승인됨'),
        u.status !== 'rejected' ? h('button', { class: 'btn small ghost', onClick: async () => { await Store.setUserStatus(u.id, 'rejected'); users(clear(body)); } }, '거절') : h('span', { class: 'tag bad' }, '거절됨'),
        h('button', { class: 'btn small danger', onClick: async () => { if (await U.confirm(`${u.name}(${u.studentId}) 계정을 삭제할까요?`)) { await Store.deleteUser(u.id); users(clear(body)); } } }, '삭제')));
    U.append(body, h('h3', { text: `승인 대기 (${pending.length})` }), pending.length ? pending.map(row) : h('p', { class: 'muted' }, '대기 중인 신청이 없습니다.'), h('h3', { class: 'mt', text: `전체 학생 (${others.length})` }), others.length ? others.map(row) : h('p', { class: 'muted' }, '아직 승인된 학생이 없습니다.'));
  }
  async function results(body) {
    const all = (await Store.getResults()).filter(r => r.mode !== 'practice').sort((a, b) => b.date.localeCompare(a.date));
    const stat = (k, v) => h('div', { class: 'stat' }, h('div', { class: 'stat-k' }, k), h('div', { class: 'stat-v' }, String(v)));
    const avg = all.length ? (all.reduce((s, r) => s + r.score, 0) / all.length).toFixed(1) : '-';
    const tbl = h('table', { class: 'grid' }, h('thead', {}, h('tr', {}, ['일시', '학번', '이름', '모드', '층', '점수', '합격', '정답/문항', '소요', '시도'].map(t => h('th', { text: t })))),
      h('tbody', {}, all.map(r => h('tr', { class: r.pass ? '' : 'fail' }, h('td', { text: fmtDate(r.date) }), h('td', { text: r.studentId }), h('td', { text: r.name }), h('td', { text: modeName(r.mode) }), h('td', { text: r.floors }), h('td', {}, h('b', { text: r.score })), h('td', { text: r.pass ? '합격' : '불합격' }), h('td', { text: `${r.correct}/${r.total}` }), h('td', { text: Math.round(r.durationSec / 60) + '분' }), h('td', { text: r.attempt || '' })))));
    U.append(body, h('div', { class: 'stat-row' }, stat('응시 건수', all.length), stat('합격', all.filter(r => r.pass).length), stat('응시 학생', new Set(all.map(r => r.studentId)).size), stat('평균 점수', avg)),
      h('div', { class: 'row wrap mt' }, h('button', { class: 'btn primary', onClick: () => exportXlsx(all) }, '📥 엑셀(.xlsx) 다운로드'), h('button', { class: 'btn ghost', onClick: () => exportCsv(all) }, 'CSV 다운로드'),
        window.showDirectoryPicker ? h('button', { class: 'btn ghost', onClick: () => pickFolder().then(() => results(clear(body))) }, autosaveState.handle ? '📁 자동 저장 폴더 변경' : '📁 결과 자동 저장 폴더 지정') : null,
        Store.remote ? h('a', { class: 'btn ghost', href: '/api/results.csv?pin=' + encodeURIComponent(Store.adminPin), target: '_blank' }, '서버 CSV 열기') : null),
      autosaveState.handle ? h('p', { class: 'tiny muted' }, `자동 저장 중: ${autosaveState.name}/PT_시뮬레이션_성적.xlsx (새 결과가 생길 때마다 갱신)`) : h('p', { class: 'tiny muted' }, 'PC의 Chrome/Edge에서 폴더를 지정하면 결과가 생길 때마다 그 폴더의 엑셀 파일이 자동 갱신됩니다. ' + (Store.remote ? '서버 모드에서는 server/data/results.csv 에도 항상 기록됩니다.' : '')),
      h('div', { class: 'table-wrap mt' }, all.length ? tbl : h('p', { class: 'muted' }, '아직 결과가 없습니다.')));
  }
  function rows(all) { return all.map(r => ({ '일시': fmtDate(r.date), '학번': r.studentId, '이름': r.name, '모드': modeName(r.mode), '층': r.floors, '문항수': r.total, '정답수': r.correct, '점수': r.score, '합격여부': r.pass ? '합격' : '불합격', '합격기준': r.passScore, '소요시간(초)': r.durationSec, '시도': r.attempt || '', '오답수': (r.wrong || []).length })); }
  function wrongRows(all) { const out = []; all.forEach(r => (r.wrong || []).forEach(w => out.push({ '일시': fmtDate(r.date), '학번': r.studentId, '이름': r.name, '층': w.floor, '사례': w.caseTitle, '문항': w.stem, '학생 답': w.chosen, '정답': w.answer }))); return out; }
  function buildWorkbook(all) { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows(all)), '성적'); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(wrongRows(all)), '오답'); return wb; }
  const stamp = () => new Date().toISOString().slice(0, 10);
  function exportXlsx(all) { if (!window.XLSX) { toast('엑셀 라이브러리를 불러오지 못해 CSV로 저장합니다.', 'info'); return exportCsv(all); } XLSX.writeFile(buildWorkbook(all), `PT_시뮬레이션_성적_${stamp()}.xlsx`); }
  function exportCsv(all) { const rs = rows(all); const head = Object.keys(rs[0] || { '일시': '' }); const csv = '\uFEFF' + [head.join(','), ...rs.map(r => head.map(k => `"${String(r[k] == null ? '' : r[k]).replace(/"/g, '""')}"`).join(','))].join('\n'); U.downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `PT_시뮬레이션_성적_${stamp()}.csv`); }
  // ---- 로컬 폴더 자동 저장 (File System Access API, Chrome/Edge) ----
  const autosaveState = { handle: null, name: '' };
  const idb = {
    open: () => new Promise((res, rej) => { const r = indexedDB.open('pt-sim', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }),
    async get(k) { try { const db = await this.open(); return await new Promise(res => { const t = db.transaction('kv').objectStore('kv').get(k); t.onsuccess = () => res(t.result); t.onerror = () => res(null); }); } catch (e) { return null; } },
    async set(k, v) { try { const db = await this.open(); return await new Promise(res => { const t = db.transaction('kv', 'readwrite').objectStore('kv').put(v, k); t.onsuccess = () => res(true); t.onerror = () => res(false); }); } catch (e) { return false; } }
  };
  async function loadHandle() { const hdl = await idb.get('resultsDir'); if (hdl) { autosaveState.handle = hdl; autosaveState.name = hdl.name; } }
  async function pickFolder() { try { const hdl = await window.showDirectoryPicker({ mode: 'readwrite' }); autosaveState.handle = hdl; autosaveState.name = hdl.name; await idb.set('resultsDir', hdl); toast('자동 저장 폴더: ' + hdl.name, 'ok'); await autosave(); } catch (e) { if (e.name !== 'AbortError') toast('폴더 지정 실패: ' + e.message, 'err'); } }
  async function autosave() {
    const hdl = autosaveState.handle; if (!hdl || !window.XLSX) return false;
    try {
      if ((await hdl.queryPermission({ mode: 'readwrite' })) !== 'granted' && (await hdl.requestPermission({ mode: 'readwrite' })) !== 'granted') return false;
      const all = (await Store.getResults()).filter(r => r.mode !== 'practice'); const buf = XLSX.write(buildWorkbook(all), { bookType: 'xlsx', type: 'array' });
      const fh = await hdl.getFileHandle('PT_시뮬레이션_성적.xlsx', { create: true }); const w = await fh.createWritable(); await w.write(buf); await w.close(); return true;
    } catch (e) { console.warn('autosave', e); return false; }
  }
  // ---- 학생 기록: 성공률 추이 + 익힌 케이스 삭제(복원) ----
  async function students(body) {
    const users = await Store.getUsers(); const results = (await Store.getResults()).filter(r => r.mode !== 'practice'); const mastered = await Store.getMastered();
    const ids = [...new Set([...users.map(u => u.studentId), ...results.map(r => r.studentId), ...mastered.map(m => m.studentId)])];
    const nameOf = id => (users.find(u => u.studentId === id) || results.find(r => r.studentId === id) || {}).name || '';
    let cur = ids[0] || '';
    const sel = h('select', { class: 'input', style: { maxWidth: '320px' }, onChange: e => { cur = e.target.value; draw(); } }, ids.map(id => h('option', { value: id, text: `${nameOf(id)} (${id})` })));
    const host = h('div', {});
    const draw = () => {
      host.innerHTML = ''; if (!cur) return U.append(host, h('p', { class: 'muted' }, '학생이 없습니다.'));
      const my = results.filter(r => r.studentId === cur); const ms = mastered.filter(m => m.studentId === cur);
      const chart = h('div', { class: 'chart-host' }); setTimeout(() => PTChart.trend(chart, my, Store.settings.passScore || 70), 0);
      U.append(host, h('h3', { text: `📈 ${nameOf(cur)} 학생 성공률 추이 (${my.length}회 응시)` }), my.length ? chart : h('p', { class: 'muted small' }, '응시 기록이 없습니다.'),
        h('h3', { class: 'mt', text: `✅ 익힌 케이스 (${ms.length})` }), h('p', { class: 'tiny muted' }, '학생이 정답을 맞힌 뒤 "익혔어요"로 표시한 케이스입니다. 잘못 눌렀다면 삭제하세요. 삭제하면 그 학생에게 다시 출제됩니다.'),
        ms.length ? ms.map(m => h('div', { class: 'list-row' }, h('div', {}, h('b', { text: `${m.floor}F ${m.caseTitle}` }), h('div', { class: 'tiny muted' }, `${m.caseId} · ${fmtDate(m.at)}`)),
          h('button', { class: 'btn small danger', onClick: async () => { if (!(await U.confirm(`'${m.caseTitle}'을(를) ${nameOf(cur)} 학생의 익힘 기록에서 삭제할까요? 다시 출제됩니다.`))) return; await Store.removeMastered(cur, m.caseId); mastered.splice(mastered.indexOf(m), 1); toast('삭제했습니다. 다시 출제됩니다.', 'ok'); draw(); } }, '삭제'))) : h('p', { class: 'muted small' }, '없음'),
        ms.length > 1 ? h('button', { class: 'btn ghost small mt', onClick: async () => { if (!(await U.confirm('이 학생의 익힘 기록을 모두 삭제할까요?'))) return; for (const m of ms) { await Store.removeMastered(cur, m.caseId); mastered.splice(mastered.indexOf(m), 1); } draw(); } }, '모두 삭제') : null);
    };
    U.append(body, h('div', { class: 'row wrap' }, h('b', { text: '학생 선택' }), sel), host); draw();
  }
  async function settings(body) {
    const s = Store.settings; const f = {};
    const field = (k, label, type = 'text', hint = '') => h('label', { class: 'field' }, h('span', { text: label }), f[k] = h('input', { class: 'input', type, value: s[k] == null ? '' : s[k] }), hint ? h('small', { class: 'muted' }, hint) : null);
    U.append(body, h('div', { class: 'form wide' },
      field('questionTarget', '출제 문항 수', 'number', '기본 40문항 (종합 순회 = 4개 층 × 5명 × 2문항)'), field('passScore', '합격 점수', 'number', '기본 70점'), field('schoolName', '학과 표시명'), field('appName', '앱 이름'),
      h('h3', { class: 'mt' }, '🤖 Gemini AI 연동'),
      h('p', { class: 'muted small' }, Store.remote ? (Store.geminiRemote ? '서버(server/config.json)의 API 키를 사용 중입니다. 아래 키는 비워 두세요.' : '서버의 config.json 에 geminiApiKey 를 넣으면 키가 브라우저에 노출되지 않습니다(권장). 아래 키는 이 브라우저에서만 쓰입니다.') : 'Google AI Studio(aistudio.google.com)에서 무료 API 키를 발급받아 입력하세요. 키는 이 브라우저(localStorage)에만 저장됩니다. 학생 배포 시에는 Node 서버 프록시 사용을 권장합니다.'),
      field('geminiKey', 'Gemini API 키', 'password'), field('geminiModel', '모델 이름', 'text', '예: gemini-2.5-flash (무료 할당량 모델). 최신 모델명은 Google AI Studio에서 확인하세요.'),
      h('label', { class: 'field' }, h('span', { text: 'AI 튜터 동작 방식' }), f.aiMode = h('select', { class: 'input' }, [['wrong', '오답일 때 자동 해설 (권장 · 호출 절약)'], ['always', '정답·오답 모두 자동 해설'], ['manual', '버튼을 눌렀을 때만'], ['off', 'AI 기능 끄기']].map(([v, t]) => h('option', { value: v, text: t, selected: (s.aiMode || 'wrong') === v }))), h('small', { class: 'muted' }, '문진의 AI 환자, 후속 질문, 결과 화면 학습 코치는 AI가 켜져 있으면 항상 사용할 수 있습니다. 무료 키는 분당·일일 호출 한도가 있으니 학생 수가 많으면 "오답일 때"를 권장합니다.')),
      (window.PT_CONFIG && window.PT_CONFIG.geminiKey) ? h('p', { class: 'tiny muted' }, '공개 배포용 키(app/js/config.js)가 설정되어 있어 모든 학생이 AI를 쓸 수 있습니다. 위 키를 입력하면 이 브라우저에서는 그 키가 우선합니다.') : h('p', { class: 'tiny muted' }, 'GitHub Pages 등 정적 배포에서 모든 학생에게 AI를 켜려면 app/js/config.js 의 geminiKey 에 "웹사이트 제한"을 건 키를 넣으세요.'),
      h('div', { class: 'row mt' },
        h('button', { class: 'btn primary', onClick: async () => { const patch = {}; for (const k in f) { if (k === 'newPin') continue; patch[k] = (k === 'questionTarget' || k === 'passScore') ? (Number(f[k].value) || s[k]) : f[k].value.trim(); } await Store.saveSettings(patch); toast('저장되었습니다', 'ok'); } }, '저장'),
        h('button', { class: 'btn ghost', onClick: async () => { try { toast('Gemini 연결 테스트 중…'); const t = await Gemini.ask('안녕하세요. 물리치료 튜터로서 한 문장으로 인사해 주세요.'); U.modal({ title: 'Gemini 응답', body: h('p', { text: t }) }); } catch (e) { U.modal({ title: 'Gemini 오류', body: h('p', { text: e.message }) }); } } }, '연결 테스트')),
      h('h3', { class: 'mt' }, '🔐 관리자 PIN 변경'),
      h('div', { class: 'row' }, f.newPin = h('input', { class: 'input', type: 'password', placeholder: '새 PIN (숫자 4~8자리)', maxlength: '8' }), h('button', { class: 'btn ghost', onClick: async () => { const v = f.newPin.value.trim(); if (!/^\d{4,8}$/.test(v)) return toast('숫자 4~8자리로 입력하세요', 'err'); try { await Store.adminChangePin(v); toast('PIN 변경 완료', 'ok'); } catch (e) { toast(e.message, 'err'); } } }, '변경'))));
  }
  async function data(body) {
    const custom = Store.getCustomCases();
    const floorSel = h('select', { class: 'input' }, Object.entries(FLOORS).map(([k, v]) => h('option', { value: k, text: v })));
    const topic = h('input', { class: 'input', placeholder: '주제(선택) 예: 경직형 사지마비, 급성 무릎 염좌, 자외선 치료' }); const out = h('div', { class: 'muted small' });
    const builtin = [1, 2, 3, 4].map(f => `${f}F ${(PT_CASES[f] || []).length}개`).join(' · '); const totalQ = [1, 2, 3, 4].reduce((a, f) => a + (PT_CASES[f] || []).reduce((x, c) => x + c.Q.length, 0), 0);
    U.append(body, h('h3', { text: '🤖 AI로 새 환자 사례 생성' }), h('p', { class: 'muted small' }, '생성된 사례는 이 브라우저의 케이스 풀에 추가되어 해당 층 병실에 랜덤 배정됩니다. 교수님이 내용을 검토한 뒤 사용하세요. (영구 반영은 JSON 내보내기 → app/js/data/parts 에 추가)'),
      h('div', { class: 'row wrap' }, floorSel, topic, h('button', { class: 'btn primary', onClick: async e => { if (!Store.geminiAvailable()) return toast('설정 탭에서 Gemini 키를 먼저 설정하세요.', 'err'); const b = e.currentTarget; b.disabled = true; out.textContent = '생성 중… (10~30초)'; try { const c = await Gemini.generateCase(Number(floorSel.value), topic.value.trim()); Store.addCustomCase(c); toast('사례 추가: ' + c.title, 'ok'); data(clear(body)); } catch (err) { out.textContent = '실패: ' + err.message; b.disabled = false; } } }, '생성')), out,
      h('h3', { class: 'mt', text: `AI/추가 사례 (${custom.length})` }),
      custom.length ? custom.map(c => h('div', { class: 'list-row' }, h('div', {}, h('b', { text: `[${c.floor}F] ${c.title}` }), h('div', { class: 'tiny muted' }, c.dx + ' · 문항 ' + c.Q.length)), h('div', { class: 'row' }, h('button', { class: 'btn small ghost', onClick: () => U.modal({ title: c.title, wide: true, body: h('pre', { class: 'pre', text: JSON.stringify(c, null, 1) }) }) }, '보기'), h('button', { class: 'btn small danger', onClick: () => { Store.removeCustomCase(c.id); data(clear(body)); } }, '삭제')))) : h('p', { class: 'muted' }, '없음'),
      h('h3', { class: 'mt' }, '💾 데이터 백업'),
      h('div', { class: 'row wrap' }, h('button', { class: 'btn ghost', onClick: () => U.downloadBlob(new Blob([JSON.stringify(Store.exportAll(), null, 1)], { type: 'application/json' }), `PT_sim_backup_${stamp()}.json`) }, '전체 데이터 JSON 내보내기'), h('button', { class: 'btn ghost', onClick: () => U.downloadBlob(new Blob([JSON.stringify(custom, null, 1)], { type: 'application/json' }), 'ai_cases.json') }, 'AI 사례 JSON 내보내기')),
      h('p', { class: 'tiny muted mt' }, `내장 케이스: ${builtin} (총 ${totalQ}문항)`));
  }
  return { render, autosave, loadHandle, exportXlsx };
})();