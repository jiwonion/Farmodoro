# 농장 그림과 시안 반영

현재 농장은 v3의 기본·벚꽃·은하수 배경과 성장 단계·심어진 작물, v4의 확장 테마 배경을 사용한다. 주방과 보유 재료에는 v2 음식·수확 작물 그림을 사용한다. 실제 제작 명세는 [v3 프롬프트](garden-v3-prompts.md)와 [v4 테마 그림](garden-v4-art.md)에 있다.

기본 흙밭은 v3 둥근 흙 그림을 사용한다. 구매하는 12종 밭은 새 v5 둥근 테마 밭으로 교체했다. 실제 그림 영역을 잘라 원래 비율을 유지하므로 다른 칸의 이미지가 섞이지 않는다. [밭 그림과 실제 제작 프롬프트](garden-fields-art.md)를 따른다.

심어진 작물은 씨앗·새싹·잎·꽃·수확 단계로 표시한다. 꽃 단계에는 익은 열매가 없는 성장 아틀라스 6번 칸을 사용한다. 기존 12종에 v6의 45종을 추가하여 모든 57종에 개별 수확물 그림과 성숙한 식물 그림이 있다. 투명 여백 대신 실제 그림 영역을 기준으로 잘라 비율을 유지하고 밭 중앙에 놓는다. 우편함·씨앗 선택·주방·랜덤 보상도 같은 수확물 그림을 사용한다. [작물 전체 제작 프롬프트와 검증](garden-crops-art.md)을 따른다.

| 현재 자산 | 용도 |
| --- | --- |
| `assets/garden-v2/food-atlas.png` | 주요 요리 6종 |
| `assets/garden-v2/crop-atlas.png` | 수확 작물 12종 |
| `assets/garden-v3/terrain-atlas.png` | 기본·벚꽃·은하수 배경 |
| `assets/garden-v3/soil-atlas.png` | 기본·물 준·시든 흙밭 |
| `assets/garden-v3/stages-atlas.png` | 성장 단계 |
| `assets/garden-v3/plants-atlas.png` | 심어진 작물 12종 |
| `assets/garden-v4/*-atlas.png` | 확장 테마 배경 16종 |
| `assets/garden-v5/themed-plots-atlas.png` | 구매하는 테마 밭 12종 |
| `assets/garden-v6/crop-*.png` | 추가 수확 작물 45종, 4개 아틀라스 |
| `assets/garden-v6/plants-*.png` | 추가 성숙 작물 45종, 4개 아틀라스 |

농장·스킨 미리보기·집중 배경은 동일한 배경과 밭·작물 그림을 사용한다. [현재 농장 동작](garden-v2.md)과 [작물 그림 검증](garden-crops-art.md)에 구현·검증 상태를 기록한다.
