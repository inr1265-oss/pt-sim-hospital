// 공개 배포(GitHub Pages 등 정적 호스팅)용 설정 — 서버 없이 모든 학생이 AI 튜터를 쓰게 하려면 여기에 키를 넣습니다.
// ★ 반드시 Google Cloud 콘솔 > API 및 서비스 > 사용자 인증 정보 > 해당 키 > "애플리케이션 제한사항: 웹사이트" 에
//   배포 주소(예: https://inr1265-oss.github.io/*)만 허용하도록 제한하세요. 그래야 다른 사이트에서 키를 도용할 수 없습니다.
// 비워 두면 AI 기능은 서버 모드(server/config.json) 또는 관리자 콘솔에서 입력한 키가 있을 때만 켜집니다.
window.PT_CONFIG = {
  geminiKey: "",
  geminiModel: "gemini-2.5-flash"
};