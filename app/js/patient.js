// 침대에 누운 환자 SVG (부위 하이라이트 + 장비 적용 표시)
window.Patient = (() => {
  const LABELS = { head: '머리', neck: '목', shoulder_L: '왼쪽 어깨', shoulder_R: '오른쪽 어깨', elbow_L: '왼쪽 팔꿈치', elbow_R: '오른쪽 팔꿈치', wrist_L: '왼쪽 손목', wrist_R: '오른쪽 손목', hand_L: '왼손', hand_R: '오른손', chest: '가슴', lowback: '허리', hip_L: '왼쪽 엉덩관절', hip_R: '오른쪽 엉덩관절', knee_L: '왼쪽 무릎', knee_R: '오른쪽 무릎', calf_L: '왼쪽 종아리', calf_R: '오른쪽 종아리', ankle_L: '왼쪽 발목', ankle_R: '오른쪽 발목', foot_L: '왼발', foot_R: '오른발', legs: '양쪽 다리', whole: '전신' };
  // 머리가 왼쪽, 위에서 내려다본 모습. 바로누운자세에서는 환자의 오른쪽이 화면 아래쪽.
  const AX = { head: 55, neck: 76, shoulder: 90, chest: 110, lowback: 140, hip: 170, knee: 220, calf: 244, ankle: 268, foot: 286, elbow: 130, wrist: 166, hand: 180, legs: 240, whole: 160 };
  const OFF = { shoulder: 22, elbow: 32, wrist: 36, hand: 38, hip: 11, knee: 13, calf: 13, ankle: 13, foot: 13 };
  function point(region, posture) {
    const [base, side] = String(region || 'whole').split('_');
    const x = AX[base] != null ? AX[base] : 160; let y = 80;
    if (side) { const sign = side === 'R' ? 1 : -1; const flip = posture === 'prone' ? -1 : 1; y = 80 + sign * flip * (OFF[base] || 14); }
    return { x, y };
  }
  function render(container, patient, opts = {}) {
    const posture = patient.posture || 'supine'; const ped = !!patient.pediatric; const k = ped ? 0.68 : 1; const cx = 160, cy = 80;
    const skin = '#f6d3b5', cloth = ped ? '#ffd6e7' : '#cfe3ff', hair = '#3b2a20';
    const rightBottom = posture !== 'prone';
    const face = posture === 'prone'
      ? `<circle cx="55" cy="80" r="19" fill="${hair}"/><ellipse cx="55" cy="80" rx="19" ry="12" fill="${hair}"/>`
      : `<path d="M36 74 Q55 50 74 74 Q65 63 55 63 Q45 63 36 74Z" fill="${hair}"/><circle cx="49" cy="80" r="1.8" fill="#333"/><circle cx="61" cy="80" r="1.8" fill="#333"/><path d="M50 88 Q55 91 60 88" stroke="#b96b5a" stroke-width="1.5" fill="none"/>`;
    container.innerHTML = `
<svg viewBox="0 0 320 172" class="patient-svg" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="침대에 누운 환자">
  <defs><filter id="pt-sh" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity=".15"/></filter></defs>
  <rect x="14" y="18" width="292" height="124" rx="14" fill="#dfe6f0" filter="url(#pt-sh)"/>
  <rect x="22" y="26" width="276" height="108" rx="10" fill="#f4f7fb"/>
  <rect x="26" y="${ped ? 52 : 48}" width="${ped ? 34 : 42}" height="${ped ? 56 : 64}" rx="10" fill="#ffffff" stroke="#e3e8ef"/>
  <rect x="${ped ? 112 : 96}" y="30" width="${ped ? 168 : 200}" height="100" rx="12" fill="#e8f1ff" opacity=".85"/>
  <g transform="translate(${cx} ${cy}) scale(${k}) translate(${-cx} ${-cy})">
    <rect x="166" y="60" width="112" height="17" rx="8" fill="${cloth}"/>
    <rect x="166" y="83" width="112" height="17" rx="8" fill="${cloth}"/>
    <rect x="274" y="57" width="22" height="15" rx="6" fill="${skin}"/><rect x="274" y="88" width="22" height="15" rx="6" fill="${skin}"/>
    <rect x="78" y="58" width="94" height="44" rx="18" fill="${cloth}"/>
    <rect x="92" y="40" width="48" height="12" rx="6" fill="${skin}" transform="rotate(-10 92 46)"/>
    <rect x="92" y="108" width="48" height="12" rx="6" fill="${skin}" transform="rotate(10 92 114)"/>
    <rect x="136" y="38" width="42" height="11" rx="5.5" fill="${skin}"/>
    <rect x="136" y="111" width="42" height="11" rx="5.5" fill="${skin}"/>
    <circle cx="182" cy="43" r="7" fill="${skin}"/><circle cx="182" cy="117" r="7" fill="${skin}"/>
    <rect x="70" y="72" width="12" height="16" rx="5" fill="${skin}"/>
    <circle cx="55" cy="80" r="19" fill="${skin}"/>
    ${face}
  </g>
  <text x="300" y="${rightBottom ? 138 : 36}" font-size="9" fill="#6b7280" text-anchor="end">오른쪽(R)</text>
  <text x="300" y="${rightBottom ? 36 : 138}" font-size="9" fill="#6b7280" text-anchor="end">왼쪽(L)</text>
  <text x="24" y="162" font-size="10" fill="#6b7280">${posture === 'prone' ? '엎드린자세' : '바로누운자세'}${ped ? ' · 소아' : ''}${patient.region ? ' · 주 문제 부위: ' + (LABELS[patient.region] || patient.region) : ''}</text>
  <g class="hl"></g><g class="eq"></g>
</svg>`;
    const svg = container.querySelector('svg'); const hl = svg.querySelector('.hl'); const eq = svg.querySelector('.eq');
    const api = {
      highlight(region) {
        hl.innerHTML = ''; if (!region) return;
        const p = point(region, posture); const big = region === 'whole' || region === 'legs';
        const r0 = big ? 26 : 10, r1 = big ? 34 : 17;
        hl.innerHTML = `<circle cx="${p.x}" cy="${p.y}" r="${big ? 30 : 13}" fill="none" stroke="#e5484d" stroke-width="2.5" opacity=".9"><animate attributeName="r" values="${r0};${r1};${r0}" dur="1.6s" repeatCount="indefinite"/><animate attributeName="opacity" values=".9;.3;.9" dur="1.6s" repeatCount="indefinite"/></circle><circle cx="${p.x}" cy="${p.y}" r="4" fill="#e5484d"/>`;
      },
      place(emoji, label, ok = true) {
        const p = point(patient.region || 'whole', posture);
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g'); g.setAttribute('class', 'placed ' + (ok ? 'ok' : 'bad'));
        g.innerHTML = `<circle cx="${p.x}" cy="${p.y - 28}" r="15" fill="${ok ? '#dcfce7' : '#fee2e2'}" stroke="${ok ? '#16a34a' : '#e5484d'}" stroke-width="2"/><text x="${p.x}" y="${p.y - 23}" font-size="16" text-anchor="middle">${emoji}</text>${label ? `<text x="${p.x}" y="${p.y - 48}" font-size="9" text-anchor="middle" fill="#374151">${label}</text>` : ''}`;
        eq.append(g);
      },
      clearEquipment() { eq.innerHTML = ''; }
    };
    if (opts.highlight !== false) api.highlight(patient.region);
    return api;
  }
  return { render, point, label: r => LABELS[r] || r, LABELS };
})();