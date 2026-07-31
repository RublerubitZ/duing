# Refresh Token 재사용 탐지 — 응답 코드 분리 · 감사 로그 보강

- 날짜: 2026-07-31
- 상태: 확정
- 선행 스펙: [2026-07-18-refresh-token-session-auth-design.md](./2026-07-18-refresh-token-session-auth-design.md) (이하 "원 스펙")

## 1. 배경 — 요구사항 대비 갭 분석

"Refresh Token Re-use Detection 추가" 요청을 받아 현행 시스템을 전수 대조한 결과,
**요구사항 대부분은 원 스펙(V86, PR #641·#675~680)으로 이미 prod 가동 중**이다.
이 문서는 신규 구축이 아니라 **잔여 갭 2건**의 설계다.

| 요구사항 | 현행 상태 | 판정 |
|---|---|---|
| 1. Rotation (구토큰 즉시 폐기 + RT/AT 재발급) | `rotate()` — ACTIVE→ROTATED, 새 쌍 발급, 부분 UNIQUE로 "세션당 ACTIVE 1개" DB 강제 | ✅ 기충족 |
| 2. Hash 저장 + Token Family | SHA-256 hex만 저장(원문 무저장). 패밀리 = 세션(원 스펙 §5.2 — `session_id`가 곧 familyId, 세대별 행이 이력이라 임의 세대 탐지 가능) | ✅ 기충족 |
| 3. Re-use Detection (A발급→A사용→B발급→A재사용) | `detectReuse()` — grace 밖 ROTATED·모든 REVOKED 제시 시 세션(패밀리) 폐기 + 전 토큰 REVOKED + 감사 + Sentry, 이후 재발급 불가 | ✅ 기충족 |
| 4. Audit Log (userId·familyId·tokenId·event·**ip·userAgent**) | `auth_event` REUSE_DETECTED 기록됨. 단 **ip/userAgent가 항상 null** — `rotate()`가 클라이언트 정보를 받지 않음 | ⚠️ **갭 1** |
| 5. 401 + code `REFRESH_TOKEN_REUSED` | 사유 불문 단일 `AUTH_SESSION_EXPIRED`(원 스펙 §8의 의도적 결정) | ⚠️ **갭 2** |
| 6. 원타임 사용·Row Lock·REVOKED 재사용 불가·패밀리 revoke | 세션 행 FOR UPDATE로 동시 요청 직렬화, REVOKED 제시는 전부 탐지, `revokeBySessionIds` 패밀리 단위 폐기 | ✅ 기충족 |
| 7. 테스트 7종 | 정상 rotation·재사용(grace 안/밖)·동시 2건/8건(실스레드)·만료·폐기 세션·패밀리 폐기 영속·감사 영속 — 전부 존재 | ✅ 기충족 (갭 단언만 보강) |

## 2. 이번에 구현하는 것

### 2.1 갭 1 — 재사용 탐지 감사 이벤트에 ip/userAgent

`rotate()` 시그니처를 `rotate(String rawRefreshToken, String clientIp, String userAgent)`로
확장한다(레포 전례: `userService.signup(command, clientIp, userAgent)`).
두 호출처(`AuthController.refresh`, `webRefresh`)에서 기존 로그인과 동일하게
`getRemoteAddr()` / `User-Agent` 헤더로 추출해 전달하고, `detectReuse()`가
`AuthEvent.of(...)`의 ip/userAgent 인자로 넘긴다. Bearer `refresh` 엔드포인트는
`HttpServletRequest` 파라미터가 없으므로 `AuthApi` 인터페이스와 함께 추가한다.

`auth_event` 테이블에 ip_address·user_agent 컬럼이 이미 있으므로 **스키마 변경 없음**.

### 2.2 갭 2 — 재사용 탐지 401 코드 분리

`AuthSessionException.RefreshTokenReusedException` 추가:

- HTTP 401, code `REFRESH_TOKEN_REUSED`
- 메시지는 레포 컨벤션(사용자 대면 한글) 유지: `"이미 사용된 리프레시 토큰입니다. 다시 로그인해주세요."`
  (요청서의 영문 메시지 대신 — code가 기계 계약이고 메시지는 표시용)
- `detectReuse()`가 기존 `SessionExpiredException` 대신 이것을 던진다

원 스펙 §8은 "재사용 여부를 외부에 구분해 주지 않는다"를 의도적으로 택했으나,
이번 요청이 구분 코드를 명시 요구하므로 **재사용 탐지 경로만** 분리한다.
그 외 모든 실패(미존재·만료·폐기 세션·grace 밖이 아닌 경로)는 기존
`AUTH_SESSION_EXPIRED` 유지 — 유효/무효 토큰 구별 오라클은 여전히 제공하지 않는다.
공격자가 얻는 추가 정보는 "이 토큰이 한때 유효했고 이미 회전됐다"뿐이며, 이는
Auth0 등 상용 IdP도 노출하는 수준이다.

**FE 영향 없음**: `packages/api/src/client.ts`의 refresh 실패 분기는 status
(401/404)만 보고 code를 읽지 않는다. 401 유지이므로 세션 종료 처리 동일.

### 2.3 함정 2건 (구현 시 필수 반영)

1. **`noRollbackFor` 누락 = 보안 사고**: `rotate()`의
   `@Transactional(noRollbackFor = SessionExpiredException.class)`에
   `RefreshTokenReusedException`을 추가하지 않으면, 새 예외가 트랜잭션을 롤백시켜
   **패밀리 폐기·감사 기록이 증발하고 탈취 세션이 살아남는다**. 두 클래스를 명시 나열한다.
2. **webRefresh 쿠키 3종 삭제 불변식**: `webRefresh`의
   `catch (SessionExpiredException)`을 `catch (AuthSessionException)`으로 넓힌다.
   재사용 탐지 401에서 쿠키(특히 auth_hint)가 남으면 FE 미들웨어가 로그인 페이지를
   되돌려 재로그인이 불가능해진다(기존 주석의 사고 시나리오 그대로).
   현재 rotate의 모든 401 경로는 복구 불가 세션 종료이므로 부모 타입 catch가 정확하다.

### 2.4 문서·테스트

- `AuthApi` 두 refresh 엔드포인트의 401 설명에 코드 2종(`AUTH_SESSION_EXPIRED`,
  `REFRESH_TOKEN_REUSED`) 명시. 단 **REUSED는 패밀리당 최초 탐지 1회**임을 함께
  적는다 — 탐지가 세션을 폐기하면 이후 재제시는 `session.isUsable` 선행 검사에서
  `AUTH_SESSION_EXPIRED`로 떨어진다.
- 설계 근거 주석 3곳 동기화(코드와 반대말 방지): `AuthSessionService` rotate
  javadoc, `AuthSessionException.SessionExpiredException` javadoc("사유 불문 단일
  401" 서술), `GeneralAuthSessionService.rotate`의 noRollbackFor 주석.
- 테스트 보강 (신규 파일 없이 기존 파일 확장, 상대 날짜만 사용):
  - `AuthSessionRotationTest`: grace 밖 재사용·REVOKED 재사용 케이스의 기존
    `SessionExpiredException` 단언을 `RefreshTokenReusedException` 으로 **교체**
    (형제 예외라 교체가 강제된다) + 감사 이벤트 ip/userAgent 단언 추가
  - 탐지 2회째(폐기된 세션에 재제시)는 `AUTH_SESSION_EXPIRED`인 것 단언 1건 추가
  - `AuthRefreshControllerTest`(HTTP 계약): 재사용 시 401 + body code
    `REFRESH_TOKEN_REUSED` 단언, web refresh 재사용 시 쿠키 3종 삭제 단언
  - `AuthRefreshControllerTest`(갭 1 배선 회귀 가드): 재사용 제시 요청에만 식별용
    User-Agent 를 실어 보내고, REUSE_DETECTED 감사 이벤트의 user_agent 가 그 값·
    ip_address 가 non-null 인 것 단언(web·mobile 두 호출처) — 컨트롤러가
    `rotate(token, null, null)` 로 되돌아가면 여기서 깨진다
  - `AuthRefreshConcurrencyTest`: grace 밖 구토큰을 4스레드가 동시 제시해도
    `RefreshTokenReusedException` 정확히 1건 + 나머지 `SessionExpiredException`,
    REUSE_DETECTED 감사 1건, 세션 폐기 단언 — `AuthApi` 가 공언한 "패밀리당 최초 1회"가
    `rotate` 의 `isUsable` 선행 검사 순서에만 의존하므로 그 순서를 실스레드로 고정한다
  - 나머지 401 경로(미존재 토큰 등)가 여전히 `AUTH_SESSION_EXPIRED`인 것 단언
- `rotate` 시그니처 변경 파급: `AuthSessionService` 인터페이스 + 기존 테스트
  호출부(2개 파일 11곳)의 기계적 수정 — 구현체는 `GeneralAuthSessionService`
  단일, 컴파일러가 강제한다.

## 3. 하지 않는 것 (Out of Scope)

- **`familyId`/`parentTokenId` 컬럼 추가** — 요청서의 "필드 예시"는 기능 요건이며,
  원 스펙 §5.2가 세션=패밀리 2-테이블 구조로 동일 기능(임의 세대 탐지·패밀리 단위
  revoke)을 이미 더 강하게 보장한다. prod 가동 스키마를 기능 이득 없이 바꾸지 않는다.
- **재사용 탐지 시 전 세션(사용자 전체) 로그아웃** — 원 스펙 §5.4 유지: 해당
  패밀리(세션)만 폐기. 오탐 시 타격 최소화. 요청서 3의 "모든 Refresh Token 폐기"도
  "해당 Token Family 전체를 revoke"에 걸린 패밀리 범위로 해석. 패턴 감지 시
  `revokeAll()`로 확전할 수 있는 구조는 이미 있다.
- **grace window(기본 30초) 제거** — 원 스펙 §5.3/§11의 멀티탭 오탐 방지 장치.
  엄격 원타임이 필요하면 `DUING_AUTH_REFRESH_REUSE_GRACE_SECONDS=0`으로 코드 변경
  없이 조정 가능하다.
- **토큰 해시 Argon2/Bcrypt 전환** — 256bit 랜덤 토큰은 사전공격이 불가능해 느린
  해시가 불필요하며(요청서도 SHA-256 허용), 매 refresh마다 KDF 비용만 늘어난다.
- **Access Token 즉시 무효화** — 원 스펙 §5.5 유지(짧은 TTL + tokenVersion으로 충분).
- **DB 마이그레이션** — 없음.

## 4. 검증 기준

- `./gradlew test` 전체 통과 (Docker/TestContainers)
- 재사용 탐지 시: 401 `REFRESH_TOKEN_REUSED` + 세션 폐기·전 토큰 REVOKED·감사
  이벤트(ip/userAgent 포함)가 401 이후에도 영속 + web 경로 쿠키 3종 삭제
- 그 외 401 경로의 code·동작 무변경 (FE 회귀 없음)
