// 저장소 어댑터: 로컬(localStorage) 기본 + Node 서버(/api)가 있으면 자동으로 서버 모드
window.Store = (() => {
  const LS = {
    get(k, d) { try { const v = localStorage.getItem('pt:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('pt:' + k, JSON.stringify(v)); } catch (e) { console.warn('localStorage', e); } },
    del(k) { try { localStorage.removeItem('pt:' + k); } catch (e) { /* ignore */ } }
  };
  const DEFAULTS = { questionTarget: 40, questionsPerStep: 3, passScore: 60, avatarGlbF: '', avatarGlbM: '', patientGlbF: '', patientGlbM: '', patientGlbChild: '', patientGlbChildF: '', patientGlbChildM: '', patientGlbElderF: '', patientGlbElderM: '', geminiModel: 'gemini-flash-lite-latest', geminiKey: '', aiMode: 'wrong', adminPinHash: null, schoolName: '신성대학교 물리치료학과', appName: 'PT 시뮬레이션 병원' };
  const PUB = () => window.PT_CONFIG || {};
  const S = { remote: false, backend: 'local', geminiRemote: false, settings: { ...DEFAULTS }, adminPin: null, sheetUrl: null };
  const SHEET = () => String(PUB().sheetApi || '').trim(); // 구글 시트(Apps Script 웹 앱) 주소 — app/js/config.js

  async function api(path, opts = {}) {
    if (S.backend === 'sheet' || opts.sheet) { // 구글 시트: 사전 요청(CORS preflight)이 없도록 text/plain POST 하나로 모든 호출을 보냄
      const u = new URL(path, 'http://x'); const query = {}; u.searchParams.forEach((v, k) => { query[k] = v; });
      const res = await fetch(SHEET(), { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ path: u.pathname, method: opts.method || 'GET', query, body: opts.body || null, pin: S.adminPin || null }) });
      const data = await res.json().catch(() => ({ error: '구글 시트 응답을 읽지 못했습니다.' }));
      if (!res.ok || data.error) throw new Error(data.error || ('구글 시트 오류 ' + res.status));
      return data;
    }
    const headers = { 'Content-Type': 'application/json' };
    if (S.adminPin) headers['x-admin-pin'] = S.adminPin;
    const res = await fetch('/api' + path, { method: opts.method || 'GET', headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || ('서버 오류 ' + res.status));
    return data;
  }

  S.init = async function () {
    S.settings = { ...DEFAULTS, ...LS.get('settings', {}) };
    if (S.settings.passScore === 70 && !S.settings.passV) { S.settings.passScore = 60; S.settings.passV = 2; LS.set('settings', S.settings); } // 2026-11: 합격 기준 70 → 60 (이전에 저장된 기본값 1회 이전)
    if (SHEET()) { // 구글 시트 모드: 모든 기기의 가입·성적이 한 시트에 모임
      try { const j = await api('/health', { sheet: true }); if (j.ok) { S.remote = true; S.backend = 'sheet'; S.geminiRemote = !!j.geminiEnabled; Object.assign(S.settings, j.settings || {}); } }
      catch (e) { console.warn('[Store] 구글 시트 연결 실패', e); setTimeout(() => U.toast('구글 시트에 연결하지 못했습니다. 지금은 이 기기에만 저장됩니다. (' + e.message + ')', 'err'), 1200); }
      return S;
    }
    if (location.protocol.startsWith('http')) {
      try {
        const r = await fetch('/api/health', { cache: 'no-store' });
        if (r.ok) { const j = await r.json(); if (j.ok) { S.remote = true; S.backend = 'server'; S.geminiRemote = !!j.geminiEnabled; Object.assign(S.settings, j.settings || {}); } }
      } catch (e) { /* 정적 호스팅 → 로컬 모드 */ }
    }
    return S;
  };
  S.saveSettings = async function (patch) {
    Object.assign(S.settings, patch); LS.set('settings', S.settings);
    if (S.remote && S.adminPin) { try { await api('/settings', { method: 'POST', body: patch }); } catch (e) { U.toast('서버 설정 저장 실패: ' + e.message, 'err'); } }
  };

  // ---- 사용자(학생) ----
  S.getUsers = async () => S.remote ? (await api('/users')).users : LS.get('users', []);
  S.signup = async function ({ studentId, name, pinHash, sex }) {
    if (S.remote) return (await api('/signup', { method: 'POST', body: { studentId, name, pinHash, sex } })).user;
    const users = LS.get('users', []);
    if (users.some(u => u.studentId === studentId)) throw new Error('이미 가입 신청된 학번입니다.');
    const user = { id: U.uid(), studentId, name, pinHash, sex: sex || '여', status: 'pending', createdAt: Date.now() };
    users.push(user); LS.set('users', users); return user;
  };
  S.login = async function (studentId, pinHash) {
    if (S.remote) return (await api('/login', { method: 'POST', body: { studentId, pinHash } })).user;
    const u = LS.get('users', []).find(u => u.studentId === studentId);
    if (!u || u.pinHash !== pinHash) throw new Error('학번 또는 비밀번호가 올바르지 않습니다.');
    return u;
  };
  S.setUserStatus = async function (id, status) {
    if (S.remote) return api('/users/status', { method: 'POST', body: { id, status } });
    const users = LS.get('users', []); const u = users.find(u => u.id === id);
    if (u) { u.status = status; if (status === 'approved') u.approvedAt = Date.now(); }
    LS.set('users', users);
  };
  S.deleteUser = async function (id) {
    if (S.remote) return api('/users/delete', { method: 'POST', body: { id } });
    LS.set('users', LS.get('users', []).filter(u => u.id !== id));
  };

  // ---- 결과 ----
  S.getResults = async function (studentId) {
    if (S.remote) return (await api('/results' + (studentId ? `?studentId=${encodeURIComponent(studentId)}` : ''))).results;
    return LS.get('results', []).filter(r => !studentId || r.studentId === studentId);
  };
  S.addResult = async function (rec) {
    const results = LS.get('results', []); results.push(rec); LS.set('results', results);
    if (S.remote) { try { await api('/results', { method: 'POST', body: rec }); } catch (e) { U.toast('서버 저장 실패(이 기기에는 저장됨): ' + e.message, 'err'); } }
    return rec;
  };

  // ---- 관리자 ----
  S.adminVerify = async function (pin) {
    if (S.remote) { try { const j = await api('/admin/verify', { method: 'POST', body: { pin } }); S.adminPin = pin; S.sheetUrl = (j && j.sheetUrl) || null; return true; } catch (e) { return false; } }
    const hash = await U.sha256('admin:' + pin);
    if (!S.settings.adminPinHash) { await S.saveSettings({ adminPinHash: hash }); S.adminPin = pin; return 'created'; }
    if (S.settings.adminPinHash === hash) { S.adminPin = pin; return true; }
    return false;
  };
  S.adminChangePin = async function (newPin) {
    const hash = await U.sha256('admin:' + newPin);
    if (S.remote) await api('/admin/pin', { method: 'POST', body: { pin: newPin } });
    await S.saveSettings({ adminPinHash: hash }); S.adminPin = newPin;
  };

  // ---- 로그인 세션 ----
  S.getSession = () => LS.get('session', null);
  S.setSession = u => LS.set('session', u);
  S.clearSession = () => LS.del('session');

  // ---- 추가(AI 생성) 케이스: 이 브라우저에 저장 ----
  S.getCustomCases = () => LS.get('customCases', []);
  S.addCustomCase = c => { const a = LS.get('customCases', []); a.push(c); LS.set('customCases', a); };
  S.removeCustomCase = id => LS.set('customCases', LS.get('customCases', []).filter(c => c.id !== id));
  S.casesForFloor = floor => [...((window.PT_CASES && window.PT_CASES[floor]) || []), ...S.getCustomCases().filter(c => Number(c.floor) === Number(floor))];

  // ---- 익힌(완료 처리) 케이스: 정답 후 학생이 표시 → 이후 출제 제외. 관리자가 기록에서 삭제하면 복원 ----
  S.getMastered = async function (studentId) {
    if (S.remote) return (await api('/mastered' + (studentId ? `?studentId=${encodeURIComponent(studentId)}` : ''))).mastered;
    return LS.get('mastered', []).filter(m => !studentId || m.studentId === studentId);
  };
  S.addMastered = async function (rec) {
    const all = LS.get('mastered', []);
    if (!all.some(m => m.studentId === rec.studentId && m.caseId === rec.caseId)) { all.push(rec); LS.set('mastered', all); }
    if (S.remote) { try { await api('/mastered', { method: 'POST', body: rec }); } catch (e) { U.toast('서버 저장 실패(이 기기에는 저장됨): ' + e.message, 'err'); } }
  };
  S.removeMastered = async function (studentId, caseId) {
    LS.set('mastered', LS.get('mastered', []).filter(m => !(m.studentId === studentId && m.caseId === caseId)));
    if (S.remote) await api('/mastered/delete', { method: 'POST', body: { studentId, caseId } });
  };
  S.masteredIds = studentId => new Set(LS.get('mastered', []).filter(m => m.studentId === studentId).map(m => m.caseId));
  S.syncMastered = async function (studentId) {
    if (!S.remote) return;
    try { const list = await S.getMastered(studentId); LS.set('mastered', LS.get('mastered', []).filter(m => m.studentId !== studentId).concat(list)); } catch (e) { /* 오프라인이면 로컬 사용 */ }
  };
  // ---- 학생별 환경설정(이 브라우저) ----
  S.getPref = (k, d) => LS.get('pref:' + k, d);
  S.setPref = (k, v) => LS.set('pref:' + k, v);

  // ---- Gemini ----
  // ---- Gemini (무료 한도 대응: 키 여러 개 순환, 모델 대체, 한도 초과 시 10분 쉬기) ----
  const keyList = () => String(S.settings.geminiKey || PUB().geminiKey || '').split(/[,\s]+/).map(k => k.trim()).filter(Boolean);
  const MODEL_FALLBACK = ['gemini-flash-lite-latest', 'gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-flash-latest', 'gemma-4-26b-a4b-it']; // 한도·지원 종료 시 차례로 대체(2026-11 기준 제공 모델)
  S._badModel = {}; // model → 재시도 가능 시각(한도 초과·지원 종료·일시 오류 모델은 그때까지 건너뜀)
  S._keyIdx = 0; S._pauseToastAt = 0;
  const modelChain = () => { const pref = S.settings.geminiModel || PUB().geminiModel || DEFAULTS.geminiModel; return [pref].concat(MODEL_FALLBACK.filter(m => m !== pref)); };
  const liveModels = () => { const now = Date.now(); return modelChain().filter(m => !(S._badModel[m] > now)); };
  S.aiResumeAt = () => Math.min.apply(null, modelChain().map(m => S._badModel[m] || 0)); /* 모든 모델이 막혔을 때 가장 먼저 풀리는 시각 */
  S.aiPaused = () => keyList().length > 0 && liveModels().length === 0;
  S.geminiAvailable = () => S.settings.aiMode !== 'off' && !S.aiPaused() && ((S.remote && S.geminiRemote) || keyList().length > 0);
  S.aiMode = () => S.geminiAvailable() ? (S.settings.aiMode || 'wrong') : 'off';
  /* 구글이 알려주는 재시도 대기 시간(분당 한도면 수십 초, 일일 한도면 몇 시간) → 그 모델만 그때까지 건너뜀 */
  const retryMs = (data, fallback) => { const d = ((data.error && data.error.details) || []).find(x => x.retryDelay); const sec = d && parseFloat(d.retryDelay); return sec > 0 ? Math.min(sec * 1000 + 2000, 24 * 3600000) : fallback; };
  const pausedError = () => { const min = Math.max(1, Math.ceil((S.aiResumeAt() - Date.now()) / 60000)); const msg = 'AI 무료 사용량 한도로 잠시 쉬는 중이에요. ' + (min >= 60 ? Math.ceil(min / 60) + '시간' : min + '분') + ' 뒤 다시 켜집니다. (문제 풀이·기본 해설은 그대로 됩니다)'; if (U && U.toast && Date.now() - S._pauseToastAt > 60000) { S._pauseToastAt = Date.now(); U.toast(msg, 'info'); } return new Error(msg); };
  S.gemini = async function (payload) {
    const keys = keyList();
    if (!keys.length) { if (S.remote && S.geminiRemote) return (await api('/gemini', { method: 'POST', body: payload })).text; throw new Error('Gemini API 키가 설정되지 않았습니다. (관리자 > 설정)'); }
    const models = liveModels();
    if (!models.length) throw pausedError();
    const body = { contents: [{ role: 'user', parts: [{ text: payload.prompt }] }], generationConfig: { temperature: payload.temperature == null ? 0.7 : payload.temperature } };
    if (payload.system) body.systemInstruction = { parts: [{ text: payload.system }] };
    if (payload.json) body.generationConfig.responseMimeType = 'application/json';
    let lastErr = null; const retried = {};
    for (let ki = 0; ki < keys.length; ki++) {
      const key = keys[(S._keyIdx + ki) % keys.length];
      for (let mi = 0; mi < models.length; mi++) { const model = models[mi];
        let res, data;
        try { res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); data = await res.json().catch(() => ({})); }
        catch (e) { lastErr = new Error('네트워크 오류: ' + e.message); continue; }
        if (res.ok) { S._keyIdx = (S._keyIdx + ki) % keys.length; const parts = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts; return parts ? parts.filter(p => !p.thought).map(p => p.text || '').join('').trim() : ''; /* thought 파트(gemma 등 생각 과정)는 답변에서 제외 */ }
        const msg = (data.error && data.error.message) || ('Gemini 오류 ' + res.status);
        if (res.status === 429 || res.status === 503 || /quota|exhausted|rate/i.test(msg)) { S._badModel[model] = Date.now() + retryMs(data, res.status === 503 ? 2 * 60000 : 60000); lastErr = new Error('AI 사용량 한도에 도달했어요.'); continue; } // 한도 초과 → 다음 모델 → 다음 키
        if (res.status === 404 || res.status === 400 && /model/i.test(msg)) { S._badModel[model] = Date.now() + 60 * 60000; lastErr = new Error(msg); continue; } // 지원 종료·없는 모델 → 1시간 건너뜀, 다음 모델
        if (res.status === 403 || res.status === 401) { lastErr = new Error('API 키 오류: ' + msg); break; } // 키 문제 → 다음 키
        /* 500 등 구글 내부 오류(일시적일 때가 많음): 같은 모델 1회 재시도 후, 해당 모델만 2분 건너뛰고 다음 모델로 */
        if (!retried[model]) { retried[model] = 1; await new Promise(r => setTimeout(r, 700)); mi--; continue; }
        S._badModel[model] = Date.now() + 2 * 60000; lastErr = new Error(/internal/i.test(msg) ? 'AI 서버가 잠시 불안정해요. 다시 시도해 주세요.' : msg); continue;
      }
    }
    if (!liveModels().length) throw pausedError();
    throw lastErr || new Error('AI 호출 실패');
  };
  // ---- 3D 모델 파일 업로드(서버 모드): app/assets/models/ 에 저장 ----
  S.uploadAsset = async function (file, name) {
    if (S.backend !== 'server') throw new Error('PC 서버 모드에서만 업로드할 수 있습니다. 정적 배포에서는 app/assets/models/ 폴더에 파일을 넣고 경로를 입력하세요.');
    const headers = { 'Content-Type': 'application/octet-stream' }; if (S.adminPin) headers['x-admin-pin'] = S.adminPin;
    const res = await fetch('/api/asset?name=' + encodeURIComponent(name), { method: 'PUT', headers, body: file });
    const data = await res.json().catch(() => ({})); if (!res.ok) throw new Error(data.error || ('업로드 실패 ' + res.status)); return data.path;
  };
  S.exportAll = () => ({ users: LS.get('users', []), results: LS.get('results', []), settings: S.settings, customCases: LS.get('customCases', []), mastered: LS.get('mastered', []) });
  return S;
})();