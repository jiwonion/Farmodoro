# 테마 밭 그림

2026-10-03. imagegen 스킬의 built-in image_gen 도구로 기본 흙밭과 테마 밭 색상을 참조하여 제작했다. 선택한 원본을 변경하지 않고 `assets/garden-v5/themed-plots-atlas.png`에 복사했다. PNG는 1448×1086 RGBA이며 배경이 투명하다. 밭 ID·가격·구매 기록·세트 효과는 유지하고 그림만 교체했다.

| 순서 | ID | 밭 |
| --- | --- | --- |
| 0 | cherryPetalFall | 벚꽃밭 |
| 1 | frostbite | 얼음밭 |
| 2 | chocolate | 초콜릿밭 |
| 3 | candy | 사탕밭 |
| 4 | starCandy | 별빛밭 |
| 5 | mapleLeaf | 낙엽밭 |
| 6 | snowField | 눈밭 |
| 7 | sandDune | 모래밭 |
| 8 | lava | 용암밭 |
| 9 | rainbow | 무지개밭 |
| 10 | golden | 황금밭 |
| 11 | lavenderField | 라벤더밭 |

4×3 배열이지만 행 간 간격은 균등하지 않다. 실제 알파 영역에 여백을 더한 `plotSkinBounds`를 SVG 안쪽 viewport로 잘라 사용한다. 바깥 SVG는 `preserveAspectRatio`로 농장·목록·미리보기·집중 배경에서 비율을 유지한다. 다음 행의 갈색 흙이 눈밭 아래에 보이는 현상을 방지한다.

## 실제 사용한 프롬프트

```text
Use case: style-transfer
Asset type: transparent 4-column by 3-row sprite atlas of twelve empty farm beds for a cute productivity farming app.
Primary request: Draw twelve themed soil beds matching the soft warm illustrated pixel-art rendering and rounded irregular square shape of the first reference (garden soil atlas). The second reference shows the theme order and colors only. Create a NEW 4 by 3 equal-cell atlas on genuine transparent alpha; entire canvas landscape 4:3, ideally 1536x1152. Each bed centered inside its own cell with at least 9% transparent padding on all sides. All beds same size, top-down perspective with only slight visible front-edge depth, like the reference. Not isometric diamonds. Each bed has a generous flat empty planting center and sparse theme details only around the rim; no plants, crops, furniture, props outside the bed, labels, borders, separators, text or shadows crossing cells. Keep individual objects fully separate.
Exact reading order left to right top to bottom: row1 pink cherry-blossom petals on rosy brown earth; pale-blue frosted ice soil; cocoa chocolate earth with tiny chocolate rim corners; peach-pink candy soil with two small white-pink candy accents. Row2 deep lavender night soil with small golden star rim flecks; warm rusty autumn soil edged with orange maple leaves; white snowy soil with soft white snow piled around edges and a pale blue center; warm golden sandy soil with a few tiny shells. Row3 charcoal volcanic soil with thin glowing orange magma cracks only at edges; pale pastel rainbow soil with subtle bands and tiny iridescent pebble edges; golden harvest soil with sparse golden wheat accents at rim; muted lavender soil with tiny purple flower tufts at rim. No fruit or growing wheat in centers. The snowy bed must clearly read as white snow, autumn bed as fallen leaves. Warm restrained colors, neat soft pixel blocks with handmade cozy details, consistent lighting and silhouette. No checkerboard drawn into artwork. No full opaque square background. Preserve empty planting surfaces and transparency.
```
