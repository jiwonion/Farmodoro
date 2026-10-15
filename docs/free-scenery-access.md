# 풍경 전체 해금과 무료 성장

이 문서는 개편 전 `094`의 기록이다. [내 작은 농장 v3](farm-v3.md)의 `095` 적용 후 기존 해금·완성 기록은 보존하며, 새 대상 시작은 종료하고 이미 시작한 대상만 무료로 마저 완성할 수 있다. 사용자 간 랭킹은 제거한다.

농장 개편을 위해 모든 사용자가 현재 풍경 테마와 대상을 제한 없이 사용할 수 있게 한다.

- 기존 계정은 풍경 테마 20종과 대상 31종을 전부 영구 해금한다.
- 새 계정도 처음 풍경을 불러오거나 사용하면 모두 해금된다.
- Coin이 0이어도 한 번 키우기·최대 5번 일괄 키우기를 사용할 수 있다.
- 기본 20회 성장과 4단계 모습은 유지한다. 진행 중인 대상도 현재 진행도에서 계속 키운다.
- Coin을 차감하거나 임시 Coin을 지급하지 않는다. 기존 잔액과 완성 기록은 유지한다.
- 완성 보상은 기존대로 50 Farm Money다. 무료 성장의 완성 보상도 주간 랭킹에 포함된다.
- 현재 UI의 풍경 테마를 해금하며, 이미 종료한 밭 스킨·세트 효과를 복원하지 않는다.

## 적용

1. 기존 `001`~`093`이 적용된 Supabase SQL Editor에서 [`094_free_scenery_access.sql`](../supabase/migrations/094_free_scenery_access.sql)의 전체 내용을 실행한다. 사용자 이메일이나 UUID를 넣을 필요가 없다.
2. 변경된 `index.html`, `app.js`, `scenery-creations.js`, `sw.js`를 함께 배포한다. 새 스크립트는 `app.js?v=340`, `scenery-creations.js?v=9`이며 캐시는 `farmodoro-v367`이다.
3. 페이지를 새로고침하고 Coin이 없는 계정에서도 성장 버튼이 동작하는지 확인한다.

SQL만 적용하고 기존 화면을 쓰면 Coin 부족으로 버튼이 비활성화될 수 있다. 새 화면은 서버의 `freeGrowth: true` 응답을 확인한 뒤 무료 모드를 사용한다. SQL이 아직 적용되지 않은 DB에서는 기존 Coin 방식으로 동작한다.

SQL을 다시 실행해도 해금 기록을 중복 생성하거나 잔액·진행도를 초기화하지 않는다. 무료 성장에서도 기존 요청 ID 중복 방지, 계정 소유권, 한 번에 하나의 진행 대상, 완성 보상 중복 방지는 유지한다.

## 확인

- `node --test tests/theme-creations.test.cjs tests/scenery-focus-sync.test.cjs tests/scenery-cosmetic-sync.test.cjs`
- `PGLITE_MODULE`에 설치된 PGlite 경로를 설정한 뒤 `node tests/theme-creations-sql.cjs`
- Chrome이 있는 환경에서 `node tests/theme-creations-ui-smoke.cjs`

로컬 코드·격리 DB·브라우저 검증과 운영 SQL 실행·배포는 별개다.
