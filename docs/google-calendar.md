# Google 캘린더 읽기 연동

파머도로 달력에 실제 Google 일정을 불러오는 기능이다. 로그인할 때 받는 계정 정보와 별개로, 달력에서 `Google 캘린더 연결`을 눌러 읽기 권한을 허용한다. 기존 `supabase-config.js`의 웹 OAuth 클라이언트 ID를 사용한다.

## 지원 범위

- 내 캘린더와 공유받은 캘린더 중 표시할 대상을 선택한다.
- 현재 월의 달력 격자에 포함된 기간을 조회한다. 종일·시간 지정·여러 날·반복 일정의 각 회차와 페이지가 나뉜 응답을 처리한다.
- Google 일정은 파머도로 할 일과 구분해서 표시한다. Google 일정은 `Google에서 보기`로 열며 파머도로의 할 일 수정·완료·보상에 영향을 주지 않는다.
- 달력이 열린 동안 1분마다, 다른 창에서 돌아올 때, 월·캘린더 선택을 바꾸거나 새로 불러오기를 누를 때 갱신한다.
- 파머도로 할 일을 Google에 넣는 기존 수동 추가 링크는 유지한다. 자동 등록·Google 일정 수정·양방향 동기화는 이번 범위에 포함하지 않는다.

## 여러 사용자가 쓰는 운영 앱의 설정

파머도로는 운영자와 친구들이 각자의 Google 계정으로 쓰는 앱이다. 운영 연결의 목표는 친구마다 테스트 사용자 명단에 추가하는 것이 아니라, 허용되는 일반 계정이 직접 동의하고 연결할 수 있게 하는 것이다. Personal 모드는 이 용도에 맞지 않는다. 아래 절차는 운영 준비 안내이며 Google Cloud의 현재 상태를 확인하거나 변경한 기록이 아니다.

1. Google Cloud에서 현재 로그인용 OAuth 클라이언트가 속한 프로젝트를 선택하고 **Google Calendar API**를 활성화한다.
2. Google Auth Platform의 **Data Access**에 다음 두 범위를 설정한다.
   - `https://www.googleapis.com/auth/calendar.events.readonly`
   - `https://www.googleapis.com/auth/calendar.calendarlist.readonly`
3. **Clients**에서 기존 웹 클라이언트의 Authorized JavaScript origins에 실제 앱 주소 `https://farmodoro.app`가 있는지 확인한다. 개발 환경은 운영과 별도의 프로젝트로 구성한다.
4. **Audience**에서 사용자 유형 **External**, 게시 상태 **In production**을 운영 대상으로 확인한다. **Testing**의 테스트 사용자 등록은 개발 중 인증 확인에만 사용한다. 운영 공개와 OAuth 검증은 별도이며, 공개만으로 미검증 경고나 사용자 수 제한이 없어지지는 않는다.
5. 소수의 서로 아는 친구만 쓰고 사용자가 100명 미만인 경우 Google의 Limited Audience 검증 면제에 해당할 수 있다. 이 경우에도 미검증 경고와 사용자 수 제한은 남고 조직 관리자의 접근 제한이 적용될 수 있다. 경고와 제한 없이 일반 사용자에게 제공하려면 해당 읽기 권한의 OAuth 검증을 준비한다. 실제 요건은 **Data Access**와 **Verification Center**에서 확인한다.
6. 웹을 배포하고 테스트 사용자 명단에 의존하지 않는 별도 일반 계정으로 연결한다. 일정과 캘린더 목록 읽기를 모두 허용한 뒤, 표시할 캘린더와 월을 바꿔 실제 일정을 확인한다. 공개 전환만으로 모든 `access_denied` 원인이 해결된다고 가정하지 않는다.

브라우저 토큰 방식이므로 서버용 client secret이나 API key를 프런트엔드에 추가하지 않는다. 로그인용 `openid/email/profile` 동의만으로 캘린더를 읽을 수는 없다.

공식 근거: [Calendar API 최초 설정](https://developers.google.com/workspace/calendar/api/quickstart/js), [웹 OAuth 설정](https://developers.google.com/identity/oauth2/web/guides/get-google-api-clientid), [토큰 방식](https://developers.google.com/identity/oauth2/web/guides/use-token-model), [읽기 권한 범위](https://developers.google.com/workspace/calendar/api/auth).

### OAuth 검증을 진행할 때 준비할 내용

- 로그인 없이 볼 수 있는 앱 소개와 같은 도메인의 개인정보처리방침을 제공한다. `about.html`과 `privacy.html`을 준비했고 두 페이지에서 같은 처리방침 URL로 연결한다. 공개 문의 담당 표기는 jiwon, 이메일은 `wlfhddl23@gmail.com`이다. 정책 내용 검토·배포와 법정 표기 확인은 [공개 페이지 게시 기록](privacy-release.md)을 따른다. 파일 작성만으로 운영 URL이 열리거나 OAuth 검증이 끝난 것은 아니다.
- 도메인 소유권, 앱 이름·로고·홈페이지·지원 연락처를 Google 프로젝트의 Branding 설정과 일치시킨다. 공개 전환이나 검증 제출은 아직 실행하지 않았다.
- 요청 권한의 근거는 아래 표와 같다. 쓰기·삭제 권한은 요청하지 않는다.
- 검증 영상은 로그인 → 달력 → Google 연결 → 권한 동의 → 캘린더 선택 → 월 변경과 일정 표시 → 연결 해제 흐름을 실제 동작으로 보여준다. 모의 API 화면을 실제 연동 증거로 제출하지 않는다.

| 요청 범위 | 앱에서 필요한 이유 |
| --- | --- |
| `calendar.calendarlist.readonly` | 사용자가 구독한 캘린더 목록을 읽고 표시할 캘린더를 선택하게 한다. |
| `calendar.events.readonly` | 선택한 캘린더의 일정 제목·시작·종료·상태·원본 링크를 읽어 현재 월에 표시한다. |

Google 일정과 토큰은 브라우저 메모리에만 유지하며 Supabase나 진단 로그로 보내지 않는다. 연결 해제는 브라우저의 토큰과 조회 데이터를 지운다. Google 계정에 부여한 앱 권한 자체를 철회하는 기능은 아니므로, 전체 권한 철회는 사용자의 Google 계정 연결 관리에서 진행한다.

공식 근거: [게시 상태별 접근 조건](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview), [Limited Audience 검증 면제](https://support.google.com/cloud/answer/13464323?hl=en), [민감 권한 검증 준비](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification), [홈페이지·처리방침 요건](https://support.google.com/cloud/answer/13464321?hl=en).

## 연결 상태와 토큰

액세스 토큰과 Google 일정은 메모리에만 보관한다. localStorage·Supabase·진단 로그에 기록하지 않는다. 새로고침·로그아웃·파머도로 계정 전환·연결 해제·토큰 만료 시 다시 연결해야 한다. 자동 팝업으로 재동의를 강요하지 않는다. 늦게 도착한 이전 계정·이전 월의 응답은 적용하지 않는다.

API 미활성화, 부분 권한 동의, 팝업 차단·닫힘, 만료와 네트워크 오류를 구분해 안내한다. Google의 오류 원문에 포함될 수 있는 계정 정보는 화면에 출력하지 않는다.

## 액세스 제한 확인

일반 Google 로그인은 성공하지만 캘린더 연결에서 차단될 수 있다. 로그인용 기본 권한과 캘린더 읽기 권한의 접근 조건이 다르기 때문이다. 오류 제목·코드를 먼저 확인하고 현재 OAuth 클라이언트가 속한 프로젝트에서 설정한다. 아래는 진단 절차이며 프로젝트 설정을 변경했다는 뜻은 아니다.

| Google 화면의 오류 | 확인할 설정 |
| --- | --- |
| `403 access_denied`와 앱이 테스트 중이라는 안내 | 개발 중이라면 테스트 계정을 등록한다. 친구들이 사용하는 운영 앱은 위 External·In production 및 검증 요건을 확인한다. 기본 로그인만 성공해도 캘린더 접근 조건을 충족했다는 뜻은 아니다. |
| `admin_policy_enforced` | 해당 Google Workspace 조직의 관리자에게 앱 접근 허용 여부를 확인한다. |
| `org_internal` | 조직 내부 전용 앱인지 확인한다. 외부 계정을 지원해야 한다면 앱 소유자가 Audience 설정을 검토한다. |
| `origin_mismatch` | 웹 OAuth 클라이언트의 Authorized JavaScript origins에 실제 접속한 주소의 스킴·호스트·포트를 등록한다. 경로는 포함하지 않는다. |
| `invalid_client` / `invalid_scope` | 선택한 프로젝트·웹 클라이언트 ID와 위 두 읽기 범위를 확인한다. |
| 동의 후 앱에서 Calendar API 설정 안내 | 같은 프로젝트에서 Google Calendar API 활성화 여부를 확인한다. OAuth 단계 차단과 API 조회 단계 오류는 별개다. |

이 오류를 해결하려고 보안 보호를 끄거나 공개 상태로 무조건 전환하지 않는다. 개인 테스트라면 테스트 사용자 등록부터 확인하고 공개 서비스라면 필요한 검증을 진행한다. OAuth 화면에서 차단되면 오류가 앱 콜백에 전달되지 않을 수 있으므로 Google 화면의 제목·코드가 필요하다.

공식 근거: [OAuth 앱 상태와 테스트 사용자 예외](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview), [Google 오류 코드 안내](https://support.google.com/accounts/answer/16668185?hl=ko), [OAuth 오류 콜백 처리](https://developers.google.com/identity/oauth2/web/guides/error).

## 검증 범위

가짜 OAuth·API 응답을 사용하는 테스트로 읽기 전용 요청, 페이지 처리, 시간대와 종일 종료일, 여러 날 일정, 계정 격리, 월 변경 중 응답 경합, 만료·취소·설정 오류를 검증했다. 실제 브라우저에서도 계정 연결 버튼 → 일정 표시 → Google에서 보기와 모바일 배치를 확인했다.

현재 Google Cloud 프로젝트 설정과 실제 사용자 동의는 실행하지 않았다. 실계정 연결 검증은 위 설정 확인과 배포 후에 필요하다.
