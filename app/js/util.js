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
  return { $, $$, h, append, shuffle, pick, uid, fmtDate, esc, sha256, toast, modal, confirm, downloadBlob, isTouch, sleep, circled };
})();