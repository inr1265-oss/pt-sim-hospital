// PT 시뮬레이션 병원 — 선택형 로컬 서버 (의존성 없음, Node 18+)
// 역할: 정적 파일 제공, 학생 계정/승인, 결과 저장(JSON + CSV), Gemini API 프록시(키 비노출)
const http = require('http'), fs = require('fs'), path = require('path'), https = require('https'), os = require('os');
const ROOT = path.join(__dirname, '..', 'app');
const DATA = path.join(__dirname, 'data');
fs.mkdirSync(DATA, { recursive: true });
const CONFIG_PATH = path.join(__dirname, 'config.json');
const config = Object.assign({ port: 8787, adminPin: '1234', geminiApiKey: '', geminiModel: 'gemini-2.5-flash', questionTarget: 40, passScore: 70, schoolName: '신성대학교 물리치료학과', appName: 'PT 시뮬레이션 병원' },
  fs.existsSync(CONFIG_PATH) ? JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) : {});
const file = n => path.join(DATA, n);
const readJson = (n, d) => { try { return JSON.parse(fs.readFileSync(file(n), 'utf8')); } catch (e) { return d; } };
const writeJson = (n, v) => fs.writeFileSync(file(n), JSON.stringify(v, null, 1), 'utf8');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
const body = req => new Promise((resolve, reject) => { let b = ''; req.on('data', c => { b += c; if (b.length > 2e6) req.destroy(); }); req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch (e) { reject(new Error('잘못된 JSON')); } }); });
const isAdmin = (req, url) => (req.headers['x-admin-pin'] || url.searchParams.get('pin')) === String(config.adminPin);
const publicSettings = () => ({ questionTarget: config.questionTarget, questionsPerStep: config.questionsPerStep, passScore: config.passScore, schoolName: config.schoolName, appName: config.appName, avatarGlbF: config.avatarGlbF || '', avatarGlbM: config.avatarGlbM || '' });
const csvEsc = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
const fmt = d => { const x = new Date(d); const p = n => String(n).padStart(2, '0'); return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())} ${p(x.getHours())}:${p(x.getMinutes())}`; };
function appendCsv(r) {
  const head = ['일시', '학번', '이름', '모드', '층', '문항수', '정답수', '점수', '합격여부', '합격기준', '소요시간(초)', '시도', '오답수'];
  const f = file('results.csv'); if (!fs.existsSync(f)) fs.writeFileSync(f, '\uFEFF' + head.join(',') + '\n', 'utf8');
  const mode = { full: '종합 순회', floor: '단일 층', practice: '연습' }[r.mode] || r.mode;
  fs.appendFileSync(f, [fmt(r.date), r.studentId, r.name, mode, r.floors, r.total, r.correct, r.score, r.pass ? '합격' : '불합격', r.passScore, r.durationSec, r.attempt || '', (r.wrong || []).length].map(csvEsc).join(',') + '\n', 'utf8');
}
function gemini(payload) {
  return new Promise((resolve, reject) => {
    if (!config.geminiApiKey) return reject(new Error('서버에 Gemini API 키가 설정되지 않았습니다 (server/config.json)'));
    const model = config.geminiModel || 'gemini-2.5-flash';
    const reqBody = { contents: [{ role: 'user', parts: [{ text: payload.prompt || '' }] }], generationConfig: { temperature: payload.temperature == null ? 0.7 : payload.temperature } };
    if (payload.system) reqBody.systemInstruction = { parts: [{ text: payload.system }] };
    if (payload.json) reqBody.generationConfig.responseMimeType = 'application/json';
    const data = JSON.stringify(reqBody);
    const req = https.request({ hostname: 'generativelanguage.googleapis.com', path: `/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(config.geminiApiKey)}`, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, res => {
      let b = ''; res.on('data', c => b += c); res.on('end', () => { try { const j = JSON.parse(b); if (res.statusCode >= 400) return reject(new Error((j.error && j.error.message) || ('Gemini 오류 ' + res.statusCode))); const parts = j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts; resolve(parts ? parts.map(p => p.text || '').join('') : ''); } catch (e) { reject(new Error('Gemini 응답 해석 실패')); } });
    });
    req.on('error', reject); req.write(data); req.end();
  });
}
async function api(req, res, url) {
  const p = url.pathname.replace(/^\/api/, ''); const m = req.method;
  if (p === '/health') return send(res, 200, { ok: true, remote: true, geminiEnabled: !!config.geminiApiKey, settings: publicSettings() });
  if (p === '/settings' && m === 'GET') return send(res, 200, publicSettings());
  if (p === '/signup' && m === 'POST') {
    const b = await body(req); if (!/^\d{7,10}$/.test(b.studentId || '') || !b.name || !b.pinHash) return send(res, 400, { error: '입력값이 올바르지 않습니다.' });
    const users = readJson('users.json', []); if (users.some(u => u.studentId === b.studentId)) return send(res, 409, { error: '이미 가입 신청된 학번입니다.' });
    const user = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8), studentId: b.studentId, name: String(b.name).slice(0, 20), pinHash: b.pinHash, sex: b.sex === '남' ? '남' : '여', status: 'pending', createdAt: Date.now() };
    users.push(user); writeJson('users.json', users); const { pinHash, ...safe } = user; return send(res, 200, { user: safe });
  }
  if (p === '/login' && m === 'POST') {
    const b = await body(req); const u = readJson('users.json', []).find(u => u.studentId === b.studentId);
    if (!u || u.pinHash !== b.pinHash) return send(res, 401, { error: '학번 또는 비밀번호가 올바르지 않습니다.' });
    const { pinHash, ...safe } = u; return send(res, 200, { user: safe });
  }
  if (p === '/results' && m === 'POST') {
    const r = await body(req); if (!r.studentId || typeof r.score !== 'number') return send(res, 400, { error: '결과 형식 오류' });
    const all = readJson('results.json', []); all.push(r); writeJson('results.json', all); if (r.mode !== 'practice') appendCsv(r); return send(res, 200, { ok: true });
  }
  if (p === '/results' && m === 'GET') {
    const sid = url.searchParams.get('studentId'); const all = readJson('results.json', []);
    if (sid) return send(res, 200, { results: all.filter(r => r.studentId === sid) });
    if (!isAdmin(req, url)) return send(res, 403, { error: '관리자 권한 필요' }); return send(res, 200, { results: all });
  }
  // --- 익힌 케이스(학생별) ---
  if (p === '/mastered' && m === 'GET') { const sid = url.searchParams.get('studentId'); const all = readJson('mastered.json', []); if (sid) return send(res, 200, { mastered: all.filter(x => x.studentId === sid) }); if (!isAdmin(req, url)) return send(res, 403, { error: '관리자 권한 필요' }); return send(res, 200, { mastered: all }); }
  if (p === '/mastered' && m === 'POST') { const b = await body(req); if (!b.studentId || !b.caseId) return send(res, 400, { error: '형식 오류' }); const all = readJson('mastered.json', []); if (!all.some(x => x.studentId === b.studentId && x.caseId === b.caseId)) { all.push({ studentId: String(b.studentId), caseId: String(b.caseId), caseTitle: String(b.caseTitle || '').slice(0, 80), floor: Number(b.floor) || 0, at: Date.now() }); writeJson('mastered.json', all); } return send(res, 200, { ok: true }); }
  if (p === '/mastered/delete' && m === 'POST') { const b = await body(req); writeJson('mastered.json', readJson('mastered.json', []).filter(x => !(x.studentId === b.studentId && x.caseId === b.caseId))); return send(res, 200, { ok: true }); }
  if (p === '/gemini' && m === 'POST') { try { return send(res, 200, { text: await gemini(await body(req)) }); } catch (e) { return send(res, 502, { error: e.message }); } }
  // --- 관리자 전용 ---
  if (p === '/admin/verify' && m === 'POST') { const b = await body(req); return String(b.pin) === String(config.adminPin) ? send(res, 200, { ok: true }) : send(res, 401, { error: 'PIN 불일치' }); }
  if (!isAdmin(req, url)) return send(res, 403, { error: '관리자 권한 필요' });
  if (p === '/users' && m === 'GET') return send(res, 200, { users: readJson('users.json', []).map(({ pinHash, ...u }) => u) });
  if (p === '/users/status' && m === 'POST') { const b = await body(req); const users = readJson('users.json', []); const u = users.find(u => u.id === b.id); if (!u) return send(res, 404, { error: '없음' }); u.status = b.status; if (b.status === 'approved') u.approvedAt = Date.now(); writeJson('users.json', users); return send(res, 200, { ok: true }); }
  if (p === '/users/delete' && m === 'POST') { const b = await body(req); writeJson('users.json', readJson('users.json', []).filter(u => u.id !== b.id)); return send(res, 200, { ok: true }); }
  if (p === '/settings' && m === 'POST') { const b = await body(req); ['questionTarget', 'questionsPerStep', 'passScore', 'schoolName', 'appName', 'geminiModel', 'aiMode', 'avatarGlbF', 'avatarGlbM'].forEach(k => { if (b[k] != null && b[k] !== '') config[k] = b[k]; }); fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8'); return send(res, 200, { ok: true }); }
  if (p === '/admin/pin' && m === 'POST') { const b = await body(req); if (!/^\d{4,8}$/.test(String(b.pin))) return send(res, 400, { error: 'PIN 형식' }); config.adminPin = String(b.pin); fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8'); return send(res, 200, { ok: true }); }
  if (p === '/results.csv' && m === 'GET') { const f = file('results.csv'); if (!fs.existsSync(f)) return send(res, 404, { error: '결과 없음' }); res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="results.csv"' }); return fs.createReadStream(f).pipe(res); }
  return send(res, 404, { error: 'not found' });
}
function serveStatic(req, res, url) {
  let fp = decodeURIComponent(url.pathname); if (fp === '/') fp = '/index.html';
  const abs = path.normalize(path.join(ROOT, fp)); if (!abs.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.stat(abs, (err, st) => { if (err || !st.isFile()) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); fs.createReadStream(abs).pipe(res); });
}
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try { if (url.pathname.startsWith('/api/')) await api(req, res, url); else serveStatic(req, res, url); }
  catch (e) { send(res, 500, { error: e.message }); }
}).listen(config.port, () => {
  const ips = Object.values(os.networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address);
  console.log(`\n🏥 PT 시뮬레이션 병원 서버 실행 중`);
  console.log(`   이 PC:          http://localhost:${config.port}`);
  ips.forEach(ip => console.log(`   같은 Wi-Fi 기기: http://${ip}:${config.port}`));
  console.log(`   관리자 PIN:     ${config.adminPin}  (server/config.json 에서 변경)`);
  console.log(`   Gemini:         ${config.geminiApiKey ? '서버 키 사용' : '미설정 (config.json 의 geminiApiKey)'}`);
  console.log(`   데이터 폴더:    ${DATA}\n   종료: Ctrl+C\n`);
});