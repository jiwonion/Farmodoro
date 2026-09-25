# 도트 농장 화면

농장 탭 전체를 하나의 게임 맵으로 표시한다. `assets/farm-b-v1`의 지형·시설·밭·작물을 별도 레이어로 합성한다. 14개 지형마다 경작지 좌표를 맞추며, 중앙에 3×3 밭을 배치한다.

- 지도: 오두막, 우물, 판매대, 울타리, 흙길, 3×3 경작지와 보관 상자·우편함·화로·게시판.
- 밭에는 물주기 가능·수확 가능·시듦 임박·시든 상태를 상시 표시한다. 시듦까지 2시간 이하인 작물을 먼저 경고하며, 그 외 성장 중인 밭에는 성장 수치를 표시한다. 상태는 타이머에서도 갱신한다.
- 밭을 누르면 작물 이름·성장 단계·시듦까지 남은 시간·조작이 밭 위의 작은 창에 나타난다.
- 상단 기능 버튼은 없다. 수확물 상자·씨앗 상자·용품 거치대를 누르면 해당 보관함, 우편함은 우편소, 화로는 주방, 게시판은 랭킹, 판매대는 상점을 연다.
- 빈 밭은 씨앗 선택 후 심기. 선택된 씨앗이 없으면 보관함을 연다.
- 기존 용품을 선택한 상태에서 작물 밭이나 밭 위의 용품 사용 영역을 누르면 해당 용품을 사용한다.
- 씨앗·도구·주방은 집 주변, 수확물 상자는 판매대 옆에 배치한다.
- 모바일은 맵을 좌우로 스크롤하며, 표시 또는 화면 폭 변경 시 중앙으로 맞춘다. ‘전체 보기’는 맵 전체를 축소하며 상태는 작은 색 표시로 남긴다. 작물을 누르면 해당 밭을 중심으로 확대하고 상세 조작을 연다. ‘밭 돌보기’로도 복귀할 수 있다.
- 기존 구매·장착·성장 데이터를 사용한다. DB 변경 없음.
- 집중 전체 화면 연결과 자유 배치는 포함하지 않는다.

## 풍경과 스킨

현재 화면은 `app.js`의 `FARM_TERRAIN_IDS`, `TERRAIN_CLEARINGS`, `PLOT_SKIN_TERRAIN`을 사용한다. 아래 아틀라스 설명과 프롬프트는 초기 제작 기록이다.

## RPG 팝업

`farm-rpg.css`는 농장 상점, 주방, 우편소, 수확물·씨앗 보관함, 농장 용품 구매·사용 창, 랭킹, 보상 상자, 스킨 미리보기, 프리패스 대상 선택 및 밭 상세 창의 외형을 담당한다. 나무 프레임·아이템 슬롯·시설 스프라이트·현재 지형 배너를 공통으로 사용한다.

`applyFarmRpgTheme()`가 실제 적용 지형을 팝업에 전달한다. 설원 등 지형을 바꾸는 밭 스킨이 테마보다 우선하며, 상점 미리보기는 장착 테마나 팝업 색을 변경하지 않는다. 화면 밖에 있는 팝업도 같은 색을 사용하고, 생산성 페이지의 창에는 스타일을 적용하지 않는다.

## 초기 아틀라스 제작 기록

기본 풀밭, 라벤더, 튤립, 벚꽃, 겨울, 밤 풍경을 사용한다. 라벤더·벚꽃 낙화·눈밭·결빙 스킨은 해당 풍경을 지정하고 테마보다 우선한다. 그 외 밭 스킨은 흙의 색을 변경한다. 화산·바다·황금 들판은 공통 맵에 색조를 적용한다.

벚꽃 풍경에는 꽃잎, 겨울 풍경에는 눈을 표시한다. 효과는 클릭을 막지 않으며 동작 줄이기 설정에서 숨긴다. 상점 미리보기도 같은 맵을 사용하며 재화를 소비하거나 장착 상태를 바꾸지 않는다.

## 이미지 제작

- 방식: 내장 image_gen 도구
- 최종 자산: `assets/pixel/farm-world-facilities-atlas.png` (1881×836). 기존 `farm-world-atlas.png`를 기반으로 시설을 추가했다.
- 3열 × 2행, 각 627×418. 위: 풀밭 / 라벤더 / 튤립. 아래: 벚꽃 / 설원 / 밤.
- 원본 그대로 저장. CSS의 background-position으로 각 맵을 표시한다.
- 클릭 영역: 맵 왼쪽 24.5%, 위쪽 40%, 너비 54.5%, 높이 39%.
- 생성 요청 크기와 실제 출력 크기는 다르므로 실제 PNG 치수로 검증한다.

### 생성 프롬프트

Use case: stylized-concept. Production game map atlas, original 16-bit pixel art cozy farming game, NOT an illustration behind a user interface. Create a 2304x1024 image (wide aspect 9:4) consisting of EXACTLY THREE COLUMNS and TWO ROWS of equal seamless rectangular panels, no gaps. Each panel is a complete 3:2 landscape playable farm MAP, viewed from elevated three-quarter overhead like a classic pixel farming RPG. Large crisp pixel clusters, no painterly brushwork, no blur. Identical geography and structure in all six panels: a tiny strip of distant hills at the top 8 percent; a wooden farmhouse with red roof at upper left (x10-28%, y15-40%), a small open-front farm stall with striped awning at upper right (x77-93%, y24-44%), trees around perimeter, wooden fence, walking paths, a few wooden crates and barrels next to buildings. Most importantly, a SINGLE RECTANGULAR TILLED SOIL FIELD occupies exactly x28% to x73% and y48% to y88% of EACH panel. Soil has dark brown pixel-textured furrows, chunky exposed earth edge on the bottom showing depth, small pebbles and a jagged natural outline, NOT a board, panel, carpet, box or UI card. Divide this field with very thin walking furrows into 3 rows and 3 columns (NINE equal planting patches). ALL NINE PATCHES ARE EMPTY BARE TILLED SOIL; no crops, no signs, no symbols. These patches will receive interactive crop sprites in code. Furrows and field orientation aligned to screen horizontal/vertical, mildly foreshortened, NOT diamond isometric. Surrounding grass, paths and the soil form one continuous world. No text, no lettering, no UI, no floating cards, no icons, no characters. Panel variants in reading order: 1 sunny green meadow with small daisies; 2 lavender flowers along paths and perimeter; 3 spring red/yellow/pink tulips along paths and perimeter; 4 cherry blossom trees and fallen petals; 5 snowy winter with snow roofs and ground BUT bare brown tilled soil field; 6 moonlit deep-blue farm with lit cottage windows. Maintain exact identical soil field bounding box and building placement across all panels. This is a real game environment, modest low resolution chunky pixel style. Keep the soil field clearly separate from all buildings and flowers.

## 검증

`node tests/farm-mobile-ui-smoke.cjs`: 320~1440px 화면, 좌우 스크롤 및 전체 보기, 풍경 미리보기, 시설 6종 연결, 상태 표시와 조작, 효과 클릭 통과, 키보드 닫기, 요리 재료 선택, 보관함 글자 줄바꿈을 검사한다. 상점과 팝업 9종을 14개 지형에서 검사하고, 밭 스킨 우선순위와 미리보기의 장착 상태 보존도 확인한다. RPC는 로컬 스텁으로 검증하며 실제 계정이나 재화를 변경하지 않는다. `FARM_RPG_SCREENSHOTS`에 디렉터리를 지정하면 검토용 화면을 저장한다.

시설 추가 이미지의 생성 프롬프트는 `farm-facilities-imagegen.md`에 기록했다.
