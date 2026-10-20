// 침대에 누운 환자 일러스트(SVG): 성별·연령·소아·자세 반영, 부위 하이라이트 + 장비 적용 표시
window.Patient = (() => {
  const LABELS = { head: '머리', neck: '목', shoulder_L: '왼쪽 어깨', shoulder_R: '오른쪽 어깨', elbow_L: '왼쪽 팔꿈치', elbow_R: '오른쪽 팔꿈치', wrist_L: '왼쪽 손목', wrist_R: '오른쪽 손목', hand_L: '왼손', hand_R: '오른손', chest: '가슴', lowback: '허리', hip_L: '왼쪽 엉덩관절', hip_R: '오른쪽 엉덩관절', knee_L: '왼쪽 무릎', knee_R: '오른쪽 무릎', calf_L: '왼쪽 종아리', calf_R: '오른쪽 종아리', ankle_L: '왼쪽 발목', ankle_R: '오른쪽 발목', foot_L: '왼발', foot_R: '오른발', legs: '양쪽 다리', whole: '전신' };
  // 위에서 내려다본 모습, 머리가 왼쪽. 바로누운자세에서는 환자의 오른쪽이 화면 아래쪽.
  const C = { x: 180, y: 100 };
  const AX = { head: 60, neck: 88, shoulder: 106, chest: 128, lowback: 160, hip: 192, knee: 248, calf: 272, ankle: 298, foot: 316, elbow: 152, wrist: 196, hand: 214, legs: 264, whole: 180 };
  const OFF = { shoulder: 30, elbow: 42, wrist: 44, hand: 44, hip: 16, knee: 15, calf: 14, ankle: 13, foot: 13 };
  function point(region, posture, k = 1) {
    const [base, side] = String(region || 'whole').split('_');
    let x = AX[base] != null ? AX[base] : 180, y = 100;
    if (side) { const sign = side === 'R' ? 1 : -1; const flip = posture === 'prone' ? -1 : 1; y = 100 + sign * flip * (OFF[base] || 14); }
    return { x: C.x + (x - C.x) * k, y: C.y + (y - C.y) * k };
  }
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function bodySVG(patient, posture, ped) {
    const female = patient.sex === '여'; const age = Number(patient.age) || 30; const elderly = !ped && age >= 60;
    const hair = ped ? '#5B3A29' : elderly ? '#A7ADB5' : female ? '#3B2418' : '#2B1B12';
    const gown = ped ? 'url(#pt-gown-kid)' : 'url(#pt-gown)'; const gownLine = ped ? '#E9B94E' : '#9FCDB3';
    const skin = 'url(#pt-skin)', skinDark = '#E2B08E';
    const hx = 60, hr = ped ? 27 : 22, hry = hr + 2; const f = hr / 22; // 얼굴 비율
    let s = '';
    // 그림자
    s += `<ellipse cx="190" cy="106" rx="140" ry="40" fill="rgba(30,50,70,.10)" filter="url(#pt-blur)"/>`;
    // 머리카락(뒤)
    if (posture !== 'prone') {
      if (female) s += `<ellipse cx="${hx - 6}" cy="100" rx="${hr + 12}" ry="${hry + 16}" fill="${hair}"/><path d="M${hx - 26} 70 Q${hx - 38} 100 ${hx - 26} 130" stroke="${hair}" stroke-width="10" stroke-linecap="round" fill="none"/>`;
      else s += `<ellipse cx="${hx - 5}" cy="100" rx="${hr + 4}" ry="${hry + 3}" fill="${hair}"/>`;
    }
    // 다리 + 발
    s += `<path d="M194 84 L248 85 L300 87" stroke="${skin}" stroke-width="21" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`;
    s += `<path d="M194 116 L248 115 L300 113" stroke="${skin}" stroke-width="21" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`;
    s += `<ellipse cx="316" cy="87" rx="13" ry="9" fill="${skin}"/><ellipse cx="316" cy="113" rx="13" ry="9" fill="${skin}"/>`;
    s += `<path d="M323 82 l3 1 M325 86 l3 0 M323 92 l3 -1 M323 108 l3 1 M325 114 l3 0 M323 118 l3 -1" stroke="${skinDark}" stroke-width="1.2" stroke-linecap="round"/>`;
    s += `<circle cx="248" cy="85" r="7" fill="rgba(0,0,0,.05)"/><circle cx="248" cy="115" r="7" fill="rgba(0,0,0,.05)"/>`;
    // 반바지
    s += `<path d="M184 74 L222 76 L222 124 L184 126 Z" fill="url(#pt-shorts)"/><path d="M203 76 L203 124" stroke="rgba(255,255,255,.25)" stroke-width="2"/>`;
    // 몸통(환자복)
    s += `<path d="M96 64 Q142 72 168 78 L190 78 L190 122 L168 122 Q142 128 96 136 Z" fill="${gown}" stroke="${gownLine}" stroke-width="1.2"/>`;
    if (posture === 'prone') s += `<path d="M124 80 L124 120 M152 80 L152 120" stroke="${gownLine}" stroke-width="1.5" stroke-dasharray="3 3"/><circle cx="124" cy="80" r="3" fill="${gownLine}"/><circle cx="152" cy="80" r="3" fill="${gownLine}"/>`;
    else s += `<path d="M96 86 L114 100 L96 114 Z" fill="${skin}"/><path d="M96 86 L114 100 L96 114" stroke="${gownLine}" stroke-width="1.2" fill="none"/>`;
    if (ped) s += `<circle cx="130" cy="92" r="2.5" fill="#F4A6B8"/><circle cx="150" cy="108" r="2.5" fill="#F4A6B8"/><circle cx="140" cy="118" r="2" fill="#F4A6B8"/>`;
    // 팔 + 손
    s += `<path d="M104 72 L152 60 L198 57" stroke="${skin}" stroke-width="15" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`;
    s += `<path d="M104 128 L152 140 L198 143" stroke="${skin}" stroke-width="15" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`;
    s += `<ellipse cx="214" cy="57" rx="12" ry="8" fill="${skin}"/><circle cx="209" cy="50" r="4" fill="${skin}"/><ellipse cx="214" cy="143" rx="12" ry="8" fill="${skin}"/><circle cx="209" cy="150" r="4" fill="${skin}"/>`;
    s += `<path d="M219 52 l6 -2 M221 56 l6 -1 M221 60 l6 1 M219 148 l6 2 M221 144 l6 1 M221 140 l6 -1" stroke="${skinDark}" stroke-width="1.1" stroke-linecap="round"/>`;
    // 소매
    s += `<ellipse cx="106" cy="70" rx="15" ry="12" fill="${gown}" stroke="${gownLine}" stroke-width="1.2"/><ellipse cx="106" cy="130" rx="15" ry="12" fill="${gown}" stroke="${gownLine}" stroke-width="1.2"/>`;
    // 목 + 머리
    s += `<rect x="78" y="90" width="22" height="20" rx="9" fill="${skinDark}"/>`;
    s += `<ellipse cx="${hx}" cy="100" rx="${hr}" ry="${hry}" fill="${skin}"/>`;
    s += `<ellipse cx="${hx}" cy="${100 - hry + 1}" rx="5" ry="4" fill="${skinDark}"/><ellipse cx="${hx}" cy="${100 + hry - 1}" rx="5" ry="4" fill="${skinDark}"/>`;
    if (posture === 'prone') {
      s += `<ellipse cx="${hx}" cy="100" rx="${hr}" ry="${hry}" fill="${hair}"/><path d="M${hx - hr + 4} 100 Q${hx} 96 ${hx + hr - 4} 100" stroke="rgba(0,0,0,.25)" stroke-width="1.2" fill="none"/>`;
      if (female) s += `<path d="M${hx + hr - 6} 96 Q${hx + hr + 20} 92 ${hx + hr + 26} 110" stroke="${hair}" stroke-width="9" stroke-linecap="round" fill="none"/>`;
    } else {
      // 이마 쪽 머리(앞머리)
      s += female
        ? `<path d="M${hx - hr} 100 Q${hx - hr + 2} ${100 - hry} ${hx - 2} ${100 - hry + 2} Q${hx - hr + 14} ${100 - hry + 10} ${hx - hr + 8} 100 Q${hx - hr + 14} ${100 + hry - 10} ${hx - 2} ${100 + hry - 2} Q${hx - hr + 2} ${100 + hry} ${hx - hr} 100 Z" fill="${hair}"/>`
        : `<path d="M${hx - hr} 100 Q${hx - hr} ${100 - hry} ${hx + 4} ${100 - hry + 1} Q${hx - hr + 10} ${100 - hry + 8} ${hx - hr + 6} 100 Q${hx - hr + 10} ${100 + hry - 8} ${hx + 4} ${100 + hry - 1} Q${hx - hr} ${100 + hry} ${hx - hr} 100 Z" fill="${hair}"/>`;
      // 눈썹·눈·코·입·볼
      const ex = hx - 3 * f, ey1 = 100 - 9 * f, ey2 = 100 + 9 * f;
      s += `<path d="M${ex - 6 * f} ${ey1 - 4 * f} q2 ${-3 * f} ${5 * f} ${-1 * f}" stroke="${hair}" stroke-width="1.6" stroke-linecap="round" fill="none"/><path d="M${ex - 6 * f} ${ey2 + 4 * f} q2 ${3 * f} ${5 * f} ${1 * f}" stroke="${hair}" stroke-width="1.6" stroke-linecap="round" fill="none"/>`;
      s += `<ellipse cx="${ex}" cy="${ey1}" rx="${2.6 * f}" ry="${3.6 * f}" fill="#2A2A2A"/><ellipse cx="${ex}" cy="${ey2}" rx="${2.6 * f}" ry="${3.6 * f}" fill="#2A2A2A"/><circle cx="${ex + 1}" cy="${ey1 - 1}" r="1" fill="#fff"/><circle cx="${ex + 1}" cy="${ey2 - 1}" r="1" fill="#fff"/>`;
      s += `<path d="M${hx + 4 * f} ${100 - 3 * f} q${3 * f} ${3 * f} 0 ${6 * f}" stroke="${skinDark}" stroke-width="1.4" stroke-linecap="round" fill="none"/>`;
      s += `<path d="M${hx + 12 * f} ${100 - 4 * f} q${3.5 * f} ${4 * f} 0 ${8 * f}" stroke="#B4655A" stroke-width="1.6" stroke-linecap="round" fill="none"/>`;
      s += `<ellipse cx="${hx + 3 * f}" cy="${100 - 15 * f}" rx="${4 * f}" ry="${2.6 * f}" fill="rgba(240,120,120,.28)"/><ellipse cx="${hx + 3 * f}" cy="${100 + 15 * f}" rx="${4 * f}" ry="${2.6 * f}" fill="rgba(240,120,120,.28)"/>`;
      if (elderly) s += `<ellipse cx="${ex}" cy="${ey1}" rx="${6 * f}" ry="${6.5 * f}" fill="none" stroke="#4B5563" stroke-width="1.3"/><ellipse cx="${ex}" cy="${ey2}" rx="${6 * f}" ry="${6.5 * f}" fill="none" stroke="#4B5563" stroke-width="1.3"/><path d="M${ex} ${ey1 + 6.5 * f} L${ex} ${ey2 - 6.5 * f}" stroke="#4B5563" stroke-width="1.3"/>`;
      if (ped) s += `<circle cx="${hx - 2}" cy="${100 - hry - 2}" r="3" fill="${hair}"/>`;
    }
    return s;
  }

  function render(container, patient, opts = {}) {
    const posture = patient.posture || 'supine'; const ped = !!patient.pediatric; const k = ped ? 0.74 : 1;
    const rightBottom = posture !== 'prone';
    const caption = `${posture === 'prone' ? '엎드린자세' : '바로누운자세'}${ped ? ' · 소아' : ''}${patient.region ? ' · 주 문제 부위: ' + (LABELS[patient.region] || patient.region) : ''}`;
    container.innerHTML = `
<svg viewBox="0 0 360 204" class="patient-svg" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="침대에 누운 환자">
  <defs>
    <filter id="pt-sh" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#1E3A5F" flood-opacity=".18"/></filter>
    <filter id="pt-blur"><feGaussianBlur stdDeviation="4"/></filter>
    <radialGradient id="pt-skin" cx="40%" cy="40%" r="80%"><stop offset="0" stop-color="#FBE3CF"/><stop offset="1" stop-color="#EFC19E"/></radialGradient>
    <linearGradient id="pt-gown" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#EAF6EF"/><stop offset="1" stop-color="#C6E5D3"/></linearGradient>
    <linearGradient id="pt-gown-kid" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF0C9"/><stop offset="1" stop-color="#FFD98A"/></linearGradient>
    <linearGradient id="pt-shorts" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6B7B94"/><stop offset="1" stop-color="#4E5B70"/></linearGradient>
    <linearGradient id="pt-mat" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#EEF2F7"/></linearGradient>
    <linearGradient id="pt-pillow" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#E3E9F1"/></linearGradient>
    <linearGradient id="pt-rail" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#D6DEE8"/><stop offset="1" stop-color="#A9B6C6"/></linearGradient>
  </defs>
  <rect x="14" y="20" width="332" height="160" rx="20" fill="#D9E1EA" filter="url(#pt-sh)"/>
  <rect x="14" y="30" width="16" height="140" rx="7" fill="#AFBBCB"/>
  <rect x="30" y="30" width="308" height="140" rx="12" fill="url(#pt-mat)"/>
  <path d="M30 100 L338 100" stroke="rgba(120,140,165,.12)" stroke-width="1"/>
  <rect x="70" y="16" width="210" height="9" rx="4.5" fill="url(#pt-rail)"/><rect x="70" y="175" width="210" height="9" rx="4.5" fill="url(#pt-rail)"/>
  <rect x="${ped ? 40 : 34}" y="${ped ? 64 : 58}" width="${ped ? 50 : 60}" height="${ped ? 72 : 84}" rx="16" fill="url(#pt-pillow)" stroke="#D6DEE8"/>
  ${ped ? `<text x="306" y="60" font-size="18">🧸</text>` : ''}
  <g transform="translate(${C.x} ${C.y}) scale(${k}) translate(${-C.x} ${-C.y})">${bodySVG(patient, posture, ped)}</g>
  <g font-size="9" font-weight="700">
    <rect x="300" y="${rightBottom ? 160 : 36}" width="44" height="14" rx="7" fill="rgba(255,255,255,.85)" stroke="#CBD5E1"/><text x="322" y="${rightBottom ? 170 : 46}" fill="#475569" text-anchor="middle">오른쪽 R</text>
    <rect x="300" y="${rightBottom ? 36 : 160}" width="44" height="14" rx="7" fill="rgba(255,255,255,.85)" stroke="#CBD5E1"/><text x="322" y="${rightBottom ? 46 : 170}" fill="#475569" text-anchor="middle">왼쪽 L</text>
  </g>
  <text x="18" y="197" font-size="10" fill="#66736C">${esc(caption)}</text>
  <g class="hl"></g><g class="eq"></g>
</svg>`;
    const svg = container.querySelector('svg'); const hl = svg.querySelector('.hl'); const eq = svg.querySelector('.eq');
    const clampX = (x, w) => Math.min(350 - w / 2, Math.max(10 + w / 2, x));
    const api = {
      highlight(region) {
        hl.innerHTML = ''; if (!region) return;
        const p = point(region, posture, k); const big = region === 'whole' || region === 'legs';
        const r0 = big ? 28 : 11, r1 = big ? 38 : 19; const label = LABELS[region] || region; const w = label.length * 10 + 18; const lx = clampX(p.x, w);
        const d = p.y > 100 ? 1 : -1; const ly = Math.min(172, Math.max(30, p.y + d * (big ? 48 : 32))); const above = d < 0;
        hl.innerHTML = `<circle cx="${p.x}" cy="${p.y}" r="${big ? 34 : 16}" fill="rgba(220,38,38,.14)"><animate attributeName="r" values="${r0 + 4};${r1 + 6};${r0 + 4}" dur="1.6s" repeatCount="indefinite"/></circle>
<circle cx="${p.x}" cy="${p.y}" r="${big ? 30 : 13}" fill="none" stroke="#DC2626" stroke-width="2.5" opacity=".9"><animate attributeName="r" values="${r0};${r1};${r0}" dur="1.6s" repeatCount="indefinite"/><animate attributeName="opacity" values=".9;.25;.9" dur="1.6s" repeatCount="indefinite"/></circle>
<circle cx="${p.x}" cy="${p.y}" r="4" fill="#DC2626"/>
<line x1="${p.x}" y1="${p.y}" x2="${lx}" y2="${ly + (above ? 10 : -10)}" stroke="#DC2626" stroke-width="1.2" stroke-dasharray="2 2"/>
<rect x="${lx - w / 2}" y="${ly - 10}" width="${w}" height="20" rx="10" fill="#fff" stroke="#DC2626" stroke-width="1.2"/><text x="${lx}" y="${ly + 3.5}" text-anchor="middle" font-size="10" font-weight="700" fill="#B91C1C">${esc(label)}</text>`;
      },
      place(emoji, label, ok = true) {
        const p = point(patient.region || 'whole', posture, k); const big = patient.region === 'whole' || patient.region === 'legs'; const d = p.y > 100 ? 1 : -1; const by = Math.min(150, Math.max(60, p.y + d * (big ? 48 : 32))); const bx = Math.min(300, Math.max(60, p.x + 52));
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g'); g.setAttribute('class', 'placed ' + (ok ? 'ok' : 'bad'));
        const col = ok ? '#16A34A' : '#DC2626', bg = ok ? '#DCFCE7' : '#FEE2E2';
        g.innerHTML = `<line x1="${p.x}" y1="${p.y}" x2="${bx}" y2="${by}" stroke="${col}" stroke-width="1.5"/><circle cx="${bx}" cy="${by}" r="17" fill="${bg}" stroke="${col}" stroke-width="2"/><text x="${bx}" y="${by + 6}" font-size="17" text-anchor="middle">${esc(emoji)}</text>${label ? `<text x="${bx + 21}" y="${by + 3.5}" font-size="9.5" font-weight="700" text-anchor="start" fill="${col}">${esc(label)}</text>` : ''}`;
        eq.append(g);
      },
      clearEquipment() { eq.innerHTML = ''; }
    };
    if (opts.highlight !== false) api.highlight(patient.region);
    return api;
  }
  return { render, point, label: r => LABELS[r] || r, LABELS };
})();