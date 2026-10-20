# 3D 모델(GLB) 폴더

여기에 치료사·환자 모델을 넣고 `app/js/config.js`(정적 배포) 또는 관리자 콘솔 설정(서버 모드)에 경로를 지정합니다.

권장 파일명
- therapist_f.glb / therapist_m.glb : 치료사(여/남)
- patient_f.glb / patient_m.glb / patient_child.glb : 환자(여/남/아동)

경로 예: `assets/models/patient_f.glb` (상대 경로, app/ 기준)

요구사항: 사람 형태(T/A 포즈), Y축 위, 미터 단위(키 1.5~1.9 m면 자동 보정), 20 MB 이하 권장, Draco 압축 가능. Mixamo 뼈 이름(mixamorigHips 등)이 있으면 걷기·앉기 자세가 자동으로 붙습니다.
자세한 제작 방법은 프로젝트 루트의 `GLB_모델_가이드.md` 참고.
