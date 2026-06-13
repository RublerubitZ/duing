# 회원가입 이메일 인증 (Resend) 설계서

- 작성일: 2026-06-13
- 대상 도메인: User / Auth
- 관련 요구사항: REQUIREMENTS.md §2.1 (U-1 비고 "인증 메일 발송은 Phase 2")

## 1. 배경 및 목적

현재 회원가입은 `@daegu.ac.kr` 정규식 검증과 DB 중복 체크만 수행하고 즉시 계정을 생성한다. 입력한 이메일을 실제로 소유했는지 확인하지 않으므로, 타인의 학교 이메일로 가입하거나 오타 이메일로 가입하는 것을 막을 수 없다. 본 변경으로 회원가입 전에 6자리 인증 코드를 이메일로 발송·확인하여 이메일 소유를 검증한다. 발송 채널은 Resend(도메인 `duings.com` 검증 완료, 발신 주소 `noreply@duings.com`)를 사용한다.

## 2. 범위

### 포함
- 이메일 발송 인프라: `EmailSender` 인터페이스 + Resend SDK 구현체 + 로컬용 Logging 구현체 (`global/email/`)
- 인증 코드 발송 API (`POST /api/v1/auth/email-verifications`)
- 인증 코드 확인 API (`POST /api/v1/auth/email-verifications/confirm`)
- 기존 회원가입 API에 "인증 완료된 이메일만 가입 허용" 가드 추가
- `email_verifications` 테이블 신설 (Flyway V50)
- 회원가입 1단계(계정) 폼에 인증 코드 발송·입력 UI 통합 (`/signup`)

### 제외 (백로그)
- 비밀번호 재설정 (`/forgot-password`) — 본 인프라(`EmailSender`)를 재사용해 별도 설계
- 매직 링크 방식 인증
- 기존 가입자 소급 인증 (이미 가입된 계정은 인증된 것으로 간주)
- 이메일 발송 이력 감사 로그 테이블
- 이메일 템플릿 디자인 시스템 (이번에는 단순 HTML 본문)

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

## 4. 정책 수치

| 항목 | 값 | 비고 |
|---|---|---|
| 코드 형식 | `SecureRandom` 6자리 숫자 | 선행 0 허용 (`000000`~`999999`) |
| 코드 유효 시간(TTL) | 발송 후 10분 | `expires_at` |
| 재발송 쿨다운 | 60초 | `last_sent_at` 기준, 위반 시 429 |
| 검증 시도 한도 | 5회 | 초과 시 코드 무효화, 재발송 필요 |
| 인증 후 가입 유효 윈도우 | 30분 | `verified_at` + 30분 내 signup 완료 필요 |

코드는 평문으로 저장하지 않고 `SHA-256(email + ":" + code)` 해시로 저장한다. 6자리 코드는 해시되어도 전수 대입으로 역산 가능하므로 해시는 보조 장치이며, 실질 방어선은 TTL 10분 + 시도 5회 제한이다.

## 5. API 설계

세 엔드포인트 모두 기존 `SecurityConfig`의 `/api/v1/auth/**` permitAll 범위에 포함되어 추가 보안 설정이 필요 없다.

### 5.1 인증 코드 발송 — `POST /api/v1/auth/email-verifications`

Request:
```json
{ "email": "2021123456@daegu.ac.kr" }
```
- 검증: `@NotBlank` + `@Email` + SignupRequest와 동일한 `@daegu.ac.kr` 정규식
- 처리 순서:
  1. 이미 가입된 이메일(`existsByEmail`) → 409 `DuplicateEmailException` (기존 예외 재사용)
  2. 60초 쿨다운 내 재요청 → 429 `VerificationCooldownException`
  3. 코드 생성 → 해시 upsert (이메일당 1행, 기존 행 있으면 코드·만료·시도 카운트 리셋)
  4. Resend 동기 발송 → 실패 시 502 `EmailSendFailedException`
- Response: `201 Created`
```json
{ "data": { "expiresAt": "2026-06-13T12:10:00" } }
```
`expiresAt`은 프론트 카운트다운 표시용.

### 5.2 인증 코드 확인 — `POST /api/v1/auth/email-verifications/confirm`

Request:
```json
{ "email": "2021123456@daegu.ac.kr", "code": "123456" }
```
- 처리 순서:
  1. 인증 행 없음 → 400 `EmailVerificationNotFoundException`
  2. 만료(`expires_at` 경과) → 400 `EmailVerificationExpiredException`
  3. 시도 한도(5회) 초과 → 429 `VerificationAttemptExceededException`
  4. 코드 불일치 → `attempt_count` 증가 후 400 `InvalidVerificationCodeException`
  5. 일치 → `verified_at` 기록
- Response: `200 OK` (본문 데이터 없음)

### 5.3 회원가입 가드 — `POST /api/v1/auth/signup` (기존 API 변경)

`GeneralUserService.signup()`의 기존 중복 체크 앞에 인증 확인을 추가한다.

- `email_verifications`에서 해당 이메일의 `verified_at`이 존재하고 30분 이내인지 확인
- 미인증·만료 → 403 `EmailNotVerifiedException`
- 가입 성공 시 인증 행 삭제

### 5.4 예외 정리

`com.duing.domain.user.exception.EmailVerificationException` 부모 + static inner class 컨벤션.

| 예외 | HTTP | 메시지 |
|---|---|---|
| `EmailVerificationNotFoundException` | 400 | 인증 요청 이력이 없습니다. 인증코드를 먼저 발송해주세요. |
| `EmailVerificationExpiredException` | 400 | 인증코드가 만료되었습니다. 다시 발송해주세요. |
| `InvalidVerificationCodeException` | 400 | 인증코드가 올바르지 않습니다. |
| `VerificationAttemptExceededException` | 429 | 시도 횟수를 초과했습니다. 인증코드를 다시 발송해주세요. |
| `VerificationCooldownException` | 429 | 잠시 후 다시 발송할 수 있습니다. |
| `EmailNotVerifiedException` | 403 | 이메일 인증이 필요합니다. |
| `EmailSendFailedException` | 502 | 인증 메일 발송에 실패했습니다. 잠시 후 다시 시도해주세요. |

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

- `ResendEmailSender`: 공식 SDK `com.resend:resend-java:4.4.0` 사용. 발송 실패(SDK 예외) 시 `EmailSendFailedException`으로 변환
- `LoggingEmailSender`: 수신자·제목·본문을 `log.info`로 출력 — 로컬 개발과 CI에서 API 키 없이 동작
- 설정 (application.yml):

```yaml
email:
  provider: ${EMAIL_PROVIDER:logging}
resend:
  api-key: ${RESEND_API_KEY:}
  from: ${RESEND_FROM:noreply@duings.com}
```

- prod 배포 환경변수에 `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`(CI Secret) 주입 — 코드·yml에 시크릿 직접 기재 금지
- 메일 본문: "Du-ing 이메일 인증" 제목 + 6자리 코드 + 유효 시간 안내가 담긴 단순 HTML (Java 텍스트 블록)
- 발송은 동기 처리한다. 발송 실패를 사용자에게 즉시 알려야 하고, 프로젝트에 `@Async` 인프라가 없으며 도입할 이유가 부족하다.

## 7. 도메인 모델 · DB

### 7.1 엔티티

`com.duing.domain.user.entity.EmailVerification`

| 필드 | 타입 | 비고 |
|---|---|---|
| `id` | `Long` | PK |
| `email` | `String` | UNIQUE — 이메일당 1행 |
| `codeHash` | `String` | SHA-256 hex (64자) |
| `expiresAt` | `LocalDateTime` | 발송 + 10분 |
| `verifiedAt` | `LocalDateTime` | null = 미인증 |
| `attemptCount` | `int` | 검증 실패 횟수 |
| `lastSentAt` | `LocalDateTime` | 쿨다운 기준 |

도메인 메서드: `reissue(codeHash, now)` (코드 재발급 — 만료·시도·인증 상태 리셋), `verify(now)`, `isExpired(now)`, `isVerifiedWithin(now, window)`, `increaseAttempt()`. 시간 비교 로직은 엔티티에 두고 서비스는 `LocalDateTime.now()` 주입만 담당한다.

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

### 7.3 동시성

- 동일 이메일 동시 발송 요청: UNIQUE 인덱스가 1행을 보장. insert race는 `DataIntegrityViolationException` catch 후 재조회 (기존 `GeneralNotificationService.createIfAbsent()` 패턴)
- 동시 signup race: 기존 `uk_users_email_active` partial unique index가 최종 방어

### 7.4 서비스 구성

`com.duing.domain.user.service` 에 신설:

- `EmailVerificationService` (interface) — `sendCode(SendVerificationCommand)`, `confirmCode(ConfirmVerificationCommand)`, `assertVerified(String email)`, `consume(String email)`
- `GeneralEmailVerificationService` (구현체) — `@Transactional(readOnly = true)` 기본, 쓰기 메서드 오버라이드
- `GeneralUserService.signup()`은 `assertVerified()` 호출 후 기존 로직 진행, 저장 성공 후 `consume()` 호출

API 인터페이스는 기존 `AuthApi`에 메서드 2개 추가, 구현은 `AuthController`.

## 8. 프론트엔드

### 8.1 회원가입 폼 (`apps/web/app/(auth)/signup`)

`SignupStepAccount`에 인증 플로우를 인라인 통합:

1. 이메일 입력 → 형식 유효 시 "인증코드 발송" 버튼 활성화
2. 발송 성공 → 코드 입력 필드 노출, 만료 카운트다운(`expiresAt` 기반 mm:ss), 재발송 버튼(60초 쿨다운 타이머)
3. 6자리 입력 → "확인" → 성공 시 이메일 필드 잠금 + "인증 완료" 배지
4. 잠긴 이메일 수정 시 인증 상태 리셋 (발송 단계로 복귀)
5. `_lib/signup-state.ts`에 `emailVerified` 상태 추가 — 미인증 시 2단계(프로필) 진행 차단

에러 매핑:

| 응답 | UI 처리 |
|---|---|
| 409 (이미 가입) | "이미 가입된 이메일이에요" + 로그인 링크 |
| 429 (쿨다운·시도 초과) | 남은 시간 안내 / 재발송 유도 |
| 400 (만료·불일치) | 코드 필드 인라인 에러 |
| 502 (발송 실패) | "발송에 실패했어요. 잠시 후 다시 시도해주세요" |

### 8.2 패키지 레이어

| 위치 | 추가 내용 |
|---|---|
| `packages/types/src/user.ts` | `SendEmailVerificationPayload`, `ConfirmEmailVerificationPayload`, `EmailVerificationResult`(expiresAt) |
| `packages/api/src/client.ts` | `auth.sendEmailVerification()`, `auth.confirmEmailVerification()` |
| `packages/hooks/src/auth.ts` | `useSendEmailVerificationMutation`, `useConfirmEmailVerificationMutation` |
| `packages/schemas/src/index.ts` | 6자리 숫자 코드 스키마 (`/^\d{6}$/`). `signupSchema`는 변경 없음 — 인증 여부는 폼 상태로 관리 |

## 9. 테스트

### 9.1 백엔드 (RestAssured + TestContainers)

test 프로파일에 기록형 `StubEmailSender`(마지막 발송 `EmailMessage` 보관)를 등록한다. 통합 테스트는 Stub에서 발송된 본문의 코드를 추출해 confirm까지 검증한다.

시나리오:
- 발송 → 확인 → 가입 해피패스
- 만료된 코드 확인 시 400
- 코드 5회 불일치 후 6번째 시도 429 (무효화)
- 60초 내 재발송 요청 429
- 이미 가입된 이메일 발송 요청 409
- 미인증 이메일 signup 403
- 인증 후 30분 경과 signup 403
- 가입 성공 시 인증 행 삭제 확인
- 재발송 시 이전 코드 무효 + 시도 카운트 리셋 확인

단위 테스트: 코드 생성(선행 0 포함 항상 6자리), 해시 일치/불일치, `EmailVerification` 도메인 메서드(만료·윈도우·시도 증가).

### 9.2 프론트엔드

발송 → 코드 입력 → 인증 완료 → 단계 진행 플로우, 미인증 시 진행 차단, 이메일 수정 시 리셋. 기존 프론트 테스트 컨벤션을 따르며 구현계획 단계에서 구체화한다.

## 10. 구현 분할 (1단위 = 1브랜치 = 1PR)

1. **백엔드** — `feat/{이슈}-email-verification-api`: V50 마이그레이션 + `global/email/` 인프라 + 인증 API 2개 + signup 가드 + 테스트
2. **프론트** — `feat/{이슈}-signup-email-verification-ui`: 회원가입 페이지 인증 UI + 패키지 레이어 + 테스트

백엔드 PR이 머지·배포되어야 프론트 PR이 동작하므로 순차 진행한다.

## 11. 선행 작업 (코드 외)

- prod 배포 환경에 `EMAIL_PROVIDER=resend`, `RESEND_API_KEY` 환경변수(CI Secret) 등록
- Resend 대시보드에서 `duings.com` 발신 도메인 검증 상태 확인 (완료됨)
