# unread-count 401 · 콘솔 스크립트 오류 조사 (2026-08-09)

로그인 상태의 프로덕션 콘솔에서 관측된 4건의 오류를 조사하고, 로컬 실스택(Next dev :3000 + Spring :8080 + 개발 DB)에서
실제 Network 시퀀스로 최종 검증했다. **결론: 4건 모두 Du-ing 버그가 아니다.** 코드 수정 불요.

## 증상

```
screen-shader.js:1  Uncaught SyntaxError: Identifier 'afterBodyReadyScreenshader' has already been declared
night-mode.js:1     Uncaught SyntaxError: Identifier 'afterBodyReady' has already been declared
api.duings.com/api/v1/me/notifications/unread-count  401  (2회)
```

## 1. unread-count 401 — 정상 silent refresh 의 관측 노이즈

### 호출 경로 (단일 경로, 다른 호출자 없음)

```
NotificationBell (apps/web/app/_components/NotificationBell.tsx)
 → useUnreadCountQuery (packages/hooks/src/notifications.ts)      staleTime 30s · refetchOnWindowFocus: true
 → client.notifications.unreadCount (packages/api/src/client.ts)
 → ky GET me/notifications/unread-count                            authTransport: 'cookie'
```

- 렌더 지점은 HomeNav((home)/layout)·ExploreNav(clubs·calendar·faq·terms layout) 두 곳이지만 라우트가 달라 동시
  마운트되지 않고, 같은 queryKey 라 동시여도 React Query 가 요청 1건으로 dedupe 한다.
- `enabled = isAuthenticated` — 부팅 시드(localStorage `duing:had-session`)로 열리고, 서버 확인이 병행 정정한다.
- **웹은 Authorization 헤더를 쓰지 않는다.** 인증은 HttpOnly 쿠키 `__Host-duing_access_token`(TTL 30분) +
  `credentials: 'include'`. FE JS 는 토큰을 만지지 않으므로 "토큰 초기화 전 호출" 류의 race 는 구조적으로 없다.
- `duing_token` 쿠키는 레거시로, `legacy-auth-cleanup.ts` 가 발견 즉시 삭제한다. 현행 인증과 무관.
- 백엔드: `/api/v1/me/**` 는 `anyRequest().authenticated()`. `JwtAuthenticationFilter` 가 Bearer → access 쿠키
  순으로 읽고, 401 시 EntryPoint 가 무효 access 쿠키만 삭제한다(refresh·hint 는 유지 — 갱신 수단 보존).

### 실측 시퀀스 (2026-08-09, 로컬 실스택 · 실계정 로그인 · access 쿠키만 삭제해 30분 만료 재현)

| # | 요청 | 상태 | 시각 (GMT) |
|---|------|------|-----------|
| 사이클 1 | GET /me/notifications/unread-count | **401** | 13:36:00 |
| | POST /auth/web/refresh | **204** | 13:36:01 |
| | GET /me/notifications/unread-count (재시도) | **200** | 13:36:02 |
| 사이클 2 (+2분 21초) | GET /me/notifications/unread-count | **401** | 13:38:21 |
| | POST /auth/web/refresh | **204** | 13:38:22 |
| | GET /me/notifications/unread-count (재시도) | **200** | 13:38:23 |

두 사이클 뒤 콘솔에는 unread-count 401 이 **정확히 2줄** 누적됐고(보고된 화면과 동일), 세션은 끝까지 유지됐다
(사용자 메뉴·알림 배지 정상, 만료 토스트 없음). refresh 204 와 재시도 200 은 오류가 아니라 콘솔에 남지 않는다.
브라우저는 JS 가 처리한 401 응답도 무조건 콘솔에 기록하므로, 이 401 라인은 설계된 흐름의 부산물이다.

### 401 이 2회인 이유

- **시간차를 둔 두 번의 만료→갱신 사이클이다** (동일 사이클 내 이중 401 아님 — 재시도는 항상 200이었다).
- unread-count 는 전역에서 **유일하게 `refetchOnWindowFocus: true`** 인 쿼리라, access 만료(30분) 후 탭에 복귀하는
  순간마다 이 쿼리만 만료 쿠키를 처음 밟는다. 콘솔 2줄 = 그런 복귀 시점이 2번.
- React Strict Mode·RQ 재시도(401 은 `shouldRetryQuery` 가 차단)·이중 마운트는 모두 원인이 아님을 확인했다.

### #844 와의 관계

`refresh skipped → retry 401` 오분류 경로(이슈 #844)는 이번 실측에서 **발생하지 않았다**. 이번 현상의 원인이
아니며, #844 는 별도 잠재 이슈로 유효하게 유지한다.

## 2. screen-shader.js · night-mode.js — 브라우저 확장 프로그램

- 레포 전체에서 `screen-shader`·`night-mode`·`afterBodyReady*` **0건**. `public/` 에 JS 없음. layout 의 유일한
  `<script>` 는 JSON-LD 데이터 블록. `next/script` 사용처 없음.
- **확장 없는 브라우저(Playwright)로 프로덕션(duings.com)을 로드하면 두 오류가 재현되지 않는다.**
- "Screen Shader" 는 화면 색온도 조절 Chrome 확장이며 content script 파일명이 `screen-shader.js`. night-mode 도
  동종 확장. SPA 네비게이션 시 확장이 스크립트를 재주입하며 top-level 식별자 재선언 SyntaxError 가 난다.
  죽는 것은 확장 스크립트뿐, 앱 동작에는 영향 없다. 콘솔에서 오류 소스를 클릭하면 `chrome-extension://` URL 로
  직접 확인할 수 있다.

## 최종 판정

| 현상 | 판정 |
|------|------|
| unread-count 401 (2회) | 정상 동작 — silent refresh 콘솔 노이즈, 수정 불필요 |
| refresh skipped→retry 401 오분류 | 잠재 기술부채 — #844 로 별도 관리 (이번 현상과 무관) |
| screen-shader.js / night-mode.js | 브라우저 확장 문제 — 프로젝트 무관, 수정 불가·불필요 |

참고: 익명 방문에도 첫 로드에 `users/me` 401 + `auth/web/refresh` 401 두 줄이 남는다(부팅 세션 복원을 무조건
선발사하는 설계 — 스펙 §4 레버 1). 같은 성격의 정상 노이즈다.
