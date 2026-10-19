// Gemini 연동: 해설 튜터 / 새 사례 생성
window.Gemini = (() => {
  const SYSTEM = '당신은 신성대학교 물리치료학과의 임상 교육 튜터입니다. 대한의학회 의학용어집 6.1판 신용어(예: 넙다리네갈래근, 무릎관절, 발등굽힘, 어깨관절)를 사용하고, 한국 물리치료사 국가고시 수준으로 간결하고 정확하게 한국어로 답합니다. 근거가 불확실하면 그렇다고 말합니다.';
  async function ask(prompt, opts = {}) { return Store.gemini({ prompt, system: opts.system || SYSTEM, json: !!opts.json, temperature: opts.temperature }); }
  async function explain({ case: c, question: q, chosen }) {
    const prompt = `[환자 사례]\n진단: ${c.dx}\n주호소: ${c.S.chief}\n단계: ${c.A.stage}\n객관적 소견: ${c.O.map(o => o[0] + ': ' + o[1]).join('; ')}\n\n[문항] ${q.stem}\n보기: ${q.choices.map((t, i) => U.circled[i] + ' ' + t).join(' / ')}\n정답: ${U.circled[q.answer]} ${q.choices[q.answer]}\n학생이 고른 답: ${U.circled[chosen]} ${q.choices[chosen]}\n기본 해설: ${q.expl}\n\n학생이 왜 틀렸는지(맞았다면 핵심 근거를) 2~4문장으로 설명하고, 각 오답 보기가 왜 부적절한지 한 줄씩 짚어 주세요. 마지막에 "국시 암기 포인트" 1줄을 덧붙이세요.`;
    return ask(prompt);
  }
  const SCHEMA_HINT = '{"id":"string","floor":number,"title":"string","sub":"string","dx":"string","patient":{"name":"string","age":number,"sex":"남|여","job":"string","region":"ankle_R|ankle_L|knee_R|knee_L|shoulder_R|shoulder_L|lowback|neck|wrist_R|hand_R|elbow_R|hip_R|foot_L|calf_L|head|legs|whole 중 하나","posture":"supine|prone","pediatric":boolean,"informant":"보호자 호칭(소아일 때만)"},"S":{"chief":"string","chat":[["치료사 질문","환자 대답"],5개]},"O":[["검사명","결과"],6개],"A":{"stage":"string","icf":[["신체 구조와 기능: 현재","목표"],["활동: 현재","목표"],["참여: 현재","목표"]],"impression":"string"},"P":{"summary":"string","equipment":["cold|hotpack|paraffin|whirlpool|us|swd|tens|nmes|russian|ict|hvpc|idc|ionto|traction|exercise|stretch|balance|gait|orthosis|splint|manual|education|refer 중 1~3개"]},"Q":[{"step":"A","tag":"평가","stem":"string","choices":["5개"],"answer":0~4,"expl":"string"},{"step":"A",...},{"step":"P","tag":"중재","stem":"string","choices":["5개"],"answer":0~4,"expl":"string"},{"step":"P",...}]}';
  async function generateCase(floor, topic = '') {
    const dept = { 1: '임상의사결정(문진·감별·적색신호·의뢰 판단)', 2: '운동치료(정형·신경계 재활 운동 처방과 단계 진행)', 3: '소아물리치료(뇌성마비 유형, 증후군, 발달지연 등)', 4: '물리적인자치료(전기·광선·열·수치료의 선택, 매개변수, 금기)' }[floor];
    const prompt = `${dept} 영역의 한국 물리치료사 국가고시 수준 임상 시뮬레이션 사례 1개를 아래 JSON 스키마 그대로 생성하세요. ${topic ? '주제: ' + topic + '.' : '주제는 흔하면서도 교육적으로 중요한 것으로 임의 선택.'} 5지선다 긍정형("가장 적절한 것은?")으로 문항 4개(A단계 2개: 평가·임상추론, P단계 2개: 중재 선택·매개변수·안전)를 만들고 answer는 정답 인덱스(0~4)입니다. 보기는 서로 명확히 구별되고 정답은 1개여야 하며 정답 위치는 무작위로 하세요. 대한의학회 의학용어집 6.1판 신용어를 사용하세요. floor는 ${floor}, id는 "${floor}f-ai-"로 시작하는 고유값.\n스키마: ${SCHEMA_HINT}\nJSON 객체만 출력하세요.`;
    const text = await ask(prompt, { json: true, temperature: 0.9 });
    let obj; try { obj = JSON.parse(text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim()); } catch (e) { throw new Error('AI 응답을 JSON으로 해석하지 못했습니다.'); }
    validate(obj);
    obj.floor = Number(floor); obj.ai = true; obj.createdAt = Date.now();
    if (!obj.id || !String(obj.id).startsWith(floor + 'f-ai')) obj.id = `${floor}f-ai-${U.uid()}`;
    if (!obj.patient.posture) obj.patient.posture = 'supine';
    return obj;
  }
  function validate(o) {
    ['title', 'dx', 'patient', 'S', 'O', 'A', 'P', 'Q'].forEach(k => { if (!o[k]) throw new Error('생성된 사례에 ' + k + ' 항목이 없습니다.'); });
    if (!Array.isArray(o.Q) || o.Q.length < 2) throw new Error('문항 수가 부족합니다.');
    o.Q.forEach((q, i) => {
      if (!Array.isArray(q.choices) || q.choices.length !== 5) throw new Error(`문항 ${i + 1}의 보기가 5개가 아닙니다.`);
      q.answer = Number(q.answer); if (!(q.answer >= 0 && q.answer <= 4)) throw new Error(`문항 ${i + 1}의 정답 인덱스 오류`);
      if (!['A', 'P'].includes(q.step)) q.step = i < 2 ? 'A' : 'P';
    });
    if (!o.Q.some(q => q.step === 'A') || !o.Q.some(q => q.step === 'P')) throw new Error('A단계와 P단계 문항이 모두 필요합니다.');
    if (!Array.isArray(o.A.icf)) o.A.icf = [['', ''], ['', ''], ['', '']];
    if (!Array.isArray(o.S.chat)) o.S.chat = [];
    if (!Array.isArray(o.O)) o.O = [];
    if (!o.P.equipment) o.P.equipment = [];
  }
  return { ask, explain, generateCase };
})();