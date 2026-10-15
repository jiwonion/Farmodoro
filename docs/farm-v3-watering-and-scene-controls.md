# 물주기 · 맵 안 조작 · 낚시 모습

2026-10-15. 최신 동작과 배포 기준. 기존 광장·작물 경로는 [광장 문서](farm-v3-plaza.md)를 따른다.

## 물주기

작물을 심으면 즉시 한 번 무료 물주기가 가능하고, 같은 작물에는 그 이후 5시간마다 다시 사용할 수 있다. 예전 농사의 방식을 따라 새로 심으면 첫 물주기를 다시 허용한다. 물 한 번은 성장 +1이며 Coin·Farm Money를 쓰거나 지급하지 않는다. 잔액이 0 또는 음수여도 가능하다. 다 자란 작물과 물고기에는 물을 줄 수 없다.

서버가 현재 시각과 마지막 물주기를 검사한다. last_watered_at은 작물 진행 기록에 보관하며 물주기·Coin 성장은 기존 계정별 작업 잠금과 영구 요청 ID를 공유한다. 재시도·연속 클릭으로 두 번 성장하지 않는다. 5시간 경계는 정확히 도달하면 허용한다. 시들기와 시간 자동 성장은 없다.

상태 응답은 wateringVersion:1, serverNow, runs[].waterReadyAt을 제공한다. 클라이언트는 서버 시각 차이를 반영해 남은 시간을 표시하고 30초 간격으로 갱신한다. 이전 서버는 농사와 낚시를 계속 제공하며 물주기 버튼만 표시하지 않는다.

## 화면 조작

- 선택한 밭의 물주기·1 Coin·한 번에 Coin 사용·수확 버튼을 농장 맵 안 하단에 표시한다.
- 낚시 진행·물고기 받기도 낚시터 맵 안에 표시한다. 맵 아래의 별도 진행 패널은 제거했다. 시작 전 작물·물고기 선택 목록은 유지한다.
- 모바일 버튼은 높이 44px 이상이며 밭·아래 이름표가 조작 패널에 가리지 않도록 배치한다.
- 밭 선택 테두리와 키보드 포커스 테두리도 흙 중심 52.1%를 기준으로 맞춘다. 별도로 겹쳐 보이던 브라우저 포커스 외곽선은 같은 테두리로 통합한다.

## 낚시 이미지

[assets/farm-v3/mascots-fishing-v1.png](../assets/farm-v3/mascots-fishing-v1.png)는 기존 친구 8종의 완성된 낚시 모습이다. 원래 모습은 별도로 보관한다. 낚시를 시작하면 현재 대표 친구의 낚싯대·줄·찌가 포함된 그림으로 바뀐다. 물결과 작은 움직임, 낚시 중/입질 표시를 함께 보여준다. 움직임 줄이기 설정을 존중한다. 광장의 자세 선택은 다시 추가하지 않는다.

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

101까지 적용된 DB에는 [102 물주기 SQL](../supabase/migrations/102_farm_free_watering.sql)을 적용한다. 단계가 다르면 094 이후용 [통합 업그레이드 SQL](../supabase/operations/2026-10-15-upgrade-farm-v3.sql)을 사용한다. 운영 DB에는 아직 적용하지 않았다.

CSS v11, 캐릭터 렌더러 v3, 공용 그림 v7, 메인 뷰 v8, 컨트롤러 v9, 서비스 워커 farmodoro-v382. 낚시 atlas도 앱 캐시에 포함한다. 기존 생성기 순서 098→099→100→101에 이어 scripts/build-farm-v3-watering-sql.cjs가 102와 최신 통합 SQL을 만든다.

## 검증

- tests/farm-v3-watering-sql.cjs: 실제 PostgreSQL에서 무료 성장·음수 Coin·정확한 5시간 경계·변조 거부·중복 요청·동시 클릭·시듦 없음·새 작물/다른 밭·소유권·RLS·통합 재실행.
- tests/farm-v3-client.test.cjs: 서버 시각 보정·중복 클릭 직렬화·무료 물주기·쿨타임·이전 서버·잘못된 응답 거부.
- tests/farm-v3-ui-smoke.cjs: 실제 RPC와 Chrome에서 물주기/재조회, 낚시 그림 8종, Coin·수확·물고기 받기의 맵 내부 배치, 테두리 정렬, PC/모바일, 무료 물주기와 음수 잔액을 검사한다.
