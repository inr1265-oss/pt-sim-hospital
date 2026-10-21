// 공개 배포(GitHub Pages 등 정적 호스팅)용 설정 — 서버 없이 모든 학생이 AI 튜터를 쓰게 하려면 여기에 키를 넣습니다.
// ★ 반드시 Google Cloud 콘솔 > API 및 서비스 > 사용자 인증 정보 > 해당 키 > "애플리케이션 제한사항: 웹사이트" 에
//   배포 주소(예: https://inr1265-oss.github.io/*)만 허용하도록 제한하세요. 그래야 다른 사이트에서 키를 도용할 수 없습니다.
// 비워 두면 AI 기능은 서버 모드(server/config.json) 또는 관리자 콘솔에서 입력한 키가 있을 때만 켜집니다.
window.PT_CONFIG = {
  geminiKey: "",
  geminiModel: "gemini-2.5-flash",
  // 3D 사람 모델(GLB). 아래 기본 파일명으로 app/assets/models/ 에 넣기만 하면 자동 적용되고,
  // 파일이 없으면 조용히 내장 캐릭터를 씁니다. 공개 URL(예: Ready Player Me "https://models.readyplayer.me/<id>.glb")도 가능.
  avatarGlbF: "assets/models/therapist_f.glb",
  avatarGlbM: "assets/models/therapist_m.glb",
  patientGlbF: "assets/models/patient_f.glb",
  patientGlbM: "assets/models/patient_m.glb",
  patientGlbChild: "assets/models/patient_child.glb",
  patientGlbChildF: "assets/models/patient_child_f.glb",
  patientGlbChildM: "assets/models/patient_child_m.glb",
  patientGlbElderF: "assets/models/patient_elder_f.glb",
  patientGlbElderM: "assets/models/patient_elder_m.glb",
  // 위 파일이 없을 때 공개 기본 모델(Quaternius CC0, CDN)을 쓸지 여부. false 면 내장 캐릭터만 사용
  publicModels: true
};