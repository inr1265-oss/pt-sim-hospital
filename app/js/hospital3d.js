// 3D 병원 뷰(Three.js r128, CDN 지연 로드) — 2D 지도와 같은 격자·조작 로직, 렌더링만 입체
window.Hospital3D = (() => {
  const TILE = 32, COLS = 22, ROWS = 10, W = COLS * TILE, H = ROWS * TILE;
  const ROOM_COLS = [[3, 5], [7, 9], [11, 13], [15, 17], [19, 21]];
  const DOORS = ROOM_COLS.map(([a]) => a + 1);
  const ELEV = { door: { c: 1, r: 5 } };
  const META = () => Hospital.FLOOR_META;
  const THREE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
  let canvas = null, opts = {}, floor = 1, renderer = null, scene = null, camera = null, raf = null, running = false, lastTs = 0, watchdog = null, built = false, hoverRoom = -1;
  let G = null; // 층 그룹
  const world = { rooms: [], player: null, lights: [], labelKey: '', ground: null, elevSprite: null };
  const player = { c: 2, r: 6, x: 2, y: 6, path: [], dir: 'down', step: 0 };
  const cam = { x: 11, z: 7 };

  const walkable = (c, r) => c >= 0 && c < COLS && ((r === 6 || r === 7) || (r === 5 && (DOORS.includes(c) || c === ELEV.door.c)));
  const roomAt = (c, r) => (r < 1 || r > 5) ? -1 : ROOM_COLS.findIndex(([a, b]) => c >= a && c <= b);
  const inElev = t => t.c >= 0 && t.c <= 1 && t.r >= 1 && t.r <= 5;
  function bfs(from, to) {
    if (!walkable(to.c, to.r)) return null;
    const key = (c, r) => c + ',' + r; const prev = new Map([[key(from.c, from.r), null]]); const q = [from];
    while (q.length) { const cur = q.shift(); if (cur.c === to.c && cur.r === to.r) { const path = []; let node = cur; while (node) { path.unshift(node); node = prev.get(key(node.c, node.r)); } return path.slice(1); }
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = { c: cur.c + dc, r: cur.r + dr }; if (!walkable(n.c, n.r) || prev.has(key(n.c, n.r))) continue; prev.set(key(n.c, n.r), cur); q.push(n); } }
    return null;
  }
  function loadThree() { return window.THREE ? Promise.resolve() : new Promise((res, rej) => { const s = document.createElement('script'); s.src = THREE_URL; s.onload = res; s.onerror = () => rej(new Error('Three.js 로드 실패(인터넷 연결 확인)')); document.head.append(s); }); }

  // ---------- 생성 헬퍼 ----------
  const mat = (color, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: .85, metalness: .05 }, o));
  function box(w, h, d, color, x, y, z, o) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, o)); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m; }
  function textTexture(lines, opt = {}) {
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128; const x = cv.getContext('2d');
    x.fillStyle = opt.bg || 'rgba(255,255,255,.95)'; roundRect(x, 4, 4, 504, 120, 28); x.fill();
    if (opt.border) { x.strokeStyle = opt.border; x.lineWidth = 6; roundRect(x, 4, 4, 504, 120, 28); x.stroke(); }
    x.textAlign = 'center'; x.textBaseline = 'middle';
    lines.forEach((ln, i) => { x.font = `${i === 0 ? 'bold 40px' : '30px'} Pretendard, "Malgun Gothic", sans-serif`; x.fillStyle = ln.color || (i === 0 ? '#14201A' : '#374151'); x.fillText(ln.text, 256, lines.length === 1 ? 64 : 40 + i * 44); });
    const t = new THREE.CanvasTexture(cv); t.minFilter = THREE.LinearFilter; return t;
  }
  function roundRect(x, px, py, w, h, r) { x.beginPath(); x.moveTo(px + r, py); x.arcTo(px + w, py, px + w, py + h, r); x.arcTo(px + w, py + h, px, py + h, r); x.arcTo(px, py + h, px, py, r); x.arcTo(px, py, px + w, py, r); x.closePath(); }
  function sprite(lines, opt = {}) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: textTexture(lines, opt), transparent: true, depthTest: false })); sp.scale.set(opt.w || 2.6, (opt.w || 2.6) / 4, 1); return sp; }
  function checkerTexture(c1, c2, n = 8) { const cv = document.createElement('canvas'); cv.width = cv.height = 256; const x = cv.getContext('2d'); const s = 256 / n; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { x.fillStyle = (i + j) % 2 ? c1 : c2; x.fillRect(i * s, j * s, s, s); } x.strokeStyle = 'rgba(0,0,0,.06)'; for (let i = 0; i <= n; i++) { x.beginPath(); x.moveTo(i * s, 0); x.lineTo(i * s, 256); x.stroke(); x.beginPath(); x.moveTo(0, i * s); x.lineTo(256, i * s); x.stroke(); } const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; }

  function buildScene() {
    scene = new THREE.Scene(); scene.background = new THREE.Color('#EAF0F6'); scene.fog = new THREE.Fog('#EAF0F6', 18, 34);
    camera = new THREE.PerspectiveCamera(50, W / H, .1, 80);
    scene.add(new THREE.HemisphereLight('#ffffff', '#cfd8e3', .75));
    const dir = new THREE.DirectionalLight('#ffffff', .75); dir.position.set(COLS / 2 + 4, 16, 9); dir.target.position.set(COLS / 2, 0, -1); scene.add(dir.target); dir.castShadow = true; dir.shadow.mapSize.set(2048, 2048); dir.shadow.camera.left = -14; dir.shadow.camera.right = 14; dir.shadow.camera.top = 10; dir.shadow.camera.bottom = -10; dir.shadow.camera.near = 1; dir.shadow.camera.far = 40; dir.shadow.bias = -0.0005; scene.add(dir);
    const amb = new THREE.AmbientLight('#ffffff', .35); scene.add(amb);
    world.ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshBasicMaterial({ visible: false })); world.ground.rotation.x = -Math.PI / 2; scene.add(world.ground);
    buildFloor(); buildPlayer();
  }
  function clearGroup() { if (G) { scene.remove(G); G.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (m.map) m.map.dispose(); m.dispose(); }); } }); } G = new THREE.Group(); scene.add(G); world.rooms = []; world.labelKey = ''; }
  function buildFloor() {
    clearGroup(); const meta = META()[floor] || META()[1];
    // 복도 바닥(타일) z 0..2, 하단 구역 z 2..4
    const corridor = new THREE.Mesh(new THREE.PlaneGeometry(COLS, 2), new THREE.MeshStandardMaterial({ map: checkerTexture(meta.tile[0], meta.tile[1], 4), roughness: .9 })); corridor.material.map.repeat.set(COLS / 2, 1); corridor.rotation.x = -Math.PI / 2; corridor.position.set(COLS / 2, 0, 1); corridor.receiveShadow = true; G.add(corridor);
    const lower = new THREE.Mesh(new THREE.PlaneGeometry(COLS, 2.2), mat('#D9DFE7')); lower.rotation.x = -Math.PI / 2; lower.position.set(COLS / 2, -0.001, 3.1); lower.receiveShadow = true; G.add(lower);
    // 복도 뒤쪽(아래) 벽 + 창문
    G.add(box(COLS, 2.4, .2, '#E3E8EF', COLS / 2, 1.2, 4.3));
    for (let x = 3; x < COLS - 1; x += 5) G.add(box(1.8, 1.0, .08, '#BFE0FB', x + 1, 1.5, 4.18, { emissive: '#9CC9F2', emissiveIntensity: .35, roughness: .3 }));
    // 층 소품(하단 구역)
    buildProps(meta);
    // 천장 조명 띠(이미시브)

    // 병실
    ROOM_COLS.forEach(([a, b], i) => buildRoom(i, a, b, meta));
    // 엘리베이터 (x 0..2, z -4..0)
    G.add(box(2, 2.6, 4, '#B9C3D1', 1, 1.3, -2, { metalness: .5, roughness: .4 }));
    [0.5, 1.5].forEach(x => G.add(box(.9, 2.2, .06, '#D6DEE8', x, 1.1, .03, { metalness: .7, roughness: .25 })));
    G.add(box(1.2, .3, .06, '#1F2937', 1, 2.35, .04, { emissive: '#F87171', emissiveIntensity: .6 }));
    const es = sprite([{ text: `${floor}F 엘리베이터` }], { w: 2 }); es.position.set(1, 2.9, .2); G.add(es); world.elevSprite = es;
    // 복도 앞 벽(병실 전면) 상단 띠 색

  }
  function buildRoom(i, a, b, meta) {
    const cx = a + 1.5, door = DOORS[i] + .5; const room = { i, group: new THREE.Group(), floorMesh: null, lamp: null, status: '', label: null, patient: null, blanket: null };
    const g = room.group;
    // 바닥 z -5..0
    room.floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(3, 5), mat('#FFFFFF', { roughness: .95 })); room.floorMesh.rotation.x = -Math.PI / 2; room.floorMesh.position.set(cx, .002, -2.5); room.floorMesh.receiveShadow = true; g.add(room.floorMesh);
    // 뒷벽 + 창문, 옆벽
    g.add(box(3, 2.6, .12, meta.wall, cx, 1.3, -5));
    g.add(box(1.2, .9, .06, '#CFE6FB', cx + .6, 1.7, -4.93, { emissive: '#A9D3F5', emissiveIntensity: .4, roughness: .3 }));
    g.add(box(.1, 1.4, 5, '#F1F3F6', a, .7, -2.5)); g.add(box(.1, 1.4, 5, '#F1F3F6', b + 1, .7, -2.5));
    // 앞벽(문 양옆) + 상인방 + 문틀
    const dl = door - .5, dr = door + .5;
    if (dl - a > 0) g.add(box(dl - a, 1.0, .12, '#F7F8FA', (a + dl) / 2, .5, 0));
    if (b + 1 - dr > 0) g.add(box(b + 1 - dr, 1.0, .12, '#F7F8FA', (dr + b + 1) / 2, .5, 0));
    if (dl - a > 0) g.add(box(dl - a, .05, .16, meta.accent, (a + dl) / 2, 1.02, 0));
    if (b + 1 - dr > 0) g.add(box(b + 1 - dr, .05, .16, meta.accent, (dr + b + 1) / 2, 1.02, 0));
    g.add(box(.08, 2.1, .16, '#8A6A4E', dl + .04, 1.05, 0)); g.add(box(.08, 2.1, .16, '#8A6A4E', dr - .04, 1.05, 0)); g.add(box(1, .08, .16, '#8A6A4E', door, 2.08, 0));
    const leaf = box(.86, 2.0, .05, '#B9803F', dl + .43, 1.0, -.42, { roughness: .6 }); leaf.rotation.y = -1.25; leaf.position.x = dl + .04 + Math.cos(-1.25) * .43; leaf.position.z = -Math.sin(1.25) * .43 - 0.02; g.add(leaf);
    // 침대(머리는 뒷벽 쪽)
    const bx = cx, bz = -3.1;
    g.add(box(1.1, .22, 2.1, '#CBD5E1', bx, .3, bz, { metalness: .3, roughness: .5 }));
    [[-.45, -.9], [.45, -.9], [-.45, .9], [.45, .9]].forEach(([dx, dz]) => g.add(box(.08, .3, .08, '#94A3B8', bx + dx, .15, bz + dz)));
    g.add(box(1.0, .18, 2.0, '#FFFFFF', bx, .5, bz));
    g.add(box(1.0, .5, .08, '#AFBBCB', bx, .6, bz - 1.04)); // 헤드보드
    g.add(box(.6, .12, .4, '#F8FAFC', bx, .65, bz - .75)); // 베개
    room.blanket = box(.96, .14, 1.1, meta.color, bx, .66, bz + .35); g.add(room.blanket);
    // 환자(머리 + 몸통)
    const info = (opts.getRoom && opts.getRoom(i)) || {}; const ped = !!info.pediatric; const s = ped ? .75 : 1;
    const pg = new THREE.Group(); pg.position.set(bx, .62, bz); pg.scale.set(s, s, s);
    const head = new THREE.Mesh(new THREE.SphereGeometry(.17, 20, 16), mat('#F6D3B5')); head.position.set(0, .14, -.72); pg.add(head);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(.18, 20, 16, 0, Math.PI * 2, 0, Math.PI / 2), mat(ped ? '#5B3A29' : (info.age >= 60 ? '#A7ADB5' : '#3B2A20'))); hair.position.set(0, .16, -.74); hair.rotation.x = -0.9; pg.add(hair);
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(.2, .22, .55, 16), mat(ped ? '#FFE1A3' : '#D8EEE1')); torso.rotation.x = Math.PI / 2; torso.position.set(0, .1, -.3); pg.add(torso);
    [-.27, .27].forEach(dx => { const arm = new THREE.Mesh(new THREE.CylinderGeometry(.055, .05, .5, 10), mat('#F3C9A6')); arm.rotation.x = Math.PI / 2; arm.position.set(dx, .08, -.2); pg.add(arm); });
    pg.traverse(o => { if (o.isMesh) o.castShadow = true; }); g.add(pg); room.patient = pg;
    // 모니터 스탠드 + 호출등
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, 1.3, 8), mat('#64748B', { metalness: .6 })); pole.position.set(bx + .9, .65, bz - .4); g.add(pole);
    g.add(box(.5, .35, .06, '#1F2937', bx + .9, 1.35, bz - .4, { emissive: '#34D399', emissiveIntensity: .5 }));
    room.lamp = new THREE.Mesh(new THREE.SphereGeometry(.07, 12, 10), mat('#EF4444', { emissive: '#EF4444', emissiveIntensity: 1 })); room.lamp.position.set(bx - .7, 1.9, -4.9); g.add(room.lamp);
    // 층 소품(병실 안)
    const prop = { 1: () => box(.5, .5, .5, '#CDA77C', bx - 1.1, .25, bz + .6), 2: () => { const m = new THREE.Mesh(new THREE.SphereGeometry(.28, 16, 12), mat('#F472B6')); m.position.set(bx - 1.05, .28, bz + .7); return m; }, 3: () => box(.5, .4, .4, '#F9A8D4', bx - 1.05, .2, bz + .7), 4: () => box(.55, .9, .45, '#E5E7EB', bx - 1.05, .45, bz + .5, { metalness: .2 }) }[floor]; if (prop) g.add(prop());
    // 라벨 스프라이트(문 위)
    room.label = sprite([{ text: '' }], { w: 2.4 }); room.label.position.set(door, 2.55, .25); g.add(room.label);
    G.add(g); world.rooms.push(room);
  }
  function buildProps(meta) {
    const z = 3.1;
    if (floor === 1) { G.add(box(3, .9, .8, '#B98A5E', 3.5, .45, z)); G.add(box(3, .08, .9, '#EBD8BF', 3.5, .92, z)); G.add(box(.6, .4, .05, '#1F2937', 3.9, 1.2, z - .1, { emissive: '#60A5FA', emissiveIntensity: .6 })); for (let k = 0; k < 4; k++) { G.add(box(.5, .08, .5, meta.accent, 7 + k * .8, .45, z)); G.add(box(.5, .5, .08, meta.accent, 7 + k * .8, .7, z + .25)); } }
    if (floor === 2) { [2.6, 3.6].forEach(zz => { const bar = new THREE.Mesh(new THREE.CylinderGeometry(.04, .04, 3.2, 10), mat('#94A3B8', { metalness: .6 })); bar.rotation.z = Math.PI / 2; bar.position.set(4, .9, zz); G.add(bar); [2.5, 5.5].forEach(x => { const post = new THREE.Mesh(new THREE.CylinderGeometry(.04, .04, .9, 8), mat('#64748B', { metalness: .6 })); post.position.set(x, .45, zz); G.add(post); }); }); G.add(box(1.6, .1, 1.2, '#60A5FA', 8.2, .05, z)); [['#F472B6', 10.4, .32], ['#34D399', 11.2, .26], ['#FBBF24', 11.9, .22]].forEach(([c, x, r]) => { const b = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), mat(c)); b.position.set(x, r, z); G.add(b); }); G.add(box(1.2, 1.1, .7, '#334155', 13.8, .55, z)); }
    if (floor === 3) { const cols = ['#FCA5A5', '#FDE68A', '#86EFAC', '#93C5FD']; for (let i = 0; i < 6; i++) G.add(box(.9, .06, .9, cols[i % 4], 2.6 + i * .95, .03, z)); const slide = box(.5, .08, 2.2, '#FBBF24', 9.5, .6, z); slide.rotation.x = .5; G.add(slide); G.add(box(.9, .6, .7, '#F9A8D4', 11.5, .3, z)); [['#F472B6', 13.2], ['#60A5FA', 13.7]].forEach(([c, x]) => { const b = new THREE.Mesh(new THREE.SphereGeometry(.22, 14, 10), mat(c)); b.position.set(x, 1.6, z); b.userData.balloon = true; G.add(b); }); }
    if (floor === 4) { G.add(box(1, 1.1, .7, '#E5E7EB', 3, .55, z)); G.add(box(.8, .35, .05, '#0F172A', 3, 1.3, z - .33, { emissive: '#34D399', emissiveIntensity: .7 })); G.add(box(.9, .8, .7, '#CBD5E1', 5, .4, z, { metalness: .5, roughness: .35 })); const pole = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, 1.6, 8), mat('#64748B')); pole.position.set(7, .8, z); G.add(pole); const lamp = new THREE.Mesh(new THREE.SphereGeometry(.18, 14, 10), mat('#EF4444', { emissive: '#EF4444', emissiveIntensity: 1 })); lamp.position.set(7.2, 1.7, z); G.add(lamp); G.add(box(.9, 1.0, .7, '#F3F4F6', 9, .5, z)); G.add(box(.7, .3, .05, '#1E3A8A', 9, 1.1, z - .33, { emissive: '#60A5FA', emissiveIntensity: .5 })); }
  }
  function buildPlayer() {
    const p = new THREE.Group();
    const coat = new THREE.Mesh(new THREE.CylinderGeometry(.22, .26, .62, 16), mat('#FFFFFF')); coat.position.y = .55; p.add(coat);
    const scrub = new THREE.Mesh(new THREE.BoxGeometry(.18, .3, .1), mat('#0F7A4D')); scrub.position.set(0, .7, .2); p.add(scrub);
    const head = new THREE.Mesh(new THREE.SphereGeometry(.2, 20, 16), mat('#F6D3B5')); head.position.y = 1.08; p.add(head);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(.21, 20, 16, 0, Math.PI * 2, 0, Math.PI / 2), mat('#3B2A20')); hair.position.y = 1.1; p.add(hair);
    [-.1, .1].forEach(dx => { const leg = new THREE.Mesh(new THREE.CylinderGeometry(.07, .07, .3, 10), mat('#334155')); leg.position.set(dx, .15, 0); leg.userData.leg = dx; p.add(leg); });
    const steth = new THREE.Mesh(new THREE.TorusGeometry(.14, .02, 8, 20, Math.PI), mat('#374151')); steth.position.set(0, .82, .22); steth.rotation.x = Math.PI; p.add(steth);
    p.traverse(o => { if (o.isMesh) { o.castShadow = true; } }); scene.add(p); world.player = p;
  }

  // ---------- 마운트/루프 ----------
  function mount(cv, o) {
    canvas = cv; opts = o || {}; floor = opts.floor || 1; running = true; built = false;
    loadThree().then(() => {
      renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true }); renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5)); renderer.outputEncoding = THREE.sRGBEncoding; renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      buildScene(); built = true; resize(); window.addEventListener('resize', resize);
      cv.addEventListener('pointerdown', onPointer); cv.addEventListener('pointermove', onHover); window.addEventListener('keydown', onKey);
      lastTs = performance.now(); raf = requestAnimationFrame(loop);
      watchdog = setInterval(() => { if (running && performance.now() - lastTs > 60) tick(performance.now()); }, 40);
    }).catch(e => { running = false; if (U && U.toast) U.toast('3D 엔진을 불러오지 못했어요: ' + e.message, 'err'); if (opts.onFail) opts.onFail(); });
  }
  function destroy() {
    running = false; if (raf) cancelAnimationFrame(raf); clearInterval(watchdog);
    window.removeEventListener('keydown', onKey); window.removeEventListener('resize', resize);
    if (canvas) { canvas.removeEventListener('pointerdown', onPointer); canvas.removeEventListener('pointermove', onHover); }
    if (renderer) { renderer.dispose(); renderer = null; } scene = null; built = false;
  }
  function resize() {
    if (!renderer || !canvas || !canvas.parentElement) return; const rect = canvas.parentElement.getBoundingClientRect(); if (!rect.width) return;
    const w = rect.width, h = Math.round(w * H / W); renderer.setSize(w, h, false); canvas.style.width = w + 'px'; canvas.style.height = h + 'px'; camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  const enabled = () => !opts.enabled || opts.enabled();
  const ray = new (function () { this.rc = null; })();
  function pick(e) {
    if (!built) return null; if (!ray.rc) ray.rc = new THREE.Raycaster();
    const rect = canvas.getBoundingClientRect(); const nd = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    ray.rc.setFromCamera(nd, camera); const hit = ray.rc.intersectObject(world.ground)[0]; if (!hit) return null;
    return { c: Math.floor(hit.point.x), r: Math.floor(hit.point.z) + 6 };
  }
  function onHover(e) { const t = pick(e); hoverRoom = t ? roomAt(t.c, t.r) : -1; canvas.style.cursor = (t && (hoverRoom >= 0 || walkable(t.c, t.r) || inElev(t))) ? 'pointer' : 'default'; }
  function onPointer(e) {
    if (!enabled()) return; e.preventDefault(); const t = pick(e); if (!t) return; const ri = roomAt(t.c, t.r); let target = null;
    if (ri >= 0) target = { c: DOORS[ri], r: 5 }; else if (inElev(t)) target = ELEV.door; else if (walkable(t.c, t.r)) target = t;
    if (!target) return;
    if (player.r === 6 && target.r === 5 && target.c === player.c && !player.path.length) { arrivedAt(target); return; }
    const p = bfs({ c: player.c, r: player.r }, target); if (p) player.path = p;
  }
  function move(dir) { if (!enabled() || player.path.length) return; const d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir]; if (!d) return; player.dir = dir; const n = { c: player.c + d[0], r: player.r + d[1] }; if (walkable(n.c, n.r)) player.path = [n]; }
  function onKey(e) {
    if (!enabled()) return; if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
    const map = { ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down', ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right' };
    const dir = map[e.key]; if (dir) { e.preventDefault(); move(dir); return; }
    if (e.key === 'Enter' || e.key === ' ') { if (player.r === 6 && !player.path.length) { if (DOORS.includes(player.c)) { e.preventDefault(); arrivedAt({ c: player.c, r: 5 }); } else if (player.c <= 1) { e.preventDefault(); arrivedAt(ELEV.door); } } }
  }
  function arrivedAt(t) { player.c = t.c; player.r = 6; player.x = t.c; player.y = 6; player.path = []; player.dir = 'down'; const ri = DOORS.indexOf(t.c); if (ri >= 0) { if (opts.onEnterRoom) opts.onEnterRoom(ri); } else if (t.c <= 1) { if (opts.onElevator) opts.onElevator(); } }
  const SPEED = 5;
  function update(dt) {
    if (!player.path.length) return;
    const n = player.path[0]; const dx = n.c - player.x, dy = n.r - player.y; const dist = Math.hypot(dx, dy); const stepLen = SPEED * dt; player.step += stepLen * 5;
    if (Math.abs(dx) > Math.abs(dy)) player.dir = dx > 0 ? 'right' : 'left'; else if (dy !== 0) player.dir = dy > 0 ? 'down' : 'up';
    if (dist <= stepLen) { player.x = n.c; player.y = n.r; player.c = n.c; player.r = n.r; player.path.shift(); if (!player.path.length && player.r === 5) arrivedAt({ c: player.c, r: 5 }); }
    else { player.x += dx / dist * stepLen; player.y += dy / dist * stepLen; }
  }
  function tick(ts) { const dt = Math.min(.1, Math.max(0, (ts - lastTs) / 1000)); lastTs = ts; update(dt); render(ts, dt); }
  function loop(ts) { if (!running) return; tick(ts); raf = requestAnimationFrame(loop); }
  function render(ts, dt) {
    if (!built || !renderer) return;
    // 라벨/상태 갱신(변경 시에만 텍스처 재생성)
    const infos = world.rooms.map(r => (opts.getRoom && opts.getRoom(r.i)) || {}); const key = infos.map(x => (x.label || '-') + ':' + x.status).join('|') + '#' + floor;
    if (key !== world.labelKey) {
      world.labelKey = key; const meta = META()[floor] || META()[1];
      world.rooms.forEach((room, i) => {
        const info = infos[i]; const done = info.status === 'done', empty = info.status === 'empty';
        room.label.material.map.dispose(); room.label.material.map = textTexture([{ text: `${floor}0${i + 1}호 · ${info.label || '빈 병실'}` }, { text: done ? '✓ 치료 완료' : empty ? '—' : '대기 중', color: done ? '#15803D' : '#92400E' }], { border: done ? '#86EFAC' : meta.accent }); room.label.material.needsUpdate = true;
        room.blanket.material.color.set(done ? '#BBF7D0' : (info.pediatric ? '#FFE3A8' : meta.color)); room.lamp.visible = !done && !empty; room.patient.visible = !empty;
      });
    }
    world.rooms.forEach((room, i) => { if (room.lamp.visible) room.lamp.material.emissiveIntensity = Math.floor(ts / 600) % 2 ? 1 : .15; room.floorMesh.material.emissive.set(hoverRoom === i ? '#0F7A4D' : '#000000'); room.floorMesh.material.emissiveIntensity = hoverRoom === i ? .18 : 0; });
    G.traverse(o => { if (o.userData.balloon) o.position.y = 1.6 + Math.sin(ts / 600 + o.position.x) * .08; });
    // 플레이어
    const px = player.x + .5, pz = player.y - 6 + .5; const moving = player.path.length > 0;
    world.player.position.set(px, 0, pz); world.player.rotation.y = { up: Math.PI, down: 0, left: -Math.PI / 2, right: Math.PI / 2 }[player.dir] || 0;
    world.player.children.forEach(ch => { if (ch.userData.leg != null) ch.rotation.x = moving ? Math.sin(player.step + (ch.userData.leg > 0 ? Math.PI : 0)) * .6 : 0; });
    world.player.position.y = moving ? Math.abs(Math.sin(player.step)) * .04 : 0;
    // 카메라(부드럽게 따라감, 좌우는 가장자리에서 멈춤)
    const tx = Math.min(COLS - 7, Math.max(7, px)); cam.x += (tx - cam.x) * Math.min(1, dt * 4); cam.z += (pz + 5.4 - cam.z) * Math.min(1, dt * 4);
    camera.position.set(cam.x, 8.2, cam.z); camera.lookAt(cam.x, .2, pz - 3.3);
    renderer.render(scene, camera);
  }
  function setFloor(f) { floor = f; player.c = 2; player.r = 6; player.x = 2; player.y = 6; player.path = []; if (built) { buildFloor(); } }
  return { mount, destroy, setFloor, move, resize, get floor() { return floor; } };
})();