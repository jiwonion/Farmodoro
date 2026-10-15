# 대표 캐릭터와 영구 해금

2026-10-15. 캐릭터 옷입히기를 중단하고 완성된 슬라임·친구 중 대표를 고르는 방식으로 변경했다. 103 마이그레이션에서 친구 8종을 더해 현재 16종이다. [어종별 해금 경로](farm-v3-fish-paths.md)와 함께 적용하며 광장 위치·농장 진입 호환은 [광장 위치 문서](farm-v3-plaza.md)를 따른다. 기존 8종 원화는 아래 멍한 점눈 버전을 유지한다.

## 캐릭터

| ID | 이름 | 자동 해금 조건 |
| --- | --- | --- |
| `sprout-slime` | 새싹 슬라임 | 기본 제공 |
| `aqua-slime` | 물방울 슬라임 | 물고기 획득 10회 |
| `berry-slime` | 딸기 젤리 | 작물 수확 25회 |
| `mushroom` | 버섯 친구 | 작물 수확 60회 |
| `jelly-cat` | 젤리 고양이 | 작물 수확 120회 |
| `cloud-puff` | 구름 친구 | 작물 수확 100회 **및** 물고기 획득 60회 |
| `star-slime` | 별빛 슬라임 | 물고기 획득 150회 |
| `royal-slime` | 왕관 슬라임 | 작물 수확 300회 **및** 물고기 획득 200회 |
| `peach-slime` | 복숭아 젤리 | 작물 수확 40회 **및** 작물 8종 수집 |
| `fox-puff` | 여우 친구 | 작물 수확 80회 **및** 물고기 획득 20회 **및** 작물 12종 수집 |
| `lotus-slime` | 연꽃 슬라임 | 물고기 획득 45회 **및** 어종 8종 수집 |
| `moon-bunny` | 달토끼 | 작물 수확 160회 **및** 물고기 획득 80회 **및** 작물 18종·어종 10종 수집 |
| `honey-bear` | 꿀곰 | 작물 수확 220회 **및** 작물 24종 수집 |
| `crystal-slime` | 수정 슬라임 | 물고기 획득 240회 **및** 어종 16종 수집 |
| `snow-penguin` | 눈꽃 펭귄 | 작물 수확 280회 **및** 물고기 획득 160회 **및** 작물 30종·어종 18종 수집 |
| `dragon-sprout` | 새싹 용 | 작물 수확 450회 **및** 물고기 획득 300회 **및** 작물 40종·어종 24종 수집 |

- 기존 누적 도감 기록도 조건에 포함하며 새 수확·획득 직후 서버가 해금한다. 이미 해금한 친구는 강화된 조건에서도 유지한다.
- 해금과 대표 선택은 별도 Coin을 쓰지 않는다. 작물 성장·낚시 진행에 드는 Coin 규칙은 그대로다.
- 잠긴 친구는 조건과 진행도를 보여주며 선택할 수 없다. 서버도 미해금·알 수 없는 ID를 거부한다.
- 카드를 고르면 초안만 바뀐다. `대표 캐릭터로 선택`을 눌러야 저장하며 `되돌리기`는 저장된 선택을 보여준다.
- 저장한 대표가 농장·낚시터·오늘 농장 미리보기·집중 배경·참여한 공개 광장에 표시된다.
- 광장은 참여한 사용자의 저장된 닉네임·대표 ID·위치를 조회한다. 실시간 접속 정보는 없다.
- 캐릭터마다 완성된 기본 그림과 낚시 그림을 표시한다. 낚시 진행 중에는 낚싯대·찌가 포함된 그림으로 바뀌며 광장에서는 반복해서 가볍게 뛴다. 광장을 눌러 내 위치를 고르고 저장한다.
- 성별·피부·얼굴·머리·옷·모자 편집 화면과 신규 코디 해금은 제거했다. 기존 avatar JSON과 옷·모자 보유 기록은 DB에 남아 있다.

## 파일과 렌더링

최종 원화: [assets/farm-v3/mascots-v1.png](../assets/farm-v3/mascots-v1.png). 내장 ImageGen으로 생성한 뒤 눈만 편집했다. CLI/API 키를 사용하지 않았다. 원본 알파와 PNG를 그대로 복사해 보관한다.

시트는 4열 × 2행이다. 순서는 위 표와 같다. `farm-v3-character-art.js`는 각 칸의 불투명 경계를 읽고 **캐릭터 전체에 동일 배율 하나**를 적용해 128×160 캔버스 안에 표시한다. 얼굴·몸·장식을 따로 늘리거나 눈 좌표를 추정하지 않는다.

- `farm-v3-catalog.js`: ID·그림 인덱스·조건. `legacyItems`는 095 시드 재생성 호환용이며 실제 목록에는 옷·모자를 넣지 않는다.
- `farm-v3-character-art.js`: 완성 그림 자르기·원본 비율 합성.
- `farm-v3-characters-view.js`: 선택·미리보기·해금 진행도·농장 장식.
- `farm-v3-art.js`, `farm-v3-views.js`, `farm-v3.js`: 화면 전체 표시와 요청 저장·복구.
- `097_representative_characters.sql`: 카탈로그, 대표 ID, 해금·선택 검증, 공개 광장.
- `scripts/build-farm-v3-characters-sql.cjs`: 처음 8종의 역사적 097 생성. 신규 8종은 103에서 추가하며 095~097 시드의 목록을 바꾸지 않는다.

## 적용과 호환

`095` → `096` → `097` → `098` 순서다. 현재는 [098 또는 통합 업그레이드 SQL](farm-v3-plaza.md)을 적용한다. 로컬 검증에서는 격리된 DB에만 적용했고 운영에는 적용하지 않았다.

097은 기존 프로필에 새 대표 ID를 보완하고 버전을 한 번 갱신한다. Coin·Farm Money·농사/낚시 진행·도감·풍경·기존 코디를 변경하지 않는다. 새 대표 선택에는 기존 프로필 버전 검사·소유권·요청 ID 복구 규칙을 사용한다. 예전 옷입히기 요청은 `FARM_V3_AVATAR_RETIRED`로 거부하며 미확인된 예전 요청도 재확인 후 정리할 수 있다. 새로운 클라이언트는 `charactersVersion:1`을 확인한다.

함께 배포할 버전: 캐릭터 그림 모듈·선택 화면 `v=2`, 광장 화면 `v=1`, 카탈로그·공용 그림 `v=6`, CSS·뷰·컨트롤러 `v=5`, 서비스 워커 `farmodoro-v374`. 사람 부품 렌더러와 원화는 보관용이며 앱/서비스 워커에서 로드하지 않는다.

## 검증

- `tests/farm-v3-characters-sql.cjs`: 기존 프로필 이관, 실제 수확·낚시 해금, 조건 AND, 음수 Coin에서도 무료 선택, 미해금/잘못된 ID 거부, 버전 충돌, 중복 요청, 공개 광장, 기존 기록 보존, RLS, 재적용.
- `tests/farm-v3-client.test.cjs`: 선택 초안·저장·충돌·계정 전환·요청 복구와 예전 코디 요청 정리.
- `tests/farm-v3-ui-smoke.cjs`: 실제 Chrome + 로컬 PostgreSQL RPC로 캐릭터 선택·저장·재조회, 16종 표시·낚시·광장·320~2560px 화면, 오늘·집중 미리보기.
- `tests/farm-v3-expansion-ui.cjs`: 물고기 24종과 캐릭터 16종의 기본·낚시 그림, 어종별 해금과 진행도, 물결 위치·겹침, PC·모바일 화면 검증.
- `tests/farm-v3-sql.cjs`: 095·096 당시 데이터 구조 호환 검사. 현재 캐릭터 렌더링 품질 검사는 아니다.

## 정확한 프롬프트

### 내장 ImageGen: 원본 시트 생성

```text
Use case: stylized-concept.
Asset type: ONE production PNG character atlas for a cozy pixel-art farm and public plaza game. A complete atlas with EIGHT standalone original mascot characters, precisely FOUR columns and TWO rows, one complete mascot centered in each equal cell. All characters are full finished sprites, no separate facial/clothing parts.
Style: extremely cute rounded pixel-art creatures, warm dark-brown pixel outlines, restrained 16-bit shading, bright expressive dark eyes with one tiny highlight, little blush cheeks, tiny smiling mouths. Compact squat silhouettes, welcoming and cuddly, readable at 48 pixels tall. Matching art direction and camera for every cell: front-facing with only a very slight three-quarter turn to the right, ground-level game sprite view. Crisp stepped pixel edges and opaque bodies. No human characters.
Exact order left to right:
Top row 1: apple-green jelly slime, low rounded gumdrop body, two small fresh leaves sprouting on top, happy little face.
Top row 2: clear sky-blue water droplet slime, rounded bottom and one soft droplet tip, tiny side fins, happy face.
Top row 3: pink strawberry jelly slime, heartlike round body with little pale seeds and a tiny green strawberry leaf crown, happy face.
Top row 4: little cream mushroom creature with a warm terracotta-red spotted cap, two tiny rounded feet and a cute face on its short stem.
Bottom row 1: soft cream jelly cat creature, rounded marshmallow body, small triangular cat ears, tiny paws and curled tail, cute kitty face.
Bottom row 2: fluffy white cloud creature with a pale lavender shadow edge and two tiny feet, pink cheeks and smile.
Bottom row 3: deep periwinkle-purple jelly slime with a small golden five-point star nestled on its head, a few little star speckles on its rounded body, sleepy sparkling eyes.
Bottom row 4: golden honey jelly slime with a small three-point gold crown with one rose gemstone, little rounded body, proud sweet smile.
Composition: every mascot around the same overall visual scale, fully contained in its cell with generous transparent padding, maximum 68% cell width and height. Exactly 8 mascots, no extras, no stray objects between cells. One body and one face per mascot. Do not repeat the same creature in multiple cells.
Background: genuinely transparent alpha, no checkerboard painted into image, no scenery, no ground, no cast shadows, no glow or haze, no text, labels, numbers, grid lines, watermark or borders. All eight sprites must be visually separate for slicing by the equal cell boundaries. Landscape image.
```

### 내장 ImageGen: 눈만 편집

편집 대상은 바로 위 생성 결과이며 최종 출력이 `mascots-v1.png`다.

```text
Use case: precise-object-edit. Edit ONLY THE EYES on all eight mascots in this existing transparent pixel-art atlas. Make their eyes adorably dopey, vacant and silly: two MUCH SMALLER solid dark-brown dot eyes, spaced a little wider apart, a blank unthinking stare. Remove ALL eye highlights, shiny pupils, irises, eyelashes and eyebrows. Each eye is a tiny simple dark oval/dot, roughly one third of the original eye area. The vibe is a sweet little creature with absolutely no thoughts in its head, endearingly clueless, not sad or mean. Keep eyes naturally aligned with each original face and mouth. Preserve every other pixel as closely as possible: the exact same eight bodies, silhouettes, colors, leaf/strawberry/mushroom/cat/cloud/star/crown details, blush, original mouths, outlines, shading, positions, cell layout, overall image dimensions, transparency and camera. Do not change mouths or body highlights. Exactly the same 4 columns x 2 rows atlas. Genuine transparent alpha background, no glow, scenery, text, grid or extra objects.
```
