/**
 * PT 시뮬레이션 병원 — 구글 시트 연동 백엔드 (Google Apps Script)
 *
 * 설치 요약 (자세한 안내: 프로젝트 루트의 「구글시트_연동_가이드.md」)
 *   1) 새 구글 시트 → 확장 프로그램 → Apps Script → 이 파일 전체를 붙여넣기
 *   2) 아래 ADMIN_PIN(처음 관리자 PIN)과, 원하면 GEMINI_API_KEY 를 바꾸고 저장
 *   3) 함수 목록에서 setup 을 한 번 실행해 권한 허용(시트 탭 4개가 만들어짐)
 *   4) 배포 → 새 배포 → 유형: 웹 앱 / 실행: 나 / 액세스: 모든 사용자 → 배포
 *   5) 나온 웹 앱 URL(…/exec)을 app/js/config.js 의 sheetApi 에 넣고 push
 *
 * 시트 탭: 학생(가입·승인) / 성적 / 익힘 / 설정
 *   - 학생 탭의 「상태」 칸에 직접 '승인' 또는 '거절'을 적어도 승인/거절됩니다.
 */

const ADMIN_PIN = '1234';            // 처음 관리자 PIN(숫자 4~8자리). 앱에서 PIN 을 바꾸면 그 값이 우선합니다.
const GEMINI_API_KEY = '';           // (선택) Google AI Studio 무료 키. 여기에 두면 학생 브라우저에 키가 보이지 않습니다.
const GEMINI_MODEL = 'gemini-2.5-flash';
const SHEET_ID = '';                 // script.google.com 에서 따로 만든 경우에만: 시트 주소의 /d/ 와 /edit 사이 긴 문자열. 시트의 '확장 프로그램 → Apps Script' 로 만들었다면 비워 두세요.
const TZ = 'Asia/Seoul';

const SHEETS = {
  users:    { name: '학생', head: ['학번', '이름', '성별', '상태', '가입일시', '승인일시', 'id', 'pinHash'] },
  results:  { name: '성적', head: ['일시', '학번', '이름', '모드', '층', '문항수', '정답수', '점수', '합격여부', '합격기준', '소요시간(초)', '시도', '오답수', 'id', '상세(JSON)'] },
  mastered: { name: '익힘', head: ['학번', '케이스ID', '케이스명', '층', '일시'] },
  settings: { name: '설정', head: ['항목', '값'] }
};
const SETTING_KEYS = ['questionTarget', 'questionsPerStep', 'passScore', 'schoolName', 'appName', 'geminiModel', 'aiMode', 'avatarGlbF', 'avatarGlbM', 'patientGlbF', 'patientGlbM', 'patientGlbChild', 'patientGlbChildF', 'patientGlbChildM', 'patientGlbElderF', 'patientGlbElderM'];
const DEFAULTS = { questionTarget: 40, questionsPerStep: 3, passScore: 70, schoolName: '신성대학교 물리치료학과', appName: 'PT 시뮬레이션 병원' };
const MODE_LABEL = { full: '종합 순회', floor: '단일 층', practice: '연습' };

// ---------- 진입점 ----------
function doGet() { return out_({ ok: true, app: 'pt-sim-sheet', note: '앱이 POST 로 호출합니다. 이 주소를 app/js/config.js 의 sheetApi 에 넣으세요.' }); }
function doPost(e) {
  let req;
  try { req = JSON.parse(e.postData.contents); } catch (x) { return out_({ error: '잘못된 요청입니다.', _status: 400 }); }
  const p = String(req.path || '');
  if (p === '/health' || p === '/gemini') { try { return out_(route_(req)); } catch (x) { return out_({ error: String(x && x.message || x), _status: 500 }); } }
  const lock = LockService.getScriptLock();
  try { lock.waitLock(20000); return out_(route_(req)); }
  catch (x) { return out_({ error: String(x && x.message || x), _status: 500 }); }
  finally { try { lock.releaseLock(); } catch (x) { /* ignore */ } }
}
/** 처음 한 번 실행: 시트 탭을 만들고 권한을 허용받습니다. */
function setup() { Object.keys(SHEETS).forEach(k => sheet_(k)); return '준비 완료: ' + Object.keys(SHEETS).map(k => SHEETS[k].name).join(', '); }

// ---------- 라우터 ----------
function route_(q) {
  const p = String(q.path || ''), m = String(q.method || 'GET').toUpperCase(), b = q.body || {}, qs = q.query || {};
  const isAdmin = String(q.pin == null ? '' : q.pin) === adminPin_();
  const fail = (code, msg) => ({ error: msg, _status: code });

  if (p === '/health') return { ok: true, remote: true, backend: 'sheet', geminiEnabled: !!geminiKey_(), settings: publicSettings_() };
  if (p === '/settings' && m === 'GET') return publicSettings_();

  if (p === '/signup' && m === 'POST') {
    const sid = String(b.studentId || ''), name = String(b.name || '').slice(0, 20), ph = String(b.pinHash || '');
    if (!/^\d{7,10}$/.test(sid) || !name || !/^[0-9a-f]{16,128}$/i.test(ph)) return fail(400, '입력값이 올바르지 않습니다.');
    if (users_().some(u => u.studentId === sid)) return fail(409, '이미 가입 신청된 학번입니다.');
    const user = { id: uid_(), studentId: sid, name, sex: b.sex === '남' ? '남' : '여', status: 'pending', createdAt: Date.now() };
    sheet_('users').appendRow([sid, name, user.sex, '대기', fmt_(user.createdAt), '', user.id, 'h:' + ph]);
    return { user };
  }
  if (p === '/login' && m === 'POST') {
    const u = users_(true).find(x => x.studentId === String(b.studentId || ''));
    if (!u || u.pinHash !== String(b.pinHash || '')) return fail(401, '학번 또는 비밀번호가 올바르지 않습니다.');
    delete u.pinHash; delete u._row; return { user: u };
  }

  if (p === '/results' && m === 'POST') {
    const r = b; if (!r || !r.studentId || typeof r.score !== 'number') return fail(400, '결과 형식 오류');
    let json = JSON.stringify(r); if (json.length > 45000) { const lite = Object.assign({}, r, { wrong: (r.wrong || []).map(w => ({ floor: w.floor, caseTitle: w.caseTitle, stem: w.stem, chosen: w.chosen, answer: w.answer })) }); json = JSON.stringify(lite).slice(0, 45000); }
    sheet_('results').appendRow([fmt_(r.date ? new Date(r.date).getTime() : Date.now()), String(r.studentId), String(r.name || ''), MODE_LABEL[r.mode] || String(r.mode || ''), "'" + String(r.floors || ''), r.total, r.correct, r.score, r.pass ? '합격' : '불합격', r.passScore, r.durationSec, r.attempt || '', (r.wrong || []).length, String(r.id || uid_()), json]);
    return { ok: true };
  }
  if (p === '/results' && m === 'GET') {
    const sid = qs.studentId ? String(qs.studentId) : '';
    if (!sid && !isAdmin) return fail(403, '관리자 권한이 필요합니다.');
    const list = rows_('results').filter(r => !sid || String(r[1]) === sid).map(r => { try { return JSON.parse(String(r[14])); } catch (x) { return null; } }).filter(Boolean);
    return { results: list };
  }

  if (p === '/mastered' && m === 'GET') {
    const sid = qs.studentId ? String(qs.studentId) : '';
    if (!sid && !isAdmin) return fail(403, '관리자 권한이 필요합니다.');
    return { mastered: rows_('mastered').filter(r => !sid || String(r[0]) === sid).map(r => ({ studentId: String(r[0]), caseId: String(r[1]), caseTitle: String(r[2]), floor: Number(r[3]) || null, at: ms_(r[4]) })) };
  }
  if (p === '/mastered' && m === 'POST') {
    if (!b.studentId || !b.caseId) return fail(400, '형식 오류');
    const exists = rows_('mastered').some(r => String(r[0]) === String(b.studentId) && String(r[1]) === String(b.caseId));
    if (!exists) sheet_('mastered').appendRow([String(b.studentId), String(b.caseId), String(b.caseTitle || '').slice(0, 80), Number(b.floor) || '', fmt_(b.at || Date.now())]);
    return { ok: true };
  }
  if (p === '/mastered/delete' && m === 'POST') {
    const sh = sheet_('mastered'); const rows = rows_('mastered');
    for (let i = rows.length - 1; i >= 0; i--) if (String(rows[i][0]) === String(b.studentId) && String(rows[i][1]) === String(b.caseId)) sh.deleteRow(i + 2);
    return { ok: true };
  }

  if (p === '/gemini' && m === 'POST') {
    const key = geminiKey_(); if (!key) return fail(502, '구글 시트 스크립트에 Gemini API 키가 없습니다 (GEMINI_API_KEY).');
    const model = (publicSettings_().geminiModel || GEMINI_MODEL);
    const body = { contents: [{ role: 'user', parts: [{ text: String(b.prompt || '') }] }], generationConfig: { temperature: b.temperature == null ? 0.7 : b.temperature } };
    if (b.system) body.systemInstruction = { parts: [{ text: String(b.system) }] };
    if (b.json) body.generationConfig.responseMimeType = 'application/json';
    const res = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(key), { method: 'post', contentType: 'application/json', payload: JSON.stringify(body), muteHttpExceptions: true });
    let j = {}; try { j = JSON.parse(res.getContentText()); } catch (x) { /* ignore */ }
    if (res.getResponseCode() >= 400) return fail(502, (j.error && j.error.message) || ('Gemini 오류 ' + res.getResponseCode()));
    const parts = j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts;
    return { text: parts ? parts.map(x => x.text || '').join('') : '' };
  }

  // ---------- 관리자 전용 ----------
  if (p === '/admin/verify' && m === 'POST') return String(b.pin) === adminPin_() ? { ok: true, sheetUrl: book_().getUrl() } : fail(401, 'PIN 이 올바르지 않습니다.');
  if (!isAdmin) return fail(403, '관리자 권한이 필요합니다.');

  if (p === '/users' && m === 'GET') return { users: users_().map(u => { delete u.pinHash; delete u._row; return u; }) };
  if (p === '/users/status' && m === 'POST') {
    const u = users_(true).find(x => x.id === String(b.id)); if (!u) return fail(404, '해당 학생이 없습니다.');
    const st = b.status === 'approved' ? '승인' : b.status === 'rejected' ? '거절' : '대기';
    const sh = sheet_('users'); sh.getRange(u._row, 4).setValue(st); sh.getRange(u._row, 6).setValue(b.status === 'approved' ? fmt_(Date.now()) : '');
    return { ok: true };
  }
  if (p === '/users/delete' && m === 'POST') {
    const u = users_(true).find(x => x.id === String(b.id)); if (u) sheet_('users').deleteRow(u._row);
    return { ok: true };
  }
  if (p === '/settings' && m === 'POST') {
    const sh = sheet_('settings'); const rows = rows_('settings');
    SETTING_KEYS.forEach(k => {
      if (b[k] == null || b[k] === '') return;
      const v = JSON.stringify(b[k]); const i = rows.findIndex(r => String(r[0]) === k);
      if (i >= 0) sh.getRange(i + 2, 2).setValue("'" + v); else sh.appendRow([k, "'" + v]);
    });
    return { ok: true };
  }
  if (p === '/admin/pin' && m === 'POST') {
    if (!/^\d{4,8}$/.test(String(b.pin))) return fail(400, 'PIN 은 숫자 4~8자리입니다.');
    PropertiesService.getScriptProperties().setProperty('ADMIN_PIN', String(b.pin)); return { ok: true };
  }
  return fail(404, '알 수 없는 요청: ' + m + ' ' + p);
}

// ---------- 도우미 ----------
function book_() {
  const ss = SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('연결된 시트가 없습니다. Code.gs 맨 위 SHEET_ID 에 시트 ID 를 넣으세요.');
  return ss;
}
function out_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
function sheet_(k) {
  const d = SHEETS[k]; const ss = book_(); let sh = ss.getSheetByName(d.name);
  if (!sh) { sh = ss.insertSheet(d.name); sh.appendRow(d.head); sh.setFrozenRows(1); }
  return sh;
}
function rows_(k) { const v = sheet_(k).getDataRange().getValues(); return v.slice(1).filter(r => r.some(c => c !== '' && c != null)); }
function users_(withSecret) {
  const v = sheet_('users').getDataRange().getValues(); const list = [];
  for (let i = 1; i < v.length; i++) {
    const r = v[i]; if (!r[0] && !r[6]) continue;
    const u = { id: String(r[6] || ''), studentId: String(r[0]), name: String(r[1]), sex: String(r[2] || '여'), status: statusIn_(r[3]), createdAt: ms_(r[4]) };
    const ap = ms_(r[5]); if (ap) u.approvedAt = ap;
    u.pinHash = String(r[7] || '').replace(/^h:/, ''); u._row = i + 1;
    if (!u.id) { u.id = uid_(); sheet_('users').getRange(i + 1, 7).setValue(u.id); }   // 시트에 직접 추가한 행에도 id 부여
    list.push(u);
  }
  return list;
}
function statusIn_(v) { const s = String(v || '').trim(); if (/^(승인|approved)$/i.test(s)) return 'approved'; if (/^(거절|rejected)$/i.test(s)) return 'rejected'; return 'pending'; }
function publicSettings_() {
  const s = Object.assign({}, DEFAULTS);
  rows_('settings').forEach(r => { const k = String(r[0]); if (SETTING_KEYS.indexOf(k) < 0) return; const raw = String(r[1]).replace(/^'/, ''); try { s[k] = JSON.parse(raw); } catch (x) { s[k] = raw; } });
  return s;
}
function adminPin_() { return String(PropertiesService.getScriptProperties().getProperty('ADMIN_PIN') || ADMIN_PIN); }
function geminiKey_() { return String(PropertiesService.getScriptProperties().getProperty('GEMINI_KEY') || GEMINI_API_KEY || ''); }
function uid_() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function fmt_(ms) { return Utilities.formatDate(new Date(ms), TZ, 'yyyy-MM-dd HH:mm:ss'); }
function ms_(v) {
  if (v == null || v === '') return null; if (v instanceof Date) return v.getTime(); if (typeof v === 'number') return v;
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/); if (m) return new Date(m[1] + '-' + m[2] + '-' + m[3] + 'T' + m[4] + ':' + m[5] + ':' + (m[6] || '00') + '+09:00').getTime();
  const t = Date.parse(String(v)); return isNaN(t) ? null : t;
}