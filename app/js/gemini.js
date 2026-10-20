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
  // ---- 해설 캐시(같은 문항·같은 오답은 재호출하지 않음) ----
  const cacheGet = k => { try { return (JSON.parse(localStorage.getItem('pt:aiCache') || '{}'))[k] || null; } catch (e) { return null; } };
  const cacheSet = (k, v) => { try { const o = JSON.parse(localStorage.getItem('pt:aiCache') || '{}'); const keys = Object.keys(o); if (keys.length > 400) delete o[keys[0]]; o[k] = v; localStorage.setItem('pt:aiCache', JSON.stringify(o)); } catch (e) { /* ignore */ } };
  async function explainCached({ case: c, question: q, qIndex, chosen }) {
    const k = `${c.id}#${qIndex}#${chosen}`; const hit = cacheGet(k); if (hit) return hit;
    const t = await explain({ case: c, question: q, chosen }); cacheSet(k, t); return t;
  }
  const caseBrief = c => `진단: ${c.dx}\n단계: ${c.A.stage}\n주호소: ${c.S.chief}\n객관적 소견: ${c.O.map(o => o[0] + ': ' + o[1]).join('; ')}\n치료 계획: ${c.P.summary}`;
  // ---- 문항 후속 질문(짧은 대화) ----
  async function followUp({ case: c, question: q, chosen, history, userQ }) {
    const prompt = `[환자 사례]\n${caseBrief(c)}\n\n[문항] ${q.stem}\n보기: ${q.choices.map((t, i) => U.circled[i] + ' ' + t).join(' / ')}\n정답: ${U.circled[q.answer]} ${q.choices[q.answer]}${chosen != null ? `\n학생이 고른 답: ${U.circled[chosen]} ${q.choices[chosen]}` : ''}\n기본 해설: ${q.expl}\n\n[지금까지의 대화]\n${(history || []).map(m => (m.role === 'me' ? '학생: ' : '튜터: ') + m.text).join('\n') || '(없음)'}\n\n[학생의 새 질문] ${userQ}\n\n학생의 질문에 3~5문장으로 답하세요. 문항·사례와 관련된 임상 근거를 중심으로 하고, 국가고시 관점의 핵심을 한 줄로 마무리하세요.`;
    return ask(prompt);
  }
  // ---- AI 환자: 자유 문진에 환자(또는 보호자) 역할로 대답 ----
  async function patientReply({ case: c, history, userQ }) {
    const p = c.patient; const who = p.informant ? `${p.name}의 ${p.informant}` : p.name;
    const system = `당신은 물리치료 임상 시뮬레이션의 환자 역할입니다. 지금은 "${who}"(환자 ${p.name}, ${p.ageText || p.age + '세'} ${p.sex}성, ${p.job})로서 치료사의 문진에 대답합니다. 규칙: 1) 반드시 환자/보호자 입장의 구어체 존댓말로 1~3문장만 말한다. 2) 의학 용어·진단명·검사 결과를 스스로 말하지 않는다(환자는 모른다). 3) 아래 사례 정보와 모순되지 않게 답하고, 정보에 없는 내용을 물으면 그 환자라면 할 법한 평범한 대답을 짧게 한다. 4) 치료사가 환자에게 할 질문이 아닌 것(정답 알려 달라 등)에는 "잘 모르겠어요, 선생님이 알려주세요" 식으로 넘긴다.`;
    const prompt = `[사례 정보(비공개, 대답의 근거로만 사용)]\n진단: ${c.dx}\n주호소: ${c.S.chief}\n문진 내용: ${c.S.chat.map(([q, a]) => `Q: ${q} → A: ${a}`).join(' / ')}\n검사 소견(환자는 결과를 모름, 증상 묘사에만 참고): ${c.O.map(o => o[0] + ': ' + o[1]).join('; ')}\n\n[지금까지의 대화]\n${(history || []).map(m => (m.role === 'me' ? '치료사: ' : '환자: ') + m.text).join('\n') || '(없음)'}\n\n[치료사의 새 질문] ${userQ}\n\n환자로서 대답:`;
    return ask(prompt, { system, temperature: 0.8 });
  }
  // ---- AI 검사 응답: 학생이 자유롭게 입력한 검사·측정에 대해 사례와 일치하는 결과를 보고 ----
  async function examReply({ case: c, history, userQ }) {
    const system = '당신은 물리치료 임상 시뮬레이션에서 "검사 결과를 보고하는 시스템"입니다. 학생(치료사)이 시행하겠다고 말한 검사·측정에 대해, 주어진 사례 정보와 일치하는 결과를 임상 기록처럼 간결한 한국어로 보고합니다. 진단명이나 정답을 직접 말하지 말고, 결과(수치·양성/음성·관찰 소견)만 보고합니다. 사례에 없는 검사는 그 진단의 환자라면 나올 법한 결과를 그럴듯하게 만들되 사례와 모순되지 않게 합니다. 검사가 금기이거나 위험하면 결과 대신 짧게 경고합니다. 치료사가 할 검사가 아닌 요청(정답·진단 묻기)은 "그건 평가 단계에서 직접 판단하세요"로 넘깁니다.';
    const prompt = `[사례 정보(비공개)]\n진단: ${c.dx}\n단계: ${c.A.stage}\n주호소: ${c.S.chief}\n등록된 검사 목록(index: 검사명 → 결과):\n${c.O.map((o, i) => `${i}: ${o[0]} → ${o[1]}`).join('\n')}\n\n[지금까지 시행한 검사 대화]\n${(history || []).map(m => (m.role === 'me' ? '치료사: ' : '결과: ') + m.text).join('\n') || '(없음)'}\n\n[치료사가 시행하는 검사] ${userQ}\n\nJSON으로만 답하세요: {"result":"보고 문장(1~3문장, 수치 포함)","matched":[등록된 검사 중 이번 요청에 해당하는 index 배열, 없으면 []]}`;
    const text = await ask(prompt, { system, json: true, temperature: 0.4 });
    try { const j = JSON.parse(text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim()); return { result: String(j.result || ''), matched: Array.isArray(j.matched) ? j.matched.map(Number).filter(n => n >= 0 && n < c.O.length) : [] }; }
    catch (e) { return { result: text, matched: [] }; }
  }  // ---- 결과 화면 학습 코치 ----
  async function coach(result) {
    const wrong = (result.wrong || []).slice(0, 12).map(w => `- [${w.floor}F ${w.caseTitle}] ${w.stem} / 학생 답: ${w.chosen} / 정답: ${w.answer}`).join('\n');
    const prompt = `학생의 시뮬레이션 평가 결과입니다.\n점수: ${result.score}점 (${result.total}문항 중 ${result.correct} 정답, 합격 기준 ${result.passScore}점)\n층별: ${Object.entries(result.byFloor || {}).map(([f, v]) => `${f}F ${v.correct}/${v.total}`).join(', ')}\n오답 목록:\n${wrong || '(없음)'}\n\n이 학생을 위한 학습 코칭을 작성하세요. 형식: 1) 한 줄 총평 2) 오답에서 드러난 약한 개념 2~3가지(각 1~2문장, 왜 헷갈리는지와 구분 포인트) 3) 다음 응시 전 복습 과제 3개(구체적 키워드) 4) 격려 한 줄. 전체 10문장 이내, 마크다운 기호 없이 줄바꿈으로 구분.`;
    return ask(prompt, { temperature: 0.5 });
  }
  return { ask, explain, explainCached, followUp, patientReply, examReply, coach, generateCase };
})();