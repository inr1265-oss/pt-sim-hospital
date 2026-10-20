# 3D 사람 모델(GLB) 넣는 곳

이 폴더에 넣은 `.glb` 파일은 앱에서 `assets/models/파일명.glb` 상대 경로로 불러옵니다.
로컬 서버(`start.bat`)와 GitHub Pages 배포(`https://inr1265-oss.github.io/pt-sim-hospital/assets/models/파일명.glb`) 모두 그대로 동작합니다.
서버 모드에서는 관리자 콘솔 → 설정 → "GLB 파일 업로드"로 PC의 파일을 바로 올릴 수 있습니다(올린 파일은 이 폴더에 저장됨).
자세한 제작 절차는 프로젝트 루트의 `GLB_모델_가이드.md`도 참고하세요.

## 1. 어떤 모델을 쓸 수 있나
| 용도 | 설정 키 (관리자 콘솔 → 설정, 또는 app/js/config.js) | 기본 파일명(이 이름이면 설정 없이 자동 적용) |
|---|---|---|
| 여자 치료사 | `avatarGlbF` | therapist_f.glb |
| 남자 치료사 | `avatarGlbM` | therapist_m.glb |
| 성인 여자 환자 | `patientGlbF` | patient_f.glb |
| 성인 남자 환자 | `patientGlbM` | patient_m.glb |
| 소아 환자 | `patientGlbChild` | patient_child.glb |
| 노인 여자/남자 환자 | `patientGlbElderF` / `patientGlbElderM` | patient_elder_f.glb / patient_elder_m.glb |

요구 사항
- 형식: **GLB(glTF 2.0 바이너리)** 하나의 파일(텍스처 포함). 10 MB 이하 권장(모바일 로딩), 업로드 상한 80 MB.
- 기준: Y축이 위, **발이 원점(0,0,0)**, **정면이 +Z**. 키는 앱이 자동으로 1.7 m(소아 1.15 m)로 맞춥니다.
- 포즈: T 포즈 또는 A 포즈. 팔은 앱이 자동으로 내립니다.
- **리깅(뼈대) 권장**: Mixamo 표준 뼈 이름(`Hips`, `LeftUpLeg`, `RightUpLeg`, `LeftLeg`, `RightLeg`, `LeftArm`, `RightArm`, 접두사 `mixamorig` 허용)이 있으면
  치료사는 걷기 동작이, 환자는 **누움·엎드림·앉음** 자세가 자동으로 적용됩니다. 리깅이 없으면 치료사는 미끄러지듯 이동하고 환자는 누운 자세로만 표시됩니다.

## 2. Genspark로 만드는 절차(예시)
1. Genspark(AI 이미지/3D) 또는 Meshy·Tripo·Rodin 등에서 **정면 T 포즈의 전신 캐릭터**를 생성합니다.
   프롬프트 예: "full body, T-pose, standing, front view, physical therapist in teal scrubs, realistic, neutral background" / 환자: "elderly Korean woman in pink hospital gown, T-pose, full body, front view".
2. **GLB로 내보내기**(Export → glTF/GLB). 텍스처가 포함되는 옵션을 고릅니다.
3. (권장) 리깅: https://www.mixamo.com 에 GLB/FBX를 올려 **Auto-Rigger** 실행 → "T-Pose" 상태로 **FBX(Binary) 다운로드** → Blender에서 Import FBX → File → Export → glTF 2.0(.glb)로 저장.
   Blender 내보내기 옵션: Format = glb, Transform → +Y Up 체크, Data → Mesh Apply Modifiers 체크, Material → Export, Images → Automatic.
4. 파일을 이 폴더에 넣고(예: `patient_f.glb`) Git으로 push 하거나, 로컬 서버라면 관리자 콘솔에서 업로드합니다.
5. 관리자 콘솔 → 설정 → "치료사 3D 아바타 / 환자 3D 모델" 칸에 `assets/models/patient_f.glb` 를 입력하고 저장.
   모든 학생에게 적용하려면(GitHub Pages) `app/js/config.js` 의 같은 키에 적고 push 하세요.
6. 병원 화면을 새로고침해 확인합니다. 실패하면 "모델 로드 실패" 안내가 뜹니다(파일명·경로·CORS 확인).

## 3. 이미 리깅된 공개 모델로 바로 시험하기
- Ready Player Me(https://readyplayer.me)에서 아바타를 만들면 Mixamo 호환 리깅이 포함된 GLB URL을 바로 줍니다(`https://models.readyplayer.me/<id>.glb`).
  단, 일부 브라우저 환경에서는 외부 서버 다운로드가 막힐 수 있으니 파일을 내려받아 이 폴더에 넣는 방법이 가장 확실합니다.
- three.js 예제 모델(Mixamo 리깅): `https://cdn.jsdelivr.net/gh/mrdoob/three.js@r128/examples/models/gltf/Xbot.glb` — 동작 확인용입니다.

## 4. 문제 해결
- 모델이 너무 크거나 작다 → 앱이 뼈/정점 높이로 자동 스케일합니다. 그래도 이상하면 Blender에서 Apply Scale 후 다시 내보내세요.
- 모델이 뒤를 본다 → 정면이 +Z가 아닙니다. Blender에서 Z축 기준 180° 회전 후 Apply Rotation.
- 환자가 침대 옆에 서 있다 → 리깅(Hips/UpLeg 뼈)이 없어 앉은 자세를 만들 수 없는 경우입니다. Mixamo 리깅을 거치세요.
- 검은색으로 보인다 → 텍스처가 GLB에 포함되지 않았습니다. 내보낼 때 "Embed textures" 옵션을 켜세요.