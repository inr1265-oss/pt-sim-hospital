// 학업 상태(전체 기록 기반) 통계·진단 — 의존성 없음. AI가 없어도 규칙 기반 진단을 보여주고, AI가 있으면 프롬프트 요약을 제공
window.PTProgress = (() => {
  const { h } = U;
  const FLOOR_NAMES = { 1: '임상의사결정', 2: '운동치료', 3: '소아물리치료', 4: '물리적인자치료' };
  const r1 = v => Math.round(v * 10) / 10;
  function stats(results, opts = {}) {
    const passScore = opts.passScore || 70;
    const data = (results || []).filter(r => r && r.mode !== 'practice' && typeof r.score === 'number').slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const n = data.length;
    if (!n) return { attempts: 0, passScore, level: '시작 전', levelCls: 'soft', diagnosis: '아직 평가 기록이 없어요. 첫 평가를 마치면 학업 상태를 진단해 드립니다.', floors: [], weakFloors: [], repeated: [], trend: null };
    const last = data[n - 1]; const scores = data.map(r => r.score);
    const best = Math.max(...scores), avg = r1(scores.reduce((a, b) => a + b, 0) / n);
    const recent = data.slice(-3), prior = data.slice(0, -3);
    const mean = a => a.length ? a.reduce((s, r) => s + r.score, 0) / a.length : null;
    const recentAvg = r1(mean(recent)), priorAvg = prior.length ? r1(mean(prior)) : null;
    const trendDelta = priorAvg == null ? (n > 1 ? r1(last.score - data[n - 2].score) : null) : r1(recentAvg - priorAvg);
    const trend = trendDelta == null ? null : trendDelta >= 5 ? 'up' : trendDelta <= -5 ? 'down' : 'flat';
    const passes = data.filter(r => r.pass).length; let streak = 0; for (let i = n - 1; i >= 0 && data[i].pass; i--) streak++;
    const fl = {}; data.forEach(r => Object.entries(r.byFloor || {}).forEach(([f, v]) => { fl[f] = fl[f] || { floor: Number(f), total: 0, correct: 0, attempts: 0 }; fl[f].total += v.total; fl[f].correct += v.correct; fl[f].attempts++; }));
    const floors = Object.values(fl).map(v => ({ ...v, name: FLOOR_NAMES[v.floor] || v.floor + 'F', acc: v.total ? Math.round(v.correct / v.total * 100) : 0 })).sort((a, b) => a.acc - b.acc);
    const weakFloors = floors.filter(v => v.total >= 4 && v.acc < passScore);
    const strongFloors = floors.filter(v => v.total >= 4 && v.acc >= 85);
    const miss = {}; data.forEach(r => (r.wrong || []).forEach(w => { const k = `${w.floor}F ${w.caseTitle}`; miss[k] = miss[k] || { key: k, floor: w.floor, title: w.caseTitle, count: 0, stems: new Set() }; miss[k].count++; miss[k].stems.add(w.stem); }));
    const repeated = Object.values(miss).filter(m => m.count >= 2).sort((a, b) => b.count - a.count).slice(0, 6).map(m => ({ ...m, stems: [...m.stems].slice(0, 2) }));
    const lastMisses = (last.wrong || []).map(w => `${w.floor}F ${w.caseTitle}`);
    let level, levelCls;
    if (last.pass && streak >= 2) { level = '안정 합격권'; levelCls = 'ok'; }
    else if (last.pass) { level = '합격'; levelCls = 'ok'; }
    else if (recentAvg >= passScore - 10) { level = '합격선 근접'; levelCls = 'warn'; }
    else if (recentAvg >= 50) { level = '기초 보강 필요'; levelCls = 'warn'; }
    else { level = '기초 다지기'; levelCls = 'bad'; }
    const parts = [];
    parts.push(n === 1 ? `첫 평가 ${last.score}점으로 ${last.pass ? '합격했어요' : '합격선(' + passScore + '점)에 ' + r1(passScore - last.score) + '점 모자랐어요'}.` : `최근 ${recent.length}회 평균 ${recentAvg}점(전체 평균 ${avg}점, 최고 ${best}점)이고 ${trend === 'up' ? '상승세예요' : trend === 'down' ? '하락세라 점검이 필요해요' : '정체 구간이에요'}.`);
    if (weakFloors.length) parts.push(`${weakFloors.map(v => `${v.floor}F ${v.name}(${v.acc}%)`).join(', ')} 층이 누적 정답률 ${passScore}% 미만으로 가장 약해요.`);
    else if (floors.length) parts.push(`모든 층이 누적 정답률 ${passScore}% 이상이에요${strongFloors.length ? `. 특히 ${strongFloors.map(v => v.floor + 'F ' + v.name).join(', ')}이(가) 강점이에요` : ''}.`);
    if (repeated.length) parts.push(`${repeated.slice(0, 3).map(m => m.key).join(', ')} 케이스는 ${repeated[0].count}회 이상 반복해서 틀렸으니 해설을 다시 읽고 연습 모드로 복습하세요.`);
    return { attempts: n, passScore, last, lastId: last.id, best, avg, recentAvg, priorAvg, trend, trendDelta, passes, streak, floors, weakFloors, strongFloors, repeated, lastMisses, level, levelCls, diagnosis: parts.join(' ') };
  }
  function render(container, st) {
    container.innerHTML = '';
    if (!st.attempts) { U.append(container, h('p', { class: 'muted small' }, st.diagnosis)); return container; }
    const trendTxt = st.trend === 'up' ? `▲ 상승 (+${st.trendDelta})` : st.trend === 'down' ? `▼ 하락 (${st.trendDelta})` : st.trend === 'flat' ? '→ 유지' : '첫 시도';
    U.append(container,
      h('div', { class: 'status-row' }, h('span', { class: 'status-badge ' + st.levelCls }, st.level), h('span', { class: 'tag soft' }, `응시 ${st.attempts}회 · 합격 ${st.passes}회`), st.streak >= 2 ? h('span', { class: 'tag ok' }, `연속 합격 ${st.streak}회`) : null, h('span', { class: 'tag soft' }, `추세 ${trendTxt}`)),
      h('p', { class: 'status-diag' }, st.diagnosis),
      st.floors.length ? h('div', { class: 'floor-bars mt' }, h('div', { class: 'tiny muted' }, '층별 누적 정답률 (모든 평가 합산)'), st.floors.map(v => h('div', { class: 'fb-row' }, h('span', {}, `${v.floor}F ${v.name}`), h('div', { class: 'bar' + (v.acc < st.passScore ? ' weak' : '') }, h('i', { style: { width: v.acc + '%' } })), h('b', {}, `${v.acc}%`)))) : null,
      st.repeated.length ? h('div', { class: 'mt' }, h('div', { class: 'tiny muted' }, '반복해서 틀린 케이스'), h('div', { class: 'row wrap' }, st.repeated.map(m => h('span', { class: 'tag bad' }, `${m.key} ×${m.count}`)))) : null);
    return container;
  }
  const summaryText = st => !st.attempts ? '평가 기록 없음' : `응시 ${st.attempts}회, 최근 ${st.last.score}점(${st.last.pass ? '합격' : '불합격'}), 최근 평균 ${st.recentAvg}점, 전체 평균 ${st.avg}점, 최고 ${st.best}점, 합격 ${st.passes}회, 연속 합격 ${st.streak}회, 추세 ${st.trend || '첫 시도'}(${st.trendDelta == null ? '-' : st.trendDelta}). 층별 누적 정답률: ${st.floors.map(v => `${v.floor}F ${v.name} ${v.acc}%(${v.correct}/${v.total})`).join(', ') || '-'}. 약한 층: ${st.weakFloors.map(v => v.floor + 'F').join(',') || '없음'}. 반복 오답 케이스: ${st.repeated.map(m => `${m.key}(${m.count}회)`).join(', ') || '없음'}. 규칙 기반 진단: ${st.level} — ${st.diagnosis}`;
  const aiKey = (st, studentId) => `${studentId}:${st.attempts}:${st.lastId || ''}`;
  return { stats, render, summaryText, aiKey, FLOOR_NAMES };
})();