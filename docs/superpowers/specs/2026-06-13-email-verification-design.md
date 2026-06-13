# 회원가입 이메일 인증 (Resend) 설계서

- 작성일: 2026-06-13
- 대상 도메인: User / Auth
- 관련 요구사항: REQUIREMENTS.md §2.1 (U-1 비고 "인증 메일 발송은 Phase 2")

## 1. 배경 및 목적

현재 회원가입은 `@daegu.ac.kr` 정규식 검증과 DB 중복 체크만 수행하고 즉시 계정을 생성한다. 입력한 이메일을 실제로 소유했는지 확인하지 않으므로, 타인의 학교 이메일로 가입하거나 오타 이메일로 가입하는 것을 막을 수 없다. 본 변경으로 회원가입 전에 6자리 인증 코드를 이메일로 발송·확인하여 이메일 소유를 검증한다. 발송 채널은 Resend(도메인 `duings.com` 검증 완료, 발신 주소 `noreply@duings.com`)를 사용한다.

## 2. 범위

### 포함
- 이메일 발송 인프라: `EmailSender` 인터페이스 + Resend REST API 호출 구현체(RestClient) + 로컬용 Logging 구현체 (`global/email/`)
- 인증 코드 발송 API (`POST /api/v1/auth/email-verifications`)
- 인증 코드 확인 API (`POST /api/v1/auth/email-verifications/confirm`)
- 기존 회원가입 API에 "인증 완료된 이메일만 가입 허용" 가드 추가
- `email_verifications` 테이블 신설 (Flyway V50)
- IP 레이트리밋 + 일일 발송 상한 (in-memory, 단일 인스턴스 전제)
- 에러 응답에 machine-readable `code` 필드 도입 (`ApiResponse` 비파괴 확장)
- 회원가입 1단계(계정) 폼에 인증 코드 발송·입력 UI 통합 (`/signup`)

### 제외 (백로그)
- 비밀번호 재설정 (`/forgot-password`) — 본 인프라(`EmailSender`)를 재사용해 별도 설계
- 매직 링크 방식 인증
- 기존 가입자 소급 인증 (이미 가입된 계정은 인증된 것으로 간주)
- 이메일 발송 이력 감사 로그 테이블
- 이메일 템플릿 디자인 시스템 (이번에는 단순 HTML 본문)
- 만료 행 정리 배치 (이메일당 1행 upsert 구조라 불필요)
- 멀티 인스턴스 대응 레이트리밋 저장소 (Redis 등) — 인스턴스 증설 시 재설계

## 3. 인증 플로우

가입 전 사전 인증 방식. 계정 생성 전에 폼 안에서 이메일을 인증하고, 서버는 인증 상태를 DB로 관리한다. 프론트가 별도 토큰을 들고 다니지 않는다.

```
[1단계: 계정]
이메일 입력 → "인증코드 발송" → 메일 수신(6자리)
→ 코드 입력 → "확인" → 인증 완료 (이메일 필드 잠금)
→ 비밀번호 입력 → [2단계: 프로필] → 가입 완료
```

- 인증되지 않은 이메일로는 다음 단계 진행 불가 (프론트 차단 + 백엔드 signup 가드 이중 방어)
- 인증 완료 후 이메일을 수정하면 인증 상태 리셋
- 가입 성공 시 서버는 해당 인증 행을 삭제하여 재사용을 막는다

### 알려진 한계 (수용)

인증 상태가 이메일 단위(세션 무관)로 관리되므로, 피해자가 인증을 완료한 직후 같은 이메일을 아는 제3자가 먼저 signup을 완료하는 이론상의 race가 존재한다. 공격자가 피해자의 이메일과 가입 시점을 동시에 알아야 하고 만료 윈도우 내에만 가능해 위험은 낮다. 세션 바인딩(인증 토큰 발급)은 백로그로 둔다.

## 4. 정책

### 4.1 코드·만료 정책 — 단일 `expires_at`

| 항목 | 값 | 비고 |
|---|---|---|
| 코드 형식 | `SecureRandom` 6자리 숫자 | 선행 0 허용 (`000000`~`999999`) |
| 만료 | `expires_at` = 발송 시각 + **20분** | 코드 유효 시간과 인증 후 가입 유효 시간을 하나로 통합 |
| 재발송 쿨다운 | 60초 | `last_sent_at` 기준, 위반 시 429 |
| 검증 시도 한도 | 5회 | 초과 시 코드 무효화, 재발송 필요 |

- **Confirm**: `now < expiresAt`이면 인증 성공, `verifiedAt = now` 기록
- **Signup**: `verifiedAt != null && now < expiresAt`이면 가입 허용
- 별도 "인증 후 30분 윈도우" 정책은 두지 않는다. 만료 개념이 `expires_at` 하나로 통합되어 orphan verified row가 영구 재사용되는 경로가 차단되고, 테스트와 추론이 단순해진다.
- 엣지 케이스: 만료 직전(예: 19분차)에 인증하면 가입 완료까지 시간이 거의 없다. signup이 403(`EMAIL_NOT_VERIFIED`)을 반환하면 프론트는 1단계로 복귀시키고 재발송을 유도한다 (§8.1).

코드는 평문으로 저장하지 않고 **`HMAC-SHA256(secret, email + ":" + code)`** hex(64자)로 저장한다. secret은 환경변수 `EMAIL_VERIFICATION_SECRET`(기본값 없음, 필수)로 주입한다. 6자리 코드 특성상 해시는 보조 장치이며, 실질 방어선은 만료 20분 + 시도 5회 제한이다.

### 4.2 레이트리밋 (발송 API 최상단에서 검사)

| 단위 | 제한 | 위반 응답 |
|---|---|---|
| IP별 | 1분 5회 | 429 `VERIFICATION_RATE_LIMITED` |
| IP별 | 1시간 50회 | 429 `VERIFICATION_RATE_LIMITED` |
| 이메일별 | 60초 쿨다운 | 429 `VERIFICATION_COOLDOWN` |
| 전역 | 일일 5,000건 (Resend 쿼터 보호) | 503 `EMAIL_SEND_QUOTA_EXCEEDED` |

- 저장소: **in-memory** (`ConcurrentHashMap` 슬라이딩 윈도우 + `AtomicInteger` 일일 카운터, KST 자정 롤오버). 현재 백엔드는 단일 인스턴스 배포이므로 충분하며, 재시작 시 카운터가 리셋되는 것은 "쿼터 보호" 목적상 수용한다.
- 클라이언트 IP: prod가 프록시/LB 뒤에 있으므로 `X-Forwarded-For` 첫 번째 값을 사용하고, 헤더가 없으면 `remoteAddr`로 폴백한다. LB가 XFF를 덮어쓰는 환경 전제 — 배포 환경에서 확인 후 아니라면 `remoteAddr`만 사용한다.
- 일일 카운터는 Resend 발송 **시도** 시점에 증가한다 (실패한 호출도 Resend 쿼터를 소비하므로).

## 5. API 설계

세 엔드포인트 모두 기존 `SecurityConfig`의 `/api/v1/auth/**` permitAll 범위에 포함되어 추가 보안 설정이 필요 없다.

### 5.1 인증 코드 발송 — `POST /api/v1/auth/email-verifications`

Request:
```json
{ "email": "2021123456@daegu.ac.kr" }
```
- 검증: `@NotBlank` + `@Email` + SignupRequest와 동일한 `@daegu.ac.kr` 정규식
- 처리 순서:
  1. IP 레이트리밋 (1분 5회 / 1시간 50회) → 429 `VERIFICATION_RATE_LIMITED`
  2. 전역 일일 상한 (5,000건) → 503 `EMAIL_SEND_QUOTA_EXCEEDED`
  3. 이미 가입된 이메일(`existsByEmail`) → 409 `DuplicateEmailException` (기존 예외 재사용, code 없음 — FE는 status 409로 분기)
  4. 60초 쿨다운 내 재요청 → 429 `VERIFICATION_COOLDOWN`
  5. 코드 생성 → HMAC 해시 upsert (이메일당 1행, 기존 행 있으면 코드·만료·시도·인증 상태 리셋)
  6. Resend 동기 발송 → 실패 시 502 `EMAIL_SEND_FAILED`
- Response: `201 Created`
```json
{
  "ok": true,
  "data": {
    "expiresAt": "2026-06-13T12:20:00",
    "expiresInSeconds": 1200
  }
}
```
- 프론트 카운트다운의 단일 진실원천은 **`expiresInSeconds`** (클라이언트-서버 시계 오차 무관). `expiresAt`은 정보성 필드로, 기존 코드베이스 직렬화 컨벤션(`LocalDateTime`, 오프셋 없음)을 따른다.

### 5.2 인증 코드 확인 — `POST /api/v1/auth/email-verifications/confirm`

Request:
```json
{ "email": "2021123456@daegu.ac.kr", "code": "123456" }
```
- 처리 순서:
  1. 인증 행 없음 → 400 `EMAIL_VERIFICATION_NOT_FOUND`
  2. **`verifiedAt != null` → 200 즉시 반환 (멱등)** — 코드·만료 검사 없이 성공. 네트워크 재시도·더블클릭에 안전하다. 인증 후 만료된 행에도 200을 반환하지만, 그 경우 signup이 403으로 막고 프론트가 재발송을 유도하므로 플로우가 자연 복구된다. 재발송(reissue) 시 `verifiedAt`이 리셋되므로 멱등성은 새 코드 발급 전까지만 유지된다 (의도된 동작).
  3. 만료(`now >= expiresAt`) → 400 `EMAIL_VERIFICATION_EXPIRED`
  4. 시도 한도(5회) 초과 → 429 `VERIFICATION_ATTEMPT_EXCEEDED`
  5. 코드 불일치 → `attempt_count` 증가 후 400 `INVALID_VERIFICATION_CODE`
  6. 일치 → `verifiedAt = now` 기록
- Response: `200 OK` (본문 데이터 없음)

### 5.3 회원가입 가드 — `POST /api/v1/auth/signup` (기존 API 변경)

`GeneralUserService.signup()`의 기존 중복 체크 앞에 인증 확인을 추가한다.

- `email_verifications`에서 `verifiedAt != null && now < expiresAt` 확인
- 미인증·만료 → 403 `EMAIL_NOT_VERIFIED`
- 가입 성공 시 인증 행 삭제

### 5.4 에러 응답 — machine-readable code

HTTP status 외에 프론트 분기용 `code`를 제공한다.

```json
{
  "ok": false,
  "data": null,
  "message": "인증코드가 만료되었습니다. 다시 발송해주세요.",
  "code": "EMAIL_VERIFICATION_EXPIRED"
}
```

**`ApiResponse` 비파괴 확장**: `code` 필드를 추가하되 `@JsonInclude(NON_NULL)`로 직렬화해 기존 응답 계약은 변하지 않는다. `ApplicationException`에 선택적 `code`(기본 null)를 받는 생성자를 추가하고, `GlobalExceptionHandler.handleApplicationException`이 code를 응답에 실어준다. 기존 예외들은 code 없이 그대로 동작한다.

`com.duing.domain.user.exception.EmailVerificationException` 부모 + static inner class 컨벤션.

| 예외 | HTTP | code | 메시지 |
|---|---|---|---|
| `EmailVerificationNotFoundException` | 400 | `EMAIL_VERIFICATION_NOT_FOUND` | 인증 요청 이력이 없습니다. 인증코드를 먼저 발송해주세요. |
| `EmailVerificationExpiredException` | 400 | `EMAIL_VERIFICATION_EXPIRED` | 인증코드가 만료되었습니다. 다시 발송해주세요. |
| `InvalidVerificationCodeException` | 400 | `INVALID_VERIFICATION_CODE` | 인증코드가 올바르지 않습니다. |
| `VerificationCooldownException` | 429 | `VERIFICATION_COOLDOWN` | 잠시 후 다시 발송할 수 있습니다. |
| `VerificationAttemptExceededException` | 429 | `VERIFICATION_ATTEMPT_EXCEEDED` | 시도 횟수를 초과했습니다. 인증코드를 다시 발송해주세요. |
| `VerificationRateLimitedException` | 429 | `VERIFICATION_RATE_LIMITED` | 요청이 너무 많습니다. 잠시 후 다시 시도해주세요. |
| `EmailNotVerifiedException` | 403 | `EMAIL_NOT_VERIFIED` | 이메일 인증이 필요합니다. |
| `EmailSendFailedException` | 502 | `EMAIL_SEND_FAILED` | 인증 메일 발송에 실패했습니다. 잠시 후 다시 시도해주세요. |
| `EmailSendQuotaExceededException` | 503 | `EMAIL_SEND_QUOTA_EXCEEDED` | 일시적으로 발송이 제한되었습니다. 잠시 후 다시 시도해주세요. |

이미 가입된 이메일에 발송 시점에 409를 반환하면 계정 존재가 드러나지만, 동일 정보가 signup의 중복 체크에서 이미 드러나므로 추가 노출이 아니다. 발송 전에 알려주는 쪽이 UX에 낫다.

## 6. 발송 인프라 (`global/email/`)

기존 `FileStorageService`(Strategy + `@ConditionalOnProperty`) 패턴을 동일하게 따른다.

```
global/email/
├── EmailSender.java            (interface)  void send(EmailMessage message)
├── EmailMessage.java           (record)     to, subject, html
├── ResendEmailSender.java      @ConditionalOnProperty(name="email.provider", havingValue="resend")
├── LoggingEmailSender.java     @ConditionalOnProperty(..., havingValue="logging", matchIfMissing=true)
└── ResendProperties.java       (record) @ConfigurationProperties(prefix="resend") — apiKey, from
```

### 6.1 ResendEmailSender — RestClient 직접 호출

Resend 공식 Java SDK(`resend-java`)는 내부에서 `new OkHttpClient()`를 하드코딩해 **타임아웃 설정 주입점이 없다** (4.13.0 기준 소스 확인). 타임아웃 3초 요구를 충족하기 위해 SDK 대신 **spring-web 내장 `RestClient`로 Resend REST API를 직접 호출**한다. 필요한 API는 `POST https://api.resend.com/emails` 하나뿐이라 구현 부담이 없고, 의존성도 추가되지 않는다.

- 요청: `Authorization: Bearer ${RESEND_API_KEY}`, body `{ "from": "Du-ing <noreply@duings.com>", "to": [...], "subject": "...", "html": "..." }`
- **타임아웃: connect 3초 / read 3초** (`ClientHttpRequestFactorySettings`) — Resend 장애 시 발송 API가 길게 블로킹되지 않는다
- 비 2xx 응답·타임아웃·I/O 예외 → `EmailSendFailedException`(502)으로 변환, 원인은 `log.error`로 기록
- `LoggingEmailSender`: 수신자·제목·본문을 `log.info`로 출력 — 로컬 개발과 CI에서 API 키 없이 동작

### 6.2 설정

```yaml
email:
  provider: ${EMAIL_PROVIDER:logging}
  verification:
    secret: ${EMAIL_VERIFICATION_SECRET}    # HMAC 키, 기본값 없음(필수)
resend:
  api-key: ${RESEND_API_KEY:}
  from: ${RESEND_FROM:noreply@duings.com}
```

- prod 배포 환경변수에 `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`(CI Secret), `EMAIL_VERIFICATION_SECRET`(CI Secret) 주입 — 코드·yml에 시크릿 직접 기재 금지
- 로컬 `.env`에도 `EMAIL_VERIFICATION_SECRET` 추가 (`JWT_SECRET`과 동일한 취급)
- 메일 본문: "Du-ing 이메일 인증" 제목 + 6자리 코드 + 유효 시간 안내가 담긴 단순 HTML (Java 텍스트 블록)
- 발송은 동기 처리한다. 발송 실패를 사용자에게 즉시 알려야 하고, 프로젝트에 `@Async` 인프라가 없으며 도입할 이유가 부족하다.

### 6.3 레이트리밋 컴포넌트

`domain/user/service/EmailVerificationRateLimiter` (`@Component`, in-memory):

- IP별 슬라이딩 윈도우 2개(1분/1시간): `ConcurrentHashMap<String, Deque<Instant>>`, 접근 시 윈도우 밖 타임스탬프 제거
- 전역 일일 카운터: `AtomicInteger` + KST 날짜 키, 날짜가 바뀌면 리셋
- 단일 인스턴스 전제를 클래스 Javadoc에 명시. 인스턴스 증설 시 Redis 기반으로 교체 (백로그)

## 7. 도메인 모델 · DB

### 7.1 엔티티

`com.duing.domain.user.entity.EmailVerification`

| 필드 | 타입 | 비고 |
|---|---|---|
| `id` | `Long` | PK |
| `email` | `String` | UNIQUE — 이메일당 1행 |
| `codeHash` | `String` | HMAC-SHA256 hex (64자) |
| `expiresAt` | `LocalDateTime` | 발송 + 20분 |
| `verifiedAt` | `LocalDateTime` | null = 미인증 |
| `attemptCount` | `int` | 검증 실패 횟수 |
| `lastSentAt` | `LocalDateTime` | 쿨다운 기준 |

도메인 메서드: `reissue(codeHash, now)` (코드 재발급 — 만료·시도·인증 상태 리셋), `verify(now)`, `isVerified()`, `isExpired(now)`, `isUsableForSignup(now)` (`verifiedAt != null && now < expiresAt`), `increaseAttempt()`, `isInCooldown(now)`. 시간 비교 로직은 엔티티에 두고 서비스는 `LocalDateTime.now()` 주입만 담당한다.

### 7.2 마이그레이션 — `V50__create_email_verifications_table.sql`

```sql
CREATE TABLE email_verifications (
    id            BIGSERIAL    PRIMARY KEY,
    email         VARCHAR(100) NOT NULL,
    code_hash     VARCHAR(64)  NOT NULL,
    expires_at    TIMESTAMP    NOT NULL,
    verified_at   TIMESTAMP,
    attempt_count INT          NOT NULL DEFAULT 0,
    last_sent_at  TIMESTAMP    NOT NULL,
    created_at    TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uk_email_verifications_email ON email_verifications (email);
```

- 이메일당 1행 upsert 방식이므로 테이블이 무한히 자라지 않아 별도 정리 잡이 필요 없다 (가입 완료 행은 삭제, 미완료 행은 재발송 시 덮어씀)
- soft delete 미적용 — 인증 이력은 보존 가치가 없는 일회성 상태다

### 7.3 동시성 — 동일 이메일 동시 발송 요청

메일 2통 발송과 코드 덮어쓰기를 모두 막는다.

**행이 없을 때 (insert race)**
```
insert → DataIntegrityViolationException
→ 재조회 → last_sent_at 재검사
→ 쿨다운 위반 → 429 VERIFICATION_COOLDOWN (메일 미발송)
```
패자는 메일을 보내지 않으므로 2통 발송이 방지된다. (저장 후 발송 순서 — 발송은 항상 자기 트랜잭션이 확정한 코드로만 수행)

**행이 있을 때 (update race)**
기존 행 조회를 `@Lock(LockModeType.PESSIMISTIC_WRITE)`로 잠근다. 두 번째 트랜잭션은 첫 번째 커밋 후 잠금을 획득하고, 갱신된 `last_sent_at`으로 쿨다운을 재평가해 429를 반환한다. 잠금 없이는 두 요청이 모두 쿨다운을 통과해 코드를 덮어쓰고 메일을 2통 보낼 수 있다.

**동시 signup race**: 기존 `uk_users_email_active` partial unique index가 최종 방어.

### 7.4 서비스 구성

`com.duing.domain.user.service` 에 신설:

- `EmailVerificationService` (interface) — `sendCode(SendVerificationCommand)`, `confirmCode(ConfirmVerificationCommand)`, `assertVerified(String email)`, `consume(String email)`
- `GeneralEmailVerificationService` (구현체) — `@Transactional(readOnly = true)` 기본, 쓰기 메서드 오버라이드. HMAC 해시 계산·코드 생성 담당
- `GeneralUserService.signup()`은 `assertVerified()` 호출 후 기존 로직 진행, 저장 성공 후 `consume()` 호출

API 인터페이스는 기존 `AuthApi`에 메서드 2개 추가, 구현은 `AuthController`.

## 8. 프론트엔드

### 8.1 회원가입 폼 (`apps/web/app/(auth)/signup`)

`SignupStepAccount`에 인증 플로우를 인라인 통합:

1. 이메일 입력 → 형식 유효 시 "인증코드 발송" 버튼 활성화
2. 발송 성공 → 코드 입력 필드 노출, 만료 카운트다운(**`expiresInSeconds` 기반** mm:ss), 재발송 버튼(60초 쿨다운 타이머)
3. 6자리 입력 → "확인" → 성공 시 이메일 필드 잠금 + "인증 완료" 배지
4. 잠긴 이메일 수정 시 인증 상태 리셋 (발송 단계로 복귀)
5. `_lib/signup-state.ts`에 `emailVerified` 상태 추가 — 미인증 시 2단계(프로필) 진행 차단
6. signup 제출이 403 `EMAIL_NOT_VERIFIED`로 실패하면 (인증 후 만료된 경우) 1단계로 복귀 + "인증이 만료되었어요. 다시 인증해주세요" 안내 + 재발송 유도

에러 매핑 — **`code` 기준 분기** (409만 status 분기):

| 분기 기준 | UI 처리 |
|---|---|
| status 409 (이미 가입) | "이미 가입된 이메일이에요" + 로그인 링크 |
| `VERIFICATION_COOLDOWN` | 재발송 버튼 비활성 + 남은 시간 안내 |
| `VERIFICATION_RATE_LIMITED` | "요청이 너무 많아요. 잠시 후 다시 시도해주세요" |
| `VERIFICATION_ATTEMPT_EXCEEDED` | "시도 횟수 초과" + 재발송 유도 |
| `EMAIL_VERIFICATION_EXPIRED` / `EMAIL_VERIFICATION_NOT_FOUND` | 발송 단계로 복귀 + 재발송 유도 |
| `INVALID_VERIFICATION_CODE` | 코드 필드 인라인 에러 |
| `EMAIL_NOT_VERIFIED` (signup 시) | 1단계 복귀 + 재인증 유도 |
| `EMAIL_SEND_FAILED` / `EMAIL_SEND_QUOTA_EXCEEDED` | "발송에 실패했어요. 잠시 후 다시 시도해주세요" |

### 8.2 패키지 레이어

| 위치 | 추가 내용 |
|---|---|
| `packages/types/src/user.ts` | `SendEmailVerificationPayload`, `ConfirmEmailVerificationPayload`, `EmailVerificationResult`(expiresAt, expiresInSeconds) |
| `packages/api/src/client.ts` | `auth.sendEmailVerification()`, `auth.confirmEmailVerification()` — 에러 객체에 `code` 노출 (api error 타입 확장) |
| `packages/hooks/src/auth.ts` | `useSendEmailVerificationMutation`, `useConfirmEmailVerificationMutation` |
| `packages/schemas/src/index.ts` | 6자리 숫자 코드 스키마 (`/^\d{6}$/`). `signupSchema`는 변경 없음 — 인증 여부는 폼 상태로 관리 |

## 9. 테스트

### 9.1 백엔드 (RestAssured + TestContainers)

test 프로파일에 기록형 `StubEmailSender`(마지막 발송 `EmailMessage` 보관)를 등록한다. 통합 테스트는 Stub에서 발송된 본문의 코드를 추출해 confirm까지 검증한다.

통합 시나리오:
- 발송 → 확인 → 가입 해피패스
- 만료된 코드 확인 시 400 `EMAIL_VERIFICATION_EXPIRED`
- 코드 5회 불일치 후 6번째 시도 429 `VERIFICATION_ATTEMPT_EXCEEDED`
- 60초 내 재발송 요청 429 `VERIFICATION_COOLDOWN`
- 이미 가입된 이메일 발송 요청 409
- 미인증 이메일 signup 403 `EMAIL_NOT_VERIFIED`
- 인증 후 `expires_at` 경과 signup 403
- 가입 성공 시 인증 행 삭제 확인
- 재발송 시 이전 코드 무효 + 시도 카운트·인증 상태 리셋 확인
- **confirm 멱등성**: 인증 완료 후 동일 요청 재호출 200
- **IP 레이트리밋**: 1분 내 6번째 발송 요청 429 `VERIFICATION_RATE_LIMITED`
- **에러 응답에 `code` 필드 포함** 확인, 기존 API 에러 응답에는 `code` 미노출(비파괴) 확인

단위 테스트:
- 코드 생성(선행 0 포함 항상 6자리), HMAC 해시 일치/불일치
- `EmailVerification` 도메인 메서드(만료·signup 가능 판정·시도 증가·reissue 리셋·쿨다운)
- `EmailVerificationRateLimiter` 윈도우 동작·일일 카운터 롤오버
- `ResendEmailSender`: `MockRestServiceServer`로 성공 / 비 2xx / 타임아웃 → `EmailSendFailedException` 변환 검증

### 9.2 프론트엔드

발송 → 코드 입력 → 인증 완료 → 단계 진행 플로우, 미인증 시 진행 차단, 이메일 수정 시 리셋, `code` 기반 에러 분기. 기존 프론트 테스트 컨벤션을 따르며 구현계획 단계에서 구체화한다.

## 10. 구현 분할 (1단위 = 1브랜치 = 1PR)

1. **백엔드** — `feat/{이슈}-email-verification-api`: V50 마이그레이션 + `global/email/` 인프라 + `ApiResponse` code 확장 + 인증 API 2개 + 레이트리밋 + signup 가드 + 테스트
2. **프론트** — `feat/{이슈}-signup-email-verification-ui`: 회원가입 페이지 인증 UI + 패키지 레이어 + 테스트

백엔드 PR이 머지·배포되어야 프론트 PR이 동작하므로 순차 진행한다.

## 11. 선행 작업 (코드 외)

- prod 배포 환경에 환경변수 등록: `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`(CI Secret), `EMAIL_VERIFICATION_SECRET`(CI Secret)
- 로컬 `.env`에 `EMAIL_VERIFICATION_SECRET` 추가
- Resend 대시보드에서 `duings.com` 발신 도메인 검증 상태 확인 (완료됨)
- prod LB/프록시가 `X-Forwarded-For`를 신뢰할 수 있게 설정하는지 확인 (IP 레이트리밋 정확도)
