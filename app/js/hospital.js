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
    1: { name: '임상의사결정 문진실', color: '#E3F3EA', accent: '#0F7A4D' },
    2: { name: '운동치료실', color: '#E1EEFF', accent: '#2563EB' },
    3: { name: '소아물리치료실', color: '#FDE8F1', accent: '#DB2777' },
    4: { name: '물리적인자치료실', color: '#FFF3DD', accent: '#D97706' }
  };
  let canvas = null, ctx = null, opts = {}, floor = 1, raf = null, running = false, lastTs = 0, hoverRoom = -1;
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
  // 백그라운드/숨김 상태에서 requestAnimationFrame이 멈추면 타이머로 대신 진행
  let watchdog = null;
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
  function rr(x, y, w, h, r, fill, stroke) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke(); } }
  function draw(ts) {
    const meta = FLOOR_META[floor] || FLOOR_META[1];
    ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#f6f7f9'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#e9ecf1'; ctx.fillRect(0, 6 * TILE, W, 2 * TILE);
    ctx.strokeStyle = '#d7dbe2'; ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.moveTo(0, 7 * TILE); ctx.lineTo(W, 7 * TILE); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#dfe4ea'; ctx.fillRect(0, 8 * TILE, W, 2 * TILE);
    for (let c = 3; c < COLS - 1; c += 5) rr(c * TILE + 6, 8 * TILE + 8, TILE * 2 - 12, TILE * 1.3, 6, '#cfe8ff', '#b9d4ef');
    ctx.font = '20px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ['🪴', '🛋️', '🪴', '🧯', '🪴'].forEach((e, i) => ctx.fillText(e, (1 + i * 5) * TILE + TILE / 2, 9.3 * TILE));
    ctx.fillStyle = meta.color; ctx.fillRect(0, 0, W, TILE);
    ctx.fillStyle = '#1f2937'; ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'left'; ctx.fillText(`${floor}F  ${meta.name}`, 12, TILE / 2);
    ctx.textAlign = 'right'; ctx.font = '12px sans-serif'; ctx.fillStyle = '#6b7280';
    ctx.fillText(U.isTouch ? '병실을 터치하면 이동 · 문 앞에서 다시 터치하면 입장' : '방향키/클릭으로 이동 · 문 앞에서 Enter로 입장', W - 12, TILE / 2);
    // 엘리베이터
    rr(4, ELEV.r0 * TILE + 4, 2 * TILE - 8, 4 * TILE - 8, 8, '#cbd5e1', '#94a3b8');
    ctx.font = '26px serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#475569'; ctx.fillText('🛗', TILE, 3.1 * TILE);
    ctx.font = 'bold 11px sans-serif'; ctx.fillStyle = '#1e293b'; ctx.fillText('엘리베이터', TILE, 1.6 * TILE);
    rr(6, 5 * TILE + 2, 2 * TILE - 12, TILE - 4, 4, '#64748b');
    // 병실
    ROOM_COLS.forEach(([a], i) => {
      const x = a * TILE, y = TILE, w = 3 * TILE, hgt = 4 * TILE; const room = (opts.getRoom && opts.getRoom(i)) || {}; const done = room.status === 'done'; const empty = room.status === 'empty'; const hovered = hoverRoom === i;
      rr(x + 2, y + 2, w - 4, hgt - 2, 10, done ? '#f0fdf4' : '#ffffff', hovered ? meta.accent : '#d1d5db');
      rr(DOORS[i] * TILE + 5, 5 * TILE + 1, TILE - 10, TILE - 2, 4, hovered ? meta.accent : '#a16207');
      ctx.fillStyle = '#374151'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'; ctx.fillText(`${floor}0${i + 1}호`, x + 8, y + 14);
      rr(x + 14, y + 26, w - 28, 46, 8, '#e5ecf5', '#cbd5e1'); rr(x + 18, y + 30, 16, 38, 5, '#fff', '#e2e8f0');
      if (!empty) {
        const s = room.pediatric ? 0.75 : 1; const px = x + w / 2 + 8, py = y + 49;
        rr(px - 18 * s, py - 9 * s, 46 * s, 18 * s, 8 * s, done ? '#bbf7d0' : '#cfe3ff');
        ctx.beginPath(); ctx.arc(px - 24 * s, py, 8 * s, 0, Math.PI * 2); ctx.fillStyle = '#f6d3b5'; ctx.fill();
        if (!done && Math.floor(ts / 600) % 2 === 0) { ctx.fillStyle = '#e5484d'; ctx.beginPath(); ctx.arc(px + 16, py - 13, 4, 0, Math.PI * 2); ctx.fill(); }
      }
      ctx.fillStyle = done ? '#15803d' : '#4b5563'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(room.label || '빈 병실', x + w / 2, y + hgt - 22);
      ctx.fillStyle = done ? '#16a34a' : (empty ? '#9ca3af' : '#0F7A4D'); ctx.font = 'bold 11px sans-serif';
      ctx.fillText(done ? '✓ 치료 완료' : empty ? '—' : '대기 중', x + w / 2, y + hgt - 8);
    });
    // 입장 힌트
    if (player.r === 6 && !player.path.length) {
      let hintX = null, text = '';
      if (DOORS.includes(player.c)) { hintX = player.c * TILE + TILE / 2; text = U.isTouch ? '↑ 터치 입장' : 'Enter 입장'; }
      else if (player.c <= 1) { hintX = TILE; text = U.isTouch ? '↑ 터치 탑승' : 'Enter 탑승'; }
      if (hintX != null) { rr(hintX - 36, 5 * TILE - 22, 72, 18, 9, '#111827'); ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(text, hintX, 5 * TILE - 13); }
    }
    // 플레이어(치료사)
    const px = (player.x + 0.5) * TILE, py = (player.y + 0.5) * TILE; const bob = player.path.length ? Math.sin(player.step) * 1.5 : 0;
    ctx.fillStyle = 'rgba(0,0,0,.15)'; ctx.beginPath(); ctx.ellipse(px, py + 12, 10, 4, 0, 0, Math.PI * 2); ctx.fill();
    rr(px - 9, py - 4 + bob, 18, 18, 6, '#ffffff', '#cbd5e1');
    ctx.fillStyle = '#0F7A4D'; ctx.fillRect(px - 2, py - 2 + bob, 4, 10);
    ctx.beginPath(); ctx.arc(px, py - 10 + bob, 8, 0, Math.PI * 2); ctx.fillStyle = '#f6d3b5'; ctx.fill();
    ctx.fillStyle = '#3b2a20'; ctx.beginPath(); ctx.arc(px, py - 12 + bob, 8, Math.PI, 0); ctx.fill();
    if (player.dir !== 'up') { const ex = player.dir === 'left' ? -3 : player.dir === 'right' ? 3 : 0; ctx.fillStyle = '#333'; ctx.fillRect(px - 3 + ex, py - 10 + bob, 2, 2); ctx.fillRect(px + 1 + ex, py - 10 + bob, 2, 2); }
  }
  function setFloor(f) { floor = f; player.c = 2; player.r = 6; player.x = 2; player.y = 6; player.path = []; }
  return { mount, destroy, setFloor, move, resize, FLOOR_META, get floor() { return floor; } };
})();