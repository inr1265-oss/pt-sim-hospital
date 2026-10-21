---
type: 가이드
작성: 2026-10-20
관련: "[[README]]"
---
# 3D 사람 모델(GLB) 제작·연동 가이드

PT 시뮬레이션 병원은 치료사(여/남)와 환자(여/남/아동/노인 여·남) 모델을 **GLB 파일**로 교체할 수 있습니다.
모델이 없으면 내장 캐릭터를 쓰고, 모델이 있으면 자동으로 키를 맞추고(1.7 m, 아동 1.15 m, 영아 0.8 m) 케이스 자세에 맞춰 눕히거나 앉힙니다.

## 0. 가장 빠른 방법: 기본 파일명으로 넣기

아래 이름으로 `app/assets/models/` 에 넣고 push(또는 관리자 콘솔 → 설정 → "GLB 파일 업로드")하면 **설정을 건드리지 않아도** 자동 적용됩니다.
파일이 없으면 내장 캐릭터를 쓰고, 노인 모델이 없으면 성인 모델을 대신 씁니다.

| 용도 | 파일명 |
|---|---|
| 여자 / 남자 치료사 | `therapist_f.glb` / `therapist_m.glb` |
| 성인 여자 / 남자 환자 | `patient_f.glb` / `patient_m.glb` |
| 소아 환자 | `patient_child.glb` |
| 노인 여자 / 남자 환자 | `patient_elder_f.glb` / `patient_elder_m.glb` |

다른 이름이나 외부 URL을 쓰려면 관리자 콘솔 → 설정의 해당 칸(또는 `app/js/config.js`)에 경로를 적으면 됩니다.
## 1. 모델이 갖춰야 할 조건

| 항목 | 요구 | 이유 |
|---|---|---|
| 형식 | `.glb` (glTF 바이너리). Draco 압축 가능 | 브라우저 Three.js가 바로 읽음 |
| 포즈 | T포즈 또는 A포즈로 **서 있는** 사람 | 눕힘·앉힘은 앱이 뼈를 돌려 만듦 |
| 축·단위 | Y축이 위, 미터 단위(키 1.5~1.9 m). 다르면 자동 보정 | 높이 정규화 |
| 정면 | +Z 방향을 바라봄(glTF 표준) | 침대 위 방향 결정 |
| 리깅 | Mixamo 뼈 이름(`mixamorigHips`, `LeftUpLeg`, `RightUpLeg`, `LeftLeg`, `RightLeg`, `LeftArm`, `RightArm` …) 권장 | 치료사 걷기, 환자 앉기 자세, 팔 내리기 |
| 용량 | 20 MB 이하 권장(최대 80 MB) | 폰에서도 로드되게 |
| 텍스처 | GLB 안에 포함(embedded) | 외부 이미지 경로는 깨짐 |

리깅이 없는 모델도 쓸 수 있지만, 환자는 **누운 자세로만** 배치되고(앉는 케이스는 침대 옆에 서 있음) 치료사는 걷기 동작 없이 미끄러지듯 이동합니다.

## 2. 모델 만드는 방법(툴별)

### A. Genspark (AI 3D 생성)
1. Genspark에서 3D/이미지 생성 도구로 **정면을 보고 T포즈로 서 있는 사람 전신**을 만듭니다.
   - 프롬프트 예: `full body, T-pose, standing, front view, neutral background, Korean female physical therapist in teal scrubs, realistic` / 환자: `elderly Korean woman in hospital gown, T-pose, full body`
2. 결과를 **GLB(glTF)** 로 내보냅니다. GLB 옵션이 없으면 OBJ/FBX로 받은 뒤 아래 "변환" 절차로 GLB를 만듭니다.
3. 리깅이 없으므로 **Mixamo로 자동 리깅**(아래 D)까지 거치면 걷기·앉기가 붙습니다.

### B. Ready Player Me (무료 아바타, 가장 쉬움)
1. https://readyplayer.me 에서 아바타를 만듭니다(사진으로도 가능). 의상은 치료복에 가까운 상의·바지를 고릅니다.
2. 완성 화면의 `.glb` 링크(`https://models.readyplayer.me/<id>.glb`)를 복사합니다.
3. 바로 URL로 넣어도 되지만, 일부 브라우저·네트워크에서 차단될 수 있으니 **파일로 내려받아 저장소에 넣는 것**을 권장합니다. (Mixamo 호환 뼈가 들어 있어 걷기·앉기가 바로 됩니다.)

### C. Meshy / Tripo / Luma 등 AI 3D 생성 서비스
1. 텍스트 또는 이미지 → 3D 생성 후 **GLB** 로 내보냅니다(텍스처 포함 옵션 켜기).
2. 대부분 리깅 옵션("Rig / Animate")이 있습니다. 있으면 **Humanoid(Mixamo) 리깅**을 선택한 뒤 T포즈 상태로 내보냅니다.

### D. Mixamo로 리깅 추가(무료, 어도비 계정)
1. https://www.mixamo.com → Upload Character → OBJ/FBX/GLB(정적 모델) 업로드.
2. 턱·손목·팔꿈치·무릎·사타구니 마커를 찍고 Auto-Rigger 실행.
3. 애니메이션 없이 **T-Pose 상태**로 Download: Format **FBX Binary**, Pose **T-pose**.
4. 아래 "변환"으로 FBX → GLB.

### E. 변환(FBX/OBJ → GLB)
- **Blender(무료)**: File → Import(FBX/OBJ) → File → Export → glTF 2.0 → Format `glTF Binary (.glb)`, "Include: Selected Objects" 끄고, Transform "+Y Up" 체크, Data "Apply Modifiers", "Compression(Draco)" 선택 가능 → 저장.
- 웹 변환기(예: products.aspose.app/3d/conversion/fbx-to-glb)도 가능하지만 텍스처가 빠질 수 있습니다.

## 3. 앱에 넣는 방법

### 방법 1 — 교수님 PC 서버 모드(가장 간단)
1. `start.bat` 으로 서버 실행 → 관리자 콘솔 → 설정.
2. "3D 모델 업로드"에서 파일을 고르고 슬롯(치료사 여/남, 환자 여/남/아동/노인)을 지정해 업로드하면 `app/assets/models/` 에 저장되고 설정에 경로가 들어갑니다.
   (업로드 UI가 아직 없다면: 파일을 `app/assets/models/` 에 복사하고 설정 칸에 `assets/models/파일명.glb` 를 직접 적습니다.)
3. 병원 화면을 새로고침하면 적용됩니다.

### 방법 2 — GitHub Pages 정적 배포(모든 학생에게 적용)
1. 파일을 `app/assets/models/` 에 넣습니다. 권장 파일명:
   - 치료사: `therapist_f.glb`, `therapist_m.glb`
   - 환자: `patient_f.glb`, `patient_m.glb`, `patient_child.glb`, `patient_elder_f.glb`, `patient_elder_m.glb`
2. `app/js/config.js` 에 상대 경로를 적습니다.
   ```js
   avatarGlbF: "assets/models/therapist_f.glb",
   avatarGlbM: "assets/models/therapist_m.glb",
   patientGlbF: "assets/models/patient_f.glb",
   patientGlbM: "assets/models/patient_m.glb",
   patientGlbChild: "assets/models/patient_child.glb",
   patientGlbElderF: "assets/models/patient_elder_f.glb",
   patientGlbElderM: "assets/models/patient_elder_m.glb"
   ```
3. 커밋·푸시하면 1~2분 뒤 배포됩니다.
   ```bash
   git add app/assets/models app/js/config.js && git commit -m "3D 모델 추가" && git push origin main
   ```
   GitHub는 파일 하나당 100 MB 제한이 있으니 20 MB 안팎으로 줄이세요(Blender Draco 압축, 텍스처 2048→1024).

## 4. 확인 포인트와 문제 해결

| 증상 | 원인 | 해결 |
|---|---|---|
| "모델을 내려받지 못했어요" | 경로 오타, 파일 미배포, 외부 URL CORS 차단 | 저장소에 넣고 상대 경로 사용. 브라우저 주소창에 파일 주소를 열어 다운로드되는지 확인 |
| 모델이 거대/아주 작음 | 단위가 cm 등 | 자동 보정되지만, 뼈가 이상하면 Blender에서 Apply Scale 후 다시 내보내기 |
| 팔이 하늘로 올라감 | T포즈 보정 방향 차이 | 뼈 이름이 Mixamo 규칙인지 확인. 비표준 뼈면 A포즈로 내보내기 |
| 환자가 침대를 뚫고 눕거나 떠 있음 | 발 위치가 원점이 아님 | Blender에서 발바닥을 Z=0(내보내면 Y=0)에 맞춤 |
| 검게 보임 | 텍스처 외부 참조 | GLB 내보낼 때 "Images: Automatic/Embedded" 선택 |
| 폰에서 느림 | 폴리곤·텍스처 과다 | Decimate로 2~5만 폴리곤, 텍스처 1024 이하 |

## 5. 다음 단계 아이디어
- 환자 모델에 **표정·호흡 애니메이션**(GLB 애니메이션 클립)을 넣으면 앱이 첫 클립을 재생하도록 확장할 수 있습니다.
- 병실 장비(치료 테이블·전기치료기)도 같은 방식으로 GLB 교체 슬롯을 만들 수 있습니다.

## 5. 걷기 애니메이션이 들어 있는 모델 만들기 (Mixamo)

앱은 GLB 안에 이름에 `walk`(또는 `run`)가 들어간 애니메이션 클립이 있으면 걸을 때 그 클립을 재생하고, `idle`이 들어간 클립이 있으면 멈춰 섰을 때 재생합니다. 클립이 없으면 뼈를 흔드는 임시 동작을 쓰기 때문에 어색합니다. 자연스러운 걷기를 원하면 아래처럼 Mixamo 애니메이션을 넣으세요.

1. https://www.mixamo.com 에 Adobe 계정(무료)으로 로그인합니다.
2. **캐릭터 고르기**: 상단 Characters 에서 마음에 드는 캐릭터를 고르거나, Upload Character 로 내 모델(GLB/FBX/OBJ, 예: Genspark·Meshy·Ready Player Me 결과물)을 올려 자동 리깅합니다.
3. **걷기 넣기**: Animations 에서 `Walking` 검색 → 오른쪽 옵션에서 **In Place 체크**(제자리 걷기, 필수) → Download → Format `FBX Binary`, Skin `With Skin`, 30 fps.
4. (선택) `Idle` 애니메이션도 같은 방식으로 Download(Skin `Without Skin`).
5. **Blender(무료)에서 GLB로 합치기**: File → Import → FBX 로 걷기 파일을 가져옵니다. Idle 도 가져오면 같은 뼈 이름이라 Action 이 하나 더 생깁니다. Dope Sheet → Action Editor 에서 액션 이름을 `Walking`, `Idle` 로 바꾸고 각각 **Push Down**(NLA 트랙으로) 합니다. File → Export → glTF 2.0: Format `glb`, Animation 탭에서 `Group by NLA Track` 체크, Transform `+Y Up`.
6. 파일 이름을 `therapist_m.glb`(또는 `therapist_f.glb`)로 바꿔 `app/assets/models/` 에 넣고 push 하면 끝입니다. 걷기 클립만 있어도 됩니다(멈추면 걷기 동작을 정지 자세로 세웁니다).

## 6. 무료로 사람 모델을 구하는 곳

| 사이트 | 특징 | 이 앱에서 쓰려면 |
|---|---|---|
| **Ready Player Me** (readyplayer.me) | 무료. 웹에서 얼굴·머리 모양·옷을 골라 만드는 반사실적 아바타. 머리카락 있는 캐릭터를 바로 만들 수 있고 Mixamo 호환 뼈대. | 완성 후 `.glb` 다운로드 → `therapist_m.glb` 로 저장. URL(`https://models.readyplayer.me/<id>.glb`)을 관리자 설정에 바로 넣어도 됩니다. 의료복이 없으면 앱이 상·하의를 치료복 색으로 자동 재채색합니다. 걷기는 5번 절차로 Mixamo 를 거치면 자연스러워집니다. |
| **Mixamo** (mixamo.com) | 무료(Adobe 계정). 리깅된 캐릭터 수십 종 + 걷기·서기 등 애니메이션. 내 모델 자동 리깅. | 걷기 애니메이션을 넣는 가장 쉬운 경로(5번 절차). |
| **MakeHuman** (makehumancommunity.org) | 무료 오픈소스 PC 프로그램. 나이·성별·체형 슬라이더로 사실적인 사람을 만들어 **노인·아이**도 만들 수 있음. 커뮤니티 에셋에 옷·머리카락 다수. | FBX 내보내기 → Mixamo 에 올려 리깅·걷기 → Blender 에서 GLB. 환자 유형별(`patient_elder_f.glb` 등) 모델을 만들기에 가장 적합. |
| **Sketchfab** (sketchfab.com) | CC 라이선스 무료 모델 검색. 검색어 예: `rigged nurse`, `elderly woman rigged`, `child rigged`, `doctor scrubs`. | Download → glTF(.glb). 라이선스(출처 표기 등) 확인 후 사용. |
| **Meshy / Tripo / Genspark** | AI로 사진·문장에서 3D 생성(무료 크레딧). 리깅은 없음. | GLB 내보내기 → Mixamo 자동 리깅 → Blender GLB. |
| **VRoid Studio** (vroid.com) | 무료. 애니메이션풍 캐릭터, 머리·옷 커스터마이즈가 쉬움. | VRM 으로 저장 → Blender(VRM 애드온)로 GLB 변환. 화풍이 만화풍이라 취향에 따라. |
| **Quaternius** (quaternius.com) | CC0 로우폴리 캐릭터 팩, Mixamo 호환 리깅·애니메이션 포함. | 단순한 스타일이지만 바로 쓸 수 있음. |

권장 조합: 치료사는 **Ready Player Me(머리카락·얼굴) → Mixamo(걷기)**, 환자 6종은 **MakeHuman(나이·성별) → Mixamo(리깅)**.

## 7. 지금 기본으로 쓰이는 공개 모델

파일을 넣지 않아도 아래 공개 모델(Quaternius Ultimate Animated Character Pack, **CC0**)이 자동으로 쓰입니다. 같은 팩의 다른 캐릭터(Suit, Worker, Chef, Kimono, Cowboy …)로 바꾸고 싶으면 관리자 설정의 해당 칸에 URL 을 넣으면 됩니다.

| 슬롯 | 기본 공개 모델 URL |
|---|---|
| 여자 치료사 | https://cdn.cinevva.com/assets/packs/quaternius/ultimate-animated-characters/Casual_Female.glb |
| 남자 치료사 | https://cdn.cinevva.com/assets/packs/quaternius/ultimate-animated-characters/Casual_Male.glb |
| 성인 여자 환자 | …/Casual2_Female.glb |
| 성인 남자 환자 | …/Casual2_Male.glb |
| 할머니 | …/OldClassy_Female.glb |
| 할아버지 | …/OldClassy_Male.glb |
| 여자아이 | …/Casual3_Female.glb |
| 남자아이 | …/Casual3_Male.glb |

같은 폴더에 있는 다른 파일: Suit_Female/Male, Worker_Female/Male, Chef_Female/Male, Kimono_Female/Male, Cowboy_Female/Male, Ninja_Female/Male, Viking_Female/Male, Casual_Bald, Pirate_Female, Witch, Goblin_Female/Male.
인터넷이 안 되거나 CDN 이 막히면 자동으로 내장 캐릭터로 돌아갑니다. `app/js/config.js` 의 `publicModels: false` 로 끌 수 있습니다.
