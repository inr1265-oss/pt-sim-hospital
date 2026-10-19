// parts/*.js + (optional) extra → app/js/data/cases_Nf.js 로 합치고 검증
const fs = require("fs"), path = require("path"), vm = require("vm");
const dataDir = path.join(__dirname, "..", "app", "js", "data");
const partsDir = path.join(dataDir, "parts");
const ctx = { window: {} }; vm.createContext(ctx);
for (const f of fs.readdirSync(partsDir).filter(f => f.endsWith(".js")).sort()) {
  vm.runInContext(fs.readFileSync(path.join(partsDir, f), "utf8"), ctx, { filename: f });
}
const names = {1:"1층 임상의사결정(문진실)",2:"2층 운동치료실",3:"3층 소아물리치료실",4:"4층 물리적인자치료실"};
let total = 0, errors = [];
for (const floor of [1,2,3,4]) {
  const arr = (ctx.window.PT_CASES[floor] || []).sort((a,b)=>a.id.localeCompare(b.id));
  const ids = new Set();
  for (const c of arr) {
    if (ids.has(c.id)) errors.push("dup id " + c.id); ids.add(c.id);
    if (!c.patient || !c.S || !c.O || !c.A || !c.P || !c.Q) errors.push("missing section " + c.id);
    c.Q.forEach((q,i) => {
      if (q.choices.length !== 5) errors.push(`${c.id} Q${i} choices=${q.choices.length}`);
      if (q.answer < 0 || q.answer > 4) errors.push(`${c.id} Q${i} answer=${q.answer}`);
      if (q.icons && q.icons.length !== 5) errors.push(`${c.id} Q${i} icons=${q.icons.length}`);
      if (!["A","P"].includes(q.step)) errors.push(`${c.id} Q${i} step=${q.step}`);
    });
    if (c.Q.filter(q=>q.step==="A").length < 1 || c.Q.filter(q=>q.step==="P").length < 1) errors.push(c.id+" needs A and P questions");
    total += c.Q.length;
  }
  const out = `// ${names[floor]} 케이스 — 자동 생성(tools/build_cases.js). 원본은 app/js/data/parts/ 에서 편집.\n` +
    `window.PT_CASES = window.PT_CASES || {};\nwindow.PT_CASES[${floor}] = ${JSON.stringify(arr, null, 1)};\n`;
  fs.writeFileSync(path.join(dataDir, `cases_${floor}f.js`), out, "utf8");
  console.log(`cases_${floor}f.js: ${arr.length} cases, ${arr.reduce((a,c)=>a+c.Q.length,0)} questions`);
}
console.log("TOTAL questions:", total);
if (errors.length) { console.log("ERRORS:\n" + errors.join("\n")); process.exit(1); } else console.log("validation OK");
