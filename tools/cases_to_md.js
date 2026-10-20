// 케이스 데이터 → Obsidian 마크다운 노트 (임상 사례 연구 형식)
// 사용: node tools/cases_to_md.js   → 케이스_노트/ 폴더에 생성
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..'); const dataDir = path.join(root, 'app', 'js', 'data'); const out = path.join(root, '케이스_노트');
const ctx = { window: {} }; vm.createContext(ctx);
['equipment.js', 'cases_1f.js', 'cases_2f.js', 'cases_3f.js', 'cases_4f.js'].forEach(f => vm.runInContext(fs.readFileSync(path.join(dataDir, f), 'utf8'), ctx));
const EQ = ctx.window.PT_EQUIP; const FLOORS = { 1: '1층 임상의사결정 문진실', 2: '2층 운동치료실', 3: '3층 소아물리치료실', 4: '4층 물리적인자치료실' };
const circled = ['①', '②', '③', '④', '⑤']; const safe = s => s.replace(/[\\/:*?"<>|]/g, '').trim();
fs.mkdirSync(out, { recursive: true });
let index = `---\ntype: MOC\n생성: ${new Date().toISOString().slice(0, 10)}\n---\n# PT 시뮬레이션 병원 — 케이스 노트 색인\n\n> 앱의 케이스 데이터(app/js/data/parts/*.js)에서 자동 생성. 수정은 parts 파일에서 하고 \`node tools/build_cases.js && node tools/cases_to_md.js\` 를 다시 실행.\n\n`;
for (const floor of [1, 2, 3, 4]) {
  const dir = path.join(out, FLOORS[floor]); fs.mkdirSync(dir, { recursive: true }); index += `\n## ${FLOORS[floor]}\n`;
  for (const c of ctx.window.PT_CASES[floor]) {
    const p = c.patient; const fname = `${c.id} ${safe(c.title)}.md`; index += `- [[${fname.replace(/\.md$/, '')}]] — ${c.sub}\n`;
    const rows = ['신체 구조와 기능', '활동', '참여'];
    let md = `---\ntype: 임상사례\nid: ${c.id}\n층: ${floor}\n영역: ${FLOORS[floor]}\n진단: "${c.dx}"\n태그: [PT시뮬레이션, ${c.sub.split('·').map(s => s.trim()).join(', ')}]\n---\n`;
    md += `# 사례 연구 ${c.id} · ${c.title}\n\n> ${c.sub} · 진단: **${c.dx}**\n\n## 평가\n\n### 과거력(S)\n${p.name}은(는) ${p.ageText || p.age + '세'} ${p.sex}성 ${p.job}${p.informant ? ` (정보 제공: ${p.informant})` : ''}이다. 주호소: "${c.S.chief}"\n\n| 치료사 질문 | ${p.informant || '환자'} 대답 |\n|---|---|\n${c.S.chat.map(([q, a]) => `| ${q} | ${a} |`).join('\n')}\n\n### 평가와 측정(O)\n| 검사 | 결과 |\n|---|---|\n${c.O.map(([t, r]) => `| ${t} | ${r} |`).join('\n')}\n\n### 평가와 목표(A) — ${c.A.stage}\n| ICF 단계 | 현재 상태 | 목표 |\n|---|---|---|\n${c.A.icf.map((r, k) => `| ${rows[k]} | ${r[0]} | ${r[1]} |`).join('\n')}\n\n**임상 인상:** ${c.A.impression}\n\n## 중재(P)\n${c.P.summary}\n\n주요 인자·중재: ${(c.P.equipment || []).map(id => (EQ[id] ? EQ[id].emoji + ' ' + EQ[id].name : id)).join(', ')}\n\n## 문항 (국가고시형 5지선다)\n`;
    c.Q.forEach((q, i) => { md += `\n### 문항 ${i + 1} [${q.step}단계 · ${q.tag}]\n${q.stem}\n${q.choices.map((ch, k) => `- ${circled[k]} ${ch}${k === q.answer ? ' ✅' : ''}`).join('\n')}\n\n> **해설:** ${q.expl}\n`; });
    fs.writeFileSync(path.join(dir, fname), md, 'utf8');
  }
}
index += `
## 연결
- 공모전 출품: [[06_출품작_PT 시뮬레이션 병원]] — 2026 AI 기반 미래교육혁신사례 공모전(AIDX센터장 출품)
- 상위: [[AIDX센터장 MOC]] · 앱 설명: [[21_Vibe Coding/01_AI 학습앱/README|README]]
`;
fs.writeFileSync(path.join(out, '00_케이스 색인.md'), index, 'utf8');
console.log('케이스 노트 생성 완료 →', out);