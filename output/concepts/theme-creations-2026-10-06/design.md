# 테마별 대상을 하나씩 완성하기 — 시안

2026-10-06, Asia/Seoul. 사용자가 요청한 논의용 시안이다. 아래 규칙과 가격은 제안이며 실제 앱 구현이나 운영 경제에 적용한 값이 아니다.

## 시안

[시안 원본](concept-board.png)

왼쪽은 바다 테마의 분홍 산호 성장 중 화면, 오른쪽은 눈 테마의 눈사람 완성 화면이다. 같은 기능의 서로 다른 상태를 비교하는 보드이며 실제 화면에서는 진행 중인 대상 하나만 표시한다. 아래는 바다 테마의 종류 선택·해금 창이다. 기존 배경 그림의 작은 집, 산책길, 부드러운 픽셀 표현과 현재 앱의 흰색·파란색 UI를 참고했다.

## 공통 흐름

할 일·습관·집중 → Coin 획득 → 현재 대상에 Coin 사용 → 단계별 모습 변화 → 완성 보상으로 Farm Money 획득 → 새로운 종류 영구 해금 → 다음 대상 시작.

1. 보유 테마에서 해금된 종류 하나를 골라 시작한다. 각 보유 테마에는 기본 종류를 무료 제공한다.
2. 동시에 진행하는 대상은 전체에서 하나다. Coin을 사용하면 진행량이 증가하고, 몇 개의 시각적 단계에 걸쳐 모습이 달라진다. 성장 외에 별도의 돌보기 절차는 두지 않는 방향을 제안한다.
3. 완성되면 보상 받기 버튼으로 이번 회차의 Farm Money를 받는다. 완성 기록에는 대상 종류, 최종 모습, 완성 횟수를 남긴다.
4. Farm Money로 새로운 종류를 한 번 해금하면 이후 계속 고를 수 있다. 이미 해금한 종류를 다시 만드는 데 해금 비용은 추가로 들지 않는다.
5. 종류별 Coin 대비 보상 효율을 비슷하게 맞추어 원하는 외형을 고를 수 있게 한다. 시안의 성장 20 Coin, 완성 보상 50 Farm Money, 새 종류 해금 100 Farm Money는 설명용 예시다. 구현 가격은 사용자 피드백을 반영해 영구 해금 300 Farm Money로 조정했다. 아래 이미지 생성 프롬프트는 최초 시안 제작 기록으로 보존한다.

## 테마와 대상

| 테마 | 기본 예시 | 추가 종류 예시 |
| --- | --- | --- |
| 바다 | 기본 산호 | 분홍 산호, 모래성 |
| 눈·얼음 | 눈사람 | 눈 토끼, 얼음 조각 |
| 초원·봄 | 작은 나무 | 벚꽃나무, 꽃나무 |
| 밤·우주 | 작은 별 | 별자리, 작은 행성 |

테마마다 같은 화면 구조와 완성 규칙을 사용하고 배경·대상·단계별 그림을 바꾼다. 종류 선택 창은 진행 중에도 열람과 영구 해금이 가능하며, 새로운 대상을 시작하는 것은 현재 회차가 끝난 뒤다. 진행 중인 대상의 종류·장면·진행량은 한 쌍으로 보존하고 새로 고른 테마는 다음 회차부터 적용하는 방향을 제안한다.

## 생성 정보

내장 image_gen 도구로 생성했다. 참조 이미지: assets/garden-v4/fantasy-atlas.png (그림·테마 분위기), output/focus-default-ocean-desktop.png (UI 스타일). 원본 생성 파일을 복사했으며 원본은 유지했다.

### 실제 생성 프롬프트

```text
Use case: ui-mockup.
Asset type: one high fidelity concept board for the existing Farmodoro productivity app, in Korean. Landscape canvas approximately 2400x1600, 3:2 aspect.
Primary request: redesign the rewards area around ONE active creation at a time, with Coin earned through productive work advancing it and Farm Money permanently unlocking new creation types. Show two alternative theme views of the SAME single-slot feature, not two simultaneous creations, and a compact unlock picker below.
Input images: Image 1 is a STYLE AND THEME reference atlas only. Its upper-right coastal scene and lower-right icy scene provide the gentle painterly pixel texture, foliage, cottage, path and atmosphere. Image 2 is a UI STYLE reference only: restrained white panels, navy Korean sans-serif text, clear royal-blue accents. These are references, not images to reproduce unchanged. Generate a new finished concept board.
Composition: off-white background, generous spacing, polished clear UI typography. Small header at top "Farmodoro · 내 풍경", right two compact currency pills "12 Coin" and "120 Farm Money". Below are two equally large side-by-side cropped app screens with identical UI geometry. Above left small label "바다 · 성장 중"; above right "눈 · 완성". These demonstrate alternate states.
LEFT screen: clean small header "분홍 산호". Main picture occupies most of screen: beautiful sunny turquoise coastal cove in the exact cute gentle painterly pixel language of the atlas. Small coastal cottage tucked upper left, leafy border and sandy walking path, an intimate clear shallow turquoise lagoon centered in the scene containing ONE large focal branching pink coral in its middle growth stage, readable beautiful silhouette. The coral should dominate the scene and be obviously the creation. No farm plots or other creations. Below picture a simple status area with the exact text "성장 14 / 20", a 70 percent filled blue progress bar, a clear blue primary button "1 Coin으로 키우기", and a small secondary control "종류 고르기".
RIGHT screen: same geometry, header "눈사람". Main picture: magical quiet cream-white snowy garden with pale blue ice, snow-touched evergreen borders, small matching cozy cottage upper left and curved path, using the reference icy scene atmosphere. ONE large adorable completed snowman focal subject centered, scarf, twig arms, warm gentle expression, small celebratory sparkle. No extra snowmen or crop beds. Below picture exact text "완성!", a 100 percent filled blue progress bar, clear primary button "보상 받기 · +50 Farm Money", small secondary "다음 대상 고르기".
LOWER section spanning width: compact picker titled "바다에서 만들기". Three evenly spaced restrained white product cards with charming matching painterly pixel thumbnails: "기본 산호" with status "해금됨"; "분홍 산호" with status "해금됨" and a fine blue selected outline; "모래성" with an outlined button "해금 · 100 Farm Money". Small note below the section, exact Korean "한 번 해금하면 계속 선택할 수 있어".
Art/UI balance: scene artwork richly appealing and immersive; controls and labels calm and functional with good contrast. No annotations over focal objects. All Korean text must be large, crisp, spelled exactly and legible. Consistent scene scale and composition on both screens, single object center stage. Preserve the existing app's gentle garden/cottage art identity while ocean coral and snowman express the expanded concept. Not a marketing landing page, no smartphone frame, no people, no kitchen, no inventory, no crop grid, no timers, no new currencies, no clutter, no extra paragraphs or arbitrary text.
```
