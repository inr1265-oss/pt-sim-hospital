// 3D 병원 — 치료사 1인칭 시점(Three.js r128, CDN 지연 로드)
// 복도를 걷고 → 문으로 병실에 들어가 → 침대 발치에서 환자를 보면 "평가 시작" (Enter / 탭 / D패드 가운데)
window.Hospital3D = (() => {
  const COLS = 34, W = 704, H = 320; // 건물 폭 34 m, 캔버스 비율 704:320
  const ROOM_COLS = [[3, 8], [9, 14], [15, 20], [21, 26], [27, 32]]; // 치료실 x 범위(폭 5 m, 사이 벽 1 m)
  const DOOR_X = ROOM_COLS.map(([a]) => a + 2.5);
  const ROOM_TYPE = ['room', 'bay', 'plinth', 'room', 'bay']; // 침상실 / 트인 치료 베이 / 운동치료 매트 구역
  const CORR_Z = 7.5, ROOM_D = 6, WALL_H = 3.0, EYE = 1.55, R = 0.3;
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
  function plateTexture(fl, i, info, meta) {
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 668; const x = cv.getContext('2d');
    x.clearRect(0, 0, 512, 668);
    // 호실 번호(입체감 있는 회색 숫자)
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = 'bold 150px Pretendard, "Malgun Gothic", sans-serif';
    x.fillStyle = 'rgba(0,0,0,.18)'; x.fillText(`${fl}0${i + 1}`, 262, 112); x.fillStyle = '#8A94A3'; x.fillText(`${fl}0${i + 1}`, 256, 104); x.fillStyle = '#B5BEC9'; x.fillText(`${fl}0${i + 1}`, 253, 100);
    // 흰 플레이트
    x.fillStyle = 'rgba(0,0,0,.15)'; roundRect(x, 52, 232, 420, 400, 18); x.fill(); x.fillStyle = '#FFFFFF'; roundRect(x, 44, 224, 420, 400, 18); x.fill(); x.strokeStyle = '#CBD5E1'; x.lineWidth = 4; roundRect(x, 44, 224, 420, 400, 18); x.stroke();
    x.fillStyle = meta.accent; roundRect(x, 44, 224, 420, 34, 10); x.fill(); x.fillStyle = '#fff'; x.font = 'bold 22px Pretendard, "Malgun Gothic", sans-serif'; x.fillText(meta.name, 254, 242);
    const rows = [['환자명', info.name || '—'], ['나이/성별', info.ageSex || '—'], ['상태', info.state || '빈 병실']];
    x.textAlign = 'left'; rows.forEach(([k, v], r) => { const y = 300 + r * 92; x.fillStyle = '#6B7280'; x.font = 'bold 26px Pretendard, "Malgun Gothic", sans-serif'; x.fillText(k, 72, y); x.fillStyle = r === 2 ? (info.stateColor || '#111827') : '#111827'; x.font = 'bold 36px Pretendard, "Malgun Gothic", sans-serif'; let txt = v; while (x.measureText(txt).width > 370 && txt.length > 2) txt = txt.slice(0, -2) + '…'; x.fillText(txt, 72, y + 40); x.strokeStyle = '#E5E7EB'; x.lineWidth = 2; x.beginPath(); x.moveTo(64, y + 66); x.lineTo(444, y + 66); x.stroke(); });
    x.textAlign = 'center'; x.fillStyle = '#9CA3AF'; x.font = '18px Pretendard, "Malgun Gothic", sans-serif'; x.fillText('신성대학교 PT 시뮬레이션 병원', 254, 600);
    const t = new THREE.CanvasTexture(cv); t.minFilter = THREE.LinearMipMapLinearFilter; t.anisotropy = 8; return t;
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
    scene = new THREE.Scene(); scene.background = new THREE.Color('#DCE4EC'); scene.fog = new THREE.Fog('#DCE4EC', 20, 42);
    camera = new THREE.PerspectiveCamera(66, W / H, .05, 60);
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
    if (world.avatar) { scene.remove(world.avatar); world.avatar = null; world.bones = null; } if (world.mixer) { world.mixer.stopAllAction(); world.mixer = null; world.anim = null; }
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
    loadGlbAvatar([info.glb, publicOn() ? (female ? PUBLIC_GLB.therapistF : PUBLIC_GLB.therapistM) : ''].filter(Boolean), g, female); // 지정 GLB → 공개 기본 모델 → 내장 캐릭터
  }
  // ---------- GLB 공용 로더(치료사·환자) ----------
  const ensureGltf = () => (THREE.GLTFLoader ? Promise.resolve() : new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js'; sc.onload = res; sc.onerror = () => rej(new Error('GLTFLoader 로드 실패')); document.head.append(sc); }));
  const glbMissing = new Set(); // 기본 경로(assets/models/…)에 파일이 없으면 조용히 내장 모델 사용
  const glbAbsent = url => Object.assign(new Error('파일 없음: ' + url), { silent: true });
  function probeGlb(url) { if (glbMissing.has(url)) return Promise.reject(glbAbsent(url)); if (/^(https?:)?\/\//.test(url)) return Promise.resolve(); return fetch(url, { method: 'HEAD', cache: 'no-store' }).then(r => { if (!r.ok && r.status !== 405) { glbMissing.add(url); throw glbAbsent(url); } }, () => { glbMissing.add(url); throw glbAbsent(url); }); }
  function loadGlb(url) { if (window.THREE && THREE.Cache) THREE.Cache.enabled = true; return probeGlb(url).then(ensureGltf).then(() => new Promise((res, rej) => new THREE.GLTFLoader().load(url, res, undefined, () => rej(new Error('모델을 내려받지 못했어요 (URL·CORS 확인)'))))); }
  function findBone(model, names) { let b = null; model.traverse(o => { if (!b && o.isBone && names.some(n => o.name === n || o.name.endsWith(n))) b = o; }); return b; }
  // Mixamo(LeftUpLeg…), Quaternius(UpperLegL…), 기타 흔한 이름을 모두 인식
  function humanBones(model) { const f = (...names) => findBone(model, names.flatMap(nm => [nm, 'mixamorig' + nm])); return { hips: f('Hips', 'Pelvis'), lUp: f('LeftUpLeg', 'UpperLegL', 'LeftUpperLeg', 'Thigh_L'), rUp: f('RightUpLeg', 'UpperLegR', 'RightUpperLeg', 'Thigh_R'), lLeg: f('LeftLeg', 'LowerLegL', 'LeftLowerLeg', 'Shin_L'), rLeg: f('RightLeg', 'LowerLegR', 'RightLowerLeg', 'Shin_R'), lArm: f('LeftArm', 'UpperArmL', 'LeftUpperArm', 'UpperArm_L'), rArm: f('RightArm', 'UpperArmR', 'RightUpperArm', 'UpperArm_R'), lFore: f('LeftForeArm', 'LowerArmL', 'LeftLowerArm', 'LowerArm_L'), rFore: f('RightForeArm', 'LowerArmR', 'RightLowerArm', 'LowerArm_R'), lHand: f('LeftHand', 'FistL', 'HandL', 'Hand_L'), rHand: f('RightHand', 'FistR', 'HandR', 'Hand_R'), lFoot: f('LeftFoot', 'FootL', 'Foot_L'), rFoot: f('RightFoot', 'FootR', 'Foot_R') }; }
  // 뼈가 어떤 축으로 리깅됐든 동작하도록, 뼈→자식뼈 방향을 원하는 월드 방향으로 돌림
  function aimBone(bone, child, dirWorld) {
    bone.updateWorldMatrix(true, false); child.updateWorldMatrix(true, false);
    const a = new THREE.Vector3(), c = new THREE.Vector3(); bone.getWorldPosition(a); child.getWorldPosition(c);
    const cur = c.sub(a); if (cur.lengthSq() < 1e-8) return; cur.normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(cur, dirWorld.clone().normalize());
    const pq = new THREE.Quaternion(); if (bone.parent) bone.parent.getWorldQuaternion(pq); const pqi = pq.clone().invert();
    bone.quaternion.premultiply(pq).premultiply(q).premultiply(pqi); bone.userData.baseQ = bone.quaternion.clone();
  }
  function armsDown(b) { // T포즈/A포즈 팔을 몸 옆으로 내림(약간 바깥쪽)
    const hips = new THREE.Vector3(); if (b.hips) b.hips.getWorldPosition(hips);
    [[b.lArm, b.lFore, b.lHand], [b.rArm, b.rFore, b.rHand]].forEach(([arm, fore, hand]) => {
      if (!arm || !fore) return; const s = new THREE.Vector3(); arm.getWorldPosition(s); const out = s.sub(hips); out.y = 0; if (out.lengthSq() < 1e-6) out.set(1, 0, 0); out.normalize();
      aimBone(arm, fore, new THREE.Vector3(0, -1, 0).addScaledVector(out, .2));
      if (hand) aimBone(fore, hand, new THREE.Vector3(0, -1, 0).addScaledVector(out, .45));
    });
  }
  // 모델 정면 판정: 사람이 +z를 보면 왼팔이 +x 쪽에 있음. 반대면 -z를 보는 모델(예: three.js Soldier)
  function facesPlusZ(model, b) { if (!b || !b.lArm || !b.rArm) return true; model.updateMatrixWorld(true); const l = new THREE.Vector3(), r = new THREE.Vector3(); b.lArm.getWorldPosition(l); b.rArm.getWorldPosition(r); return l.x >= r.x; }
  function swing(bone, angle) { if (!bone) return; if (!bone.userData.baseQ) bone.userData.baseQ = bone.quaternion.clone(); bone.quaternion.copy(bone.userData.baseQ).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), angle)); }
  function normalizeHeight(model, target) {
    model.updateMatrixWorld(true); let minY = Infinity, maxY = -Infinity; const v = new THREE.Vector3();
    model.traverse(o => { if (o.isBone) { o.getWorldPosition(v); minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y); } });
    // 뼈 높이는 머리 끝까지 닿지 않는 리그(Quaternius 등)에서 작게 나오므로, 메시 바운딩 박스가 그럴듯하면(뼈 높이의 0.95~1.6배) 그것을 씀
    const bb = new THREE.Box3().setFromObject(model); const bbH = bb.max.y - bb.min.y; const boneH = maxY - minY;
    if (!isFinite(minY) || boneH < .05) { minY = bb.min.y; maxY = bb.max.y; } else if (isFinite(bbH) && bbH >= boneH * .95 && bbH <= boneH * 1.6) { minY = Math.min(minY, bb.min.y); maxY = minY + bbH; }
    const h = (maxY - minY) || 1; const k = target / h; model.scale.setScalar(k); model.position.y = -minY * k; model.updateMatrixWorld(true); return k;
  }
  const patientGlbUrls = info => { const u = (typeof opts.patientGlb === 'function' ? opts.patientGlb() : opts.patientGlb) || {}; const elderly = !info.pediatric && Number(info.age) >= 60; const m = info.sex === '남'; const pubList = publicOn() ? (info.pediatric ? [m ? PUBLIC_GLB.childM : PUBLIC_GLB.childF] : elderly ? [m ? PUBLIC_GLB.elderM : PUBLIC_GLB.elderF] : [m ? PUBLIC_GLB.M : PUBLIC_GLB.F]) : []; const list = (info.pediatric ? [m ? u.childM : u.childF, u.child] : elderly ? (m ? [u.elderM, u.M] : [u.elderF, u.F]) : (m ? [u.M] : [u.F])).concat(pubList); /* 환자는 공개 기본 모델을 쓰지 않음(할머니·할아버지·아이를 표현 못 함) → 파일이 없으면 내장 환자 */ return [...new Set(list.filter(Boolean))]; }; // 앞의 파일이 없으면 다음 후보로
  const patientGlbUrl = info => patientGlbUrls(info)[0] || '';
  // 기본 사람 모델(리깅된 공개 GLB, three.js 예제 저장소·jsDelivr): 저장소 assets/models 에 파일이 없을 때 마지막 후보
  // 공개 기본 모델(Quaternius 'Ultimate Animated Characters', CC0, Cinevva CDN): 머리카락·걷기/서기 클립 포함. 저장소 파일이 없을 때 마지막 후보.
  // config.js 의 publicModels:false 로 끌 수 있음
  const PUB_BASE = 'https://cdn.cinevva.com/assets/packs/quaternius/ultimate-animated-characters/';
  const PUBLIC_GLB = { therapistF: PUB_BASE + 'Casual_Female.glb', therapistM: PUB_BASE + 'Casual_Male.glb', F: PUB_BASE + 'Casual2_Female.glb', M: PUB_BASE + 'Casual2_Male.glb', elderF: PUB_BASE + 'OldClassy_Female.glb', elderM: PUB_BASE + 'OldClassy_Male.glb', childF: PUB_BASE + 'Casual3_Female.glb', childM: PUB_BASE + 'Casual3_Male.glb' };
  const publicOn = () => opts.publicModels !== false;
  // 옷 입히기: Ready Player Me 계열(Wolf3D_*) 메시는 상의·하의를 단색으로 바꿔 치료복/환자복처럼, 모자는 숨김
  function dressModel(model, kind) {
    const top = kind === 'therapist' ? '#0F2546' : '#C9DDEF', bottom = kind === 'therapist' ? '#0B1B33' : '#8EA6BE'; // 치료사: 남색 상·하의 / 환자: 연한 환자복
    model.traverse(o => {
      if (!o.isMesh) return; const nm = o.name || '';
      if (/Headwear|Glasses/i.test(nm)) { o.visible = false; return; }
      if (/Beard/i.test(nm) && kind === 'therapist') { o.visible = false; return; }
      if (/^Ch0\d/.test(nm) && o.material && o.material.map && o.material.map.image && !o.material.userData.recolored) { // Mixamo 'Michelle' 같은 단일 텍스처 모델: 노란 바지만 치료복/환자복 색으로
        try { const img = o.material.map.image; const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height; const x = cv.getContext('2d'); x.drawImage(img, 0, 0); const id = x.getImageData(0, 0, cv.width, cv.height); const d = id.data;
          for (let i = 0; i < d.length; i += 4) { const r = d[i], g = d[i + 1], bl = d[i + 2]; const mx = Math.max(r, g, bl), mn = Math.min(r, g, bl); if (mx === mn || mx === 0) continue; const sat = (mx - mn) / mx; let h = mx === r ? ((g - bl) / (mx - mn)) % 6 : mx === g ? (bl - r) / (mx - mn) + 2 : (r - g) / (mx - mn) + 4; h *= 60; if (h < 0) h += 360; if (sat > .35 && h >= 38 && h <= 68) { const l = mx / 255; const c = kind === 'therapist' ? [60, 170, 152] : [185, 205, 230]; d[i] = Math.round(c[0] * l); d[i + 1] = Math.round(c[1] * l); d[i + 2] = Math.round(c[2] * l); } }
          x.putImageData(id, 0, 0); const m = o.material.clone(); const tx = new THREE.CanvasTexture(cv); tx.flipY = false; tx.encoding = o.material.map.encoding; m.map = tx; m.userData.recolored = true; m.needsUpdate = true; o.material = m; } catch (e) { /* 실패하면 원본 유지 */ }
        return;
      }
      const mn = (o.material && o.material.name) || '';
      if (/^Skin$/i.test(mn) && o.material.color) { // Quaternius 류: 피부 재질이 검게 들어오는 경우 → 정점색이 있으면 그것을, 없으면 살색
        const c = o.material.color; if (c.r + c.g + c.b < .3) { const m = o.material.clone(); if (o.geometry && o.geometry.attributes && o.geometry.attributes.color) { m.vertexColors = true; m.color.set('#ffffff'); } else { m.color.set('#F1C8A5'); } m.needsUpdate = true; o.material = m; }
      }
      if (/^(Hat|Headwear|Band)$/i.test(mn)) { o.visible = false; return; } // 모자·머리띠는 병원에 안 맞으므로 숨김
      if (/^(Shirt|Pants|Belt|Jacket|Vest|Skirt|Dress|Shoes|Black|Details|Clothes|DarkClothes)$/i.test(mn)) { // Quaternius 류: 재질 이름으로 옷 구분 → 치료사는 남색, 환자는 연한 환자복
        const m = o.material.clone(); m.color = new THREE.Color(/Shirt|Jacket|Vest|Dress|Clothes$/i.test(mn) && !/Dark/i.test(mn) ? top : /Shoes/i.test(mn) ? '#F3F4F6' : /Belt|Details/i.test(mn) ? (kind === 'therapist' ? '#0F1D33' : '#7B8FA3') : bottom); m.needsUpdate = true; o.material = m; return;
      }
      if (/Outfit_Top|Outfit_Bottom|Outfit_Footwear/i.test(nm) && o.material) {
        const m = o.material.clone(); m.map = null; m.color = new THREE.Color(/Top/i.test(nm) ? top : /Bottom/i.test(nm) ? bottom : '#F3F4F6'); m.roughness = .85; m.metalness = 0; m.needsUpdate = true; o.material = m;
      }
    });
  }
  let glbWarned = false;
  function applyPatientGlb(room, info, bx, bz, topY, type) {
    const urls = patientGlbUrls(info); if (!urls.length || !room.patient) return; const tryLoad = k => loadGlb(urls[k]).catch(e => { if (e.silent && k + 1 < urls.length) return tryLoad(k + 1); throw e; }); const pose = room.pose; const edgeX = type === 'plinth' ? 1.2 : (type === 'bay' ? .3 : .36);
    tryLoad(0).then(gltf => {
      if (!world.rooms.includes(room)) return; const model = gltf.scene; const elderlyP = !info.pediatric && Number(info.age) >= 60; normalizeHeight(model, info.pediatric ? (Number(info.age) < 2 ? .72 : 1.05) : elderlyP ? 1.5 : 1.58); const b = humanBones(model);
      const wrap = new THREE.Group(); wrap.add(model); if (!facesPlusZ(model, b)) model.rotation.y = Math.PI; // model: 발이 원점, 정면 +z 로 통일
      armsDown(b); // T포즈 팔 내리기
      if (pose === 'sitting') {
        if (b.lUp && b.rUp && b.hips) {
          const fwd = new THREE.Vector3(0, 0, 1); [[b.lUp, b.lLeg], [b.rUp, b.rLeg]].forEach(([up, leg]) => { if (up && leg) aimBone(up, leg, fwd); }); [[b.lLeg, b.lFoot], [b.rLeg, b.rFoot]].forEach(([leg, foot]) => { if (leg && foot) aimBone(leg, foot, new THREE.Vector3(0, -1, 0)); }); // 넙다리 앞으로, 종아리 아래로
          model.updateMatrixWorld(true); const hp = new THREE.Vector3(); b.hips.getWorldPosition(hp);
          wrap.position.set(bx + edgeX, topY + .06 - hp.y, bz + .1); wrap.rotation.y = Math.PI / 2;
        } else { wrap.position.set(bx + edgeX + .5, 0, bz + .1); wrap.rotation.y = Math.PI / 2; } // 리깅이 없으면 침대 옆에 서 있음
      } else {
        wrap.rotation.x = -Math.PI / 2; if (pose === 'prone') wrap.rotateOnWorldAxis(new THREE.Vector3(0, 0, 1), Math.PI);
        wrap.position.set(bx, topY + (pose === 'prone' ? .16 : .13), bz + .95);
      }
      dressModel(model, 'patient'); model.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; o.userData.room = room.i; o.userData.patient = true; world.clickables.push(o); } });
      room.patient.visible = false; room.glb = wrap; G.add(wrap);
    }).catch(e => { if (e.silent) return; if (!glbWarned && U && U.toast) { glbWarned = true; U.toast('환자 모델 로드 실패: ' + e.message + ' (내장 환자 사용)', 'err'); } });
  }
  function loadGlbAvatar(urls, g, female) {
    const list = (Array.isArray(urls) ? urls : [urls]).filter(Boolean); if (!list.length) return; const tryLoad = k => loadGlb(list[k]).catch(e => { if (e.silent && k + 1 < list.length) return tryLoad(k + 1); throw e; });
    // GLB가 준비될 때까지 내장 캐릭터는 숨김(처음 들어간 층에서 다른 모습이 잠깐 보였다 바뀌는 현상 방지). 로드 실패 시 다시 표시
    const procedural = g.children.filter(ch => ch !== world.nameTag); procedural.forEach(ch => { ch.visible = false; });
    tryLoad(0).then(gltf => {
      if (world.avatar !== g) return; const model = gltf.scene; normalizeHeight(model, 1.58); if (world.nameTag) world.nameTag.position.y = 1.9; if (facesPlusZ(model, humanBones(model))) model.rotation.y = Math.PI; world.glbModel = model; /* 병원 규모에 맞게 조금 작게 · +z를 보는 모델은 돌려서 -z(진행 방향)를 보게 */
      dressModel(model, 'therapist'); model.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
      g.children.forEach(ch => { if (ch !== world.nameTag) ch.visible = false; }); g.add(model);
      const b = humanBones(model); world.bones = b; armsDown(b); // T포즈 → 팔 내리기
      // GLB에 걷기/서기 애니메이션 클립이 있으면(Mixamo 등) 뼈 흔들기 대신 그 클립을 재생
      const clips = gltf.animations || []; const walkClip = clips.find(c => /walk/i.test(c.name)) || clips.find(c => /run/i.test(c.name)); const idleClip = clips.find(c => /idle|breath|stand/i.test(c.name));
      if (walkClip || idleClip) { const mixer = new THREE.AnimationMixer(model); world.mixer = mixer; world.anim = { walk: walkClip ? mixer.clipAction(walkClip) : null, idle: idleClip ? mixer.clipAction(idleClip) : null, cur: null, checked: false }; }
    }).catch(e => { if (world.avatar === g) procedural.forEach(ch => { ch.visible = true; }); if (e.silent) return; if (U && U.toast) U.toast('외부 아바타 로드 실패: ' + e.message + ' (내장 캐릭터 사용)', 'err'); });
  }
  function setPlayer() { if (built) buildAvatar(); }
  function clearGroup() { if (G) { scene.remove(G); G.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (m.map && !(m.map.userData && m.map.userData.shared)) m.map.dispose(); m.dispose(); }); } }); } G = new THREE.Group(); scene.add(G); world.rooms = []; world.solids = []; world.clickables = []; world.walls = []; world.labelKey = ''; }
  function floorTexture(c1, c2) { const cv = document.createElement('canvas'); cv.width = cv.height = 512; const x = cv.getContext('2d'); x.fillStyle = c2; x.fillRect(0, 0, 512, 512); const n = 4, s = 512 / n; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { x.fillStyle = (i + j) % 2 ? c1 : c2; x.fillRect(i * s + 2, j * s + 2, s - 4, s - 4); } x.fillStyle = 'rgba(255,255,255,.18)'; for (let k = 0; k < 40; k++) x.fillRect(Math.random() * 512, Math.random() * 512, 2, 60); const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t; }
  function buildFloor() {
    clearGroup(); const meta = META()[floor] || META()[1];
    // 복도: 광택 바닥·천장·조명·뒷벽(창문·걸레받이·하단 띠)
    const cf = plane(COLS, CORR_Z, '#ffffff', COLS / 2, 0, CORR_Z / 2, { map: floorTexture(meta.tile[0], meta.tile[1]), roughness: .35, metalness: .08 }); cf.material.map.repeat.set(COLS / 2, CORR_Z / 2);
    const ceil = plane(COLS + 8, ROOM_D + CORR_Z + 2, '#F5F7FA', COLS / 2, WALL_H, (CORR_Z - ROOM_D) / 2, { side: THREE.BackSide, roughness: 1 }); ceil.receiveShadow = false;
    for (let x = 3; x < COLS; x += 4) { box(2.2, .05, .8, '#ffffff', x, WALL_H - .03, CORR_Z / 2, { emissive: '#ffffff', emissiveIntensity: 1 }); box(2.4, .02, 1.0, '#E5E7EB', x, WALL_H - .05, CORR_Z / 2); }
    box(COLS, WALL_H, .24, '#E9EDF2', COLS / 2, WALL_H / 2, CORR_Z + .12, {}, true);
    box(COLS, 1.0, .06, meta.wall, COLS / 2, .5, CORR_Z - .03); box(COLS, .14, .07, meta.accent, COLS / 2, 1.04, CORR_Z - .035); box(COLS, .1, .08, '#9AA5B5', COLS / 2, .05, CORR_Z - .04);
    for (let x = 4; x < COLS - 2; x += 6) { box(3.2, 1.3, .06, '#CFE8FF', x + 1.6, 1.95, CORR_Z - .04, { emissive: '#BBDDF8', emissiveIntensity: .5, roughness: .2, metalness: .1 }); [x + .05, x + 1.6, x + 3.15].forEach(xx => box(.07, 1.34, .1, '#94A3B8', xx, 1.95, CORR_Z - .06)); box(3.3, .07, .12, '#94A3B8', x + 1.6, 1.28, CORR_Z - .07); box(3.3, .07, .12, '#94A3B8', x + 1.6, 2.62, CORR_Z - .07); }
    box(.24, WALL_H, CORR_Z + ROOM_D, '#E9EDF2', COLS + .12, WALL_H / 2, (CORR_Z - ROOM_D) / 2, {}, true);
    box(.24, WALL_H, CORR_Z, '#E9EDF2', -.12, WALL_H / 2, CORR_Z / 2, {}, true);
    const sign = sprite([{ text: `${floor}F ${meta.name}` }], { w: 3.4, border: meta.accent, depthTest: false }); sign.position.set(COLS / 2, 2.5, CORR_Z - .4); sign.renderOrder = 9; G.add(sign);
    buildProps(meta);
    // 엘리베이터(복도 왼쪽 끝, x 0~2.5)
    box(2.5, WALL_H, 3, '#AEB8C6', 1.25, WALL_H / 2, -1.5, { metalness: .6, roughness: .35 }, true);
    [0.65, 1.85].forEach(x => box(1.1, 2.3, .06, '#D6DEE8', x, 1.15, .03, { metalness: .8, roughness: .18 }));
    box(1.4, .3, .06, '#1F2937', 1.25, 2.55, .04, { emissive: '#F87171', emissiveIntensity: .7 });
    const es = sprite([{ text: '🛗 엘리베이터 · 층 이동' }], { w: 2.0, depthTest: false }); es.position.set(1.25, 2.85, .6); es.renderOrder = 10; G.add(es);
    // 치료실 사이 기둥 벽(1 m) + 치료실
    ROOM_COLS.forEach(([a, b], i) => buildRoom(i, a, b, meta));
    for (let i = 0; i <= ROOM_COLS.length; i++) { const x0 = i === 0 ? 2.5 : ROOM_COLS[i - 1][1]; const x1 = i === ROOM_COLS.length ? COLS : ROOM_COLS[i][0]; if (x1 - x0 > 0) box(x1 - x0, WALL_H, .24, '#E9EDF2', (x0 + x1) / 2, WALL_H / 2, 0, {}, true); }
  }
  function buildRoom(i, a, b, meta) {
    const type = ROOM_TYPE[i] || 'room'; const cx = a + 2.5, door = DOOR_X[i];
    const room = { i, type, floorMesh: null, lamp: null, label: null, chart: null, patient: null, blanket: null, ring: null, prog: null, marker: null, plateX: null, bedCenter: { x: cx, z: -3.5 }, stand: { x: cx, z: -1.8 }, bounds: { x0: a, x1: b }, topY: .6 };
    const info = (opts.getRoom && opts.getRoom(i)) || {};
    room.floorMesh = plane(5, ROOM_D, type === 'plinth' ? '#DDE7F0' : '#F6F8FB', cx, .002, -ROOM_D / 2, { roughness: type === 'plinth' ? .9 : .5, metalness: .05 });
    box(5, WALL_H, .14, meta.wall, cx, WALL_H / 2, -ROOM_D, {}, true); box(5, 1.0, .05, meta.color, cx, .5, -ROOM_D + .1); box(5, .12, .06, meta.accent, cx, 1.04, -ROOM_D + .1);
    box(1.6, 1.2, .06, '#CFE8FF', cx + 1.2, 1.95, -ROOM_D + .09, { emissive: '#BBDDF8', emissiveIntensity: .55, roughness: .2 }); box(.07, 1.24, .1, '#94A3B8', cx + 1.2, 1.95, -ROOM_D + .11); box(1.7, .07, .12, '#94A3B8', cx + 1.2, 1.35, -ROOM_D + .11);
    box(2.2, .05, .8, '#ffffff', cx, WALL_H - .03, -3, { emissive: '#ffffff', emissiveIntensity: 1 });
    let bx = cx, bz = -3.5, topY = .6;
    if (type === 'room') {
      // 침상실: 양옆 벽 + 문 달린 앞벽, 병원 침대
      box(.14, WALL_H, ROOM_D, '#F1F3F6', a + .07, WALL_H / 2, -ROOM_D / 2, {}, true); box(.14, WALL_H, ROOM_D, '#F1F3F6', b - .07, WALL_H / 2, -ROOM_D / 2, {}, true);
      const dl = door - .6, dr = door + .6;
      box(dl - a, WALL_H, .14, '#F7F8FA', (a + dl) / 2, WALL_H / 2, 0, {}, true); box(b - dr, WALL_H, .14, '#F7F8FA', (dr + b) / 2, WALL_H / 2, 0, {}, true); box(1.2, WALL_H - 2.2, .14, '#F7F8FA', door, (WALL_H + 2.2) / 2, 0);
      box(.1, 2.2, .22, '#7C5A3C', dl + .05, 1.1, 0); box(.1, 2.2, .22, '#7C5A3C', dr - .05, 1.1, 0); box(1.2, .1, .22, '#7C5A3C', door, 2.2, 0);
      const leaf = box(1.0, 2.1, .06, '#B9803F', 0, 1.05, 0, { roughness: .55 }); leaf.position.set(dl + .07 + Math.cos(1.5) * .5, 1.05, -Math.sin(1.5) * .5); leaf.rotation.y = 1.5;
      box(.5, .7, .07, '#D7AE78', leaf.position.x + Math.cos(1.5) * .0, 1.45, leaf.position.z - .25).rotation.y = 1.5; box(.5, .6, .07, '#D7AE78', leaf.position.x, .55, leaf.position.z - .25).rotation.y = 1.5;
      buildBed(room, bx, bz, meta, i); topY = .6;
      room.plateX = dr + .45; room.label = plate(i, meta, dr + .45, 1.5, .085); room.stand = { x: cx, z: -1.9 };
    } else if (type === 'bay') {
      // 트인 치료 베이: 앞벽 없음, 허리 높이 파티션 + 커튼 레일, 치료 테이블
      box(.1, 1.2, ROOM_D - .6, '#E6EEF5', a + .3, .6, -ROOM_D / 2, { roughness: .6 }, true); box(.1, 1.2, ROOM_D - .6, '#E6EEF5', b - .3, .6, -ROOM_D / 2, { roughness: .6 }, true);
      const rail = new THREE.Mesh(new THREE.TorusGeometry(1.9, .02, 8, 40, Math.PI), mat('#9CA3AF', { metalness: .7 })); rail.rotation.x = Math.PI / 2; rail.rotation.z = 0; rail.position.set(bx, 2.3, bz); G.add(rail);
      const curtain = box(.04, 2.0, 2.2, '#CFE9DD', bx - 1.9, 1.3, bz, { roughness: 1, transparent: true, opacity: .85 }); curtain.castShadow = false; world.walls.push(curtain); // 카메라가 커튼 뒤로 가지 않게
      buildPlinth(room, bx, bz, .75, meta, i); topY = .75;
      box(.6, .9, .5, '#E5E7EB', bx + 1.9, .45, bz + 1.4, { metalness: .2 }, true); box(.5, .3, .05, '#0F172A', bx + 1.9, 1.05, bz + 1.15, { emissive: '#34D399', emissiveIntensity: .6 });
      room.plateX = b - .9; room.label = plate(i, meta, b - .9, 1.35, .5, true); room.stand = { x: cx, z: -1.7 };
    } else {
      // 운동치료 매트 구역: 완전히 개방, 넓은 매트 테이블 + 평행봉·짐볼
      const matT = box(2.4, .5, 2.0, '#1E3A8A', bx, .25, bz, { roughness: .9 }, true); matT.userData.room = i; world.clickables.push(matT); box(2.4, .04, 2.0, '#2E4FA3', bx, .52, bz, { roughness: .95 });
      room.bedCenter = { x: bx, z: bz }; topY = .54;
      [bz - .9, bz + .9].forEach(zz => { const bar = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, 2.6, 10), mat('#94A3B8', { metalness: .7 })); bar.rotation.z = Math.PI / 2; bar.position.set(cx - 1.8, .95, zz); G.add(bar); });
      [cx - 3.0, cx - .6].forEach(x => [bz - .9, bz + .9].forEach(zz => { const post = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, .95, 8), mat('#64748B', { metalness: .7 })); post.position.set(x, .47, zz); G.add(post); }));
      world.solids.push({ x0: cx - 3.0 - R, x1: cx - .6 + R, z0: bz - .9 - R, z1: bz - .9 + R }); world.solids.push({ x0: cx - 3.0 - R, x1: cx - .6 + R, z0: bz + .9 - R, z1: bz + .9 + R });
      [['#F472B6', cx + 1.9, .32, bz - 1.6], ['#34D399', cx + 2.0, .26, bz + 1.0]].forEach(([c, x, r, z]) => { const bl = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 14), mat(c, { roughness: .5 })); bl.position.set(x, r, z); bl.castShadow = true; G.add(bl); });
      box(1.2, .06, .8, '#60A5FA', cx + 1.7, .03, bz + 2.2);
      room.plateX = b - .9; room.label = plate(i, meta, b - .9, 1.35, .5, true); room.stand = { x: cx + 1.9, z: bz + .1 };
    }
    room.topY = topY;
    // 환자
    room.patient = buildPatient(info, bx, bz, topY, type); room.patient.traverse(o => { if (o.isMesh) { o.userData.room = i; world.clickables.push(o); } }); G.add(room.patient);
    room.pose = room.patient.userData.pose; room.focus = room.pose === 'sitting' ? { x: bx + .36, z: bz + .1 } : { x: bx, z: bz - .3 };
    if (info.status !== 'empty') applyPatientGlb(room, info, bx, bz, topY, type);
    room.ring = new THREE.Mesh(new THREE.TorusGeometry(.13, .02, 10, 28), mat('#DC2626', { emissive: '#DC2626', emissiveIntensity: .9 })); room.ring.rotation.x = Math.PI / 2; room.ring.visible = false; G.add(room.ring);
    room.lamp = new THREE.Mesh(new THREE.SphereGeometry(.07, 12, 10), mat('#EF4444', { emissive: '#EF4444', emissiveIntensity: 1 })); room.lamp.position.set(bx - .7, 2.4, -ROOM_D + .12); G.add(room.lamp);
    room.chart = sprite([{ text: '' }], { w: 1.2, depthTest: false }); room.chart.position.set(bx + .2, 2.05, -ROOM_D + .25); room.chart.renderOrder = 10; G.add(room.chart);
    room.prog = sprite([{ text: '진행률 0%' }], { w: .8, bg: 'rgba(37,99,235,.92)', depthTest: false }); room.prog.position.set(bx - .7, topY + .9, bz - .95); room.prog.renderOrder = 12; room.prog.visible = false; G.add(room.prog); room.progVal = -1;
    // 다음 과제 마커(입구 위에서 까딱임)
    room.marker = sprite([{ text: '▼ 다음 과제' }], { w: 1.3, bg: 'rgba(109,91,208,.95)', depthTest: false }); room.marker.material.map.dispose(); room.marker.material.map = textTexture([{ text: '▼ 다음 과제', color: '#fff' }], { bg: 'rgba(109,91,208,.95)' }); room.marker.material.needsUpdate = true; room.marker.position.set(door, 2.6, .9); room.marker.renderOrder = 13; room.marker.visible = false; G.add(room.marker);
    world.rooms.push(room);
  }
  function plate(i, meta, x, y, z, standing) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(.46, .6), new THREE.MeshStandardMaterial({ map: plateTexture(floor, i, {}, meta), roughness: .5, metalness: .05, transparent: true })); m.position.set(x, y, z); m.userData.plate = i; m.castShadow = false; G.add(m); world.clickables.push(m);
    if (standing) { const pole = new THREE.Mesh(new THREE.CylinderGeometry(.025, .025, 1.05, 10), mat('#9CA3AF', { metalness: .7 })); pole.position.set(x, .52, z - .02); G.add(pole); const base = new THREE.Mesh(new THREE.CylinderGeometry(.2, .22, .04, 16), mat('#6B7280', { metalness: .6 })); base.position.set(x, .02, z - .02); G.add(base); const back = new THREE.Mesh(new THREE.BoxGeometry(.5, .64, .02), mat('#F3F4F6')); back.position.set(x, y, z - .015); G.add(back); }
    return m;
  }
  function buildBed(room, bx, bz, meta, i) {
    const frame = box(1.1, .22, 2.1, '#5B6B80', bx, .3, bz, { metalness: .5, roughness: .4 }, true); frame.userData.room = i; world.clickables.push(frame);
    [[-.45, -.9], [.45, -.9], [-.45, .9], [.45, .9]].forEach(([dx, dz]) => { box(.08, .3, .08, '#475569', bx + dx, .15, bz + dz); const wheel = new THREE.Mesh(new THREE.CylinderGeometry(.06, .06, .05, 10), mat('#1F2937')); wheel.rotation.z = Math.PI / 2; wheel.position.set(bx + dx, .06, bz + dz); G.add(wheel); });
    const matt = box(1.0, .18, 2.0, '#1E3A8A', bx, .5, bz, { roughness: .85 }); matt.userData.room = i; world.clickables.push(matt);
    const sheet = box(1.0, .03, 1.6, '#FFFFFF', bx, .6, bz - .2, { roughness: .95 }); sheet.userData.room = i; world.clickables.push(sheet);
    box(1.0, .55, .08, '#AFBBCB', bx, .62, bz - 1.04); box(.62, .12, .4, '#F8FAFC', bx, .65, bz - .75);
    [[-.52, 0], [.52, 0]].forEach(([dx]) => box(.04, .25, 1.2, '#B8C2D0', bx + dx, .7, bz - .2, { metalness: .5 }));
    room.blanket = box(.96, .14, 1.15, '#ffffff', bx, .66, bz + .38, { map: patternTexture('#FFFFFF', meta.accent, 'stripes'), roughness: .95 }); room.blanket.userData.room = i; world.clickables.push(room.blanket);
    box(.5, .55, .45, '#F8FAFC', bx - 1.1, .28, bz - 1.25, {}, true); box(.4, .03, .35, '#94A3B8', bx - 1.1, .36, bz - 1.25);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, 1.4, 8), mat('#64748B', { metalness: .6 })); pole.position.set(bx + 1.0, .7, bz - .5); G.add(pole); box(.55, .38, .06, '#1F2937', bx + 1.0, 1.5, bz - .5, { emissive: '#34D399', emissiveIntensity: .45 });
    const iv = new THREE.Mesh(new THREE.CylinderGeometry(.02, .02, 1.9, 8), mat('#9CA3AF', { metalness: .6 })); iv.position.set(bx - .95, .95, bz - .9); G.add(iv); box(.16, .3, .16, '#DBEAFE', bx - .95, 1.75, bz - .9, { roughness: .2 });
    box(.45, .06, .45, meta.accent, bx - 1.1, .45, bz + .9, {}, true); box(.45, .5, .06, meta.accent, bx - 1.1, .7, bz + 1.1);
    room.bedCenter = { x: bx, z: bz };
  }
  function buildPlinth(room, bx, bz, h, meta, i) {
    // 물리치료용 치료 테이블(플린스): 금속 다리 + 패드
    [[-.35, -.9], [.35, -.9], [-.35, .9], [.35, .9]].forEach(([dx, dz]) => box(.06, h - .1, .06, '#6B7280', bx + dx, (h - .1) / 2, bz + dz, { metalness: .7, roughness: .3 }));
    const pad = box(.8, .12, 2.0, '#1E3A8A', bx, h - .04, bz, { roughness: .8 }, true); pad.userData.room = i; world.clickables.push(pad);
    box(.8, .02, 1.3, '#FFFFFF', bx, h + .03, bz - .3, { roughness: .95 }).userData.room = i;
    box(.5, .08, .3, '#F8FAFC', bx, h + .06, bz - .8);
    room.blanket = box(.76, .08, .9, '#ffffff', bx, h + .06, bz + .45, { map: patternTexture('#FFFFFF', meta.accent, 'stripes'), roughness: .95 }); room.blanket.userData.room = i; world.clickables.push(room.blanket);
    room.bedCenter = { x: bx, z: bz };
  }
  function posture(info) {
    if (info.posture === 'prone') return 'prone';
    const r = String(info.region || ''); const upper = /^(shoulder|elbow|wrist|hand|neck|head)/.test(r);
    if (upper) return 'sitting';
    if (info.floor === 1 && !/^(lowback|legs|hip|knee|ankle|foot|calf|whole)/.test(r)) return 'sitting';
    if (info.pediatric && Number(info.age) >= 3 && /^(whole)$/.test(r)) return 'sitting';
    return 'supine';
  }
  function buildPatient(info, bx, bz, topY, type) {
    const ped = !!info.pediatric, female = info.sex === '여', age = Number(info.age) || 30, elderly = !ped && age >= 60; const pose = posture(info);
    const s = ped ? (age < 2 ? .6 : .78) : 1; const edgeX = type === 'plinth' ? 1.2 : (type === 'bay' ? .3 : .36);
    const skin = mat('#F6D3B5'); const hairM = mat(ped ? (female ? '#6B3F2A' : '#4A3024') : elderly ? '#CBD0D8' : female ? '#3B2418' : '#2B1B12');
    const gown = new THREE.MeshStandardMaterial({ map: patternTexture(ped ? (female ? '#FFD9E7' : '#D6E8FF') : elderly ? (female ? '#EADFF5' : '#E3EAF0') : (female ? '#F6DCE4' : '#DCEAF2'), ped ? (female ? '#F472B6' : '#60A5FA') : elderly ? (female ? '#B79BD8' : '#93A7BA') : (female ? '#C47A95' : '#7E9BB5'), 'dots'), roughness: .9 }); const pants = mat(ped ? (female ? '#F9A8D4' : '#93C5FD') : '#6B7B94');
    const g = new THREE.Group(); g.userData.pose = pose;
    const add = (geo, m, x, y, z, rx, ry, rz) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); if (rx) o.rotation.x = rx; if (ry) o.rotation.y = ry; if (rz) o.rotation.z = rz; o.castShadow = true; g.add(o); return o; };
    const headR = ped ? .2 : .17;
    const makeHead = (x, y, z, faceDir) => {
      add(new THREE.SphereGeometry(headR, 22, 18), skin, x, y, z);
      const upAx = faceDir === 'front' ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, -1);
      if (elderly && !female) { // 할아버지: 정수리가 벗어진 흰머리 띠
        add(new THREE.TorusGeometry(headR * .92, .045, 8, 24), hairM, x + upAx.x * headR * .2, y + upAx.y * headR * .2, z + upAx.z * headR * .2, faceDir === 'front' ? Math.PI / 2 : 0);
      } else {
        const cap = add(new THREE.SphereGeometry(headR + .012, 22, 18, 0, Math.PI * 2, 0, Math.PI / 2), hairM, x, y, z);
        if (faceDir === 'up') { cap.rotation.x = -1.15; } else if (faceDir === 'down') { cap.rotation.x = 1.0; } else { cap.rotation.z = -.35; cap.rotation.x = -.25; }
      }
      if (elderly && female) { const bun = faceDir === 'front' ? [x - headR * .95, y + headR * .25, z] : faceDir === 'up' ? [x, y + headR * .15, z - headR * 1.05] : [x, y + headR * .95, z]; add(new THREE.SphereGeometry(.075, 12, 10), hairM, bun[0], bun[1], bun[2]); } // 할머니: 쪽진 머리
      if (faceDir !== 'down') { const mp = faceDir === 'front' ? [x + headR * .96, y - .05, z] : [x, y + headR * .96, z + .07]; const mo = add(new THREE.SphereGeometry(.022, 10, 8), mat('#C9736E'), mp[0], mp[1], mp[2]); mo.scale.set(faceDir === 'front' ? .5 : 1.4, .5, faceDir === 'front' ? 1.4 : .5); } // 입
      if (female && !ped) { const lg = add(new THREE.SphereGeometry(headR * 1.15, 16, 12), hairM, x - (faceDir === 'front' ? .07 : 0), y - (faceDir === 'front' ? .05 : .08), z - (faceDir === 'up' ? .1 : 0)); lg.scale.set(faceDir === 'front' ? .9 : 1.3, faceDir === 'front' ? 1.3 : .5, 1.2); }
      if (female && ped) { [-1, 1].forEach(sg => add(new THREE.SphereGeometry(.07, 10, 8), hairM, x + (faceDir === 'front' ? 0 : sg * (headR + .03)), y + .02, z + (faceDir === 'front' ? sg * (headR + .03) : 0))); }
      if (faceDir !== 'down') { const ex = faceDir === 'front' ? x + headR * .92 : x; [-1, 1].forEach(sg => add(new THREE.SphereGeometry(.018, 8, 8), mat('#222'), faceDir === 'front' ? ex : x + sg * .06, faceDir === 'front' ? y + .02 : y + headR * .9, faceDir === 'front' ? z + sg * .06 : z + .03)); }
      if (elderly && faceDir === 'up') { [-1, 1].forEach(sg => add(new THREE.TorusGeometry(.045, .006, 6, 16), mat('#4B5563'), x + sg * .06, y + headR * .98, z + .03, Math.PI / 2)); }
      if (elderly && faceDir === 'front') { [-1, 1].forEach(sg => add(new THREE.TorusGeometry(.045, .006, 6, 16), mat('#4B5563'), x + headR * .98, y + .02, z + sg * .06, 0, Math.PI / 2)); }
    };
    if (pose === 'sitting') {
      g.position.set(bx + edgeX, topY, bz + .1); g.scale.set(s, s, s);
      add(new THREE.BoxGeometry(.42, .16, .34), pants, 0, .06, 0);
      add(new THREE.CylinderGeometry(.19, .22, .6, 18), gown, 0, .42, 0);
      add(new THREE.CylinderGeometry(.07, .07, .14, 10), skin, 0, .78, 0);
      makeHead(0, .78 + headR + .06, 0, 'front');
      [-.13, .13].forEach(dz => { add(new THREE.CylinderGeometry(.07, .065, .5, 10), pants, .12, -.1, dz, 0, 0, -.5); add(new THREE.CylinderGeometry(.06, .055, .45, 10), skin, .32, -.5, dz, 0, 0, -.1); add(new THREE.BoxGeometry(.18, .07, .1), mat('#374151'), .38, -.74, dz); });
      [-.24, .24].forEach(dz => add(new THREE.CylinderGeometry(.05, .045, .5, 10), skin, .03, .36, dz, 0, 0, -.15));
      g.userData.sitX = bx + edgeX;
    } else if (pose === 'prone') {
      g.position.set(bx, topY + .02, bz); g.scale.set(s, s, s);
      add(new THREE.CylinderGeometry(.22, .2, .62, 18), gown, 0, .1, -.3, Math.PI / 2);
      add(new THREE.BoxGeometry(.4, .12, .9), pants, 0, .06, .35);
      makeHead(0, .16, -.74, 'down');
      [-.3, .3].forEach(dx => { add(new THREE.CylinderGeometry(.055, .05, .5, 10), skin, dx, .1, -.75, Math.PI / 2); add(new THREE.SphereGeometry(.06, 10, 8), skin, dx, .1, -1.0); });
      [-.12, .12].forEach(dx => add(new THREE.SphereGeometry(.07, 10, 8), skin, dx, .12, .85));
    } else {
      g.position.set(bx, topY + .02, bz); g.scale.set(s, s, s);
      makeHead(0, .14, -.72, 'up');
      add(new THREE.CylinderGeometry(.21, .23, .6, 18), gown, 0, .1, -.3, Math.PI / 2); [-.11, .11].forEach(dx => { add(new THREE.CylinderGeometry(.09, .07, .85, 12), pants, dx, .08, .45, Math.PI / 2); add(new THREE.BoxGeometry(.1, .16, .09), skin, dx, .12, .9); }); add(new THREE.BoxGeometry(.86, .13, .98), mat('#CFE3F6', { roughness: .95 }), 0, .1, .52); // 다리·발·이불(허리 아래)
      [-.28, .28].forEach(dx => { add(new THREE.CylinderGeometry(.055, .05, .55, 10), skin, dx, .08, -.2, Math.PI / 2); add(new THREE.SphereGeometry(.06, 10, 8), skin, dx, .08, .1); });
      if (ped) [-.1, .1].forEach(dx => add(new THREE.SphereGeometry(.06, 10, 8), skin, dx, .1, .82));
    }
    g.traverse(o => { if (o.isMesh) o.userData.patient = true; });
    return g;
  }
  function buildProps(meta) {
    const z = CORR_Z - .8; const px = f => 2.5 + (COLS - 3) * f;
    if (floor === 1) { box(3, .95, .8, '#B98A5E', px(.12), .47, z, {}, true); box(3.1, .06, .9, '#EBD8BF', px(.12), .98, z); box(.6, .4, .05, '#1F2937', px(.12) + .6, 1.25, z - .1, { emissive: '#60A5FA', emissiveIntensity: .6 }); for (let k = 0; k < 5; k++) { box(.5, .06, .5, meta.accent, px(.35) + k * .8, .46, z, {}, true); box(.5, .55, .06, meta.accent, px(.35) + k * .8, .74, z + .22); } box(.5, 1.1, .4, '#F3F4F6', px(.7), .55, z, { roughness: .4 }, true); box(.3, .4, .3, '#BFDBFE', px(.7), 1.3, z, { roughness: .1, transparent: true, opacity: .8 }); }
    if (floor === 2) { box(1.8, .1, 1.3, '#60A5FA', px(.15), .05, z); [['#F472B6', px(.3), .34], ['#34D399', px(.33), .27], ['#FBBF24', px(.36), .22]].forEach(([c, x, r]) => { const b = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 14), mat(c, { roughness: .5 })); b.position.set(x, r, z); b.castShadow = true; G.add(b); }); box(1.3, 1.2, .8, '#334155', px(.55), .6, z, {}, true); box(1.1, .08, .6, '#0F172A', px(.55), 1.2, z); box(1.2, 1.0, .5, '#E5E7EB', px(.75), .5, z, { metalness: .2 }, true); [0, 1, 2].forEach(k => [0, 1].forEach(r => { box(.3, .05, .05, '#374151', px(.75) - .35 + k * .35, .35 + r * .35, z - .1); box(.08, .14, .14, '#1F2937', px(.75) - .5 + k * .35, .35 + r * .35, z - .1); box(.08, .14, .14, '#1F2937', px(.75) - .2 + k * .35, .35 + r * .35, z - .1); })); }
    if (floor === 3) { const cols = ['#FCA5A5', '#FDE68A', '#86EFAC', '#93C5FD']; for (let i = 0; i < 8; i++) box(.95, .05, .95, cols[i % 4], px(.08) + i * 1.0, .025, z); box(1.0, .7, .8, '#F9A8D4', px(.5), .35, z, {}, true); const slide = box(.6, .08, 2.4, '#FBBF24', px(.65), .65, z); slide.rotation.x = .5; [['#F472B6', px(.82)], ['#60A5FA', px(.85)]].forEach(([c, x]) => { const b = new THREE.Mesh(new THREE.SphereGeometry(.22, 14, 10), mat(c)); b.position.set(x, 1.8, z); b.userData.balloon = true; G.add(b); }); }
    if (floor === 4) { box(1.0, 1.2, .7, '#E5E7EB', px(.12), .6, z, {}, true); box(.8, .35, .05, '#0F172A', px(.12), 1.4, z - .36, { emissive: '#34D399', emissiveIntensity: .7 }); box(.9, .85, .7, '#CBD5E1', px(.3), .42, z, { metalness: .5, roughness: .35 }, true); const pole = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, 1.7, 8), mat('#64748B')); pole.position.set(px(.48), .85, z); G.add(pole); const lamp = new THREE.Mesh(new THREE.SphereGeometry(.18, 14, 10), mat('#EF4444', { emissive: '#EF4444', emissiveIntensity: 1 })); lamp.position.set(px(.48) + .2, 1.8, z); G.add(lamp); box(.9, 1.0, .7, '#F3F4F6', px(.65), .5, z, {}, true); box(.7, .3, .05, '#1E3A8A', px(.65), 1.1, z - .36, { emissive: '#60A5FA', emissiveIntensity: .5 }); box(1.2, 1.6, .6, '#BFDBFE', px(.85), .8, z, { roughness: .3 }, true); }
    [1.4, COLS - 1.4].forEach(x => { box(.45, .45, .45, '#B45309', x, .22, z); const leaf = new THREE.Mesh(new THREE.SphereGeometry(.4, 14, 12), mat('#4ADE80')); leaf.position.set(x, .8, z); leaf.castShadow = true; G.add(leaf); });
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
    }).catch(e => { running = false; console.error('[Hospital3D] mount 실패', e); window.__h3dError = e && (e.stack || e.message); if (U && U.toast) U.toast('3D 엔진을 불러오지 못했어요: ' + e.message, 'err'); if (opts.onFail) opts.onFail(); });
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
    // 터치 기기용 가상 조이스틱(왼쪽: 이동) + 입장 버튼(오른쪽). 화면 드래그는 시점 회전. CSS 에서 pointer:coarse 일 때만 표시
    const joy = document.createElement('div'); joy.className = 'fp-joy'; const knob = document.createElement('div'); knob.className = 'fp-knob'; joy.append(knob); wrap.append(joy);
    let jid = null; const JR = 44;
    const setFrom = e => { const rc = joy.getBoundingClientRect(); let dx = e.clientX - (rc.left + rc.width / 2), dy = e.clientY - (rc.top + rc.height / 2); const d = Math.hypot(dx, dy); if (d > JR) { dx = dx / d * JR; dy = dy / d * JR; } knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)'; P.axis = { x: dx / JR, y: dy / JR }; };
    const jend = e => { if (jid == null || (e && e.pointerId !== jid)) return; jid = null; P.axis = null; knob.style.transform = ''; joy.classList.remove('on'); };
    joy.addEventListener('pointerdown', e => { if (!enabled()) return; jid = e.pointerId; try { joy.setPointerCapture(jid); } catch (x) { } joy.classList.add('on'); setFrom(e); P.wps = []; P.arrive = null; e.preventDefault(); e.stopPropagation(); });
    joy.addEventListener('pointermove', e => { if (e.pointerId !== jid) return; setFrom(e); e.preventDefault(); });
    joy.addEventListener('pointerup', jend); joy.addEventListener('pointercancel', jend); joy.addEventListener('lostpointercapture', jend);
    const act = document.createElement('button'); act.className = 'fp-act'; act.type = 'button'; act.textContent = '입장'; act.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); }); act.addEventListener('click', e => { e.preventDefault(); if (enabled()) { P.lastInteract = 0; interact(); } }); wrap.append(act);
    canvas.style.touchAction = 'none'; canvas.addEventListener('pointercancel', onUp);
  }
  function resize() {
    if (!renderer || !canvas || !canvas.parentElement) return; const rect = canvas.parentElement.getBoundingClientRect(); if (!rect.width) return;
    const w = rect.width; const top = rect.top + (window.scrollY || 0); const avail = window.innerHeight - top - 28; const h = Math.max(340, Math.min(Math.round(w * .66), avail > 340 ? avail : 9999)); renderer.setSize(w, h, false); canvas.style.width = w + 'px'; canvas.style.height = h + 'px'; camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  function resetPlayer() { P.x = 3.2; P.z = CORR_Z / 2; P.yaw = Math.PI / 2; P.pitch = 0; P.wps = []; P.arrive = null; P.turnTo = null; }
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
    if (hitObj && hitObj.object.userData.plate != null) { const pi = hitObj.object.userData.plate; if (nearDoor(pi)) { P.lastInteract = 0; openCard(pi); } else { P.wps = routeTo({ x: plateX(pi), z: 1.4 }); P.arrive = { type: 'door', i: pi }; setHint('🚶 명판 쪽으로 이동 중…'); } return; }
    if (hitObj && hitObj.object.userData.room != null) {
      const ri = hitObj.object.userData.room; const r = world.rooms[ri];
      if (curRoom() === ri && Math.hypot(P.x - r.bedCenter.x, P.z - r.bedCenter.z) < 2.8) { P.turnTo = null; P.yaw = Math.atan2(r.focus.x - P.x, -(r.focus.z - P.z)); P.lastInteract = 0; interact(); }
      else goToRoom(ri);
      return;
    }
    const hit = rc.r.intersectObject(world.ground)[0]; if (!hit) return; const x = hit.point.x, z = hit.point.z;
    if (z < 0) { if (x < 2.6) { goToElevator(); return; } const ri = ROOM_COLS.findIndex(([a, b]) => x >= a && x <= b); if (ri >= 0) { goToRoom(ri); return; } }
    if (z >= 0 && z <= CORR_Z && x > 0 && x < COLS) { P.wps = routeTo({ x: Math.min(COLS - .5, Math.max(.5, x)), z: Math.min(CORR_Z - .4, Math.max(.4, z)) }); P.arrive = null; }
  }
  const curRoom = () => P.z < 0 ? ROOM_COLS.findIndex(([a, b]) => P.x >= a && P.x <= b) : -1;
  function routeTo(pt, viaRoom) { // 현재 위치 → (병실이면 문으로 나와서) 복도 → 목표
    const wps = []; const cr = curRoom();
    if (cr >= 0) wps.push({ x: DOOR_X[cr], z: -.7 }, { x: DOOR_X[cr], z: .9 });
    if (viaRoom != null) { wps.push({ x: DOOR_X[viaRoom], z: .9 }, { x: DOOR_X[viaRoom], z: -.7 }); }
    wps.push(pt); return wps;
  }
  function goToRoom(i) { const r = world.rooms[i]; if (!r) return; const info = (opts.getRoom && opts.getRoom(i)) || {}; if (info.status === 'empty') { if (U && U.toast) U.toast('빈 병실입니다.', 'info'); return; } P.wps = curRoom() === i ? [r.stand] : routeTo(r.stand, i); P.arrive = { type: 'room', i }; setHint('🚶 ' + (info.label || '병실') + ' 침대로 이동 중…'); }
  function goToElevator() { P.wps = routeTo({ x: 1.25, z: 1.0 }); P.arrive = { type: 'elev' }; setHint('🚶 엘리베이터로 이동 중…'); }
  const plateX = i => (world.rooms[i] && world.rooms[i].plateX != null) ? world.rooms[i].plateX : DOOR_X[i];
  const nearDoor = i => P.z >= -0.5 && Math.hypot(P.x - plateX(i), P.z - .4) < 2.4;
  function interactable() {
    const cr = curRoom();
    if (cr >= 0) { const r = world.rooms[cr]; const d = Math.hypot(P.x - r.bedCenter.x, P.z - r.bedCenter.z); if (d < 2.4 && facing(r.bedCenter.x, r.bedCenter.z, .3)) return { type: 'room', i: cr }; }
    else if (P.x < 3.0 && P.z < 1.8 && facing(1.25, -.3, .5)) return { type: 'elev' };
    else { for (let i = 0; i < DOOR_X.length; i++) if (nearDoor(i) && facing(plateX(i), -.3, .1)) return { type: 'door', i }; }
    return null;
  }
  function openCard(i) { if (opts.onDoor) opts.onDoor(i); }
  function facing(x, z, min) { const fx = Math.sin(P.yaw), fz = -Math.cos(P.yaw); const dx = x - P.x, dz = z - P.z; const l = Math.hypot(dx, dz) || 1; return (fx * dx + fz * dz) / l > min; }
  function interact() {
    if (!enabled() || performance.now() - P.lastInteract < 600) return; const it = interactable(); if (!it) { setHint('침대 가까이에서 환자를 바라보고 Enter 를 누르세요.', 1800); return; }
    P.lastInteract = performance.now(); P.wps = []; P.arrive = null;
    if (it.type === 'room') { const info = (opts.getRoom && opts.getRoom(it.i)) || {}; if (info.status === 'done') { if (U && U.toast) U.toast('이미 치료를 마친 환자입니다.', 'info'); return; } if (opts.onEnterRoom) opts.onEnterRoom(it.i); }
    else if (it.type === 'door') openCard(it.i);
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
      if (P.axis) { f += -P.axis.y; s += P.axis.x; } // 가상 조이스틱
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
    if (!P.wps.length && !P.turnTo) { const it = interactable(); if (it) setHint(it.type === 'room' ? '👆 환자를 클릭(또는 Enter) : 평가 시작' : it.type === 'door' ? '🚪 명판 클릭(또는 Enter) : 환자 정보 보기' : '🛗 Enter(또는 탭) : 층 이동'); else if (hint && hint.classList.contains('show') && (hint.textContent.startsWith('👆') || hint.textContent.startsWith('🛗') || hint.textContent.startsWith('🚪'))) setHint(''); }
  }
  function arrived() {
    const a = P.arrive; P.arrive = null; if (!a) { setHint(''); return; }
    if (a.type === 'room') { const r = world.rooms[a.i]; const f = r.focus || r.bedCenter; const yaw = Math.atan2(f.x - P.x, -(f.z - P.z)); P.turnTo = { yaw, pitch: r.pose === 'sitting' ? -.12 : -.3, after: () => setHint('👆 침대의 환자를 클릭하면 평가를 시작합니다') }; }
    else if (a.type === 'door') { const yaw = Math.atan2(plateX(a.i) - P.x, -(-.3 - P.z)); P.turnTo = { yaw, pitch: 0, after: () => { setHint(''); openCard(a.i); } }; }
    else if (a.type === 'elev') { P.turnTo = { yaw: Math.atan2(1.25 - P.x, -(-.3 - P.z)), pitch: 0, after: () => { setHint(''); setTimeout(() => { if (enabled()) { P.lastInteract = 0; interact(); } }, 250); } }; }
  }
  const angDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
  const lerpAngle = (a, b, t) => a + angDiff(a, b) * t;

  // ---------- 렌더 ----------
  function tick(ts) { const dt = Math.min(.1, Math.max(0, (ts - lastTs) / 1000)); lastTs = ts; update(dt); render(ts, dt); }
  function loop(ts) { if (!running) return; tick(ts); raf = requestAnimationFrame(loop); }
  function render(ts, dt) {
    if (!built || !renderer) return;
    const infos = world.rooms.map(r => (opts.getRoom && opts.getRoom(r.i)) || {}); const key = infos.map(x => (x.label || '-') + ':' + x.status).join('|') + '#' + floor;
    if (key !== world.labelKey) {
      world.labelKey = key; const meta = META()[floor] || META()[1];
      world.rooms.forEach((room, i) => {
        const info = infos[i]; const done = info.status === 'done', empty = info.status === 'empty';
        const nxt = !!info.next && !done && !empty;
        const m = /^(.*?)\s*\((.*)\)$/.exec(info.label || ''); const nm = m ? m[1] : (info.label || ''); const as = m ? m[2].replace(',', ' ·') : '';
        room.label.material.map.dispose(); room.label.material.map = plateTexture(floor, i, { name: empty ? '—' : nm, ageSex: as, state: done ? '치료 완료 ✓' : empty ? '빈 병실' : nxt ? '▶ 지금 과제' : '순서 대기', stateColor: done ? '#15803D' : nxt ? '#B45309' : '#6B7280' }, meta); room.label.material.needsUpdate = true;
        room.chart.material.map.dispose(); room.chart.material.map = textTexture([{ text: info.label || '' }, { text: done ? '치료 완료' : nxt ? '평가 대기 · 환자를 클릭' : '순서 대기', color: done ? '#15803D' : '#B45309' }], { bg: 'rgba(255,255,255,.92)' }); room.chart.material.needsUpdate = true;
        if (room.blanket) room.blanket.material.color.set(done ? '#BBF7D0' : (info.pediatric ? '#FFF1C9' : '#FFFFFF')); room.lamp.visible = !done && !empty; room.patient.visible = !empty && !room.glb; if (room.glb) room.glb.visible = !empty; room.chart.visible = !empty; if (room.marker) room.marker.visible = nxt; room.label.material.emissive = new THREE.Color(nxt ? '#8B5CF6' : '#000000'); room.label.material.emissiveIntensity = nxt ? .18 : 0;
        // 환부 고리 위치
        const cs = Session && Session.state && Session.state.rooms[floor] && Session.state.rooms[floor][i]; const reg = cs && cs.case && cs.case.patient && cs.case.patient.region;
        if (reg && !empty && room.pose !== 'sitting' && window.Patient) { const pt = Patient.point(reg, cs.case.patient.posture || 'supine', info.pediatric ? .74 : 1); const z = -3.72 + (pt.x - 60) / 256 * 1.67; const x = -(pt.y - 100) / 44 * .36; room.ring.position.set(room.bedCenter.x + x, (room.topY || .6) + .18, Math.max(room.bedCenter.z - .95, Math.min(room.bedCenter.z + .95, z + (room.bedCenter.z + 3.0)))); room.ring.visible = !done; } else room.ring.visible = false;
      });
    }
    world.rooms.forEach(room => { if (room.lamp.visible) room.lamp.material.emissiveIntensity = Math.floor(ts / 600) % 2 ? 1 : .15; if (room.ring.visible) { const s = 1 + Math.sin(ts / 250) * .25; room.ring.scale.set(s, s, 1); } });
    G.traverse(o => { if (o.userData.balloon) o.position.y = 1.8 + Math.sin(ts / 600 + o.position.x) * .08; });
    world.rooms.forEach(room => { if (room.marker && room.marker.visible) room.marker.position.y = 2.6 + Math.sin(ts / 350) * .12; });
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
      if (world.mixer && world.anim) { // 애니메이션 클립 기반 걷기/서기
        const A = world.anim; const want = moving ? (A.walk || A.idle) : (A.idle || A.walk);
        if (want && A.cur !== want) { if (A.cur) A.cur.fadeOut(.25); want.reset().fadeIn(.25).play(); A.cur = want; }
        if (want && want === A.walk && !A.idle) want.paused = !moving; // 서기 클립이 없으면 걷기 클립을 멈춰 세움
        world.mixer.update(dt || .016);
        // 클립이 뼈대를 돌려놓는 경우를 대비해, 애니메이션이 한 번 적용된 뒤 어깨선으로 실제 정면을 확인하고 뒤집혀 있으면 180° 돌림
        if (!A.checked && A.cur && A.cur.time > .05 && world.bones && world.bones.lArm && world.bones.rArm && world.glbModel) {
          A.checked = true; const l = new THREE.Vector3(), r = new THREE.Vector3(); world.bones.lArm.getWorldPosition(l); world.bones.rArm.getWorldPosition(r);
          const fwdB = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), r.sub(l)); const fwdA = new THREE.Vector3(Math.sin(P.yaw), 0, -Math.cos(P.yaw));
          if (fwdB.lengthSq() > 1e-6 && fwdB.dot(fwdA) < 0) world.glbModel.rotation.y += Math.PI;
        }
      } else if (world.bones) { const b = world.bones; swing(b.lUp, sw * .5); swing(b.rUp, -sw * .5); swing(b.lArm, -sw * .4); swing(b.rArm, sw * .4); }
    }
    // 어깨너머 카메라(벽 뒤로 빠지지 않도록 거리 조절)
    const fx0 = Math.sin(P.yaw), fz0 = -Math.cos(P.yaw); const rx0 = -fz0, rz0 = fx0; const inRoom = P.z < -.2; const DIST = inRoom ? 2.1 : 3.9, SIDE = inRoom ? .85 : .8; const camH = Math.max(1.4, Math.min(2.8, (inRoom ? 2.7 : 2.25) - P.pitch * 1.6)); // 치료실 안에서는 높은 어깨너머 시점으로 침대가 보이게
    const head = new THREE.Vector3(P.x, 1.5, P.z); const want = new THREE.Vector3(P.x - fx0 * DIST + rx0 * SIDE, camH, P.z - fz0 * DIST + rz0 * SIDE);
    let dist = DIST; if (world.walls.length) { const cr2 = world.camRc || (world.camRc = new THREE.Raycaster()); const dirv = want.clone().sub(head); const len = dirv.length(); dirv.normalize(); cr2.set(head, dirv); cr2.far = len; const hit = cr2.intersectObjects(world.walls, false)[0]; if (hit) dist = Math.max(.7, hit.distance - .25); }
    const t = dist / DIST; let wantPos = new THREE.Vector3(head.x + (want.x - head.x) * t, head.y + (want.y - head.y) * t, head.z + (want.z - head.z) * t);
    if (inRoom) wantPos.z = Math.min(wantPos.z, -.45); // 카메라가 문 밖(복도)으로 빠져 벽 너머를 보지 않도록
    const tSide = inRoom ? .7 : 1.05; let wantTgt = new THREE.Vector3(P.x + fx0 * 1.8 + rx0 * tSide, (inRoom ? .95 : 1.25) + P.pitch * 1.4, P.z + fz0 * 1.8 + rz0 * tSide);
    // 평가·중재 중: 침대 옆 클로즈업(차트 패널이 열려 있는 동안)
    if (P.focus != null && world.rooms[P.focus]) {
      const r = world.rooms[P.focus]; const b = r.bedCenter;
      if (r.pose === 'sitting') { wantPos = new THREE.Vector3(b.x + 1.75, 1.6, b.z + 1.2); wantTgt = new THREE.Vector3(b.x + .36, 1.05, b.z + .1); } else { wantPos = new THREE.Vector3(b.x - 1.4, 1.85, b.z + .15); wantTgt = new THREE.Vector3(b.x + .05, .8, b.z - .4); } // 머리맡 옆에서 얼굴이 보이게
      // 차트 패널이 오른쪽을 덮으므로 환자가 화면 왼쪽에 오도록 시선을 오른쪽으로 옮김
      const dirF = wantTgt.clone().sub(wantPos).normalize(); const right = new THREE.Vector3().crossVectors(dirF, new THREE.Vector3(0, 1, 0)).normalize(); const wide = (canvas && canvas.clientWidth > 760) ? .75 : .15; wantTgt.add(right.multiplyScalar(wide));
      if (world.walls.length) { const cr3 = world.camRc2 || (world.camRc2 = new THREE.Raycaster()); const dv = wantPos.clone().sub(wantTgt); const L = dv.length(); dv.normalize(); cr3.set(wantTgt, dv); cr3.far = L; const hit = cr3.intersectObjects(world.walls, false)[0]; if (hit) wantPos.copy(wantTgt).addScaledVector(dv, Math.max(.7, hit.distance - .2)); } // 클로즈업 카메라도 벽·파티션·커튼 안쪽에 머물게
      if (world.avatar) world.avatar.visible = false;
    }
    else if (world.avatar) world.avatar.visible = wantPos.distanceTo(head) > 1.3;
    if (world.nameTag) world.nameTag.visible = !inRoom && P.focus == null; // 치료실 안에서는 이름표가 시야를 가리므로 숨김 // 벽에 막혀 카메라가 바짝 붙으면 아바타가 시야를 가리므로 숨김
    if (!camState.pos) { camState.pos = wantPos.clone(); camState.tgt = wantTgt.clone(); }
    const k = Math.min(1, (lastTs ? 0.016 : 0.016) * 5); camState.pos.lerp(wantPos, P.focus != null ? .08 : .35); camState.tgt.lerp(wantTgt, P.focus != null ? .08 : .35);
    camera.position.copy(camState.pos); camera.lookAt(camState.tgt);
    renderer.render(scene, camera);
  }
  function setFloor(f) { floor = f; P.focus = null; if (built) { buildFloor(); resetPlayer(); setHint(`${f}F 에 도착했습니다. 병실을 클릭하거나 걸어가세요.`, 2500); } }
  function focus(i) { P.focus = (i == null) ? null : i; if (i != null) setHint(''); }
  function snapshot() { try { if (renderer && scene && camera) renderer.render(scene, camera); return canvas.toDataURL('image/png'); } catch (e) { return null; } }
  return { mount, destroy, setFloor, move, resize, setPlayer, focus, snapshot, goToRoom, FLOOR_META, get floor() { return floor; }, get pos() { return { x: P.x, z: P.z, yaw: P.yaw, room: curRoom(), wps: P.wps.length }; }, _debug: () => ({ camera, world, P, click, goToRoom, interact, opts, patientGlbUrl }) };
})();