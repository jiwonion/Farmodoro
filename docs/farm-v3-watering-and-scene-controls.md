# 물주기 제거 · 맵 안 조작 · 낚시 모습

2026-10-15. 최신 동작과 배포 기준. 기존 광장·작물 경로는 [광장 문서](farm-v3-plaza.md)를 따른다.

## 농장 성장과 물주기 제거

씨앗 비용과 심기는 계속 무료다. 심은 작물은 1 Coin 또는 최대 5 Coin씩 사용해 성장시키고 다 자라면 수확한다. 물주기 버튼·대기 시간·물주기 갱신 타이머는 제거한다. 시간 자동 성장과 시들기는 추가하지 않는다.

[104 마이그레이션](../supabase/migrations/104_remove_farm_watering.sql)은 서버의 물주기 동작도 중단한다. 기존에 심은 작물·성장도·수확 가능 상태와 도감·해금·대표 친구·지갑은 보존한다. 이전 물주기로 얻은 성장도를 되돌리거나 Coin을 차감하지 않는다. 과거 물주기 기록과 성공한 요청 기록도 삭제하지 않는다.

상태 응답은 `wateringVersion:0`, 각 진행의 `waterReadyAt:null`을 반환한다. 물주기 RPC는 기존 요청의 재실행 처리보다 먼저 `FARM_V3_WATERING_RETIRED`로 거부하므로 과거 요청 ID를 사용해도 새로 성장하지 않는다.

현재 화면은 물주기를 지원하는 이전 서버에서도 물주기 조작을 표시하지 않는다. 오래 열린 이전 클라이언트의 물주기 실행까지 막으려면 서버에 `104`를 적용해야 한다. Coin 성장·수확·낚시와 해당 요청들의 재확인 흐름은 유지한다.

## 화면 조작

- 선택한 밭의 1 Coin·한 번에 Coin 사용·수확 버튼을 농장 맵 안 하단에 표시한다.
- 낚시 진행·물고기 받기도 낚시터 맵 안에 표시한다. 맵 아래의 별도 진행 패널은 제거했다. 시작 전 작물·물고기 선택 목록은 유지한다.
- 모바일 버튼은 높이 44px 이상이며 밭·아래 이름표가 조작 패널에 가리지 않도록 배치한다.
- 밭 선택 테두리와 키보드 포커스 테두리도 흙 중심 52.1%를 기준으로 맞춘다. 별도로 겹쳐 보이던 브라우저 포커스 외곽선은 같은 테두리로 통합한다.

## 낚시 이미지

[assets/farm-v3/mascots-fishing-v1.png](../assets/farm-v3/mascots-fishing-v1.png)는 기존 친구 8종의 완성된 낚시 모습이다. 추가 친구 8종은 [확장 원화 문서](farm-v3-expansion-art.md)를 따른다. 원래 모습은 별도로 보관한다. 낚시를 시작하면 현재 대표 친구의 낚싯대·줄·찌가 포함된 그림으로 바뀐다. 물결과 작은 움직임, 낚시 중/입질 표시를 함께 보여준다. 움직임 줄이기 설정을 존중한다. 광장의 자세 선택은 다시 추가하지 않는다.

원화와 동일한 4열×2행 순서이며 각 셀 전체를 같은 배율로 맞춰 256×192 캔버스에 표시한다. 머리·얼굴·몸·낚싯대를 따로 늘이거나 조립하지 않는다. 투명 배경을 유지한다.

내장 image_gen으로 기존 PNG를 참조해 새 낚시 원화를 생성했다. CLI는 사용하지 않았다. 생성 원본은 C:/Users/wlfhd/.codex/generated_images/01a13cce-9e65-7e33-99e3-3171e0146d96/exec-87cbd692-7319-4975-9a1a-a10740d0c832.png이며 프로젝트의 위 경로로 복사했다.

### 최종 프롬프트

```text
Use case: identity-preserve. Asset type: production transparent PIXEL ART FISHING POSE SPRITE ATLAS for Farmodoro.
Image 1 is the exact character identity and pixel style reference, showing eight existing mascots in a 4-column, 2-row grid. Create one NEW atlas with exactly the SAME four columns and two rows, in the SAME order: row 1 sprout green slime, aqua droplet slime, strawberry pink slime, red-cap cream mushroom friend; row 2 cream jelly cat, lilac-white cloud puff, purple star slime, gold crowned slime.
Every cell must contain ONE COMPLETE existing mascot now visibly fishing: seated or settled at the LEFT lower part of its cell, facing slightly right, a small rounded hand holding a wooden fishing rod extending diagonally UP AND RIGHT, a visibly curved fishing line dropping from the tip to one little red-and-white bobber on the lower RIGHT. Draw the whole mascot + rod + line + bobber together as ONE finished sprite in each cell. Keep rod and line readable at small game size. No detached body parts.
Preserve each mascot's exact colors, body shape, identifying sprout/star/crown/mushroom cap/ears, blush and wonderfully simple slightly vacant solid dark dot eyes WITHOUT eye shine. Same cute warm textured crisp pixel-art rendering as reference, no human features or clothes. No wide sparkly anime eyes. All eight groups share the same placement, scale and fishing rod orientation. Keep the mascot body substantial, around 40 percent of each cell width; rod group can use 80 percent of cell width. Generous transparent padding around every cell. Absolutely no crossing the invisible cell boundaries.
Genuinely transparent RGBA background, not black, not checkerboard. No pier, water, scenery, text, labels, grid lines, frames or UI. All the sprites must be fully inside their cells, including the full fishing line and bobber. Landscape atlas overall 2:1 with equally sized square cells.
```

## 반영

103까지 적용된 DB에는 [104 물주기 제거 SQL](../supabase/migrations/104_remove_farm_watering.sql)만 적용한다. 단계가 다르면 094 이후용 [095~104 통합 업그레이드 SQL](../supabase/operations/2026-10-15-upgrade-farm-v3.sql)을 사용한다. 운영 DB 적용과 웹 배포는 별도 작업이며, 이 작업에서는 운영 DB를 변경하지 않았다.

CSS v18, 캐릭터 렌더러 v5, 공용 그림 v9, 메인 뷰 v12, 컨트롤러 v12, 앱 v342, 서비스 워커 farmodoro-v391. 낚시 atlas도 앱 캐시에 포함한다. 생성기는 098→099→100→101→102→103→104 순으로 이어지며, 역사적 102는 당시의 물주기 동작을 보관하고 최종 104에서 이를 중단한다.

## 검증

- `tests/farm-v3-watering-sql.cjs`는 역사적 102 동작 검증을 보관한다.
- `tests/farm-v3-no-watering-sql.cjs`: 103→104 업그레이드와 최신 통합 SQL에서 물주기 중단·과거 요청 ID의 물주기 거부·기존 성장도와 기록 보존·무료 심기·Coin 성장·수확·낚시·재시도를 검사한다.
- `tests/farm-v3-client.test.cjs`: 물주기 기능이 있는 이전 서버에서도 조작·대기 시간·갱신 타이머 제거, Coin 성장·재시도·잘못된 응답 거부.
- `tests/farm-v3-ui-smoke.cjs`: 실제 RPC와 Chrome에서 물주기 제거, 무료 심기, Coin·수확·물고기 받기의 맵 내부 배치, 낚시 그림, 테두리 정렬, PC·모바일 동작을 검사한다.
