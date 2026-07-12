# 웹 HttpOnly Cookie·모바일 Bearer 이중 인증 설계

## 1. 목표

웹 브라우저에서 Access Token JWT가 JavaScript에 노출되는 경로를 제거한다. 웹은 host-only
HttpOnly Cookie로 인증하고, 모바일은 향후 Keychain/Keystore 기반 Secure Storage에 JWT를 저장해
Authorization Bearer로 인증한다. Spring Security는 두 전송 방식을 모두 지원하되 실제 인증과 권한
판정의 단일 진실은 Access Token과 현재 DB 사용자 상태로 유지한다.

이번 변경은 현재 1시간 Access Token 정책과 `token_version` 무효화 정책을 유지한다. Refresh Token,
Rotation, 재발급 API와 서버 세션 저장소는 별도 후속 작업이다.

## 2. 현재 문제

현재 웹은 로그인 응답의 JWT를 다음 두 JavaScript 접근 가능 저장소에 중복 보관한다.

- `localStorage['duing.accessToken']`
- `document.cookie`의 `duing_token`

동일 출처 XSS가 발생하면 두 위치에서 JWT를 읽어 외부로 반출하고, 남은 유효 시간 동안 사용자 권한으로
API를 호출할 수 있다. Zustand에도 `accessToken`이 들어가므로 런타임 상태에서 토큰이 불필요하게
전파된다. Next.js Middleware가 라우팅 UX를 위해 JWT Cookie를 직접 읽는 현재 구조가 이 중복 저장을
만들었다.

## 3. 범위

### 3.1 이번 작업

- 웹 전용 Cookie 로그인·로그아웃 API
- 웹 Access Token의 host-only HttpOnly Cookie 발급
- 모바일 Bearer JWT 로그인 계약 유지
- Spring Security의 Bearer 우선, Cookie 차선 인증
- Cookie 인증 상태 변경 요청의 Origin 검증
- 서명된 비인증 `auth_hint`를 이용한 Middleware UX
- `/users/me` 기반 웹 세션 복원
- 브라우저와 Zustand의 JWT 제거
- 기존 웹 토큰 저장 흔적의 제한적·멱등 마이그레이션

### 3.2 후속 작업

- Refresh Token과 재발급 API
- Refresh Token Rotation과 재사용 탐지
- DB/Redis 기반 세션·디바이스 관리
- Double Submit 등 CSRF Token
- 사용자용 세션 관리 UI
- React Native 앱과 실제 Secure Storage 의존성 설치

## 4. 검토한 대안

### 4.1 백엔드 직접 Cookie + Bearer 이중 지원 — 채택

웹 브라우저는 `api.duings.com`을 직접 호출하고, 백엔드가 host-only Cookie를 발급한다. 기존 네트워크
경로와 비용을 유지하면서 JavaScript의 JWT 접근을 제거할 수 있다. Spring Security는 Bearer와 Cookie를
명시적인 우선순위로 처리한다.

### 4.2 Next.js BFF 프록시 — 제외

host-only Cookie를 `duings.com`에 둘 수 있지만 모든 API·업로드 요청이 Vercel을 경유한다. 비용, 지연,
프록시 스트리밍 구현과 장애 지점이 증가해 이번 P1의 최소 변경 원칙에 맞지 않는다.

### 4.3 API host-only Cookie + 클라이언트 전용 라우트 가드 — 제외

Access Token 범위는 안전하지만 Next.js Middleware가 로그인 UX를 처리할 수 없다. 보호 경로의 새로고침
깜빡임과 상태 이중화를 피하기 위해, 인증 권한이 없는 별도 힌트 Cookie를 사용한다.

## 5. Cookie 구조

### 5.1 실제 Access Token Cookie

운영 속성은 다음과 같다.

- 이름: `__Host-duing_access_token`
- Domain: 지정하지 않음 — `api.duings.com` host-only
- `HttpOnly`
- `Secure`
- `SameSite=Lax`
- `Path=/`
- `Max-Age=3600`

`__Host-` prefix는 브라우저가 Secure, `Path=/`, Domain 미지정을 강제한다. 따라서
`files.duings.com`을 포함한 다른 하위 도메인이 `Domain=.duings.com`으로 같은 이름의 Cookie를
주입하는 cookie tossing과 세션 고정 경로를 차단한다. 실제 인증에는 이 Cookie 또는 Authorization
Bearer만 사용한다.

로컬에서도 Domain을 지정하지 않고 `Secure`와 `__Host-` prefix를 유지한다. 프론트와 백엔드는 각각
`http://localhost:3000`, `http://localhost:8080`처럼 호스트 문자열을 모두 `localhost`로 통일한다.
`127.0.0.1`과 `localhost`를 섞어 쓰지 않는다. Cookie는 포트가 아닌 호스트 기준이므로 Domain 없는
localhost Cookie를 두 포트의 요청에서 사용할 수 있다. 현대 브라우저는 localhost가 설정하는 Secure
Cookie의 HTTPS 요구를 예외 처리하므로 HTTP localhost에서도 `__Host-` 조건을 만족한다. 일반 HTTP
호스트는 지원하지 않으며 Access Token Cookie를 발급하지 않는다. 근거는
[MDN Set-Cookie의 Secure localhost 예외](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie)와
[IETF Cookie의 `__Host-` prefix 정의](https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-layered-cookies)를 따른다.

`SameSite=Lax`를 사용하는 이유는 운영 웹 `duings.com`과 API `api.duings.com`이 scheme과 등록 가능
도메인을 공유하는 same-site 구조이기 때문이다. 정상 API 요청에 `SameSite=None`이 필요하지 않으며,
Lax로 불필요한 cross-site Cookie 전송을 줄인다.

### 5.2 Middleware용 `auth_hint`

`auth_hint`는 Access Token이 아니며 Spring Security 인증에 사용할 수 없다.

- 운영 Domain: `.duings.com`
- `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=3600`
- 로컬: Domain을 생략하고 Secure는 유지
- JWS HS256 서명 키: `AUTH_HINT_SECRET`
- payload: `typ: "AUTH_HINT"`, `role`, `exp`만 포함

유효한 힌트의 존재 자체가 로그인 UX를 나타내므로 별도 `authenticated` 필드는 넣지 않는다. `role`은
현재 `/admin` 접근을 Middleware에서 `/403` UX로 분기하는 데 실제 사용하므로 유지한다. 이 `role`은
로그인 여부 확인과 리다이렉트 UI 분기에만 사용하며 실제 권한을 부여하거나 API 요청을 허용하는 근거로
절대 사용하지 않는다. 사용자 ID, Access Token, 이름, 학번, 전화번호 등 개인정보는 어떤 경우에도
포함하지 않는다.

Next.js Middleware는 Web Crypto로 알고리즘, 서명, `typ`, `role`, `exp`를 검증한다. 검증 실패는
미인증 UX로 처리한다. 힌트가 위조되거나 오래되어도 API 권한은 얻을 수 없으며, Spring Security 결과가
항상 최종 판정이다.

### 5.3 Cookie 삭제 규칙

Cookie 삭제는 빈 값과 `Max-Age=0`을 설정하고 방어적으로 과거 `Expires`도 함께 설정한다. 브라우저가
동일 Cookie로 인식하도록 발급 때와 같은 Name, Path, Domain, SameSite, Secure, HttpOnly 속성을 사용한다.

- `__Host-duing_access_token`: Domain 없음, `Path=/`
- `auth_hint`: 운영 `Domain=.duings.com`, 로컬 Domain 없음, `Path=/`

운영에서는 두 Cookie 모두 Secure가 필수다. HTTPS가 아닌 일반 운영·스테이징 호스트에서는 Cookie를
발급하지 않는다. `http://localhost`만 앞 절의 브라우저 예외에 따라 Secure Cookie를 사용한다.

## 6. Secret 관리

- 백엔드: `JWT_SECRET`, `AUTH_HINT_SECRET` 모두 사용
- Vercel Next.js Middleware: `AUTH_HINT_SECRET`만 사용
- `JWT_SECRET`은 Vercel에 배포하거나 노출하지 않음
- 두 Secret은 각각 최소 32바이트이며 반드시 서로 다른 값
- 백엔드는 두 값이 같으면 기동 단계에서 실패
- Secret은 환경변수나 CI Secret으로만 주입하고 코드·문서·yml에 실제 값을 기록하지 않음

힌트 키가 노출되어도 Access Token을 서명할 수 없도록 키 용도를 분리한다.

## 7. API와 인증 흐름

### 7.1 모바일 Bearer

기존 `POST /api/v1/auth/login` 계약을 유지한다. 응답 본문은 `accessToken`, `tokenType`, `user`를
포함한다. 향후 모바일 앱은 JWT를 Keychain/Keystore 기반 Secure Storage에 저장하고 Bearer 헤더로
전송한다. AsyncStorage에는 JWT를 저장하지 않는다.

### 7.2 웹 Cookie 로그인

`POST /api/v1/auth/web/login`은 같은 로그인 서비스와 잠금·레이트리밋 정책을 사용한다.

1. 허용 Origin을 검증한다.
2. 자격 증명을 검증하고 1시간 JWT를 발급한다.
3. JWT는 `__Host-duing_access_token` HttpOnly Cookie에만 기록한다.
4. 현재 역할과 만료 시각으로 `typ: "AUTH_HINT"`를 서명한 `auth_hint`를 발급한다.
5. 응답 본문에는 사용자 정보만 포함하고 JWT·힌트 원문을 포함하지 않는다.

### 7.3 인증 추출 우선순위

Spring Security 인증 필터의 순서는 다음과 같다.

1. `Authorization: Bearer <token>`이 있으면 Bearer만 검증한다.
2. Bearer가 없으면 `__Host-duing_access_token` Cookie를 검증한다.
3. `auth_hint`는 읽지 않는다.

Bearer와 Cookie가 동시에 있어도 Bearer가 단독 후보다. JWT 서명·만료·`token_version`을 검증한 뒤
현재 DB 사용자의 역할로 SecurityContext를 구성하는 기존 정책은 유지한다.

### 7.4 웹 세션 복원

웹 앱은 시작 시 `GET /api/v1/users/me`를 `credentials: include`로 호출한다.

- 성공: Zustand에 `user`와 `authenticated` 상태 저장
- 401: 사용자와 인증 상태 제거
- 기타 네트워크·5xx: 인증 만료로 단정하지 않고 복구 가능한 오류 상태로 처리

Zustand에는 사용자 정보와 인증 상태만 저장한다. JWT 필드나 JWT 파생값을 넣지 않는다.

## 8. CSRF 정책

이번 작업은 Origin 검증을 적용하고 CSRF Token은 후속 작업으로 둔다.

- 안전 메서드 `GET`, `HEAD`, `OPTIONS`: Origin 검사 제외
- `Authorization: Bearer <값>`이 있는 요청: 모바일 Bearer 요청으로 간주하고 Origin 검사 제외
- Bearer가 없고 `__Host-duing_access_token` Cookie가 있는 `POST`, `PUT`, `PATCH`, `DELETE`: Origin 필수
- `/auth/web/login`, `/auth/web/logout`: Cookie 유무와 관계없이 Origin 필수
- Origin은 기존 CORS 허용 Origin 목록과 정확히 일치해야 함
- 누락·불일치: 일관된 403 `ApiResponse`

Origin이 누락되면 Referer로 대체하지 않고 fail-closed 403으로 처리한다. Origin을 제거하는 프라이버시
확장이나 프록시를 통한 Cookie 상태 변경 요청은 지원 대상에서 제외한다. Referer fallback은 경로 정보
노출과 파싱 분기를 늘리고 Origin보다 약한 판정이므로 이번 범위에 넣지 않는다.

Bearer 존재 여부가 전송 방식 판별 기준이다. Bearer가 있으면 Cookie가 함께 있어도 Cookie CSRF 검사와
Cookie 인증을 수행하지 않는다. 일반 브라우저의 교차 출처 공격은 Authorization 헤더를 임의로 추가할
수 없으며, preflight와 CORS 정책도 기존대로 유지한다.

`SameSite=Lax`는 cross-site 최상위 GET 탐색에 Cookie를 보낼 수 있으므로 모든 상태 변경은 반드시
`POST`, `PUT`, `PATCH`, `DELETE` 중 하나를 사용한다. GET·HEAD는 읽기 전용이어야 하며 상태 변경 GET은
출시 차단 결함으로 취급한다.

## 9. 로그아웃과 인증 실패

### 9.1 모바일 로그아웃

기존 `POST /api/v1/auth/logout`을 유지한다. Bearer로 사용자를 식별하고 `token_version`을 증가시킨다.

현재 `token_version`은 사용자 단위 전역 버전이다. 따라서 모바일에서 로그아웃하면 같은 사용자의 웹
Cookie도 다음 인증 시 401이 되고, 웹에서 로그아웃하면 모든 모바일 Bearer JWT도 즉시 무효화된다.
이번 작업은 기존 정책을 유지하며 **한 곳 로그아웃 = 전 디바이스 로그아웃**을 의도된 제품 정책으로
명시한다. 디바이스별 세션은 Refresh Token·세션 관리 후속 작업에서 별도 모델로 도입한다.

### 9.2 웹 로그아웃

`POST /api/v1/auth/web/logout`은 Origin 검증 후 항상 멱등적으로 동작한다.

- `__Host-duing_access_token`과 `auth_hint`를 5.3의 발급 대칭 속성으로 항상 만료
- 유효한 Access Token으로 사용자를 식별할 수 있을 때만 `token_version` 증가
- 만료·손상 토큰 또는 Cookie 부재로 사용자를 식별하지 못해도 200 또는 204 성공

HttpOnly Cookie는 JavaScript가 삭제할 수 없다. 웹 로그아웃 네트워크 요청이 실패했는데 로컬 상태만
지우면 공용 PC에서 실제 세션이 남은 채 로그아웃된 것처럼 보이는 더 위험한 상태가 된다. 따라서 프론트는
인증 상태를 유지하고 "로그아웃하지 못했습니다. 네트워크 연결 후 다시 시도하고 이 기기를 떠나지
마세요."라는 차단성 오류와 재시도를 제공한다. 서버가 Cookie 삭제를 확인한 뒤에만 Zustand와 React
Query 캐시를 비운다.

### 9.3 401 처리

- Bearer가 없는 Cookie 인증 요청의 401: 두 Cookie를 만료
- Bearer 인증 실패의 401: Cookie를 변경하지 않음
- 403: 세션 Cookie를 변경하지 않음

프론트는 Cookie 세션 401에서 사용자 상태와 React Query 캐시를 제거하고 재로그인을 안내한다.
Middleware와 API 결과가 충돌하면 Spring Security 응답을 최종 결과로 사용한다.

`auth_hint.role`이 오래되어 강등된 사용자를 `/admin` UX에 통과시켜도 API 403에서 접근 거부 화면으로
전환하고 세션은 유지한다. 승격 후 힌트가 이전 역할인 경우에는 재로그인 전까지 Middleware가 `/admin`
진입을 막을 수 있다. 이는 최대 1시간의 UX 불일치이며 권한 오부여는 발생하지 않는다. 역할 변경 즉시
힌트 재발급은 디바이스별 세션 관리와 함께 후속 작업으로 둔다.

### 9.4 1시간 만료 UX

Cookie 세션 401은 현재 pathname과 query를 검증된 내부 `next` 경로로 로그인 화면에 전달하고, 로그인
성공 후 원래 경로로 복귀한다. 지원서처럼 기존 서버 draft가 있는 흐름은 draft를 먼저 복원한다. 모든 폼
내용을 localStorage에 범용 저장하면 개인정보·민감 입력을 새로 노출하므로 이번 작업에서는 하지 않는다.
draft가 없는 폼은 경로 복귀만 보장하며, 범용 암호화 임시저장은 후속 UX 작업으로 분리한다.

## 10. 레거시 토큰 마이그레이션

웹 최초 실행 시 다음 인증 흔적만 제거하는 멱등 함수를 실행한다.

- `localStorage['duing.accessToken']`
- `sessionStorage['duing.accessToken']`
- 기존 JavaScript Cookie `duing_token`의 host-only 변형
- 기존 JavaScript Cookie `duing_token`의 `Domain=.duings.com; Path=/` 변형

다른 localStorage, sessionStorage, Cookie 값은 삭제하지 않는다. 새 HttpOnly Cookie는 JavaScript 정리
대상 이름과 다르므로 영향을 받지 않는다. 기존 토큰은 최대 1시간 뒤 자연 만료하며, 이번 전환을 위해
JWT 서명 키를 회전하지 않는다.

## 11. Supported Environments

- 운영 `duings.com / api.duings.com`: 완전 지원
- 로컬 `localhost:3000 / localhost:8080`: Secure host-only Cookie로 완전 지원
- 일반 `*.vercel.app`: 인증 지원 대상 아님
- Preview 인증 테스트가 필요할 때: `preview.duings.com` 등 동일 사이트 커스텀 도메인 사용

Preview를 위해 `SameSite=None`, JavaScript JWT, BFF fallback을 추가하지 않는다. 운영 보안성과 단순성을
우선한다.

## 12. 배포와 롤백

1. 백엔드를 먼저 배포해 기존 Bearer 인증을 유지하면서 Cookie 인증과 웹 인증 API를 추가한다.
2. 백엔드에 `JWT_SECRET`, `AUTH_HINT_SECRET`을 주입하고 두 값이 다름을 확인한다.
3. Vercel에는 `AUTH_HINT_SECRET`만 주입한다. `JWT_SECRET`은 주입하지 않는다.
4. 프론트를 배포해 웹 API 클라이언트를 Cookie 모드로 전환한다.
5. 기존 1시간 토큰 만료 기간 후 레거시 JWT가 자연 만료됐는지 확인한다.

백엔드는 새 버전에서도 Cookie와 Bearer를 동시에 지원한다. 따라서 문제가 발생하면 백엔드는 유지하고
프론트만 이전 버전으로 롤백할 수 있다. 이전 프론트는 기존 `/auth/login`과 Bearer 경로를 그대로 사용해
즉시 복구된다. 새 프론트는 새 웹 인증 API에 의존하므로 백엔드를 먼저 이전 버전으로 롤백하면 안 된다.

## 13. 테스트 전략

### 13.1 백엔드

- 모바일 로그인 응답의 Bearer JWT 계약 유지
- 웹 로그인 본문에 JWT가 없고 두 Cookie가 올바른 속성으로 발급됨
- `__Host-duing_access_token`의 Secure·`Path=/`·Domain 미지정과 하위 도메인 주입 거부
- 운영과 localhost의 Secure Cookie 발급, 일반 HTTP 환경의 발급 거부
- Cookie 삭제가 발급과 같은 Name·Path·Domain·SameSite·Secure·HttpOnly 및 `Max-Age=0`을 사용
- Bearer 우선, Cookie 차선, `auth_hint` 무시
- Bearer 요청의 Origin 검사 제외
- Cookie 변경 요청의 허용·누락·불일치 Origin
- Origin 누락의 fail-closed 403과 Referer fallback 부재
- 모든 GET·HEAD API가 읽기 전용이며 알려진 상태 변경 경로가 GET을 허용하지 않음
- 웹 로그인·로그아웃 Origin 검증
- 웹 로그아웃의 Cookie 항상 삭제, 조건부 `token_version`, 멱등 성공
- Cookie 401만 Cookie 만료, Bearer 401은 Cookie 불변
- `AUTH_HINT_SECRET` 길이와 `JWT_SECRET` 동일 값 fail-fast
- `auth_hint`의 고정 `typ: "AUTH_HINT"`, 최소 payload와 서명 검증
- 웹·모바일 로그아웃이 전 디바이스 토큰을 무효화하는 기존 정책

### 13.2 프론트엔드

- Cookie 모드가 `credentials: include`를 사용하고 Authorization을 붙이지 않음
- 웹 로그인 결과와 Zustand에 JWT가 없음
- `/users/me` 성공·401·일시 오류 세션 복원
- 로그아웃 성공 후 상태·캐시 제거, 실패 시 상태 유지·차단성 경고·재시도
- 레거시 localStorage·sessionStorage·Cookie만 제거하고 다른 데이터 보존
- Middleware의 서명·타입·역할·만료 검증과 UX 리다이렉트
- `auth_hint`가 API 인증 자료로 사용되지 않음
- stale role의 API 403 접근 거부 화면과 세션 유지
- Cookie 401의 안전한 내부 `next` 복귀 및 기존 draft 복원

### 13.3 회귀 검증

- 프론트: lint, typecheck, 전체 test, production build
- 백엔드: 관련 단위·통합 테스트, 전체 test
- 운영과 동일한 두 도메인 환경에서 로그인, 새로고침, 권한 경로, 만료, 로그아웃 smoke test

## 14. 성공 기준

- 브라우저 JavaScript로 Access Token을 읽을 수 없다.
- 웹 로그인 응답·Zustand·localStorage·sessionStorage·JavaScript Cookie에 JWT가 없다.
- 모바일 Bearer 인증 계약이 깨지지 않는다.
- Cookie 인증 변경 요청은 허용 Origin에서만 성공한다.
- 모든 상태 변경 작업은 비-GET 메서드만 사용한다.
- Middleware는 UX만 담당하고 Spring Security가 모든 실제 인증·권한의 최종 책임을 갖는다.
- 운영·로컬 지원 범위와 배포·롤백 절차가 테스트와 문서로 고정된다.
