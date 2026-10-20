// 병원 지도(캔버스): 층별 5개 병실 + 엘리베이터, 키보드/클릭/터치 이동
window.Hospital = (() => {
  if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); this.moveTo(x + r, y); this.arcTo(x + w, y, x + w, y + h, r); this.arcTo(x + w, y + h, x, y + h, r); this.arcTo(x, y + h, x, y, r); this.arcTo(x, y, x + w, y, r); this.closePath(); return this; };
  }
  const TILE = 32, COLS = 22, ROWS = 10, W = COLS * TILE, H = ROWS * TILE;
  const ROOM_COLS = [[3, 5], [7, 9], [11, 13], [15, 17], [19, 21]];
  const DOORS = ROOM_COLS.map(([a]) => a + 1); // 4,8,12,16,20
  const ELEV = { c0: 0, c1: 1, r0: 1, door: { c: 1, r: 5 } };
  const FLOOR_META = {
    1: { name: '임상의사결정 문진실', color: '#E3F3EA', accent: '#0F7A4D', deep: '#0B5E3B', prop: '🩺', wall: '#EEF6F1', tile: ['#E2EBE5', '#EAF1EC'], gap: ['🕒', '🖼️'] },
    2: { name: '운동치료실', color: '#E1EEFF', accent: '#2563EB', deep: '#1E40AF', prop: '🏋️', wall: '#EEF4FC', tile: ['#E0E8F3', '#E9EFF7'], gap: ['📋', '🏃'] },
    3: { name: '소아물리치료실', color: '#FDE8F1', accent: '#DB2777', deep: '#9D174D', prop: '🧸', wall: '#FEF2F7', tile: ['#F5E4EC', '#FAEDF3'], gap: ['⭐', '☁️'] },
    4: { name: '물리적인자치료실', color: '#FFF3DD', accent: '#D97706', deep: '#92400E', prop: '⚡', wall: '#FBF5EC', tile: ['#F0E9DE', '#F6F0E7'], gap: ['⚠️', '🧯'] }
  };
  let canvas = null, ctx = null, opts = {}, floor = 1, raf = null, running = false, lastTs = 0, hoverRoom = -1, watchdog = null;
  const player = { c: 2, r: 6, x: 2, y: 6, path: [], dir: 'down', step: 0 };

  const walkable = (c, r) => c >= 0 && c < COLS && ((r === 6 || r === 7) || (r === 5 && (DOORS.includes(c) || c === ELEV.door.c)));
  const roomAt = (c, r) => (r < 1 || r > 5) ? -1 : ROOM_COLS.findIndex(([a, b]) => c >= a && c <= b);
  const inElev = t => t.c >= ELEV.c0 && t.c <= ELEV.c1 && t.r >= ELEV.r0 && t.r <= 5;

  function bfs(from, to) {
    if (!walkable(to.c, to.r)) return null;
    const key = (c, r) => c + ',' + r; const prev = new Map([[key(from.c, from.r), null]]); const q = [from];
    while (q.length) {
      const cur = q.shift();
      if (cur.c === to.c && cur.r === to.r) { const path = []; let node = cur; while (node) { path.unshift(node); node = prev.get(key(node.c, node.r)); } return path.slice(1); }
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = { c: cur.c + dc, r: cur.r + dr }; if (!walkable(n.c, n.r) || prev.has(key(n.c, n.r))) continue; prev.set(key(n.c, n.r), cur); q.push(n); }
    }
    return null;
  }
  function mount(cv, o) {
    canvas = cv; ctx = cv.getContext('2d'); opts = o || {}; floor = opts.floor || 1;
    resize(); window.addEventListener('resize', resize);
    cv.addEventListener('pointerdown', onPointer); cv.addEventListener('pointermove', onHover); cv.addEventListener('pointerleave', () => { hoverRoom = -1; });
    window.addEventListener('keydown', onKey);
    running = true; lastTs = performance.now(); raf = requestAnimationFrame(loop);
    // 백그라운드/숨김 상태에서 requestAnimationFrame이 멈추면 타이머로 대신 진행
    watchdog = setInterval(() => { if (running && performance.now() - lastTs > 60) tick(performance.now()); }, 40);
  }
  function destroy() { running = false; cancelAnimationFrame(raf); clearInterval(watchdog); window.removeEventListener('keydown', onKey); window.removeEventListener('resize', resize); }
  function resize() {
    if (!canvas || !canvas.parentElement) return;
    const rect = canvas.parentElement.getBoundingClientRect(); if (!rect.width) return;
    const scale = rect.width / W; const dpr = window.devicePixelRatio || 1;
    canvas.style.width = rect.width + 'px'; canvas.style.height = (H * scale) + 'px';
    canvas.width = Math.round(W * scale * dpr); canvas.height = Math.round(H * scale * dpr);
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
  }
  function toTile(e) { const rect = canvas.getBoundingClientRect(); const x = (e.clientX - rect.left) / rect.width * W, y = (e.clientY - rect.top) / rect.height * H; return { c: Math.floor(x / TILE), r: Math.floor(y / TILE) }; }
  const enabled = () => !opts.enabled || opts.enabled();
  function onHover(e) { const t = toTile(e); hoverRoom = roomAt(t.c, t.r); canvas.style.cursor = (hoverRoom >= 0 || walkable(t.c, t.r) || inElev(t)) ? 'pointer' : 'default'; }
  function onPointer(e) {
    if (!enabled()) return; e.preventDefault(); const t = toTile(e); const ri = roomAt(t.c, t.r); let target = null;
    if (ri >= 0) target = { c: DOORS[ri], r: 5 }; else if (inElev(t)) target = ELEV.door; else if (walkable(t.c, t.r)) target = t;
    if (!target) return;
    if (player.r === 6 && target.r === 5 && target.c === player.c && !player.path.length) { arrivedAt(target); return; } // 문 앞에서 다시 터치 → 입장
    goTo(target);
  }
  function goTo(target) { const p = bfs({ c: player.c, r: player.r }, target); if (p) player.path = p; }
  function move(dir) {
    if (!enabled() || player.path.length) return;
    const d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir]; if (!d) return; player.dir = dir;
    const n = { c: player.c + d[0], r: player.r + d[1] }; if (walkable(n.c, n.r)) player.path = [n];
  }
  function onKey(e) {
    if (!enabled()) return; if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
    const map = { ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down', ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right' };
    const dir = map[e.key]; if (dir) { e.preventDefault(); move(dir); return; }
    if (e.key === 'Enter' || e.key === ' ') { if (player.r === 6 && !player.path.length) { if (DOORS.includes(player.c)) { e.preventDefault(); arrivedAt({ c: player.c, r: 5 }); } else if (player.c <= 1) { e.preventDefault(); arrivedAt(ELEV.door); } } }
  }
  const SPEED = 7; // 타일/초
  function tick(ts) { const dt = Math.min(0.1, Math.max(0, (ts - lastTs) / 1000)); lastTs = ts; update(dt); draw(ts); }
  function loop(ts) { if (!running) return; tick(ts); raf = requestAnimationFrame(loop); }
  function update(dt) {
    if (!player.path.length) return;
    const n = player.path[0]; const dx = n.c - player.x, dy = n.r - player.y; const dist = Math.hypot(dx, dy); const stepLen = SPEED * dt; player.step += stepLen * 4;
    if (Math.abs(dx) > Math.abs(dy)) player.dir = dx > 0 ? 'right' : 'left'; else if (dy !== 0) player.dir = dy > 0 ? 'down' : 'up';
    if (dist <= stepLen) { player.x = n.c; player.y = n.r; player.c = n.c; player.r = n.r; player.path.shift(); if (!player.path.length && player.r === 5) arrivedAt({ c: player.c, r: 5 }); }
    else { player.x += dx / dist * stepLen; player.y += dy / dist * stepLen; }
  }
  function arrivedAt(t) {
    // 문 타일 도착 → 복도로 한 칸 물러선 뒤 콜백
    player.c = t.c; player.r = 6; player.x = t.c; player.y = 6; player.path = []; player.dir = 'down';
    const ri = DOORS.indexOf(t.c);
    if (ri >= 0) { if (opts.onEnterRoom) opts.onEnterRoom(ri); }
    else if (t.c <= 1) { if (opts.onElevator) opts.onElevator(); }
  }

  // ---------- 그리기 ----------
  function rr(x, y, w, h, r, fill, stroke, lw) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1.5; ctx.stroke(); } }
  function lin(x0, y0, x1, y1, stops) { const g = ctx.createLinearGradient(x0, y0, x1, y1); stops.forEach(([o, c]) => g.addColorStop(o, c)); return g; }
  function text(t, x, y, font, color, align) { ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align || 'left'; ctx.textBaseline = 'middle'; ctx.fillText(t, x, y); }
  function pill(t, cx, cy, bg, fg, font) { ctx.font = font || 'bold 10px sans-serif'; const w = ctx.measureText(t).width + 14; rr(cx - w / 2, cy - 9, w, 18, 9, bg); text(t, cx, cy + 0.5, font || 'bold 10px sans-serif', fg, 'center'); }
  const SKIN = '#F6D3B5', SKIN_D = '#E2B08E';

  function emoji(e, x, y, size) { ctx.font = `${size}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(e, x, y); }
  function chair(x, y, color) { rr(x, y + 6, 16, 10, 3, color); rr(x, y, 16, 6, 2, '#1F2937'); rr(x + 2, y + 16, 3, 4, 1, '#475569'); rr(x + 11, y + 16, 3, 4, 1, '#475569'); }
  function drawBackground(meta, ts) {
    ctx.fillStyle = '#F4F6F9'; ctx.fillRect(0, 0, W, H);
    // 병실 뒤 벽(층별 색·패턴)
    ctx.fillStyle = meta.wall; ctx.fillRect(0, TILE, W, 5 * TILE);
    if (floor === 3) { ctx.fillStyle = 'rgba(219,39,119,.08)'; for (let x = 12; x < W; x += 26) for (let y = TILE + 12; y < 6 * TILE; y += 26) { ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill(); } }
    if (floor === 2) { ctx.fillStyle = 'rgba(37,99,235,.05)'; for (let y = TILE + 6; y < 6 * TILE; y += 12) ctx.fillRect(0, y, W, 5); }
    if (floor === 4) { ctx.strokeStyle = 'rgba(217,119,6,.07)'; ctx.lineWidth = 1; for (let x = 0; x < W; x += 24) { ctx.beginPath(); ctx.moveTo(x, TILE); ctx.lineTo(x, 6 * TILE); ctx.stroke(); } }
    if (floor === 1) { ctx.fillStyle = 'rgba(15,122,77,.06)'; ctx.fillRect(0, 4.4 * TILE, W, 1.6 * TILE); }
    // 상단 벽 띠 + 층 안내판
    ctx.fillStyle = lin(0, 0, 0, TILE, [[0, meta.color], [1, '#FFFFFF']]); ctx.fillRect(0, 0, W, TILE);
    ctx.fillStyle = 'rgba(0,0,0,.06)'; ctx.fillRect(0, TILE - 2, W, 2);
    rr(10, 5, 40, 22, 6, meta.deep); text(`${floor}F`, 30, 16.5, 'bold 13px sans-serif', '#fff', 'center');
    text(meta.name, 58, 16.5, 'bold 14px sans-serif', '#1F2937');
    text(U.isTouch ? '병실을 터치하면 이동 · 문 앞에서 다시 터치하면 입장' : '방향키/클릭으로 이동 · 문 앞에서 Enter로 입장', W - 12, 16.5, '11px sans-serif', '#6B7280', 'right');
    if (floor === 3) { // 무지개
      ['#F87171', '#FBBF24', '#34D399', '#60A5FA', '#A78BFA'].forEach((c, i) => { ctx.strokeStyle = c; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(330, TILE + 2, 26 - i * 3.2, Math.PI, 0); ctx.stroke(); });
      emoji('☁️', 296, TILE - 6, 13); emoji('☁️', 366, TILE - 6, 13);
    }
    if (floor === 2) { rr(300, 6, 150, 20, 10, meta.accent); text('오늘도 한 걸음 더! 🏃', 375, 16.5, 'bold 11px sans-serif', '#fff', 'center'); }
    if (floor === 4) { for (let x = 300; x < 460; x += 16) { ctx.fillStyle = (x / 16) % 2 ? '#FBBF24' : '#1F2937'; ctx.fillRect(x, 24, 16, 5); } }
    if (floor === 1) { rr(300, 6, 120, 20, 10, '#fff'); text('ℹ️ 접수 · 안내', 360, 16.5, 'bold 11px sans-serif', meta.deep, 'center'); }
    // 병실 사이 벽 장식
    [6, 10, 14, 18].forEach((c, i) => { const gx = c * TILE + TILE / 2; emoji(meta.gap[i % 2], gx, 1.7 * TILE + (floor === 3 ? Math.sin(ts / 700 + i) * 2 : 0), 15); if (i % 2 === 0) emoji('🪴', gx, 4.55 * TILE, 15); });
    // 복도 바닥(타일) + 걸레받이
    for (let c = 0; c < COLS; c++) for (let r = 6; r < 8; r++) { ctx.fillStyle = (c + r) % 2 ? meta.tile[0] : meta.tile[1]; ctx.fillRect(c * TILE, r * TILE, TILE, TILE); }
    ctx.fillStyle = 'rgba(0,0,0,.10)'; ctx.fillRect(0, 6 * TILE, W, 3);
    ctx.strokeStyle = 'rgba(31,41,55,.12)'; ctx.setLineDash([8, 8]); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, 7 * TILE); ctx.lineTo(W, 7 * TILE); ctx.stroke(); ctx.setLineDash([]);
    // 하단 구역(층별 테마 공간)
    ctx.fillStyle = lin(0, 8 * TILE, 0, H, [[0, '#E6EBF1'], [1, '#D8DFE8']]); ctx.fillRect(0, 8 * TILE, W, 2 * TILE);
    ctx.fillStyle = '#C9D2DD'; ctx.fillRect(0, 8 * TILE, W, 3);
    drawDecor(meta, ts);
  }
  function drawDecor(meta, ts) {
    const y0 = 8 * TILE; const t = ts / 1000;
    const win = x => { rr(x, y0 + 8, 46, 40, 6, lin(x, y0, x + 46, y0 + 40, [[0, '#DFF1FF'], [1, '#B9DBFA']]), '#9DBBD8'); ctx.strokeStyle = '#9DBBD8'; ctx.beginPath(); ctx.moveTo(x + 23, y0 + 8); ctx.lineTo(x + 23, y0 + 48); ctx.stroke(); ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.beginPath(); ctx.moveTo(x + 4, y0 + 44); ctx.lineTo(x + 18, y0 + 12); ctx.lineTo(x + 26, y0 + 12); ctx.lineTo(x + 12, y0 + 44); ctx.closePath(); ctx.fill(); };
    if (floor === 1) {
      // 접수 데스크 + 대기 의자 + 정수기 + 게시판
      rr(36, y0 + 10, 160, 42, 8, lin(0, y0, 0, y0 + 52, [[0, '#CDA77C'], [1, '#A77B4F']]), '#8E6540'); rr(36, y0 + 10, 160, 7, 4, '#EBD8BF');
      rr(44, y0 + 24, 64, 18, 4, '#0B5E3B'); text('접수 · 안내', 76, y0 + 33, 'bold 10px sans-serif', '#fff', 'center');
      rr(122, y0 + 22, 60, 20, 4, '#111827'); text(`대기 ${pad2(1 + Math.floor(t / 3) % 5)}번`, 152, y0 + 32.5, 'bold 10px monospace', Math.floor(t * 2) % 2 ? '#F87171' : '#FCA5A5', 'center');
      rr(160, y0 - 4, 24, 16, 3, '#1F2937'); rr(163, y0 - 1, 18, 10, 2, '#60A5FA'); rr(170, y0 + 12, 4, 3, 1, '#374151');
      [0, 1, 2, 3, 4].forEach(i => chair(222 + i * 30, y0 + 20, meta.accent));
      emoji('🚰', 400, y0 + 30, 24); emoji('🪴', 436, y0 + 32, 22);
      rr(470, y0 + 10, 100, 40, 4, '#F8EFD8', '#C9B48B'); [0, 1, 2].forEach(i => rr(478 + i * 30, y0 + 16, 22, 26, 2, i === 1 ? '#DBEAFE' : '#fff', '#D1D5DB')); text('📌', 520, y0 + 12, '10px serif', '#000', 'center');
      win(590); emoji('🪴', 666, y0 + 32, 22);
    } else if (floor === 2) {
      // 평행봉 · 매트 · 트레드밀 · 짐볼 · 자전거
      [y0 + 16, y0 + 40].forEach(y => { rr(40, y, 110, 4, 2, '#94A3B8'); [40, 94, 146].forEach(x => rr(x, y - 2, 4, 12, 1, '#64748B')); });
      rr(170, y0 + 10, 70, 44, 6, '#60A5FA', '#3B82F6'); ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = 1; [14, 28].forEach(d => { ctx.beginPath(); ctx.moveTo(170 + d, y0 + 10); ctx.lineTo(170 + d, y0 + 54); ctx.stroke(); });
      rr(258, y0 + 8, 48, 50, 6, '#334155'); rr(264, y0 + 16, 36, 38, 3, '#0F172A'); ctx.fillStyle = '#475569'; for (let k = 0; k < 4; k++) { const yy = y0 + 18 + ((k * 9 + t * 30) % 34); ctx.fillRect(266, yy, 32, 2); } rr(262, y0 + 4, 40, 8, 3, '#60A5FA');
      [['#F472B6', 336, y0 + 36, 12], ['#34D399', 362, y0 + 26, 10], ['#FBBF24', 386, y0 + 40, 11]].forEach(([c, x, y, r]) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.beginPath(); ctx.arc(x - r / 3, y - r / 3, r / 3, 0, Math.PI * 2); ctx.fill(); });
      emoji('🏋️', 430, y0 + 32, 26); emoji('🚴', 474, y0 + 32, 26); emoji('🧘', 516, y0 + 32, 24);
      win(560); emoji('🪴', 650, y0 + 32, 22);
    } else if (floor === 3) {
      // 놀이매트 · 미끄럼틀 · 장난감 · 풍선
      const cols = ['#FCA5A5', '#FDE68A', '#86EFAC', '#93C5FD'];
      for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) rr(36 + i * 26, y0 + 8 + j * 26, 24, 24, 4, cols[(i + j) % 4]);
      ctx.fillStyle = '#FBBF24'; ctx.beginPath(); ctx.moveTo(210, y0 + 54); ctx.lineTo(240, y0 + 10); ctx.lineTo(252, y0 + 10); ctx.lineTo(290, y0 + 54); ctx.closePath(); ctx.fill();
      rr(236, y0 + 6, 20, 8, 3, '#F59E0B'); ctx.strokeStyle = '#B45309'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(214, y0 + 50); ctx.lineTo(242, y0 + 12); ctx.stroke();
      emoji('🧸', 318, y0 + 34, 24); emoji('🚂', 352 + Math.sin(t) * 3, y0 + 36, 24); emoji('🪀', 388, y0 + 30, 20);
      rr(412, y0 + 20, 56, 34, 6, '#F9A8D4', '#EC4899'); text('TOY', 440, y0 + 38, 'bold 11px sans-serif', '#fff', 'center');
      [[500, 0], [526, 1.3]].forEach(([x, ph], i) => { const by = y0 + 22 + Math.sin(t * 1.6 + ph) * 3; ctx.strokeStyle = '#9CA3AF'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, by + 10); ctx.lineTo(x + 2, y0 + 58); ctx.stroke(); ctx.fillStyle = i ? '#60A5FA' : '#F472B6'; ctx.beginPath(); ctx.ellipse(x, by, 9, 11, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.beginPath(); ctx.arc(x - 3, by - 4, 2.5, 0, Math.PI * 2); ctx.fill(); });
      win(560); emoji('🪴', 650, y0 + 32, 22);
    } else {
      // 전기치료기 카트 · 핫팩 유닛 · 적외선 램프 · 초음파 · 냉팩 냉장고 · 파라핀욕
      rr(36, y0 + 8, 60, 48, 6, '#E5E7EB', '#9CA3AF'); rr(42, y0 + 14, 48, 20, 3, '#0F172A'); ctx.strokeStyle = '#34D399'; ctx.lineWidth = 1.5; ctx.beginPath(); for (let k = 0; k <= 44; k += 2) { const yy = y0 + 24 + Math.sin(k / 4 + t * 4) * 6 * (k % 16 < 8 ? 1 : .3); k ? ctx.lineTo(44 + k, yy) : ctx.moveTo(44 + k, yy); } ctx.stroke();
      [52, 66, 80].forEach(x => { ctx.fillStyle = '#6B7280'; ctx.beginPath(); ctx.arc(x, y0 + 44, 4, 0, Math.PI * 2); ctx.fill(); }); ctx.fillStyle = Math.floor(t * 2) % 2 ? '#22C55E' : '#166534'; ctx.beginPath(); ctx.arc(90, y0 + 44, 2.5, 0, Math.PI * 2); ctx.fill();
      rr(112, y0 + 14, 50, 42, 6, lin(112, 0, 162, 0, [[0, '#E5E7EB'], [1, '#9CA3AF']]), '#6B7280'); rr(116, y0 + 10, 42, 8, 3, '#9CA3AF'); ctx.strokeStyle = 'rgba(148,163,184,.8)'; ctx.lineWidth = 1.5; for (let k = 0; k < 3; k++) { const ph = (t * 0.8 + k * 0.7) % 1; ctx.globalAlpha = 1 - ph; ctx.beginPath(); ctx.moveTo(124 + k * 12, y0 + 8 - ph * 12); ctx.quadraticCurveTo(128 + k * 12, y0 + 2 - ph * 12, 124 + k * 12, y0 - 4 - ph * 12); ctx.stroke(); } ctx.globalAlpha = 1; emoji('🔥', 137, y0 + 36, 16);
      ctx.strokeStyle = '#64748B'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(190, y0 + 56); ctx.lineTo(190, y0 + 22); ctx.lineTo(206, y0 + 14); ctx.stroke(); const glow = ctx.createRadialGradient(210, y0 + 14, 2, 210, y0 + 14, 18); glow.addColorStop(0, 'rgba(252,165,165,.9)'); glow.addColorStop(1, 'rgba(252,165,165,0)'); ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(210, y0 + 14, 18, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#EF4444'; ctx.beginPath(); ctx.arc(210, y0 + 14, 8, 0, Math.PI * 2); ctx.fill(); rr(180, y0 + 54, 20, 4, 2, '#475569');
      rr(236, y0 + 8, 54, 48, 6, '#F3F4F6', '#9CA3AF'); rr(242, y0 + 14, 42, 16, 3, '#1E3A8A'); text('US', 263, y0 + 22.5, 'bold 9px sans-serif', '#BFDBFE', 'center'); ctx.strokeStyle = '#4B5563'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(284, y0 + 34); ctx.quadraticCurveTo(300, y0 + 40, 296, y0 + 52); ctx.stroke(); rr(292, y0 + 50, 10, 6, 2, '#374151');
      rr(322, y0 + 4, 36, 54, 5, '#BFDBFE', '#60A5FA'); rr(326, y0 + 10, 28, 20, 3, '#DBEAFE'); rr(352, y0 + 22, 3, 16, 1, '#1D4ED8'); emoji('🧊', 340, y0 + 44, 14);
      rr(380, y0 + 20, 48, 32, 6, '#FDE68A', '#F59E0B'); rr(384, y0 + 24, 40, 12, 4, '#FEF3C7'); emoji('🕯️', 404, y0 + 44, 12);
      emoji('⚡', 452, y0 + 32, 22); win(560); emoji('🪴', 650, y0 + 32, 22);
    }
  }
  const pad2 = n => String(n).padStart(2, '0');  function drawElevator(ts) {
    const x = 4, y = ELEV.r0 * TILE + 4, w = 2 * TILE - 8, h = 4 * TILE - 8;
    rr(x, y, w, h, 8, lin(x, y, x + w, y, [[0, '#B6C1CF'], [0.5, '#E2E8F0'], [1, '#B6C1CF']]), '#8E9AAB');
    rr(x + 6, y + 6, w - 12, 16, 4, '#1F2937'); text(`${floor}F ▲▼`, x + w / 2, y + 14.5, 'bold 10px monospace', '#F87171', 'center');
    const dy = y + 28, dh = h - 48; rr(x + 7, dy, (w - 16) / 2, dh, 3, lin(x, dy, x + w, dy, [[0, '#CBD5E1'], [1, '#94A3B8']]), '#64748B'); rr(x + w / 2 + 1, dy, (w - 16) / 2, dh, 3, lin(x, dy, x + w, dy, [[0, '#94A3B8'], [1, '#CBD5E1']]), '#64748B');
    text('엘리베이터', x + w / 2, y + h - 9, 'bold 9px sans-serif', '#334155', 'center');
    rr(6, 5 * TILE + 2, 2 * TILE - 12, TILE - 4, 4, '#64748B');
    ctx.fillStyle = '#F59E0B'; ctx.beginPath(); ctx.arc(x + w + 2, y + h / 2, 3, 0, Math.PI * 2); ctx.fill();
  }
  function drawRoom(i, meta, ts) {
    const [a] = ROOM_COLS[i]; const x = a * TILE, y = TILE, w = 3 * TILE, hgt = 4 * TILE;
    const room = (opts.getRoom && opts.getRoom(i)) || {}; const done = room.status === 'done'; const empty = room.status === 'empty'; const hovered = hoverRoom === i;
    // 그림자 + 바닥
    rr(x + 4, y + 6, w - 4, hgt - 2, 10, 'rgba(15,23,42,.08)');
    rr(x + 2, y + 2, w - 4, hgt - 2, 10, done ? '#F3FBF5' : '#FFFFFF', hovered ? meta.accent : '#D6DCE4', hovered ? 2.5 : 1.5);
    // 창문
    rr(x + w - 34, y + 7, 26, 12, 3, lin(x, y, x, y + 20, [[0, '#DFF1FF'], [1, '#BFE0FB']]), '#A9C6E0');
    // 방 번호
    rr(x + 6, y + 6, 36, 14, 4, meta.color); text(`${floor}0${i + 1}호`, x + 24, y + 13.5, 'bold 10px sans-serif', meta.deep, 'center');
    // 침대
    const bx = x + 12, by = y + 26, bw = w - 24, bh = 48;
    rr(bx, by, bw, bh, 8, '#D9E1EA', '#C5CFDC'); rr(bx + 4, by + 4, bw - 8, bh - 8, 6, '#F7F9FC');
    rr(bx + 7, by + 9, 14, bh - 18, 5, '#FFFFFF', '#E2E8F0');
    if (!empty) {
      const ped = room.pediatric; const s = ped ? 0.8 : 1; const hx = bx + 14, hy = by + bh / 2; const hr = 7 * s;
      // 이불
      const bl = done ? '#BBF7D0' : (ped ? '#FFE3A8' : meta.color);
      rr(bx + 24, by + 9, bw - 32, bh - 18, 7, bl, done ? '#86EFAC' : 'rgba(0,0,0,.08)');
      ctx.strokeStyle = 'rgba(0,0,0,.08)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(bx + 34, by + 12); ctx.lineTo(bx + 34, by + bh - 12); ctx.moveTo(bx + 44, by + 12); ctx.lineTo(bx + 44, by + bh - 12); ctx.stroke();
      // 머리(머리카락 + 얼굴)
      ctx.fillStyle = done ? '#6B4F3A' : '#3B2A20'; ctx.beginPath(); ctx.ellipse(hx - 2, hy, hr + 2, hr + 1.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = SKIN; ctx.beginPath(); ctx.arc(hx, hy, hr, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2A2A2A'; ctx.fillRect(hx - 1, hy - 3.5, 1.6, 2.2); ctx.fillRect(hx - 1, hy + 1.3, 1.6, 2.2);
      if (ped) { ctx.font = '11px serif'; ctx.textAlign = 'center'; ctx.fillText('🧸', bx + bw - 12, by + 12); }
      // 호출등
      if (!done) { const on = Math.floor(ts / 600) % 2 === 0; ctx.fillStyle = on ? '#EF4444' : '#FCA5A5'; ctx.beginPath(); ctx.arc(bx + bw - 6, by - 2, 3.5, 0, Math.PI * 2); ctx.fill(); if (on) { ctx.fillStyle = 'rgba(239,68,68,.25)'; ctx.beginPath(); ctx.arc(bx + bw - 6, by - 2, 7, 0, Math.PI * 2); ctx.fill(); } }
      else { ctx.fillStyle = '#16A34A'; ctx.beginPath(); ctx.arc(x + w - 14, y + 30, 8, 0, Math.PI * 2); ctx.fill(); text('✓', x + w - 14, y + 30.5, 'bold 11px sans-serif', '#fff', 'center'); }
    }
    // 층별 소품
    ctx.font = '12px serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(meta.prop, x + w - 7, y + hgt - 13);
    // 이름 · 상태
    text(room.label || '빈 병실', x + w / 2, y + hgt - 31, '10.5px sans-serif', done ? '#15803D' : '#374151', 'center');
    pill(done ? '✓ 치료 완료' : empty ? '빈 병실' : '대기 중', x + w / 2, y + hgt - 14, done ? '#DCFCE7' : empty ? '#F1F5F9' : '#FEF3C7', done ? '#15803D' : empty ? '#94A3B8' : '#92400E');
    // 문
    const dx = DOORS[i] * TILE + 5, dy = 5 * TILE + 1, dw = TILE - 10, dh = TILE - 2;
    rr(dx - 2, dy - 1, dw + 4, dh + 2, 5, '#8A6A4E');
    rr(dx, dy, dw, dh, 4, lin(dx, dy, dx + dw, dy, [[0, '#C8955A'], [1, '#A67340']]), hovered ? meta.accent : '#7A5230', hovered ? 2 : 1);
    ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(dx + 4, dy + 5, dw - 8, 9);
    ctx.fillStyle = '#F5D27A'; ctx.beginPath(); ctx.arc(dx + dw - 5, dy + dh / 2 + 2, 2, 0, Math.PI * 2); ctx.fill();
  }
  function drawPlayer() {
    const px = (player.x + 0.5) * TILE, py = (player.y + 0.5) * TILE; const moving = player.path.length > 0; const bob = moving ? Math.sin(player.step) * 1.5 : 0; const sw = moving ? Math.sin(player.step) * 3 : 0;
    ctx.fillStyle = 'rgba(15,23,42,.18)'; ctx.beginPath(); ctx.ellipse(px, py + 13, 10, 4, 0, 0, Math.PI * 2); ctx.fill();
    // 다리
    ctx.fillStyle = '#334155'; rr(px - 6, py + 8 + sw / 2, 5, 6, 2, '#334155'); rr(px + 1, py + 8 - sw / 2, 5, 6, 2, '#334155');
    // 가운 + 수술복
    rr(px - 10, py - 4 + bob, 20, 16, 6, '#FFFFFF', '#CBD5E1');
    ctx.fillStyle = '#0F7A4D'; ctx.beginPath(); ctx.moveTo(px - 4, py - 4 + bob); ctx.lineTo(px + 4, py - 4 + bob); ctx.lineTo(px, py + 4 + bob); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#D1D5DB'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px - 4, py - 4 + bob); ctx.lineTo(px - 2, py + 10 + bob); ctx.moveTo(px + 4, py - 4 + bob); ctx.lineTo(px + 2, py + 10 + bob); ctx.stroke();
    // 청진기
    ctx.strokeStyle = '#374151'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(px, py - 1 + bob, 6, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke(); ctx.fillStyle = '#374151'; ctx.beginPath(); ctx.arc(px + 5.5, py + 4 + bob, 2, 0, Math.PI * 2); ctx.fill();
    rr(px + 3, py + 1 + bob, 5, 3, 1, '#0F7A4D');
    // 머리
    ctx.fillStyle = SKIN; ctx.beginPath(); ctx.arc(px, py - 11 + bob, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3B2A20';
    if (player.dir === 'up') { ctx.beginPath(); ctx.arc(px, py - 11 + bob, 8, 0, Math.PI * 2); ctx.fill(); }
    else { ctx.beginPath(); ctx.arc(px, py - 12.5 + bob, 8, Math.PI, 0); ctx.fill(); ctx.fillRect(px - 8, py - 12.5 + bob, 16, 2.5); const ex = player.dir === 'left' ? -3 : player.dir === 'right' ? 3 : 0; ctx.fillStyle = '#2A2A2A'; ctx.fillRect(px - 3.5 + ex, py - 10 + bob, 2, 2.4); ctx.fillRect(px + 1.5 + ex, py - 10 + bob, 2, 2.4); ctx.fillStyle = 'rgba(240,120,120,.35)'; ctx.fillRect(px - 6 + ex, py - 7 + bob, 3, 1.5); ctx.fillRect(px + 3 + ex, py - 7 + bob, 3, 1.5); }
  }
  function draw(ts) {
    const meta = FLOOR_META[floor] || FLOOR_META[1];
    ctx.clearRect(0, 0, W, H);
    drawBackground(meta, ts); drawElevator(ts);
    ROOM_COLS.forEach((_, i) => drawRoom(i, meta, ts));
    if (player.r === 6 && !player.path.length) {
      let hintX = null, t = '';
      if (DOORS.includes(player.c)) { hintX = player.c * TILE + TILE / 2; t = U.isTouch ? '↑ 터치 입장' : 'Enter 입장'; }
      else if (player.c <= 1) { hintX = TILE; t = U.isTouch ? '↑ 터치 탑승' : 'Enter 탑승'; }
      if (hintX != null) pill(t, hintX, 5 * TILE - 13, '#111827', '#fff', 'bold 10px sans-serif');
    }
    drawPlayer();
  }
  function setFloor(f) { floor = f; player.c = 2; player.r = 6; player.x = 2; player.y = 6; player.path = []; }
  return { mount, destroy, setFloor, move, resize, FLOOR_META, get floor() { return floor; } };
})();