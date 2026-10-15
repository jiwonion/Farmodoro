# 조립형 C 캐릭터

> 옷입히기 실험 보관 문서. 현재 앱은 [대표 캐릭터와 영구 해금](farm-v3-characters.md)을 사용하며 이 렌더러와 부품 원화는 로드하지 않는다.

2026-10-15. 선택한 첫 A·B·C 시안의 C를 기준으로 만들었다. 사용자의 수정 지시에 따라 **몸체에 눈·코·입·머리·옷·신발을 그려 넣지 않는 방식**으로 바꿨다. 바탕은 얼굴과 의상이 없는 중성 인형 마네킹이며, 각각의 투명 PNG 부품을 합성한다.

## 최종 원화

OpenAI 내장 ImageGen으로 생성·편집했으며 CLI/API 키는 사용하지 않았다. PNG는 생성 결과와 알파 채널을 그대로 보관한다.

| 경로 | 구성 |
| --- | --- |
| `assets/farm-v3/avatar-mannequin-v1.png` | 옷·머리·얼굴 없는 몸체, 서기·앉기·낚시 자세 |
| `assets/farm-v3/avatar-face-parts-v1.png` | 눈 3쌍, 코 3종, 입 3종. 각 부품은 독립된 투명 영역 |
| `assets/farm-v3/avatar-hair-parts-v1.png` | 성별 표현 3종 × 머리 모양 3종. 얼굴과 몸체 없는 가발 부품 |
| `assets/farm-v3/avatar-clothes-parts-v1.png` | 상의·하의·신발 각각의 서기·앉기·낚시 부품 |
| `assets/farm-v3/collectibles-v1.png` | 기존 모자 8종과 물고기 |
| `docs/farm-character-c-reference.png` | 첫 C가 포함된 기준 시안 |

렌더링 순서는 몸체 → 신발 → 상의 → 하의 → 눈 → 코 → 입 → 머리 → 모자 → 낚싯대다. 몸체에는 옷이나 얼굴을 칠하지 않는다. 각 레이어는 128×160의 같은 좌표계에서 합성한다. 머리는 색상 분리용 보라색 원화이며 화면에서는 선택한 머리색으로 바뀐다. 피부색은 몸체·코, 옷 색은 해당 옷 부품만 바꾼다. 눈·입·머리 모양은 서로 영향을 주지 않는다.

생성 시트의 배치 차이는 `farm-v3-avatar.js`의 원본 자르기 영역과 기준점으로 맞춘다. 머리 9종은 균등 격자가 아닌 실제 부품 영역을 각각 잘라 옆 칸 조각이 들어오지 않게 한다.

- 몸체 3자세의 `bodyHeads`는 원화에서 잰 두피~턱 상자다. 마네킹 머리는 오른쪽을 보는 3/4 각도라 얼굴면(귀 오른쪽)의 중심은 머리 폭의 약 63% 지점이다.
- 가발 9종의 `hairAnchors`는 각 가발 얼굴 구멍의 가로 중심과 앞머리 아래 끝이다. 이 점을 머리 상자의 `layout.hairAt`에 맞춘다. 두피 중심이 아니라 얼굴 구멍을 기준으로 해서 가발이 얼굴면을 가리지 않는다.
- 눈·코·입은 상자에 맞춰 늘리지 않는다. 얼굴 원화 전체에 하나의 배율 `layout.faceScale`을 적용하고 각 부품의 중심을 `layout.eyes`·`nose`·`mouth` 위치에 둔다. 그래서 무표정 입이나 작은 코가 다른 부품보다 커지지 않는다.
- 눈 칸의 위쪽 경계는 원화의 반투명 눈썹 조각을 제외하도록 잘랐다. 모든 부품은 알파 96을 기준으로 완전 투명/불투명으로 나눠 생성 잔광을 지운다.
- 미세 조정은 `layout`의 [u,v] 값(머리 상자 기준 0~1)과 배율만 바꾸면 된다.

원본 PNG를 덮어쓰거나 미리 합쳐 저장하지 않는다. `FarmV3AvatarParts.layers()`는 몸체·눈·코·입·머리·상의·하의·신발·모자 각각의 투명 캔버스를 반환하며 `paint()`가 합성한다. 미리보기 캐시는 최대 128개다.

## 사용과 저장

- 눈·코·입·머리에는 각각 `없음` 선택이 있다. 상의·하의·신발도 각각 벗길 수 있다.
- `빈 마네킹`은 모든 얼굴·머리·옷·모자를 제거한 초안을 보여준다. `이 모습 저장`을 누르기 전에는 기존 저장을 바꾸지 않는다.
- `코디 세트`는 상의·하의·신발을 한 번에 같은 작업복으로 맞춘다. 개별 선택으로 해금된 다른 세트의 부품을 섞을 수 있다. 현재 의상 12종은 동일한 옷 모양의 색상 조합이다.
- 기존 성별 표현·피부색·머리색·의상·모자·공개 광장 참여 상태는 유지한다.
- 얼굴과 개별 의상 저장에는 [096_avatar_parts.sql](../supabase/migrations/096_avatar_parts.sql)이 필요하다. `095` 이후 적용한다. 새 카탈로그나 재화 지급은 없다.
- `096`은 기존 코디를 바탕으로 새 필드를 채우며 완료된 보관 기록과 Coin은 변경하지 않는다. 프로필 버전을 갱신해 오래 열린 편집 화면이 다른 선택을 덮어쓰지 않게 한다. 예전 클라이언트가 새 필드를 생략하면 기존 선택을 유지하고, 코디 세트를 바꿀 때는 해당 세트로 옷을 맞춘다.
- 모든 변경은 서버가 부품 범위와 의상 소유권을 확인한다. 공개 광장에는 저장된 부품 조합이 함께 반영된다.

`farm-v3-avatar.js?v=3`, `farm-v3-art.js?v=4`, `farm-v3-catalog.js?v=4`, 농장 CSS·뷰·컨트롤러 `v=3`, 서비스 워커 `farmodoro-v373`를 함께 배포한다. 이전 통짜 캐릭터 PNG는 보관용이며 현재 앱 캐시에 올리지 않는다. `v=2`의 비율·기준점 수정과 `v=3`의 얼굴면·가발 정렬 수정에는 추가 DB 변경이 없다.

## 검증

실제 로컬 PostgreSQL RPC와 Chrome에서 부품 선택·저장·재조회, 빈 마네킹, 모든 자세와 모자를 확인한다. 눈·코·입·머리색·상의·하의·신발을 하나씩 바꾸면서 해당 레이어의 픽셀만 바뀌는지도 비교한다. 서버 테스트는 잘못된 부품·미해금 의상 거부, 예전 클라이언트 호환, 기존 프로필 보완과 SQL 재실행을 확인한다.

`node tests/farm-v3-avatar-render.cjs`는 별도 계정 없이 Chrome으로 27가지 성별 표현·머리·자세 조합을 합성한다. 실제 `drawImage` 호출의 가로·세로 배율이 같은지, 눈·코·입이 몸체 위에 있고 머리 뒤에 전부 가려지지 않는지 확인한다. `output/farm-v3-avatar-registration.png`와 2배 확대 미리보기 `output/farm-v3-avatar-corrected.png`를 출력한다.

## 정확한 생성·편집 프롬프트

### 1. avatar-mannequin-v1.png

```text
Use case: precise-object-edit. Edit this three-pose mannequin sheet. REMOVE ALL CLOTHING AND SHOES: cyan shirts, blue overalls, straps, buttons, shorts, socks and brown boots. Replace the torso, limbs and feet with a smooth, completely FEATURELESS pale-peach TOY MANNEQUIN silhouette. This is an anatomically simplified plastic paper-doll base, not a nude human illustration: no anatomical details, no body contours or markings. Keep the exact same bald blank head, ears, poses, scale, camera, cell spacing, image aspect ratio and sprite positions. Left standing, center sitting hands on knees, right sitting fishing-grip pose. Preserve arm/hand placement; use plain rounded mitten hands and tiny rounded toy feet. Absolutely NO EYES, EYEBROWS, NOSE, MOUTH, HAIR, CLOTHES, SHOES OR ACCESSORIES. The face, torso and pelvis are entirely blank peach surfaces with only soft pixel shading. Maintain the reference C-style warm pixel outlines, big head and short limbs. Keep genuine transparent alpha background, three columns one row, no text or ground shadows. A blank unadorned mannequin base only.
```

### 2. avatar-clothes-parts-v1.png

```text
Use case: precise-object-edit / separated clothing layers. The supplied image has three columns: standing, sitting hands-on-knees, sitting fishing-grip. Extract ONLY CLOTHING as separate pixel-art paper-doll layers on genuine transparency. Make a portrait PNG with EXACT THREE COLUMNS and THREE ROWS, nine equal cells. Each cell preserves the coordinate system of its corresponding original full-body column: the invisible head area at the top stays EMPTY, garment position/scale matches the original body. FIRST ROW: only the cyan shirt for standing/sitting/fishing respectively; all blue overalls, skin, head, hands, legs and boots completely removed. Include the shirt's full cyan fabric torso underneath the overalls, cyan short sleeves and neck opening, no straps. SECOND ROW: only the blue short overalls including blue straps, bib, gold buttons and shorts for standing/sitting/fishing respectively; all cyan shirt, skin, head, hands, legs and boots removed to transparency. THIRD ROW: only the two brown boots for standing/sitting/fishing respectively, all other imagery removed. No skin pixels anywhere, no face/hair/head silhouettes, no placeholder mannequin. Do not center garments in their cells: keep natural original garment positions relative to a full-body mannequin (shirts in the lower middle, overalls below the head, boots at the bottom). Every column uses the exact camera and pose from the corresponding reference column so the layer will fit onto it. Warm C-style pixel art. Complete shapes with no adjacent-cell bleed, all items within cell boundaries. No labels, grid, text, scenery or shadows.
```

### 3. avatar-hair-parts-v1.png

```text
Production modular game sprite part. Reference is a comparison board: match ONLY the rightmost C character, soft cute pixel art and rounded ponytail. ONE transparent square PNG with EXACT 3 columns and 3 rows of HAIR-ONLY CUTOUT WIGS, nine equally spaced cells. No head, no skin, no ears, no face or body. The face opening is genuinely empty alpha transparency. Each wig is a U-shaped top cap and side hair around the same oval empty face opening, slightly facing right. Same head scale and opening alignment for all wigs. Columns short side-swept / rounded medium bob-wavy / tied ponytail. Rows masculine (fluffy short, medium wavy, low ponytail) / feminine (soft pixie, chin bob, C's exact high ponytail) / androgynous (soft cropped, rounded medium, loose ponytail). Magenta-purple hair source palette, clear pixel outlines, no other colors or objects. The app will tint this entire layer brown. NO GLOW, NO SHADOW, NO BACKGROUND, NO colored head placeholders. No labels, grid or text. All nine silhouettes must be fully inside their individual cells with transparent padding.
```

### 4. avatar-face-parts-v1.png

```text
Production modular face parts for C-style pixel farmer. Match ONLY rightmost C on the comparison board: warm large brown eyes and little smile. ONE genuine transparent square PNG of EXACT THREE ROWS and THREE COLUMNS, nine equally spaced cells with large blank padding. Only isolated feature pixels, absolutely no head, face skin patches, nose-face shading, hair or body. Row1 three PAIRS of eyes and simple eyebrows: left C's big warm brown round sparkling eyes; middle soft relaxed almond-round brown eyes; right happy closed eye arcs. Two eyes per cell, same spacing. Row2 three TINY NOSES: subtle peach-brown dot / small button nose curve / very short delicate angled line. No surrounding face shading. Row3 three SMALL mouths: C's tiny gentle curved smile / cheerful small open smile and tiny pink tongue / small calm horizontal neutral mouth. Keep noses and mouths naturally small rather than giant emojis. Warm brown pixel edges, clean legible isolated parts, clear transparent separation among cells. NO GLOW, NO SHADOW, NO BACKGROUND of any kind. No labels, no extra faces, grid lines, text or decorative objects.
```

### 5. avatar-clothes-parts-v1.png

```text
Precise cleanup edit of this modular clothing parts atlas. Remove ALL colored glow, haze and background pixels around the clothing. Every non-garment pixel must be genuinely transparent alpha 0. Keep only crisp opaque pixel-art garment shapes and their dark outlines, with at most a one-pixel edge. Preserve the exact clothing shapes, colors, sizes, positions, 3 columns x 3 rows layout. Row1 cyan shirts, row2 blue overalls, row3 brown boots. Do not add any human body, face, skin, hanger, mannequin or decoration. Do not move or resize items. Do not fill empty transparent spaces. No glow, no shadow, no lighting effect, no dark background, no backdrop gradient. Production paper-doll overlay PNG with clean alpha transparency.
```
