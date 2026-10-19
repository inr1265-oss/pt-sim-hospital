// 저장소 어댑터: 로컬(localStorage) 기본 + Node 서버(/api)가 있으면 자동으로 서버 모드
window.Store = (() => {
  const LS = {
    get(k, d) { try { const v = localStorage.getItem('pt:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('pt:' + k, JSON.stringify(v)); } catch (e) { console.warn('localStorage', e); } },
    del(k) { try { localStorage.removeItem('pt:' + k); } catch (e) { /* ignore */ } }
  };
  const DEFAULTS = { questionTarget: 40, passScore: 70, geminiModel: 'gemini-2.5-flash', geminiKey: '', adminPinHash: null, schoolName: '신성대학교 물리치료학과', appName: 'PT 시뮬레이션 병원' };
  const S = { remote: false, geminiRemote: false, settings: { ...DEFAULTS }, adminPin: null };

  async function api(path, opts = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (S.adminPin) headers['x-admin-pin'] = S.adminPin;
    const res = await fetch('/api' + path, { method: opts.method || 'GET', headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || ('서버 오류 ' + res.status));
    return data;
  }

  S.init = async function () {
    S.settings = { ...DEFAULTS, ...LS.get('settings', {}) };
    if (location.protocol.startsWith('http')) {
      try {
        const r = await fetch('/api/health', { cache: 'no-store' });
        if (r.ok) { const j = await r.json(); if (j.ok) { S.remote = true; S.geminiRemote = !!j.geminiEnabled; Object.assign(S.settings, j.settings || {}); } }
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
  S.signup = async function ({ studentId, name, pinHash }) {
    if (S.remote) return (await api('/signup', { method: 'POST', body: { studentId, name, pinHash } })).user;
    const users = LS.get('users', []);
    if (users.some(u => u.studentId === studentId)) throw new Error('이미 가입 신청된 학번입니다.');
    const user = { id: U.uid(), studentId, name, pinHash, status: 'pending', createdAt: Date.now() };
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
    if (S.remote) { try { await api('/admin/verify', { method: 'POST', body: { pin } }); S.adminPin = pin; return true; } catch (e) { return false; } }
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

  // ---- Gemini ----
  S.geminiAvailable = () => (S.remote && S.geminiRemote) || !!S.settings.geminiKey;
  S.gemini = async function (payload) {
    if (S.remote && S.geminiRemote && !S.settings.geminiKey) return (await api('/gemini', { method: 'POST', body: payload })).text;
    const key = S.settings.geminiKey;
    if (!key) { if (S.remote && S.geminiRemote) return (await api('/gemini', { method: 'POST', body: payload })).text; throw new Error('Gemini API 키가 설정되지 않았습니다. (관리자 > 설정)'); }
    const model = S.settings.geminiModel || DEFAULTS.geminiModel;
    const body = { contents: [{ role: 'user', parts: [{ text: payload.prompt }] }], generationConfig: { temperature: payload.temperature == null ? 0.7 : payload.temperature } };
    if (payload.system) body.systemInstruction = { parts: [{ text: payload.system }] };
    if (payload.json) body.generationConfig.responseMimeType = 'application/json';
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data.error && data.error.message) || ('Gemini 오류 ' + res.status));
    const parts = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
    return parts ? parts.map(p => p.text || '').join('') : '';
  };

  S.exportAll = () => ({ users: LS.get('users', []), results: LS.get('results', []), settings: S.settings, customCases: LS.get('customCases', []) });
  return S;
})();