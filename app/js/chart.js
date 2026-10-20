// 학습 성공률 변화 추이 차트 (의존성 없는 SVG) — 시도별 점수(정답률 %)와 합격선
window.PTChart = (() => {
  const { h } = U;
  const pad = n => String(n).padStart(2, '0');
  const shortDate = d => { const x = new Date(d); return `${pad(x.getMonth() + 1)}.${pad(x.getDate())}`; };
  const MODE = { full: '종합', floor: '층별', practice: '연습' };
  function trend(container, results, passScore = 70, highlightId = null) {
    container.innerHTML = '';
    const data = (results || []).filter(r => r && typeof r.score === 'number' && r.mode !== 'practice').slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
    if (!data.length) { U.append(container, h('p', { class: 'muted small' }, '아직 평가 기록이 없어요. 첫 평가를 마치면 추이가 그려집니다.')); return; }
    const best = Math.max(...data.map(r => r.score)), avg = data.reduce((s, r) => s + r.score, 0) / data.length, last = data[data.length - 1], passes = data.filter(r => r.pass).length;
    const delta = data.length > 1 ? last.score - data[data.length - 2].score : null;
    const stat = (k, v, sub) => h('div', { class: 'tstat' }, h('div', { class: 'tstat-k' }, k), h('div', { class: 'tstat-v' }, v), sub ? h('div', { class: 'tstat-s' }, sub) : null);
    U.append(container, h('div', { class: 'trend-stats' },
      stat('최근', `${last.score}점`, delta == null ? '첫 시도' : (delta >= 0 ? `▲ ${Math.round(delta * 10) / 10}` : `▼ ${Math.round(-delta * 10) / 10}`) + ' 전 시도 대비'),
      stat('최고', `${best}점`), stat('평균', `${Math.round(avg * 10) / 10}점`), stat('합격', `${passes} / ${data.length}회`)));
    // ---- SVG ----
    const W = 640, H = 240, L = 44, R = 20, T = 18, B = 42; const iw = W - L - R, ih = H - T - B;
    const n = data.length; const xs = i => L + (n === 1 ? iw / 2 : i * iw / (n - 1)); const ys = v => T + ih - (v / 100) * ih;
    const ns = 'http://www.w3.org/2000/svg'; const el = (t, a = {}, txt) => { const e = document.createElementNS(ns, t); for (const k in a) e.setAttribute(k, a[k]); if (txt != null) e.textContent = txt; return e; };
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'trend-svg', role: 'img', 'aria-label': `시도별 점수 추이, 최근 ${last.score}점` });
    [0, 25, 50, 75, 100].forEach(v => { svg.append(el('line', { x1: L, x2: W - R, y1: ys(v), y2: ys(v), stroke: '#E2E8E4', 'stroke-width': 1 })); svg.append(el('text', { x: L - 8, y: ys(v) + 4, 'text-anchor': 'end', 'font-size': 11, fill: '#66736C' }, v)); });
    svg.append(el('line', { x1: L, x2: W - R, y1: ys(passScore), y2: ys(passScore), stroke: '#D97706', 'stroke-width': 1.5, 'stroke-dasharray': '6 4' }));
    svg.append(el('text', { x: W - R, y: ys(passScore) - 6, 'text-anchor': 'end', 'font-size': 11, 'font-weight': 700, fill: '#B45309' }, `합격선 ${passScore}점`));
    // 영역 + 선
    if (n > 1) {
      const pts = data.map((r, i) => `${xs(i)},${ys(r.score)}`).join(' ');
      svg.append(el('polygon', { points: `${xs(0)},${ys(0)} ${pts} ${xs(n - 1)},${ys(0)}`, fill: 'rgba(15,122,77,.08)' }));
      svg.append(el('polyline', { points: pts, fill: 'none', stroke: '#0F7A4D', 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    }
    // x축 라벨: 시도 번호 + 날짜(최대 8개)
    const step = Math.ceil(n / 8);
    data.forEach((r, i) => { if (i % step === 0 || i === n - 1) { svg.append(el('text', { x: xs(i), y: H - B + 16, 'text-anchor': 'middle', 'font-size': 11, fill: '#374151', 'font-weight': 700 }, `${i + 1}회`)); svg.append(el('text', { x: xs(i), y: H - B + 30, 'text-anchor': 'middle', 'font-size': 10, fill: '#8A948E' }, shortDate(r.date))); } });
    // 점 + 툴팁
    const tip = h('div', { class: 'chart-tip' }); const wrap = h('div', { class: 'chart-wrap' });
    data.forEach((r, i) => {
      const cx = xs(i), cy = ys(r.score); const ok = r.pass; const hi = highlightId && r.id === highlightId;
      if (hi) svg.append(el('circle', { cx, cy, r: 11, fill: 'none', stroke: '#0F7A4D', 'stroke-width': 1.5, 'stroke-dasharray': '3 3' }));
      svg.append(el('circle', { cx, cy, r: 5.5, fill: ok ? '#16A34A' : '#DC2626', stroke: '#fff', 'stroke-width': 2 }));
      const hit = el('circle', { cx, cy, r: 16, fill: 'transparent', style: 'cursor:pointer' });
      const showTip = () => { tip.innerHTML = `<b>${i + 1}회차 · ${r.score}점 ${ok ? '✅ 합격' : '❌ 불합격'}</b><br>${U.fmtDate(r.date)} · ${MODE[r.mode] || r.mode} ${r.floors}F · ${r.correct}/${r.total}문항`; tip.style.display = 'block'; const bw = wrap.clientWidth || W; const px = cx / W * bw; tip.style.left = Math.min(Math.max(px, 90), bw - 90) + 'px'; tip.style.top = (cy / H * (wrap.clientHeight || H) - 10) + 'px'; };
      hit.addEventListener('mouseenter', showTip); hit.addEventListener('pointerdown', showTip); hit.addEventListener('mouseleave', () => tip.style.display = 'none');
      hit.append(el('title', {}, `${i + 1}회차 ${r.score}점`)); svg.append(hit);
    });
    svg.append(el('text', { x: xs(n - 1) + (n > 1 ? 0 : 0), y: ys(last.score) - 12, 'text-anchor': n > 1 ? 'end' : 'middle', 'font-size': 12, 'font-weight': 800, fill: '#07432A' }, `${last.score}점`));
    U.append(wrap, svg, tip); U.append(container, wrap);
    // 표 보기(접근성)
    U.append(container, h('details', { class: 'chart-table' }, h('summary', {}, '표로 보기'), h('table', { class: 'grid' }, h('thead', {}, h('tr', {}, ['회차', '일시', '모드', '층', '점수', '합격'].map(t => h('th', { text: t })))), h('tbody', {}, data.map((r, i) => h('tr', {}, h('td', { text: i + 1 }), h('td', { text: U.fmtDate(r.date) }), h('td', { text: MODE[r.mode] || r.mode }), h('td', { text: r.floors }), h('td', { text: r.score }), h('td', { text: r.pass ? '합격' : '불합격' })))))));
  }
  return { trend };
})();