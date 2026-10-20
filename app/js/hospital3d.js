// 3D 병원 — 치료사 1인칭 시점(Three.js r128, CDN 지연 로드)
// 복도를 걷고 → 문으로 병실에 들어가 → 침대 발치에서 환자를 보면 "진료 시작" (Enter / 탭 / D패드 가운데)
window.Hospital3D = (() => {
  const COLS = 22, W = 704, H = 320; // 캔버스 비율은 2D 지도와 동일
  const ROOM_COLS = [[3, 5], [7, 9], [11, 13], [15, 17], [19, 21]];
  const DOOR_X = ROOM_COLS.map(([a]) => a + 1.5);
  const CORR_Z = 3.4, ROOM_D = 5, WALL_H = 2.8, EYE = 1.55, R = 0.3;
  const FLOOR_META = {
    1: { name: '임상의사결정 문진실', color: '#E3F3EA', accent: '#0F7A4D', deep: '#0B5E3B', wall: '#EEF6F1', tile: ['#E2EBE5', '#EAF1EC'] },
    2: { name: '운동치료실', color: '#E1EEFF', accent: '#2563EB', deep: '#1E40AF', wall: '#EEF4FC', tile: ['#E0E8F3', '#E9EFF7'] },
    3: { name: '소아물리치료실', color: '#FDE8F1', accent: '#DB2777', deep: '#9D174D', wall: '#FEF2F7', tile: ['#F5E4EC', '#FAEDF3'] },
    4: { name: '물리적인자치료실', color: '#FFF3DD', accent: '#D97706', deep: '#92400E', wall: '#FBF5EC', tile: ['#F0E9DE', '#F6F0E7'] }
  };
  const META = () => FLOOR_META;
  const THREE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
  let canvas = null, opts = {}, floor = 1, renderer = null, scene = null, camera = null, raf = null, running = false, lastTs = 0, watchdog = null, built = false, G = null, hint = null, cross = null;
  const world = { rooms: [], ground: null, labelKey: '', solids: [], clickables: [], walls: [], avatar: null, nameTag: null, bones: null };
  const P = { x: 2.5, z: 1.7, yaw: Math.PI / 2, pitch: 0, bob: 0, wps: [], arrive: null, turnTo: null, impulse: null, lastInteract: 0, focus: null };
  const camState = { pos: null, tgt: null };
  const keys = new Set(); const drag = { on: false, id: null, x: 0, y: 0, moved: 0 };

  function loadThree() { return window.THREE ? Promise.resolve() : new Promise((res, rej) => { const s = document.createElement('script'); s.src = THREE_URL; s.onload = res; s.onerror = () => rej(new Error('Three.js 로드 실패(인터넷 연결 확인)')); document.head.append(s); }); }
  const mat = (color, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: .88, metalness: .04 }, o));
  function box(w, h, d, color, x, y, z, o, solid) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, o)); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; G.add(m); if (solid) { world.solids.push({ x0: x - w / 2 - R, x1: x + w / 2 + R, z0: z - d / 2 - R, z1: z + d / 2 + R }); world.walls.push(m); } return m; }
  function plane(w, d, color, x, y, z, o) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(color, o)); m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.receiveShadow = true; G.add(m); return m; }
  function roundRect(x, px, py, w, h, r) { x.beginPath(); x.moveTo(px + r, py); x.arcTo(px + w, py, px + w, py + h, r); x.arcTo(px + w, py + h, px, py + h, r); x.arcTo(px, py + h, px, py, r); x.arcTo(px, py, px + w, py, r); x.closePath(); }
  function textTexture(lines, opt = {}) {
    const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 256; const x = cv.getContext('2d');
    x.fillStyle = opt.bg || 'rgba(255,255,255,.97)'; roundRect(x, 6, 6, 1012, 244, 48); x.fill();
    x.shadowColor = 'rgba(0,0,0,0)';
    if (opt.border) { x.strokeStyle = opt.border; x.lineWidth = 12; roundRect(x, 6, 6, 1012, 244, 48); x.stroke(); }
    x.textAlign = 'center'; x.textBaseline = 'middle';
    lines.forEach((ln, i) => { let size = i === 0 ? 84 : 60; const font = n => `bold ${n}px Pretendard, "Malgun Gothic", sans-serif`; x.font = font(size); const w = x.measureText(ln.text).width; if (w > 950) { size = Math.max(30, Math.floor(size * 950 / w)); x.font = font(size); } x.fillStyle = ln.color || (i === 0 ? '#14201A' : '#374151'); x.fillText(ln.text, 512, lines.length === 1 ? 128 : 84 + i * 92); });
    const t = new THREE.CanvasTexture(cv); t.minFilter = THREE.LinearMipMapLinearFilter; t.anisotropy = 4; return t;
  }
  function sprite(lines, opt = {}) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: textTexture(lines, opt), transparent: true, depthTest: opt.depthTest !== false })); sp.scale.set(opt.w || 2.8, (opt.w || 2.8) / 4, 1); return sp; }
  const texCache = {};
  function patternTexture(bg, fg, kind) {
    const key = bg + fg + kind; if (texCache[key]) return texCache[key];
    const cv = document.createElement('canvas'); cv.width = cv.height = 128; const x = cv.getContext('2d'); x.fillStyle = bg; x.fillRect(0, 0, 128, 128);
    if (kind === 'dots') { x.fillStyle = fg; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { x.beginPath(); x.arc(16 + i * 32 + (j % 2) * 16, 16 + j * 32, 3.2, 0, Math.PI * 2); x.fill(); } }
    else { x.globalAlpha = .55; x.fillStyle = fg; for (let i = 0; i < 128; i += 32) x.fillRect(0, i, 128, 10); x.globalAlpha = 1; }
    const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3); texCache[key] = t; return t;
  }
  function checkerTexture(c1, c2, n) { const cv = document.createElement('canvas'); cv.width = cv.height = 256; const x = cv.getContext('2d'); const s = 256 / n; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { x.fillStyle = (i + j) % 2 ? c1 : c2; x.fillRect(i * s, j * s, s, s); } x.strokeStyle = 'rgba(0,0,0,.07)'; for (let i = 0; i <= n; i++) { x.beginPath(); x.moveTo(i * s, 0); x.lineTo(i * s, 256); x.stroke(); x.beginPath(); x.moveTo(0, i * s); x.lineTo(256, i * s); x.stroke(); } const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; }

  // ---------- 장면 ----------
  function buildScene() {
    scene = new THREE.Scene(); scene.background = new THREE.Color('#DCE4EC'); scene.fog = new THREE.Fog('#DCE4EC', 16, 34);
    camera = new THREE.PerspectiveCamera(60, W / H, .05, 60);
    scene.add(new THREE.HemisphereLight('#fff4e4', '#8e9aab', .8)); scene.add(new THREE.AmbientLight('#ffffff', .22));
    const dir = new THREE.DirectionalLight('#ffe7c4', .85); dir.position.set(COLS / 2 + 6, 12, 9); dir.target.position.set(COLS / 2, 0, -1); scene.add(dir.target);
    const fill = new THREE.DirectionalLight('#cfe0ff', .25); fill.position.set(COLS / 2 - 8, 8, -6); scene.add(fill);
    dir.castShadow = true; dir.shadow.mapSize.set(2048, 2048); dir.shadow.camera.left = -14; dir.shadow.camera.right = 14; dir.shadow.camera.top = 10; dir.shadow.camera.bottom = -10; dir.shadow.camera.near = 1; dir.shadow.camera.far = 40; dir.shadow.bias = -0.0004; scene.add(dir);
    world.ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshBasicMaterial({ visible: false })); world.ground.rotation.x = -Math.PI / 2; scene.add(world.ground);
    buildFloor(); buildAvatar();
  }
  // ---------- 치료사 아바타(3인칭): 내장 스크럽 캐릭터 또는 외부 GLB ----------
  const playerInfo = () => Object.assign({ name: '치료사', sex: '여', glb: '' }, (typeof opts.player === 'function' ? opts.player() : opts.player) || {});
  function buildAvatar() {
    if (world.avatar) { scene.remove(world.avatar); world.avatar = null; world.bones = null; }
    const info = playerInfo(); const g = new THREE.Group(); world.avatar = g; scene.add(g);
    const female = info.sex === '여';
    const skin = mat('#F6D3B5'), scrub = mat('#2E9C8B'), scrubD = mat('#227B6E'), hair = mat(female ? '#3B2418' : '#2B1B12'), white = mat('#FFFFFF'), shoe = mat('#F3F4F6');
    const add = (parent, geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };
    // 몸통(스크럽 상의) + 바지 + 신발
    add(g, new THREE.CylinderGeometry(female ? .17 : .2, female ? .2 : .22, .55, 18), scrub, 0, 1.05, 0);
    add(g, new THREE.BoxGeometry(.16, .12, .02), white, 0, 1.18, -.21); // 이름표
    add(g, new THREE.BoxGeometry(.26, .04, .25), scrubD, 0, .78, 0);
    const legs = []; [-.09, .09].forEach(dx => { const lg = new THREE.Group(); lg.position.set(dx, .78, 0); add(lg, new THREE.CylinderGeometry(.075, .065, .72, 12), scrubD, 0, -.36, 0); add(lg, new THREE.BoxGeometry(.13, .07, .24), shoe, 0, -.76, -.04); g.add(lg); legs.push(lg); });
    const arms = []; [-.27, .27].forEach(dx => { const ar = new THREE.Group(); ar.position.set(dx, 1.28, 0); add(ar, new THREE.CylinderGeometry(.06, .05, .22, 10), scrub, 0, -.1, 0); add(ar, new THREE.CylinderGeometry(.05, .045, .34, 10), skin, 0, -.38, 0); add(ar, new THREE.SphereGeometry(.055, 10, 8), skin, 0, -.57, 0); g.add(ar); arms.push(ar); });
    // 목·머리·머리카락(얼굴은 -z 방향)
    add(g, new THREE.CylinderGeometry(.06, .07, .1, 10), skin, 0, 1.36, 0);
    add(g, new THREE.SphereGeometry(.16, 22, 18), skin, 0, 1.55, 0);
    const cap = add(g, new THREE.SphereGeometry(.168, 22, 18, 0, Math.PI * 2, 0, Math.PI / 2), hair, 0, 1.56, 0); cap.rotation.x = .35;
    if (female) { const tail = add(g, new THREE.SphereGeometry(.09, 12, 10), hair, 0, 1.5, .17); tail.scale.set(.8, 1.6, .8); }
    [-.055, .055].forEach(dx => add(g, new THREE.SphereGeometry(.016, 8, 8), mat('#222'), dx, 1.57, -.15));
    // 청진기(목에 두름)
    const st = add(g, new THREE.TorusGeometry(.11, .012, 8, 20, Math.PI), mat('#374151'), 0, 1.3, -.12); st.rotation.x = Math.PI / 2 + .3;
    g.userData.legs = legs; g.userData.arms = arms;
    // 이름표(머리 위)
    const tag = sprite([{ text: `${female ? '👩‍⚕️' : '👨‍⚕️'} ${info.name} 치료사` }], { w: 1.4, border: '#0F7A4D', depthTest: false }); tag.position.set(0, 2.02, 0); tag.renderOrder = 11; g.add(tag); world.nameTag = tag;
    if (info.glb) loadGlbAvatar(info.glb, g, female);
  }
  function loadGlbAvatar(url, g, female) {
    const ensure = () => (THREE.GLTFLoader ? Promise.resolve() : new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js'; sc.onload = res; sc.onerror = () => rej(new Error('GLTFLoader 로드 실패')); document.head.append(sc); }));
    ensure().then(() => new Promise((res, rej) => new THREE.GLTFLoader().load(url, res, undefined, () => rej(new Error('모델을 내려받지 못했어요 (URL·CORS 확인)'))))).then(gltf => {
      if (world.avatar !== g) return; const model = gltf.scene;
      // 키 측정: 스킨드 메시는 바운딩박스가 부정확하므로 뼈(또는 정점) 월드 위치로 계산
      model.updateMatrixWorld(true); let minY = Infinity, maxY = -Infinity; const v = new THREE.Vector3();
      model.traverse(o => { if (o.isBone) { o.getWorldPosition(v); minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y); } });
      if (!isFinite(minY) || maxY - minY < .05) { const bb = new THREE.Box3().setFromObject(model); minY = bb.min.y; maxY = bb.max.y; }
      const h = (maxY - minY) || 1; const k = 1.7 / h; model.scale.setScalar(k); model.position.y = -minY * k; model.rotation.y = Math.PI; // GLB는 보통 +z를 바라봄 → -z로
      model.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
      // 내장 캐릭터 숨기고 GLB 표시
      g.children.forEach(ch => { if (ch !== world.nameTag) ch.visible = false; }); g.add(model);
      const find = names => { let b = null; model.traverse(o => { if (!b && o.isBone && names.some(n => o.name === n || o.name.endsWith(n))) b = o; }); return b; };
      world.bones = { lUp: find(['LeftUpLeg', 'mixamorigLeftUpLeg']), rUp: find(['RightUpLeg', 'mixamorigRightUpLeg']), lArm: find(['LeftArm', 'mixamorigLeftArm']), rArm: find(['RightArm', 'mixamorigRightArm']) };
      if (world.bones.lArm) { world.bones.lArm.rotation.z = -1.15; } if (world.bones.rArm) { world.bones.rArm.rotation.z = 1.15; } // T포즈 → 팔 내리기
      if (U && U.toast) U.toast('외부 아바타를 불러왔어요.', 'ok');
    }).catch(e => { if (U && U.toast) U.toast('외부 아바타 로드 실패: ' + e.message + ' (내장 캐릭터 사용)', 'err'); });
  }
  function setPlayer() { if (built) buildAvatar(); }
  function clearGroup() { if (G) { scene.remove(G); G.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (m.map) m.map.dispose(); m.dispose(); }); } }); } G = new THREE.Group(); scene.add(G); world.rooms = []; world.solids = []; world.clickables = []; world.walls = []; world.labelKey = ''; }
  function buildFloor() {
    clearGroup(); const meta = META()[floor] || META()[1];
    // 복도 바닥·천장·벽
    const cf = plane(COLS, CORR_Z, '#ffffff', COLS / 2, 0, CORR_Z / 2, { map: checkerTexture(meta.tile[0], meta.tile[1], 4), roughness: .9 }); cf.material.map.repeat.set(COLS / 2, CORR_Z / 2);
    const ceil = plane(COLS + 6, ROOM_D + CORR_Z + 2, '#F7F9FB', COLS / 2, WALL_H, (CORR_Z - ROOM_D) / 2, { side: THREE.BackSide, roughness: 1 }); ceil.receiveShadow = false;
    for (let x = 2; x < COLS; x += 3) box(1.4, .04, .6, '#ffffff', x, WALL_H - .03, CORR_Z / 2, { emissive: '#ffffff', emissiveIntensity: .95 });
    box(COLS, WALL_H, .2, '#E6EBF1', COLS / 2, WALL_H / 2, CORR_Z + .1, {}, true); // 복도 뒷벽(창문 쪽)
    box(COLS, .12, .05, meta.accent, COLS / 2, .06, CORR_Z - .02); box(COLS, .06, .05, meta.accent, COLS / 2, 1.1, CORR_Z - .02);
    for (let x = 3; x < COLS - 1; x += 4) { box(2.2, 1.2, .06, '#CFE8FF', x + 1, 1.75, CORR_Z - .04, { emissive: '#BBDDF8', emissiveIntensity: .5, roughness: .25 }); box(.06, 1.2, .08, '#9DB3C8', x + 1, 1.75, CORR_Z - .06); box(2.3, .06, .1, '#9DB3C8', x + 1, 1.14, CORR_Z - .06); }
    box(.2, WALL_H, CORR_Z + ROOM_D, '#E6EBF1', COLS + .1, WALL_H / 2, (CORR_Z - ROOM_D) / 2, {}, true); // 오른쪽 끝 벽
    box(.2, WALL_H, CORR_Z, '#E6EBF1', -.1, WALL_H / 2, CORR_Z / 2, {}, true); // 왼쪽 끝 벽(복도)
    // 층 안내 사인(복도 벽)
    const sign = sprite([{ text: `${floor}F ${meta.name}` }], { w: 3.2, border: meta.accent, depthTest: false }); sign.position.set(COLS / 2, 2.35, CORR_Z - .3); sign.renderOrder = 9; G.add(sign);
    buildProps(meta);
    // 엘리베이터 (x 0..2, 병실 줄 왼쪽 끝)
    box(2, WALL_H, ROOM_D, '#B3BDCB', 1, WALL_H / 2, -ROOM_D / 2, { metalness: .5, roughness: .4 }, true);
    [0.5, 1.5].forEach(x => box(.92, 2.2, .06, '#D6DEE8', x, 1.1, .03, { metalness: .75, roughness: .2 }));
    box(1.2, .28, .06, '#1F2937', 1, 2.45, .04, { emissive: '#F87171', emissiveIntensity: .7 });
    const es = sprite([{ text: '🛗 엘리베이터 · 층 이동' }], { w: 2.2, depthTest: false }); es.position.set(1, 2.42, 1.0); es.renderOrder = 10; G.add(es);
    ROOM_COLS.forEach(([a, b], i) => buildRoom(i, a, b, meta));
    // 복도 벽(병실 전면) 중 병실 사이 기둥
    [2.5].forEach(() => {}); // (문틀 사이 벽은 buildRoom에서)
  }
  function buildRoom(i, a, b, meta) {
    const cx = a + 1.5, door = DOOR_X[i]; const room = { i, floorMesh: null, lamp: null, label: null, chart: null, patient: null, blanket: null, ring: null, bedCenter: { x: cx, z: -3.0 }, stand: { x: cx, z: -1.35 }, bounds: { x0: a, x1: b + 1 } };
    room.floorMesh = plane(3, ROOM_D, '#FBFCFD', cx, .002, -ROOM_D / 2, { roughness: .95 });
    box(3, WALL_H, .14, meta.wall, cx, WALL_H / 2, -ROOM_D, {}, true); // 뒷벽
    box(1.3, 1.0, .06, '#CFE8FF', cx + .6, 1.8, -ROOM_D + .09, { emissive: '#BBDDF8', emissiveIntensity: .55, roughness: .25 });
    box(.14, WALL_H, ROOM_D, '#F1F3F6', a, WALL_H / 2, -ROOM_D / 2, {}, true); box(.14, WALL_H, ROOM_D, '#F1F3F6', b + 1, WALL_H / 2, -ROOM_D / 2, {}, true); // 옆벽
    box(3, .04, .5, '#ffffff', cx, WALL_H - .03, -2.5, { emissive: '#ffffff', emissiveIntensity: .9 }); // 천장등
    const dl = door - .5, dr = door + .5; // 앞벽(문 양옆) + 상인방
    box(dl - a, WALL_H, .14, '#F7F8FA', (a + dl) / 2, WALL_H / 2, 0, {}, true); box(b + 1 - dr, WALL_H, .14, '#F7F8FA', (dr + b + 1) / 2, WALL_H / 2, 0, {}, true);
    box(1.0, WALL_H - 2.1, .14, '#F7F8FA', door, (WALL_H + 2.1) / 2, 0, {}, false);
    box(.08, 2.1, .2, '#8A6A4E', dl + .04, 1.05, 0); box(.08, 2.1, .2, '#8A6A4E', dr - .04, 1.05, 0); box(1.0, .08, .2, '#8A6A4E', door, 2.08, 0);
    const leaf = box(.9, 2.0, .05, '#B9803F', 0, 1.0, 0, { roughness: .6 }); leaf.position.set(dl + .06 + Math.cos(1.52) * .45, 1.0, -Math.sin(1.52) * .45); leaf.rotation.y = 1.52; // 안쪽 벽에 붙도록 활짝 열린 문
    box(.06, .06, .06, '#F5D27A', leaf.position.x + Math.cos(1.52) * .36, 1.0, leaf.position.z - Math.sin(1.52) * .36);
    // 침대 (머리는 뒷벽 쪽) — 남색 매트리스 + 흰 시트, 금속 프레임
    const bx = cx, bz = -3.0;
    const frame = box(1.1, .22, 2.1, '#5B6B80', bx, .3, bz, { metalness: .5, roughness: .4 }, true); frame.userData.room = i; world.clickables.push(frame);
    [[-.45, -.9], [.45, -.9], [-.45, .9], [.45, .9]].forEach(([dx, dz]) => { box(.08, .3, .08, '#475569', bx + dx, .15, bz + dz); const wheel = new THREE.Mesh(new THREE.CylinderGeometry(.06, .06, .05, 10), mat('#1F2937')); wheel.rotation.z = Math.PI / 2; wheel.position.set(bx + dx, .06, bz + dz); G.add(wheel); });
    const matt = box(1.0, .18, 2.0, '#1E3A8A', bx, .5, bz, { roughness: .85 }); matt.userData.room = i; world.clickables.push(matt);
    const sheet = box(1.0, .03, 1.6, '#FFFFFF', bx, .6, bz - .2, { roughness: .95 }); sheet.userData.room = i; world.clickables.push(sheet);
    box(.5, .55, .45, '#F8FAFC', bx - 1.05, .28, bz - 1.25, {}, true); box(.4, .03, .35, '#94A3B8', bx - 1.05, .36, bz - 1.25); box(.4, .03, .35, '#94A3B8', bx - 1.05, .2, bz - 1.25); // 협탁
    box(1.0, .55, .08, '#AFBBCB', bx, .62, bz - 1.04); box(.62, .12, .4, '#F8FAFC', bx, .65, bz - .75);
    [[-.52, 0], [.52, 0]].forEach(([dx]) => box(.04, .25, 1.2, '#B8C2D0', bx + dx, .7, bz - .2, { metalness: .5 }));
    room.blanket = box(.96, .14, 1.15, '#ffffff', bx, .66, bz + .38, { map: patternTexture('#FFFFFF', meta.accent, 'stripes'), roughness: .95 }); room.blanket.userData.room = i; world.clickables.push(room.blanket);
    // 환자(케이스 특성에 따라 자세·외형 다름)
    const info = (opts.getRoom && opts.getRoom(i)) || {};
    room.patient = buildPatient(info, bx, bz); room.patient.traverse(o => { if (o.isMesh) { o.userData.room = i; world.clickables.push(o); } }); G.add(room.patient);
    room.pose = room.patient.userData.pose; room.focus = room.pose === 'sitting' ? { x: bx + .36, z: bz + .1 } : { x: bx, z: bz - .3 };    // 환부 표시(맥동하는 고리)
    room.ring = new THREE.Mesh(new THREE.TorusGeometry(.13, .02, 10, 28), mat('#DC2626', { emissive: '#DC2626', emissiveIntensity: .9 })); room.ring.rotation.x = Math.PI / 2; room.ring.visible = false; G.add(room.ring);
    // 모니터·수액대·의자·호출등
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, 1.4, 8), mat('#64748B', { metalness: .6 })); pole.position.set(bx + .95, .7, bz - .5); G.add(pole);
    box(.55, .38, .06, '#1F2937', bx + .95, 1.5, bz - .5, { emissive: '#34D399', emissiveIntensity: .45 });
    const iv = new THREE.Mesh(new THREE.CylinderGeometry(.02, .02, 1.9, 8), mat('#9CA3AF', { metalness: .6 })); iv.position.set(bx - .9, .95, bz - .9); G.add(iv); box(.16, .3, .16, '#DBEAFE', bx - .9, 1.75, bz - .9, { roughness: .2 });
    box(.45, .06, .45, meta.accent, bx - .95, .45, bz + .9, {}, true); box(.45, .5, .06, meta.accent, bx - .95, .7, bz + 1.1); // 의자
    room.lamp = new THREE.Mesh(new THREE.SphereGeometry(.07, 12, 10), mat('#EF4444', { emissive: '#EF4444', emissiveIntensity: 1 })); room.lamp.position.set(bx - .7, 2.3, -ROOM_D + .12); G.add(room.lamp);
    // 문 위 라벨(복도 쪽) + 침대 머리맡 차트(병실 안)
    // 문 위 안내판: 복도 쪽으로 띄워 걸고(천장 행잉 사인) 벽에 가려지지 않게 항상 위에 그림
    room.label = sprite([{ text: '' }], { w: 2.4, depthTest: false }); room.label.position.set(door, 2.42, 1.0); room.label.renderOrder = 10; G.add(room.label);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(.012, .012, .34, 6), mat('#9CA3AF', { metalness: .6 })); rod.position.set(door, WALL_H - .17, 1.0); G.add(rod);
    room.chart = sprite([{ text: '' }], { w: 1.7, depthTest: false }); room.chart.position.set(bx + .2, 1.98, -ROOM_D + .25); room.chart.renderOrder = 10; G.add(room.chart);
    // 공중 UI: 진행률 말풍선(머리맡), 주호소 말풍선(환자 위), 장비 라벨
    room.prog = sprite([{ text: '진행률 0%' }], { w: 1.1, bg: 'rgba(37,99,235,.92)', depthTest: false }); room.prog.position.set(bx - .75, 1.55, bz - .95); room.prog.renderOrder = 12; room.prog.visible = false; G.add(room.prog); room.progVal = -1;
    room.cc = sprite([{ text: '' }], { w: 2.2, bg: 'rgba(255,255,255,.96)', border: '#2563EB', depthTest: false }); room.cc.position.set(bx + .3, 1.45, bz + .2); room.cc.renderOrder = 12; room.cc.visible = false; G.add(room.cc); room.ccText = '';
    const tagM = sprite([{ text: '환자 감시 모니터' }], { w: .9, bg: 'rgba(15,23,42,.85)', depthTest: false }); tagM.position.set(bx + .95, 1.82, bz - .5); tagM.renderOrder = 12; G.add(tagM); tagM.material.map.dispose(); tagM.material.map = textTexture([{ text: '환자 감시 모니터', color: '#fff' }], { bg: 'rgba(15,23,42,.85)' }); tagM.material.needsUpdate = true;
    const tagI = sprite([{ text: '수액' }], { w: .6, depthTest: false }); tagI.position.set(bx - .9, 2.0, bz - .9); tagI.renderOrder = 12; G.add(tagI); tagI.material.map.dispose(); tagI.material.map = textTexture([{ text: '수액', color: '#fff' }], { bg: 'rgba(15,23,42,.85)' }); tagI.material.needsUpdate = true;
    world.rooms.push(room);
  }
  function posture(info) {
    if (info.posture === 'prone') return 'prone';
    const r = String(info.region || ''); const upper = /^(shoulder|elbow|wrist|hand|neck|head)/.test(r);
    if (upper) return 'sitting';
    if (info.floor === 1 && !/^(lowback|legs|hip|knee|ankle|foot|calf|whole)/.test(r)) return 'sitting';
    if (info.pediatric && Number(info.age) >= 3 && /^(whole)$/.test(r)) return 'sitting';
    return 'supine';
  }
  function buildPatient(info, bx, bz) {
    const ped = !!info.pediatric, female = info.sex === '여', age = Number(info.age) || 30, elderly = !ped && age >= 60; const pose = posture(info);
    const s = ped ? (age < 2 ? .6 : .78) : 1;
    const skin = mat('#F6D3B5'); const hairM = mat(ped ? (female ? '#6B3F2A' : '#4A3024') : elderly ? '#A7ADB5' : female ? '#3B2418' : '#2B1B12');
    const gown = new THREE.MeshStandardMaterial({ map: patternTexture(ped ? (female ? '#FFD9E7' : '#D6E8FF') : (female ? '#F6DCE4' : '#DCEAF2'), ped ? (female ? '#F472B6' : '#60A5FA') : (female ? '#C47A95' : '#7E9BB5'), 'dots'), roughness: .9 }); const pants = mat(ped ? (female ? '#F9A8D4' : '#93C5FD') : '#6B7B94');
    const g = new THREE.Group(); g.userData.pose = pose; g.userData.room = null;
    const add = (geo, m, x, y, z, rx, ry, rz) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); if (rx) o.rotation.x = rx; if (ry) o.rotation.y = ry; if (rz) o.rotation.z = rz; o.castShadow = true; g.add(o); return o; };
    const headR = ped ? .2 : .17;
    const makeHead = (x, y, z, faceDir) => { // faceDir: 'up' | 'down' | 'front'(+x)
      add(new THREE.SphereGeometry(headR, 22, 18), skin, x, y, z);
      const cap = add(new THREE.SphereGeometry(headR + .012, 22, 18, 0, Math.PI * 2, 0, Math.PI / 2), hairM, x, y, z);
      if (faceDir === 'up') { cap.rotation.x = -1.15; } else if (faceDir === 'down') { cap.rotation.x = 1.0; } else { cap.rotation.z = -.35; cap.rotation.x = -.25; }
      if (female && !ped) { const lg = add(new THREE.SphereGeometry(headR * 1.15, 16, 12), hairM, x - (faceDir === 'front' ? .07 : 0), y - (faceDir === 'front' ? .05 : .08), z - (faceDir === 'up' ? .1 : 0)); lg.scale.set(faceDir === 'front' ? .9 : 1.3, faceDir === 'front' ? 1.3 : .5, 1.2); }
      if (female && ped) { [-1, 1].forEach(sg => add(new THREE.SphereGeometry(.07, 10, 8), hairM, x + (faceDir === 'front' ? 0 : sg * (headR + .03)), y + .02, z + (faceDir === 'front' ? sg * (headR + .03) : 0))); }
      if (faceDir !== 'down') { const ex = faceDir === 'front' ? x + headR * .92 : x; [-1, 1].forEach(sg => add(new THREE.SphereGeometry(.018, 8, 8), mat('#222'), faceDir === 'front' ? ex : x + sg * .06, faceDir === 'front' ? y + .02 : y + headR * .9, faceDir === 'front' ? z + sg * .06 : z + .03)); }
      if (elderly && faceDir === 'up') { [-1, 1].forEach(sg => add(new THREE.TorusGeometry(.045, .006, 6, 16), mat('#4B5563'), x + sg * .06, y + headR * .98, z + .03, Math.PI / 2)); }
      if (elderly && faceDir === 'front') { [-1, 1].forEach(sg => add(new THREE.TorusGeometry(.045, .006, 6, 16), mat('#4B5563'), x + headR * .98, y + .02, z + sg * .06, 0, Math.PI / 2)); }
    };
    if (pose === 'sitting') {
      // 침대 가장자리에 앉아 방 안쪽(+x)을 바라봄, 다리는 늘어뜨림
      g.position.set(bx + .36, .6, bz + .1); g.scale.set(s, s, s);
      add(new THREE.BoxGeometry(.42, .16, .34), pants, 0, .06, 0); // 골반
      add(new THREE.CylinderGeometry(.19, .22, .6, 18), gown, 0, .42, 0); // 몸통
      add(new THREE.CylinderGeometry(.07, .07, .14, 10), skin, 0, .78, 0); // 목
      makeHead(0, .78 + headR + .06, 0, 'front');
      [-.13, .13].forEach(dz => { add(new THREE.CylinderGeometry(.07, .065, .5, 10), pants, .12, -.1, dz, 0, 0, -.5); add(new THREE.CylinderGeometry(.06, .055, .45, 10), skin, .32, -.5, dz, 0, 0, -.1); add(new THREE.BoxGeometry(.18, .07, .1), mat('#374151'), .38, -.74, dz); });
      [-.24, .24].forEach(dz => add(new THREE.CylinderGeometry(.05, .045, .5, 10), skin, .03, .36, dz, 0, 0, -.15));
    } else if (pose === 'prone') {
      g.position.set(bx, .62, bz); g.scale.set(s, s, s);
      add(new THREE.CylinderGeometry(.22, .2, .62, 18), gown, 0, .1, -.3, Math.PI / 2);
      add(new THREE.BoxGeometry(.4, .12, .9), pants, 0, .06, .35);
      makeHead(0, .16, -.74, 'down');
      [-.3, .3].forEach(dx => { add(new THREE.CylinderGeometry(.055, .05, .5, 10), skin, dx, .1, -.75, Math.PI / 2); add(new THREE.SphereGeometry(.06, 10, 8), skin, dx, .1, -1.0); });
      [-.12, .12].forEach(dx => add(new THREE.SphereGeometry(.07, 10, 8), skin, dx, .12, .85));
    } else {
      g.position.set(bx, .62, bz); g.scale.set(s, s, s);
      makeHead(0, .14, -.72, 'up');
      add(new THREE.CylinderGeometry(.21, .23, .6, 18), gown, 0, .1, -.3, Math.PI / 2);
      [-.28, .28].forEach(dx => { add(new THREE.CylinderGeometry(.055, .05, .55, 10), skin, dx, .08, -.2, Math.PI / 2); add(new THREE.SphereGeometry(.06, 10, 8), skin, dx, .08, .1); });
      if (ped) [-.1, .1].forEach(dx => add(new THREE.SphereGeometry(.06, 10, 8), skin, dx, .1, .82));
    }
    g.traverse(o => { if (o.isMesh) o.userData.patient = true; });
    return g;
  }
  function buildProps(meta) {
    const z = CORR_Z - .55;
    if (floor === 1) { box(2.6, .9, .7, '#B98A5E', 4, .45, z, {}, true); box(2.7, .06, .8, '#EBD8BF', 4, .93, z); box(.55, .36, .05, '#1F2937', 4.4, 1.2, z - .1, { emissive: '#60A5FA', emissiveIntensity: .6 }); for (let k = 0; k < 4; k++) { box(.5, .06, .5, meta.accent, 8 + k * .8, .46, z, {}, true); box(.5, .55, .06, meta.accent, 8 + k * .8, .74, z + .22); } }
    if (floor === 2) { [z - .35, z + .35].forEach(zz => { const bar = new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, 3, 10), mat('#94A3B8', { metalness: .6 })); bar.rotation.z = Math.PI / 2; bar.position.set(4.5, .95, zz); bar.castShadow = true; G.add(bar); [3.1, 5.9].forEach(x => { const post = new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, .95, 8), mat('#64748B', { metalness: .6 })); post.position.set(x, .47, zz); G.add(post); }); }); world.solids.push({ x0: 2.8 - R, x1: 6.2 + R, z0: z - .6, z1: z + .6 }); box(1.6, .08, 1.0, '#60A5FA', 8.6, .04, z); [['#F472B6', 10.8, .32], ['#34D399', 11.6, .26]].forEach(([c, x, r]) => { const b = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), mat(c)); b.position.set(x, r, z); b.castShadow = true; G.add(b); }); box(1.1, 1.1, .7, '#334155', 14, .55, z, {}, true); }
    if (floor === 3) { const cols = ['#FCA5A5', '#FDE68A', '#86EFAC', '#93C5FD']; for (let i = 0; i < 6; i++) box(.9, .05, .9, cols[i % 4], 3 + i * .95, .025, z); box(.9, .6, .7, '#F9A8D4', 10.5, .3, z, {}, true); [['#F472B6', 12.6], ['#60A5FA', 13.1]].forEach(([c, x]) => { const b = new THREE.Mesh(new THREE.SphereGeometry(.22, 14, 10), mat(c)); b.position.set(x, 1.7, z); b.userData.balloon = true; G.add(b); }); }
    if (floor === 4) { box(1, 1.1, .7, '#E5E7EB', 3.5, .55, z, {}, true); box(.8, .35, .05, '#0F172A', 3.5, 1.3, z - .36, { emissive: '#34D399', emissiveIntensity: .7 }); box(.9, .8, .7, '#CBD5E1', 5.5, .4, z, { metalness: .5, roughness: .35 }, true); const pole = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, 1.6, 8), mat('#64748B')); pole.position.set(7.5, .8, z); G.add(pole); const lamp = new THREE.Mesh(new THREE.SphereGeometry(.18, 14, 10), mat('#EF4444', { emissive: '#EF4444', emissiveIntensity: 1 })); lamp.position.set(7.7, 1.7, z); G.add(lamp); box(.9, 1.0, .7, '#F3F4F6', 9.5, .5, z, {}, true); }
    [1.5, COLS - 1.5].forEach(x => { box(.4, .4, .4, '#B45309', x, .2, z); const leaf = new THREE.Mesh(new THREE.SphereGeometry(.35, 12, 10), mat('#4ADE80')); leaf.position.set(x, .7, z); leaf.castShadow = true; G.add(leaf); });
  }

  // ---------- 마운트/해제 ----------
  function mount(cv, o) {
    canvas = cv; opts = o || {}; floor = opts.floor || 1; running = true; built = false;
    loadThree().then(() => {
      renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true }); renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5)); renderer.outputEncoding = THREE.sRGBEncoding; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05; renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      buildScene(); built = true; resetPlayer(); resize(); window.addEventListener('resize', resize);
      cv.addEventListener('pointerdown', onDown); cv.addEventListener('pointermove', onMove); cv.addEventListener('pointerup', onUp); cv.addEventListener('pointercancel', onUp);
      window.addEventListener('keydown', onKeyDown); window.addEventListener('keyup', onKeyUp);
      makeOverlay(); lastTs = performance.now(); raf = requestAnimationFrame(loop);
      watchdog = setInterval(() => { if (running && performance.now() - lastTs > 60) tick(performance.now()); }, 40);
    }).catch(e => { running = false; if (U && U.toast) U.toast('3D 엔진을 불러오지 못했어요: ' + e.message, 'err'); if (opts.onFail) opts.onFail(); });
  }
  function destroy() {
    running = false; if (raf) cancelAnimationFrame(raf); clearInterval(watchdog); keys.clear();
    window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); window.removeEventListener('resize', resize);
    if (canvas) { canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointermove', onMove); canvas.removeEventListener('pointerup', onUp); canvas.removeEventListener('pointercancel', onUp); }
    if (hint) { hint.remove(); hint = null; } if (cross) { cross.remove(); cross = null; }
    if (renderer) { renderer.dispose(); renderer = null; } scene = null; built = false;
  }
  function makeOverlay() {
    const wrap = canvas.parentElement; if (getComputedStyle(wrap).position === 'static') wrap.style.position = 'relative';
    cross = document.createElement('div'); cross.className = 'fp-cross'; wrap.append(cross);
    hint = document.createElement('div'); hint.className = 'fp-hint'; wrap.append(hint);
  }
  function resize() {
    if (!renderer || !canvas || !canvas.parentElement) return; const rect = canvas.parentElement.getBoundingClientRect(); if (!rect.width) return;
    const w = rect.width, h = Math.round(w * H / W); renderer.setSize(w, h, false); canvas.style.width = w + 'px'; canvas.style.height = h + 'px'; camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  function resetPlayer() { P.x = 2.6; P.z = CORR_Z / 2; P.yaw = Math.PI / 2; P.pitch = 0; P.wps = []; P.arrive = null; P.turnTo = null; }
  const enabled = () => !opts.enabled || opts.enabled();

  // ---------- 입력 ----------
  function onKeyDown(e) { if (!enabled()) return; if (e.target && /input|textarea|select/i.test(e.target.tagName)) return; const k = e.key.length === 1 ? e.key.toLowerCase() : e.key; if (['w', 'a', 's', 'd', 'q', 'e', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(k)) { e.preventDefault(); keys.add(k); P.wps = []; P.arrive = null; } if (e.key === 'Enter' || e.key === ' ' || k === 'f') { e.preventDefault(); interact(); } }
  function onKeyUp(e) { const k = e.key.length === 1 ? e.key.toLowerCase() : e.key; keys.delete(k); }
  function move(dir) { if (!enabled()) return; P.wps = []; P.arrive = null; P.impulse = { dir, t: dir === 'left' || dir === 'right' ? .18 : .35 }; }
  function onDown(e) { if (!enabled()) return; drag.on = true; drag.id = e.pointerId; drag.x = e.clientX; drag.y = e.clientY; drag.moved = 0; try { canvas.setPointerCapture(e.pointerId); } catch (x) { } e.preventDefault(); }
  function onMove(e) { if (!drag.on || e.pointerId !== drag.id) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.moved += Math.abs(dx) + Math.abs(dy); drag.x = e.clientX; drag.y = e.clientY; if (drag.moved > 6) { P.yaw += dx * .006; P.pitch = Math.max(-.7, Math.min(.6, P.pitch - dy * .004)); P.turnTo = null; } }
  function onUp(e) { if (!drag.on || e.pointerId !== drag.id) return; drag.on = false; try { canvas.releasePointerCapture(e.pointerId); } catch (x) { } if (drag.moved <= 6) click(e); }
  const rc = { r: null };
  function click(e) {
    if (!built) return; if (!rc.r) rc.r = new THREE.Raycaster();
    const rect = canvas.getBoundingClientRect(); const nd = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    rc.r.setFromCamera(nd, camera);
    const hitObj = rc.r.intersectObjects(world.clickables, false)[0];
    if (hitObj && hitObj.object.userData.room != null) {
      const ri = hitObj.object.userData.room; const r = world.rooms[ri];
      if (curRoom() === ri && Math.hypot(P.x - r.bedCenter.x, P.z - r.bedCenter.z) < 2.8) { P.turnTo = null; P.yaw = Math.atan2(r.focus.x - P.x, -(r.focus.z - P.z)); P.lastInteract = 0; interact(); }
      else goToRoom(ri);
      return;
    }
    const hit = rc.r.intersectObject(world.ground)[0]; if (!hit) return; const x = hit.point.x, z = hit.point.z;
    if (z < 0) { if (x < 2.2) { goToElevator(); return; } const ri = ROOM_COLS.findIndex(([a, b]) => x >= a && x <= b + 1); if (ri >= 0) { goToRoom(ri); return; } }
    if (z >= 0 && z <= CORR_Z && x > 0 && x < COLS) { P.wps = routeTo({ x: Math.min(COLS - .5, Math.max(.5, x)), z: Math.min(CORR_Z - .4, Math.max(.4, z)) }); P.arrive = null; }
  }
  const curRoom = () => P.z < 0 ? ROOM_COLS.findIndex(([a, b]) => P.x >= a && P.x <= b + 1) : -1;
  function routeTo(pt, viaRoom) { // 현재 위치 → (병실이면 문으로 나와서) 복도 → 목표
    const wps = []; const cr = curRoom();
    if (cr >= 0) wps.push({ x: DOOR_X[cr], z: -.7 }, { x: DOOR_X[cr], z: .9 });
    if (viaRoom != null) { wps.push({ x: DOOR_X[viaRoom], z: .9 }, { x: DOOR_X[viaRoom], z: -.7 }); }
    wps.push(pt); return wps;
  }
  function goToRoom(i) { const r = world.rooms[i]; if (!r) return; const info = (opts.getRoom && opts.getRoom(i)) || {}; if (info.status === 'empty') { if (U && U.toast) U.toast('빈 병실입니다.', 'info'); return; } P.wps = curRoom() === i ? [r.stand] : routeTo(r.stand, i); P.arrive = { type: 'room', i }; setHint('🚶 ' + (info.label || '병실') + ' 침대로 이동 중…'); }
  function goToElevator() { P.wps = routeTo({ x: 1.0, z: .9 }); P.arrive = { type: 'elev' }; setHint('🚶 엘리베이터로 이동 중…'); }
  function interactable() {
    const cr = curRoom();
    if (cr >= 0) { const r = world.rooms[cr]; const d = Math.hypot(P.x - r.bedCenter.x, P.z - r.bedCenter.z); if (d < 2.4 && facing(r.bedCenter.x, r.bedCenter.z, .3)) return { type: 'room', i: cr }; }
    else if (P.x < 2.6 && P.z < 1.6 && facing(1, -.3, .5)) return { type: 'elev' };
    return null;
  }
  function facing(x, z, min) { const fx = Math.sin(P.yaw), fz = -Math.cos(P.yaw); const dx = x - P.x, dz = z - P.z; const l = Math.hypot(dx, dz) || 1; return (fx * dx + fz * dz) / l > min; }
  function interact() {
    if (!enabled() || performance.now() - P.lastInteract < 600) return; const it = interactable(); if (!it) { setHint('침대 가까이에서 환자를 바라보고 Enter 를 누르세요.', 1800); return; }
    P.lastInteract = performance.now(); P.wps = []; P.arrive = null;
    if (it.type === 'room') { const info = (opts.getRoom && opts.getRoom(it.i)) || {}; if (info.status === 'done') { if (U && U.toast) U.toast('이미 치료를 마친 환자입니다.', 'info'); return; } if (opts.onEnterRoom) opts.onEnterRoom(it.i); }
    else if (opts.onElevator) opts.onElevator();
  }
  let hintTimer = null; function setHint(t, ms) { if (!hint) return; hint.textContent = t; hint.classList.toggle('show', !!t); clearTimeout(hintTimer); if (ms) hintTimer = setTimeout(() => { if (hint && hint.textContent === t) hint.classList.remove('show'); }, ms); }

  // ---------- 이동/충돌 ----------
  function tryMove(dx, dz) {
    let nx = P.x + dx, nz = P.z + dz;
    const blocked = (x, z) => world.solids.some(s => x > s.x0 && x < s.x1 && z > s.z0 && z < s.z1);
    if (!blocked(nx, P.z)) P.x = nx; if (!blocked(P.x, nz)) P.z = nz;
    P.x = Math.max(.3, Math.min(COLS - .3, P.x)); P.z = Math.max(-ROOM_D + .35, Math.min(CORR_Z - .3, P.z));
  }
  const SPEED = 2.6, TURN = 2.2;
  function update(dt) {
    const en = enabled(); let moving = false;
    if (en) {
      let f = 0, s = 0, turn = 0;
      if (keys.has('w') || keys.has('ArrowUp')) f += 1; if (keys.has('s') || keys.has('ArrowDown')) f -= 1;
      if (keys.has('a')) s -= 1; if (keys.has('d')) s += 1;
      if (keys.has('ArrowLeft') || keys.has('q')) turn -= 1; if (keys.has('ArrowRight') || keys.has('e')) turn += 1;
      if (P.impulse) { const im = P.impulse; if (im.dir === 'up') f += 1; if (im.dir === 'down') f -= 1; if (im.dir === 'left') turn -= 1; if (im.dir === 'right') turn += 1; im.t -= dt; if (im.t <= 0) P.impulse = null; }
      if (turn) { P.yaw += turn * TURN * dt; P.turnTo = null; }
      if (f || s) {
        const fx = Math.sin(P.yaw), fz = -Math.cos(P.yaw); const rx = Math.cos(P.yaw), rz = Math.sin(P.yaw); const len = Math.hypot(f, s) || 1;
        tryMove((fx * f + rx * s) / len * SPEED * dt, (fz * f + rz * s) / len * SPEED * dt); moving = true; P.wps = []; P.arrive = null;
      } else if (P.wps.length) {
        const t = P.wps[0]; const dx = t.x - P.x, dz = t.z - P.z; const d = Math.hypot(dx, dz);
        if (d < .2) { P.wps.shift(); if (!P.wps.length) arrived(); }
        else { const st = Math.min(d, SPEED * dt); tryMove(dx / d * st, dz / d * st); moving = true; const want = Math.atan2(dx, -dz); P.yaw = lerpAngle(P.yaw, want, Math.min(1, dt * 6)); P.pitch *= (1 - Math.min(1, dt * 3)); }
      }
    }
    if (P.turnTo) { P.yaw = lerpAngle(P.yaw, P.turnTo.yaw, Math.min(1, dt * 4)); P.pitch += (P.turnTo.pitch - P.pitch) * Math.min(1, dt * 4); if (Math.abs(angDiff(P.yaw, P.turnTo.yaw)) < .03) { const a = P.turnTo.after; P.turnTo = null; if (a) a(); } }
    P.bob = moving ? P.bob + dt * 9 : 0;
    // 안내 문구
    if (!P.wps.length && !P.turnTo) { const it = interactable(); if (it) setHint(it.type === 'room' ? '👆 환자를 클릭(또는 Enter) : 진료 시작' : '🛗 Enter(또는 탭) : 층 이동'); else if (hint && hint.classList.contains('show') && (hint.textContent.startsWith('👆') || hint.textContent.startsWith('🛗'))) setHint(''); }
  }
  function arrived() {
    const a = P.arrive; P.arrive = null; if (!a) { setHint(''); return; }
    if (a.type === 'room') { const r = world.rooms[a.i]; const f = r.focus || r.bedCenter; const yaw = Math.atan2(f.x - P.x, -(f.z - P.z)); P.turnTo = { yaw, pitch: r.pose === 'sitting' ? -.12 : -.3, after: () => setHint('👆 침대의 환자를 클릭하면 진료를 시작합니다') }; }
    else if (a.type === 'elev') { P.turnTo = { yaw: Math.atan2(1 - P.x, -(-.3 - P.z)), pitch: 0, after: () => { setHint(''); setTimeout(() => { if (enabled()) { P.lastInteract = 0; interact(); } }, 250); } }; }
  }
  const angDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
  const lerpAngle = (a, b, t) => a + angDiff(a, b) * t;

  // ---------- 렌더 ----------
  function tick(ts) { const dt = Math.min(.1, Math.max(0, (ts - lastTs) / 1000)); lastTs = ts; update(dt); render(ts, dt); }
  function loop(ts) { if (!running) return; tick(ts); raf = requestAnimationFrame(loop); }
  function render(ts) {
    if (!built || !renderer) return;
    const infos = world.rooms.map(r => (opts.getRoom && opts.getRoom(r.i)) || {}); const key = infos.map(x => (x.label || '-') + ':' + x.status).join('|') + '#' + floor;
    if (key !== world.labelKey) {
      world.labelKey = key; const meta = META()[floor] || META()[1];
      world.rooms.forEach((room, i) => {
        const info = infos[i]; const done = info.status === 'done', empty = info.status === 'empty';
        const nxt = !!info.next && !done && !empty;
        room.label.material.map.dispose(); room.label.material.map = textTexture([{ text: `${floor}0${i + 1}호 · ${info.label || '빈 병실'}` }, { text: done ? '✓ 치료 완료' : empty ? '—' : nxt ? '▶ 지금 진료할 환자 (클릭)' : '순서 대기', color: done ? '#15803D' : nxt ? '#B45309' : '#6B7280' }], { border: done ? '#86EFAC' : nxt ? meta.accent : '#CBD5E1', bg: nxt ? 'rgba(255,251,235,.98)' : undefined }); room.label.material.needsUpdate = true;
        room.chart.material.map.dispose(); room.chart.material.map = textTexture([{ text: info.label || '' }, { text: done ? '치료 완료' : nxt ? '진료 대기 · 환자를 클릭' : '순서 대기', color: done ? '#15803D' : '#B45309' }], { bg: 'rgba(255,255,255,.92)' }); room.chart.material.needsUpdate = true;
        room.blanket.material.color.set(done ? '#BBF7D0' : (info.pediatric ? '#FFF1C9' : '#FFFFFF')); room.lamp.visible = !done && !empty; room.patient.visible = !empty; room.chart.visible = !empty;
        // 환부 고리 위치
        const cs = Session && Session.state && Session.state.rooms[floor] && Session.state.rooms[floor][i]; const reg = cs && cs.case && cs.case.patient && cs.case.patient.region;
        if (reg && !empty && room.pose !== 'sitting' && window.Patient) { const pt = Patient.point(reg, cs.case.patient.posture || 'supine', info.pediatric ? .74 : 1); const z = -3.72 + (pt.x - 60) / 256 * 1.67; const x = -(pt.y - 100) / 44 * .36; room.ring.position.set(room.bedCenter.x + x, .78, Math.max(-3.9, Math.min(-2.0, z))); room.ring.visible = !done; } else room.ring.visible = false;
      });
    }
    world.rooms.forEach(room => { if (room.lamp.visible) room.lamp.material.emissiveIntensity = Math.floor(ts / 600) % 2 ? 1 : .15; if (room.ring.visible) { const s = 1 + Math.sin(ts / 250) * .25; room.ring.scale.set(s, s, 1); } });
    G.traverse(o => { if (o.userData.balloon) o.position.y = 1.7 + Math.sin(ts / 600 + o.position.x) * .08; });
    // 병실 안 공중 UI 갱신(현재 들어가 있는 병실만)
    const cr = curRoom();
    world.rooms.forEach((room, i) => {
      const inside = cr === i; const cs = Session && Session.state && Session.state.rooms[floor] && Session.state.rooms[floor][i];
      if (room.prog) { room.prog.visible = inside && !!cs; if (inside && cs) { const tot = cs.questions.length || 1, ans = cs.questions.filter(q => q.chosen != null).length; const v = Math.round(ans / tot * 100); if (v !== room.progVal) { room.progVal = v; room.prog.material.map.dispose(); room.prog.material.map = textTexture([{ text: `진행률 ${v}%`, color: '#fff' }, { text: '▰'.repeat(Math.round(v / 10)) + '▱'.repeat(10 - Math.round(v / 10)), color: '#BFDBFE' }], { bg: 'rgba(37,99,235,.92)' }); room.prog.material.needsUpdate = true; } } }
      if (room.cc) { room.cc.visible = inside && !!cs && !cs.done && P.focus == null; if (inside && cs) { const t = '💬 ' + String(cs.case.S.chief || '').slice(0, 26) + (String(cs.case.S.chief || '').length > 26 ? '…' : ''); if (t !== room.ccText) { room.ccText = t; room.cc.material.map.dispose(); room.cc.material.map = textTexture([{ text: t }], { bg: 'rgba(255,255,255,.96)', border: '#2563EB' }); room.cc.material.needsUpdate = true; } } }
    });
    // 아바타(3인칭) + 걷기 애니메이션
    const av = world.avatar; const moving = P.bob > 0;
    if (av) {
      av.position.set(P.x, 0, P.z); av.rotation.y = -P.yaw;
      const sw = moving ? Math.sin(P.bob) : 0; const legs = av.userData.legs || [], arms = av.userData.arms || [];
      legs.forEach((lg, i) => lg.rotation.x = sw * .6 * (i ? -1 : 1)); arms.forEach((ar, i) => ar.rotation.x = sw * .5 * (i ? 1 : -1));
      av.position.y = moving ? Math.abs(Math.sin(P.bob)) * .03 : 0;
      if (world.bones) { const b = world.bones; if (b.lUp) b.lUp.rotation.x = sw * .5; if (b.rUp) b.rUp.rotation.x = -sw * .5; if (b.lArm) b.lArm.rotation.x = -sw * .4; if (b.rArm) b.rArm.rotation.x = sw * .4; }
    }
    // 어깨너머 카메라(벽 뒤로 빠지지 않도록 거리 조절)
    const fx0 = Math.sin(P.yaw), fz0 = -Math.cos(P.yaw); const DIST = 2.6; const camH = Math.max(1.3, Math.min(3.2, 2.0 - P.pitch * 1.6));
    const head = new THREE.Vector3(P.x, 1.5, P.z); const want = new THREE.Vector3(P.x - fx0 * DIST, camH, P.z - fz0 * DIST);
    let dist = DIST; if (world.walls.length) { const cr2 = world.camRc || (world.camRc = new THREE.Raycaster()); const dirv = want.clone().sub(head); const len = dirv.length(); dirv.normalize(); cr2.set(head, dirv); cr2.far = len; const hit = cr2.intersectObjects(world.walls, false)[0]; if (hit) dist = Math.max(.7, hit.distance - .25); }
    const t = dist / DIST; let wantPos = new THREE.Vector3(head.x + (want.x - head.x) * t, head.y + (want.y - head.y) * t, head.z + (want.z - head.z) * t);
    let wantTgt = new THREE.Vector3(P.x + fx0 * 1.6, 1.25 + P.pitch * 1.4, P.z + fz0 * 1.6);
    // 진료 중: 침대 옆 클로즈업(차트 패널이 열려 있는 동안)
    if (P.focus != null && world.rooms[P.focus]) {
      const r = world.rooms[P.focus]; const b = r.bedCenter;
      if (r.pose === 'sitting') { wantPos = new THREE.Vector3(b.x + 1.45, 1.45, b.z + 1.0); wantTgt = new THREE.Vector3(b.x + .36, 1.0, b.z + .1); } else { wantPos = new THREE.Vector3(b.x - 1.3, 1.55, b.z + .6); wantTgt = new THREE.Vector3(b.x + .1, .72, b.z - .35); }
      // 차트 패널이 오른쪽을 덮으므로 환자가 화면 왼쪽에 오도록 시선을 오른쪽으로 옮김
      const dirF = wantTgt.clone().sub(wantPos).normalize(); const right = new THREE.Vector3().crossVectors(dirF, new THREE.Vector3(0, 1, 0)).normalize(); const wide = (canvas && canvas.clientWidth > 760) ? .75 : .15; wantTgt.add(right.multiplyScalar(wide));
      if (world.avatar) world.avatar.visible = false;
    }
    else if (world.avatar) world.avatar.visible = true;
    if (!camState.pos) { camState.pos = wantPos.clone(); camState.tgt = wantTgt.clone(); }
    const k = Math.min(1, (lastTs ? 0.016 : 0.016) * 5); camState.pos.lerp(wantPos, P.focus != null ? .08 : .35); camState.tgt.lerp(wantTgt, P.focus != null ? .08 : .35);
    camera.position.copy(camState.pos); camera.lookAt(camState.tgt);
    renderer.render(scene, camera);
  }
  function setFloor(f) { floor = f; P.focus = null; if (built) { buildFloor(); resetPlayer(); setHint(`${f}F 에 도착했습니다. 병실을 클릭하거나 걸어가세요.`, 2500); } }
  function focus(i) { P.focus = (i == null) ? null : i; if (i != null) setHint(''); }
  function snapshot() { try { if (renderer && scene && camera) renderer.render(scene, camera); return canvas.toDataURL('image/png'); } catch (e) { return null; } }
  return { mount, destroy, setFloor, move, resize, setPlayer, focus, snapshot, FLOOR_META, get floor() { return floor; }, get pos() { return { x: P.x, z: P.z, yaw: P.yaw, room: curRoom(), wps: P.wps.length }; }, _debug: () => ({ camera, world, P, click, goToRoom, interact }) };
})();