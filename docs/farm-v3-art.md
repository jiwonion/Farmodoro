# 농장 v3 그림 기록

현재 캐릭터는 [대표 캐릭터와 영구 해금](farm-v3-characters.md)을 따른다. 멍한 점눈의 슬라임·친구 8종을 완성된 그림으로 표시한다. 최종 원화 파일 위치와 생성·눈 편집 프롬프트는 해당 문서에 보관한다. [조립형 C 캐릭터](farm-v3-avatar-parts.md)와 아래 사람 캐릭터 원화는 실험 보관 기록이며 현재 앱에서 사용하지 않는다.

2026-10-15. OpenAI 내장 ImageGen으로 PNG 3장을 생성했다. 생성 PNG는 그대로 보관하며 웹에서는 배경 위치·캔버스 자르기·팔레트 변경으로 사용한다. 기존 작물·장식 PNG도 재사용한다.

| 저장 파일 | 용도 |
| --- | --- |
| `assets/farm-v3/worlds-v1.png` | 2172×724, 농장·낚시터·광장 가로 3패널 |
| `assets/farm-v3/avatars-v1.png` | 724×2172, 투명 배경의 서기·앉기·낚시 캐릭터 |
| `assets/farm-v3/collectibles-v1.png` | 투명 배경 4×4, 어종 8종과 모자 8종 |

캐릭터 요청은 9행이었지만 결과에는 8개 행이 그려졌다. `farm-v3-art.js`가 투명 여백으로 실제 행을 탐지하고 `[0,1,2,3,4,5,6,1,7]` 매핑으로 9가지 성별 표현·머리 선택을 연결한다. 일부 기본 몸체를 공유하고 피부·머리·옷 색은 런타임에 바꾼다. 별도 9종 원화가 있다는 의미는 아니다. 작물은 `farm-v3-crop-art.js`를 통해 기존 도트 PNG를 재사용한다.

## 생성 프롬프트

렌더러 v2는 위 원본 PNG를 계속 사용한다. 사용자 참고 이미지의 묶은 머리·크림 작업복을 추천 코디로 제공하며 기본 피부·갈색 머리는 원화 색과 얼굴 명암을 유지한다. 다른 팔레트를 선택했을 때만 해당 영역을 바꾸고, 어두운 머리와 얼굴을 넓은 갈색 조건으로 함께 칠하던 처리는 제거했다. 캐릭터 종횡비는 유지한다. 맵 역시 정사각형을 가로로 늘리지 않고 한 패널 724px 이내에서 표시한다. 새 원화를 생성하거나 기존 PNG를 덮어쓰지 않았다.

### worlds-v1.png

```text
Use case: stylized-concept. Production game background atlas for Farmodoro, cozy richly detailed pixel art with deliberate square pixel edges, same friendly feel as a high quality farming RPG but original artwork. ONE opaque landscape image, exact THREE columns and ONE row of equally sized SQUARE scenes, no gutters, each scene about 1024px square, overall 3:1 aspect ratio. No text, UI, characters, animals, crops or baked-in soil beds. Consistent elevated three-quarter camera, consistent scale and warm lighting.
LEFT SQUARE: FARM. A forest-edge garden clearing with a small blue-roof cottage confined to upper right, trees and fences around the perimeter, tiny flowerbeds and stone path edges. Keep the central 65% almost empty low-contrast grass/earth for a separate 2 by 2 grid of four large soil beds. Absolutely no planted crops or farming plots in this image. A small open area at lower left for a farmer and unlocked sign.
MIDDLE SQUARE: FISHING POND. A clear blue pond with reeds, lilies and rocks, rustic wooden fishing dock protruding from the LEFT lower side into the middle. Dock clear of people with a usable seated-avatar spot at approximately 30% across and 67% down. Lush banks around the perimeter, water dominates the right half. No fishing rods or fish icons.
RIGHT SQUARE: VILLAGE PLAZA. A friendly pixel village square with pale stone paving and tree-lined flower borders, shop facades only at the top edge, benches around the perimeter, large open central stone space for independently drawn avatars. Several visually clear empty standing and bench sitting spots, no people. No fountain in the center, keep it open. All scenery must align naturally with overlaid independent pixel avatars. No 3D, watercolor, typography, labels, grids, adjacent-panel bleed or visible dividing lines.
```

### avatars-v1.png

```text
Use case: stylized-concept. Production customizable PIXEL CHARACTER SPRITE ATLAS for Farmodoro. Genuine transparent RGBA background, no painted checkerboard. EXACT invisible grid of THREE columns and NINE rows, square cells, overall portrait aspect 1:3, ideally 1024x3072. Every cell holds exactly ONE full-body cute compact farmer sprite, no props outside its cell. All figures face front with a slight three-quarter orientation and use identical head sizes and pixel scale. Put heads at the same horizontal center, with all cells aligned to the same foot baseline and consistent body size. Use crisp deliberate small square pixels and restrained 3-tone shading, original cozy RPG style, no blur. Generous transparent padding around each sprite.
COLUMNS are poses: column 1 STANDING arms relaxed; column 2 SITTING on an invisible bench knees bent with feet pointing forward; column 3 FISHING, seated knees bent with hands forward holding an invisible fishing rod. Do NOT draw chairs, benches or rods.
ROWS are appearance presets: rows 1-3 masculine-presenting adult farmer, respectively short hair, medium wavy hair, long tied hair; rows 4-6 feminine-presenting adult farmer, respectively short pixie hair, chin-length bob hair, long tied hair; rows 7-9 androgynous adult farmer, respectively short hair, medium wavy hair, long tied hair. Every row is the same character in its three poses. All wear the SAME plain LIGHT CYAN shirt with no graphics, dark BLUE trousers or overalls, brown shoes. All have the SAME LIGHT PEACH skin and DARK BROWN hair so the application can palette-swap skin, shirt and hair colors. No hats, hair accessories or jewelry. Do not vary clothing colors between characters. Friendly readable pixel faces, nonsexualized proportionate adult chibi characters, no enormous heads, no portraits, no labels, text, grid lines, shadows outside the tiny feet, background or extra sprites.
```

### collectibles-v1.png

```text
Use case: stylized-concept. Production PIXEL ICON ATLAS for a cozy farming/fishing game, real transparent RGBA background. EXACT FOUR columns by FOUR rows, sixteen square cells, generous padding, centered isolated object in each cell, consistent pixel scale, crisp square pixel edges and restrained shading. Landscape or square canvas with equal square cells; no labels or grid.
Row 1, left to right: a silver minnow fish facing left; a golden crucian carp fish; a gray-green common carp; a blue trout fish.
Row 2: a dark catfish; a bright orange koi fish; a yellow perch fish; an elegant pale pink salmon fish. Fish are attractive recognizable small item icons, no water or plates.
Row 3: a straw farmer hat; a red baseball cap; a green bucket fishing hat; a cream beret. Headwear front three-quarter view, no heads, all items same size and facing same direction for compositing above a pixel character head.
Row 4: a navy beanie; a small golden crown; a pastel pink flower hair wreath; a brown explorer hat. Same headwear alignment.
Match the warm high-quality pixel farming RPG aesthetic. No gradients or glossy 3D, no actual people, no background shapes or checkerboard, no extra icons, no watermark, no shadows crossing cell edges.
```
