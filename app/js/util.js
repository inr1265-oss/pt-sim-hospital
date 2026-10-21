// 공용 유틸리티
window.U = (() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'disabled' || k === 'checked' || k === 'selected') el[k] = !!v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    return append(el, ...children);
  }
  function append(el, ...children) {
    const add = c => { if (c == null || c === false) return; if (Array.isArray(c)) c.forEach(add); else el.appendChild(c.nodeType ? c : document.createTextNode(String(c))); };
    children.forEach(add);
    return el;
  }
  const shuffle = arr => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const pick = (arr, n) => shuffle(arr).slice(0, n);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const pad = n => String(n).padStart(2, '0');
  const fmtDate = d => { d = d instanceof Date ? d : new Date(d); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  async function sha256(str) {
    try {
      if (crypto && crypto.subtle) {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
        return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
      }
    } catch (e) { /* fall through */ }
    // 보안 컨텍스트가 아닐 때의 대체 해시(FNV-1a) — 식별용
    let h1 = 0x811c9dc5; for (const ch of str) { h1 ^= ch.codePointAt(0); h1 = Math.imul(h1, 0x01000193) >>> 0; }
    return 'fnv' + h1.toString(16);
  }
  let toastTimer;
  function toast(msg, type = 'info') {
    let box = $('#toast'); if (!box) { box = h('div', { id: 'toast' }); document.body.append(box); }
    box.textContent = msg; box.className = 'show ' + type; clearTimeout(toastTimer); toastTimer = setTimeout(() => box.className = '', 2600);
  }
  function modal({ title, body, actions = [], closable = true, wide = false }) {
    const root = $('#modal-root');
    const close = () => { wrap.remove(); };
    const card = h('div', { class: 'modal-card' + (wide ? ' wide' : '') },
      h('div', { class: 'modal-head' }, h('h3', { text: title }), closable ? h('button', { class: 'icon-btn', onClick: close, 'aria-label': '닫기' }, '✕') : null),
      h('div', { class: 'modal-body' }, typeof body === 'string' ? h('div', { html: body }) : body),
      actions.length ? h('div', { class: 'modal-actions' }, actions.map(a => h('button', { class: 'btn ' + (a.cls || ''), onClick: () => { const r = a.onClick ? a.onClick() : undefined; if (r !== false) close(); } }, a.label))) : null);
    const wrap = h('div', { class: 'modal-wrap', onClick: e => { if (closable && e.target === wrap) close(); } }, card);
    root.append(wrap);
    return { close, el: card };
  }
  const confirm = (msg, { ok = '확인', cancel = '취소' } = {}) => new Promise(res => modal({
    title: '확인', body: h('p', { text: msg }), closable: false,
    actions: [{ label: cancel, cls: 'ghost', onClick: () => res(false) }, { label: ok, cls: 'primary', onClick: () => res(true) }]
  }));
  function downloadBlob(blob, name) { const a = h('a', { href: URL.createObjectURL(blob), download: name }); document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
  const isTouch = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const circled = ['①', '②', '③', '④', '⑤'];
  // 음성 입력(Web Speech API, Chrome/Edge/Safari). 반환: 지원 여부
  const speechOK = () => !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  function listen(onText, onState) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR) return false;
    const r = new SR(); r.lang = 'ko-KR'; r.interimResults = false; r.maxAlternatives = 1;
    r.onresult = e => { try { onText(e.results[0][0].transcript); } catch (x) { /* ignore */ } };
    r.onend = () => { if (onState) onState(false); }; r.onerror = () => { if (onState) onState(false); };
    try { r.start(); if (onState) onState(true); return true; } catch (e) { return false; }
  }
  // ---- 보상 효과: 색종이·점수 팝업·축하 배너·효과음(WebAudio, 파일 불필요) ----
  function confetti(o = {}) {
    const n = o.count || 100, dur = o.duration || 1800, colors = o.colors || ['#22C55E', '#F59E0B', '#3B82F6', '#EC4899', '#A855F7', '#FDE047'];
    const cv = document.createElement('canvas'); cv.className = 'fx-canvas'; document.body.append(cv); const x = cv.getContext('2d'); const W = cv.width = innerWidth, H = cv.height = innerHeight;
    const ox = (o.origin && o.origin.x != null ? o.origin.x : .5) * W, oy = (o.origin && o.origin.y != null ? o.origin.y : .45) * H;
    const ps = Array.from({ length: n }, () => { const a = -Math.PI / 2 + (Math.random() - .5) * (o.spread || 2.2); const v = (6 + Math.random() * 9) * (o.scale || 1); return { x: ox, y: oy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: 4 + Math.random() * 5, c: colors[Math.floor(Math.random() * colors.length)], rot: Math.random() * 6.28, vr: (Math.random() - .5) * .3 }; });
    const t0 = performance.now();
    (function frame(t) { const k = (t - t0) / dur; x.clearRect(0, 0, W, H); ps.forEach(p => { p.vy += .25; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.rot += p.vr; x.save(); x.globalAlpha = Math.max(0, 1 - k * 1.1); x.translate(p.x, p.y); x.rotate(p.rot); x.fillStyle = p.c; x.fillRect(-p.r / 2, -p.r / 3, p.r, p.r / 1.5); x.restore(); }); if (k < 1) requestAnimationFrame(frame); else cv.remove(); })(t0);
  }
  function burst(text, cls = '') { const el = h('div', { class: 'fx-burst ' + cls }, text); document.body.append(el); setTimeout(() => el.classList.add('go'), 20); setTimeout(() => el.remove(), 1400); }
  function cheer(title, sub, ms = 2400) { const el = h('div', { class: 'fx-cheer' }, h('div', { class: 'fx-title' }, title), sub ? h('div', { class: 'fx-sub' }, sub) : null); document.body.append(el); setTimeout(() => el.classList.add('go'), 20); setTimeout(() => { el.classList.remove('go'); setTimeout(() => el.remove(), 400); }, ms); }
  let actx = null;
  function chime(kind = 'correct') {
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; actx = actx || new AC(); if (actx.state === 'suspended') actx.resume();
      const seq = { correct: [[659, 0, .12], [988, .1, .2]], wrong: [[196, 0, .25]], done: [[523, 0, .14], [659, .13, .14], [784, .26, .14], [1047, .39, .32]], perfect: [[659, 0, .1], [784, .1, .1], [988, .2, .1], [1319, .3, .45]], pass: [[523, 0, .15], [523, .15, .15], [523, .3, .15], [659, .45, .3], [784, .75, .3], [1047, 1.05, .6]] }[kind] || [[660, 0, .15]];
      const t0 = actx.currentTime + .01;
      seq.forEach(([f, dt, d]) => { const o = actx.createOscillator(), g = actx.createGain(); o.type = kind === 'wrong' ? 'sawtooth' : 'triangle'; o.frequency.value = f; g.gain.setValueAtTime(0, t0 + dt); g.gain.linearRampToValueAtTime(kind === 'wrong' ? .1 : .16, t0 + dt + .02); g.gain.exponentialRampToValueAtTime(.001, t0 + dt + d); o.connect(g).connect(actx.destination); o.start(t0 + dt); o.stop(t0 + dt + d + .05); });
    } catch (e) { /* 소리가 안 나도 진행 */ }
  }
  return { $, $$, h, append, shuffle, pick, uid, fmtDate, esc, sha256, toast, modal, confirm, downloadBlob, isTouch, sleep, circled, speechOK, listen, confetti, burst, cheer, chime };
})();