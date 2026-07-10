# PR2 — 학번 로그인 전환 + signup MO 토큰 소비 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **구현 워커 공통 제약: `git push`·PR 생성 금지.** 커밋까지만 하고 멈춘다. push/PR 은 전체 리뷰·self-check 후 사용자 확인을 받아 컨트롤러가 수행한다.

**Goal:** 로그인 식별자를 이메일 → 학번(8자리)으로, 회원가입 진위 확인을 이메일 인증 → MO 인증 세션(`verificationToken`) 소비로 전환하고, 이메일 인증 API·백엔드 email 노출을 제거한다 (breaking — PR3 FE 전환과 근접 배포).

**Architecture:** 설계서 `docs/superpowers/specs/2026-07-09-student-id-login-mo-auth-design.md` §7.3·7.4·7.7·9.2(V80)·9.4·13·16 의 PR2 행. PR1(#617)이 만든 MO 세션 도메인 위에 "소비(consume)" 경로만 추가한다: signup 이 `PhoneVerificationSessionManager` 의 행잠금 트랜잭션(REQUIRED — signup 트랜잭션에 참여)으로 세션을 검증·소비하고, 전화번호는 항상 세션에서 나온다. email 은 V80 으로 nullable 화만 하고 컬럼·테이블 drop 은 PR5 (expand/contract).

**Tech Stack:** Spring Boot 3.4 / Java 21 / Flyway / TestContainers PG16 + RestAssured.

## Global Constraints

- 작업 디렉터리: 모든 gradle 명령은 `backend/` 에서 실행한다 (`cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend`). `| tail` 등으로 exit code 를 가리지 말 것.
- 브랜치: `feat/student-id-login-switch` (develop 에서 분기 — PR1 관례상 이슈번호 없는 형식).
- 커밋: Conventional Commits 한국어 (`feat(backend): ...`). **Co-Authored-By / 🤖 Generated 라인 절대 금지.**
- Flyway: 기존 마이그레이션 파일 수정 금지 — V80 신규 파일만.
- MO 인증 경로의 시각은 반드시 `Clock`(= `seoulClock`, `TimeConfig`) 주입 — raw `LocalDateTime.now()` 금지. **테스트에서 `phone_verifications` 를 시드/조작할 때도 `LocalDateTime.now(clock)` 기준** (CI JVM 은 UTC 라 raw now 로 시드하면 +9h 어긋나 happy path 가 CI 에서만 깨진다). 로그인 잠금 등 기존 로직의 raw now 는 건드리지 않는다 (spec §7.4 "식별자만 교체").
- 테스트 날짜는 상대값만 (하드코딩 미래 절대날짜 = CI 타임밤 금지). DB `NOW()` 와 JVM now 를 섞어 비교하는 시드는 시간대 차(±9h)를 압도하는 간격(1일 이상)만 사용.
- DTO 는 record, 검증 메시지는 한국어. `@DisplayName` 은 요구사항 문장. 변수명 축약(`dto`/`r`/`e`) 금지.
- 시크릿 하드코딩 금지. `application*.yml` 의 메일 설정(`email.*`/`resend.*`/`brevo.*`/`spring.mail`/`management.health.mail.enabled=false`)은 **PR2 에서 건드리지 않는다** (인프라 제거는 PR5, health 키는 PR5 에도 유지).
- 모든 신규/수정 파일 EOF newline.
- 각 태스크 완료 시 커밋. 태스크마다 spec 리뷰 + 코드 품질 리뷰(duing-code-reviewer)를 통과해야 다음 태스크로 진행.

## Out of Scope (이 PR 에서 하지 않는 것)

- FE 전환 (PR3), 전화번호 변경 재인증·비밀번호 재설정·`IssuePhoneVerificationRequest` purpose 노출 (PR4), email 컬럼·`email_verifications` 테이블 drop·메일 인프라(`global/email/**`, `MailProviderConfig`, `ResendClientConfig`, yml 메일 키, `spring-boot-starter-mail`) 제거 (PR5).
- `updateProfile` 의 phone 자유 수정 제거 (PR4 — 지금은 기존 정책 유지).
- `VerificationPurpose` Javadoc 의 "PR4 에서 구현" 문구 갱신 (PR4 몫).
- `IntegrationTestBase` TRUNCATE 목록의 `email_verifications` — 테이블이 PR5 까지 살아 있으므로 유지.

---

### Task 0: 브랜치 생성

**Files:** 없음 (git 만)

- [ ] **Step 0-1: develop 최신화 후 분기**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git checkout develop && git pull origin develop
git checkout -b feat/student-id-login-switch
```

Expected: `Switched to a new branch 'feat/student-id-login-switch'`

---

### Task 1: V80 마이그레이션 + `User.phoneVerifiedAt` 도메인 반영

**Files:**
- Create: `backend/src/main/resources/db/migration/V80__users_email_nullable_clear_verifications.sql`
- Modify: `backend/src/main/java/com/duing/domain/user/entity/User.java` (필드·메서드 추가만 — email 제거는 Task 7)
- Test: `backend/src/test/java/com/duing/domain/user/entity/UserCreateTest.java`

**Interfaces:**
- Consumes: V79 가 이미 만든 `users.phone_verified_at TIMESTAMP` 컬럼 (엔티티 미매핑 상태).
- Produces: `User.markPhoneVerified(LocalDateTime verifiedAt): void`, `User.getPhoneVerifiedAt(): LocalDateTime` — Task 3 signup 이 사용.

- [ ] **Step 1-1: 실패하는 테스트 작성** — `UserCreateTest` 에 아래 테스트를 추가한다 (기존 테스트는 그대로).

```java
    @Test
    @DisplayName("생성 직후 phoneVerifiedAt 은 null(미인증)이고, markPhoneVerified 로 인증 시각이 기록된다")
    void markPhoneVerifiedRecordsVerificationTime() {
        LocalDateTime verifiedAt = LocalDateTime.now();
        User user = User.create(
                "20240001", "홍길동", "hong@daegu.ac.kr", "hashed", UserRole.STUDENT,
                Grade.JUNIOR, College.IT_ENGINEERING, "컴퓨터정보공학부", "010-1234-5678",
                verifiedAt.minusMinutes(1));

        assertThat(user.getPhoneVerifiedAt()).isNull();

        user.markPhoneVerified(verifiedAt);

        assertThat(user.getPhoneVerifiedAt()).isEqualTo(verifiedAt);
    }
```

- [ ] **Step 1-2: 실패 확인**

Run: `./gradlew test --tests 'com.duing.domain.user.entity.UserCreateTest'`
Expected: COMPILE FAIL — `cannot find symbol: method getPhoneVerifiedAt()`

- [ ] **Step 1-3: 구현** — `User.java` 의 `phone` 필드 선언 아래에 필드를, `changePassword` 메서드 아래에 메서드를 추가한다.

```java
    // 필드 (phone 선언 바로 아래)
    /** MO 인증 완료 시각 — null 은 전환 이전 자기신고 번호(미인증). 운영 구분·소급 인증 유도 근거 (spec §9.1). */
    @Column(name = "phone_verified_at")
    private LocalDateTime phoneVerifiedAt;
```

```java
    // 메서드 (changePassword 아래)
    /** 현재 phone 이 MO 인증을 통과한 번호임을 확정한다 — signup(및 PR4 번호 변경)에서만 호출한다. */
    public void markPhoneVerified(LocalDateTime verifiedAt) {
        this.phoneVerifiedAt = verifiedAt;
    }
```

주의: `@Builder`/`create()` 에는 넣지 않는다 — 픽스처·레거시 사용자(미인증)는 null 이 올바른 값이고, 108개 테스트 호출부의 시그니처 churn 을 피한다. spec §7.3 의 "phoneVerifiedAt=now" 는 signup 이 `markPhoneVerified(now)` 호출로 달성한다.

- [ ] **Step 1-4: V80 마이그레이션 작성**

```sql
-- PR2: 로그인·가입이 학번 + 휴대폰 MO 인증으로 전환됨에 따라 email 을 선택 컬럼으로 낮추고,
-- 더 이상 발급·검증되지 않는 이메일 인증 코드 행(raw 이메일 PII)을 비운다.
-- email 컬럼·email_verifications 테이블은 drop 하지 않는다 (구 이미지 롤백 안전, expand/contract).
-- 물리 drop 과 메일 인프라 제거는 PR5 의 후속 마이그레이션에서 수행한다 (spec §9.2·16).
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;

TRUNCATE TABLE email_verifications;
```

- [ ] **Step 1-5: 테스트 통과 + 마이그레이션 스모크 확인** — 통합 테스트 부팅 시 Flyway 가 V80 을 적용한다.

Run: `./gradlew test --tests 'com.duing.domain.user.entity.UserCreateTest' --tests 'com.duing.domain.user.controller.AuthPhoneVerificationTest'`
Expected: PASS (V80 적용 실패면 컨텍스트 로드 단계에서 터진다)

- [ ] **Step 1-6: 커밋**

```bash
git add src/main/resources/db/migration/V80__users_email_nullable_clear_verifications.sql \
        src/main/java/com/duing/domain/user/entity/User.java \
        src/test/java/com/duing/domain/user/entity/UserCreateTest.java
git commit -m "feat(backend): users.email nullable 전환(V80) 및 phone_verified_at 도메인 반영"
```

---

### Task 2: MO 세션 소비 게이트 — `PhoneNotVerifiedException` + `consumed()` 팩토리 + SessionManager 검증·소비

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/user/exception/PhoneVerificationException.java`
- Modify: `backend/src/main/java/com/duing/domain/user/entity/PhoneVerificationEvent.java`
- Modify: `backend/src/main/java/com/duing/domain/user/entity/PhoneVerificationEventType.java` (Javadoc 만)
- Modify: `backend/src/main/java/com/duing/domain/user/service/PhoneVerificationSessionManager.java`
- Test: `backend/src/test/java/com/duing/domain/user/service/PhoneVerificationSessionConsumeTest.java` (신규)

**Interfaces:**
- Consumes: `PhoneVerification.status(LocalDateTime)` / `markVerified(LocalDateTime)` / `PhoneVerificationStatus.VERIFIED` / `PhoneVerificationRepository.findByTokenForUpdate(String)` / `PhoneVerificationEventRepository.save(...)` (전부 PR1 산출물).
- Produces (Task 3 signup 이 사용):
  - `PhoneVerificationException.PhoneNotVerifiedException` — 403, code `PHONE_NOT_VERIFIED`
  - `PhoneVerificationEvent.consumed(PhoneVerification phoneVerification, Long userId, String clientIp, String userAgent): PhoneVerificationEvent`
  - `PhoneVerificationSessionManager.getVerifiedSessionForUpdate(String verificationToken, VerificationPurpose expectedPurpose, LocalDateTime now): PhoneVerification`
  - `PhoneVerificationSessionManager.consume(PhoneVerification verifiedSession, Long userId, String clientIp, String userAgent): void`

- [ ] **Step 2-1: 실패하는 테스트 작성** — `PhoneVerificationSessionConsumeTest.java` 신규 파일.

```java
package com.duing.domain.user.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.user.entity.PhoneVerification;
import com.duing.domain.user.entity.PhoneVerificationEvent;
import com.duing.domain.user.entity.PhoneVerificationEventType;
import com.duing.domain.user.entity.VerificationPurpose;
import com.duing.domain.user.exception.PhoneVerificationException;
import com.duing.domain.user.repository.PhoneVerificationEventRepository;
import com.duing.domain.user.repository.PhoneVerificationRepository;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.annotation.Transactional;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@Transactional
class PhoneVerificationSessionConsumeTest {

    @Autowired PhoneVerificationSessionManager sessionManager;
    @Autowired PhoneVerificationRepository phoneVerificationRepository;
    @Autowired PhoneVerificationEventRepository phoneVerificationEventRepository;
    @Autowired Clock clock;

    private PhoneVerification saveSession(String phone) {
        return phoneVerificationRepository.save(PhoneVerification.issue(
                phone, UUID.randomUUID().toString(), VerificationPurpose.SIGNUP, null,
                LocalDateTime.now(clock)));
    }

    private PhoneVerification saveVerifiedSession(String phone) {
        PhoneVerification session = saveSession(phone);
        session.markVerified(LocalDateTime.now(clock));
        return session;
    }

    @Test
    @DisplayName("인증 완료된 SIGNUP 세션은 행잠금 조회로 반환된다")
    void returnsVerifiedSignupSession() {
        PhoneVerification verified = saveVerifiedSession("010-2000-0001");

        PhoneVerification loaded = sessionManager.getVerifiedSessionForUpdate(
                verified.getToken(), VerificationPurpose.SIGNUP, LocalDateTime.now(clock));

        assertThat(loaded.getPhone()).isEqualTo("010-2000-0001");
    }

    @Test
    @DisplayName("존재하지 않는 토큰으로 소비를 시도하면 PHONE_NOT_VERIFIED 예외가 발생한다")
    void rejectsUnknownToken() {
        assertThatThrownBy(() -> sessionManager.getVerifiedSessionForUpdate(
                "no-such-token", VerificationPurpose.SIGNUP, LocalDateTime.now(clock)))
                .isInstanceOf(PhoneVerificationException.PhoneNotVerifiedException.class);
    }

    @Test
    @DisplayName("아직 인증되지 않은(PENDING) 세션으로 소비를 시도하면 예외가 발생한다")
    void rejectsPendingSession() {
        PhoneVerification pending = saveSession("010-2000-0002");

        assertThatThrownBy(() -> sessionManager.getVerifiedSessionForUpdate(
                pending.getToken(), VerificationPurpose.SIGNUP, LocalDateTime.now(clock)))
                .isInstanceOf(PhoneVerificationException.PhoneNotVerifiedException.class);
    }

    @Test
    @DisplayName("인증 후 완료 창(SIGNUP 30분)이 지난 세션으로 소비를 시도하면 예외가 발생한다")
    void rejectsSessionPastCompletionWindow() {
        PhoneVerification stale = saveSession("010-2000-0003");
        stale.markVerified(LocalDateTime.now(clock).minusMinutes(31));

        assertThatThrownBy(() -> sessionManager.getVerifiedSessionForUpdate(
                stale.getToken(), VerificationPurpose.SIGNUP, LocalDateTime.now(clock)))
                .isInstanceOf(PhoneVerificationException.PhoneNotVerifiedException.class);
    }

    @Test
    @DisplayName("만료된(미인증) 세션으로 소비를 시도하면 예외가 발생한다")
    void rejectsExpiredUnverifiedSession() {
        // 발급 유효 5분 — 6분 전 발급 세션은 이미 EXPIRED (spec §15 "만료 후 signup 403")
        PhoneVerification expired = phoneVerificationRepository.save(PhoneVerification.issue(
                "010-2000-0007", UUID.randomUUID().toString(), VerificationPurpose.SIGNUP, null,
                LocalDateTime.now(clock).minusMinutes(6)));

        assertThatThrownBy(() -> sessionManager.getVerifiedSessionForUpdate(
                expired.getToken(), VerificationPurpose.SIGNUP, LocalDateTime.now(clock)))
                .isInstanceOf(PhoneVerificationException.PhoneNotVerifiedException.class);
    }

    @Test
    @DisplayName("용도가 다른(비 SIGNUP 기대) 세션으로 소비를 시도하면 예외가 발생한다")
    void rejectsPurposeMismatch() {
        PhoneVerification verified = saveVerifiedSession("010-2000-0004");

        assertThatThrownBy(() -> sessionManager.getVerifiedSessionForUpdate(
                verified.getToken(), VerificationPurpose.PHONE_CHANGE, LocalDateTime.now(clock)))
                .isInstanceOf(PhoneVerificationException.PhoneNotVerifiedException.class);
    }

    @Test
    @DisplayName("소비하면 세션 행이 삭제되고 userId 가 포함된 CONSUMED 감사 이벤트가 남는다")
    void consumeDeletesRowAndRecordsAuditEvent() {
        PhoneVerification verified = saveVerifiedSession("010-2000-0005");
        String token = verified.getToken();

        sessionManager.consume(verified, 77L, "127.0.0.1", "junit-agent");

        assertThat(phoneVerificationRepository.findByToken(token)).isEmpty();
        List<PhoneVerificationEvent> events = phoneVerificationEventRepository.findAll();
        assertThat(events).hasSize(1);
        PhoneVerificationEvent consumedEvent = events.get(0);
        assertThat(consumedEvent.getEventType()).isEqualTo(PhoneVerificationEventType.CONSUMED);
        assertThat(consumedEvent.getUserId()).isEqualTo(77L);
        assertThat(consumedEvent.getPhone()).isEqualTo("010-2000-0005");
        assertThat(consumedEvent.getPurpose()).isEqualTo(VerificationPurpose.SIGNUP);
        assertThat(consumedEvent.getClientIp()).isEqualTo("127.0.0.1");
    }

    @Test
    @DisplayName("300자를 넘는 User-Agent 는 CONSUMED 이벤트에서도 300자로 잘려 저장된다")
    void consumeTruncatesOversizedUserAgent() {
        PhoneVerification verified = saveVerifiedSession("010-2000-0006");

        sessionManager.consume(verified, 78L, "127.0.0.1", "x".repeat(400));

        PhoneVerificationEvent consumedEvent = phoneVerificationEventRepository.findAll().get(0);
        assertThat(consumedEvent.getUserAgent()).hasSize(300);
    }
}
```

- [ ] **Step 2-2: 실패 확인**

Run: `./gradlew test --tests 'com.duing.domain.user.service.PhoneVerificationSessionConsumeTest'`
Expected: COMPILE FAIL — `PhoneNotVerifiedException`, `getVerifiedSessionForUpdate`, `consume` 미존재

- [ ] **Step 2-3: `PhoneNotVerifiedException` 추가** — `PhoneVerificationException.java` 의 `PhoneVerificationNotFoundException` 클래스 아래에 추가.

```java
    /** 미존재·미인증·만료(완료 창 초과 포함)·용도 불일치 세션으로 완료(signup 등)를 시도 — 사유 미특정 단일 403 (spec §7.8). */
    public static class PhoneNotVerifiedException extends PhoneVerificationException {
        private static final String MESSAGE = "휴대폰 인증이 완료되지 않았습니다. 인증 후 다시 시도해주세요.";

        public PhoneNotVerifiedException() {
            super(MESSAGE, HttpStatus.FORBIDDEN, "PHONE_NOT_VERIFIED");
        }
    }
```

- [ ] **Step 2-4: `PhoneVerificationEvent.consumed()` 팩토리 추가** — `verified(...)` 팩토리 아래에 추가.

```java
    public static PhoneVerificationEvent consumed(PhoneVerification phoneVerification, Long userId,
                                                  String clientIp, String userAgent) {
        return PhoneVerificationEvent.builder()
                .userId(userId)
                .phone(phoneVerification.getPhone())
                .purpose(phoneVerification.getPurpose())
                .eventType(PhoneVerificationEventType.CONSUMED)
                .clientIp(clientIp)
                .userAgent(truncateUserAgent(userAgent))
                .build();
    }
```

`PhoneVerificationEventType` Javadoc 도 현행화한다:

```java
/** 감사 이벤트 종류 — VERIFIED(인증 성공), CONSUMED(용도 완료 — 가입은 PR2, 번호변경·재설정은 PR4 에서 기록). */
```

- [ ] **Step 2-5: SessionManager 에 검증·소비 메서드 추가** — `PhoneVerificationSessionManager.java` 의 `confirmIfPending` 아래에 추가. import 에 `com.duing.domain.user.entity.PhoneVerificationStatus` 추가.

```java
    /**
     * 완료(소비) 직전 검증 — 행잠금으로 같은 토큰의 동시 완료(이중 소비)를 직렬화한다. 미존재·미인증·
     * 만료(완료 창 초과 포함)·용도 불일치 전부 사유 미특정 단일 403 (spec §7.3·7.8). 호출자(signup 등)의
     * 트랜잭션에 참여(REQUIRED)하므로 잠금은 호출자 커밋까지 유지된다 — 패자는 커밋 후 삭제된 행을
     * 보게 되어 403 으로 수렴한다.
     */
    @Transactional
    public PhoneVerification getVerifiedSessionForUpdate(String verificationToken,
                                                         VerificationPurpose expectedPurpose,
                                                         LocalDateTime now) {
        PhoneVerification lockedSession = phoneVerificationRepository
                .findByTokenForUpdate(verificationToken)
                .orElseThrow(PhoneVerificationException.PhoneNotVerifiedException::new);
        if (lockedSession.getPurpose() != expectedPurpose
                || lockedSession.status(now) != PhoneVerificationStatus.VERIFIED) {
            throw new PhoneVerificationException.PhoneNotVerifiedException();
        }
        return lockedSession;
    }

    /**
     * 용도 완료 — 세션 행을 삭제(재사용 차단, spec §5.1)하고 userId 를 포함한 CONSUMED 감사 이벤트를
     * 남긴다 (spec §9.3). 호출자 트랜잭션에 참여해 사용자 저장과 원자적으로 커밋된다.
     */
    @Transactional
    public void consume(PhoneVerification verifiedSession, Long userId, String clientIp, String userAgent) {
        phoneVerificationRepository.delete(verifiedSession);
        phoneVerificationEventRepository.save(
                PhoneVerificationEvent.consumed(verifiedSession, userId, clientIp, userAgent));
    }
```

- [ ] **Step 2-6: 테스트 통과 확인**

Run: `./gradlew test --tests 'com.duing.domain.user.service.PhoneVerificationSessionConsumeTest'`
Expected: PASS (8 tests)

- [ ] **Step 2-7: 커밋**

```bash
git add src/main/java/com/duing/domain/user/exception/PhoneVerificationException.java \
        src/main/java/com/duing/domain/user/entity/PhoneVerificationEvent.java \
        src/main/java/com/duing/domain/user/entity/PhoneVerificationEventType.java \
        src/main/java/com/duing/domain/user/service/PhoneVerificationSessionManager.java \
        src/test/java/com/duing/domain/user/service/PhoneVerificationSessionConsumeTest.java
git commit -m "feat(backend): MO 세션 소비(consume) 게이트와 CONSUMED 감사 이벤트 추가"
```

---

### Task 3: 회원가입 전환 — `verificationToken` 소비 방식

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/user/controller/dto/request/SignupRequest.java`
- Modify: `backend/src/main/java/com/duing/domain/user/service/dto/command/SignupCommand.java`
- Modify: `backend/src/main/java/com/duing/domain/user/service/UserService.java`
- Modify: `backend/src/main/java/com/duing/domain/user/service/GeneralUserService.java`
- Modify: `backend/src/main/java/com/duing/domain/user/api/AuthApi.java` (signup 시그니처·Swagger 문구)
- Modify: `backend/src/main/java/com/duing/domain/user/controller/AuthController.java`
- Test: `backend/src/test/java/com/duing/domain/user/controller/AuthControllerSignupTest.java` (전면 재작성)

**Interfaces:**
- Consumes: Task 2 의 `getVerifiedSessionForUpdate` / `consume` / `PhoneNotVerifiedException`, Task 1 의 `markPhoneVerified`, PR1 의 `PhoneVerification.issue/markVerified`, `seoulClock` `Clock` 빈.
- Produces:
  - `SignupCommand(String studentId, String name, String rawPassword, Grade grade, College college, String major, String verificationToken)`
  - `UserService.signup(SignupCommand signupCommand, String clientIp, String userAgent): Long`
  - `POST /api/v1/auth/signup` 요청 계약: email·phone 제거, `verificationToken` 추가 (403 `PHONE_NOT_VERIFIED` / 409 유지)
- 참고: 이 시점의 `User.create` 는 아직 10-인자(email 포함) — signup 은 email 자리에 `null` 을 넘긴다 (V80 으로 컬럼 nullable). email 인자 제거는 Task 7.

- [ ] **Step 3-1: 실패하는 테스트 작성** — `AuthControllerSignupTest.java` 를 아래 내용으로 **전체 교체**한다.

```java
package com.duing.domain.user.controller;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.notNullValue;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.user.entity.PhoneVerification;
import com.duing.domain.user.entity.PhoneVerificationEvent;
import com.duing.domain.user.entity.PhoneVerificationEventType;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.VerificationPurpose;
import com.duing.domain.user.repository.PhoneVerificationEventRepository;
import com.duing.domain.user.repository.PhoneVerificationRepository;
import com.duing.domain.user.repository.UserRepository;
import com.duing.domain.user.service.MoPollThrottle;
import com.duing.domain.user.service.PhoneVerificationRateLimiter;
import com.duing.global.mo.StubMoVerificationClient;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import io.restassured.path.json.JsonPath;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AuthControllerSignupTest extends IntegrationTestBase {

    @LocalServerPort
    private int port;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PhoneVerificationRepository phoneVerificationRepository;

    @Autowired
    private PhoneVerificationEventRepository phoneVerificationEventRepository;

    @Autowired
    private StubMoVerificationClient stubMoClient;

    @Autowired
    private PhoneVerificationRateLimiter rateLimiter;

    @Autowired
    private MoPollThrottle moPollThrottle;

    // MO 세션 시각은 서버(seoulClock)와 같은 기준으로 시드해야 한다 — raw now() 는 CI(UTC JVM)에서 +9h 어긋난다.
    @Autowired
    private Clock clock;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        rateLimiter.reset();
        moPollThrottle.reset();
        stubMoClient.clear();
    }

    /** 인증 완료 상태의 MO 세션을 시드하고 verificationToken 을 반환한다 — 가드 통과용. */
    private String prepareVerifiedPhone(String phone) {
        LocalDateTime now = LocalDateTime.now(clock);
        PhoneVerification verification = PhoneVerification.issue(
                phone, UUID.randomUUID().toString(), VerificationPurpose.SIGNUP, null, now);
        verification.markVerified(now);
        return phoneVerificationRepository.save(verification).getToken();
    }

    private Map<String, Object> validBody(String verificationToken) {
        return Map.of(
                "studentId", "20240001",
                "name", "홍길동",
                "password", "Abcd1234!",
                "grade", "JUNIOR",
                "college", "IT_ENGINEERING",
                "major", "컴퓨터정보공학부",
                "verificationToken", verificationToken,
                "termsOfServiceAgreed", true,
                "privacyPolicyAgreed", true
        );
    }

    @Test
    @DisplayName("인증 완료된 세션 토큰으로 가입하면 201, 전화번호는 세션 값으로 저장되고 인증 시각이 기록된다")
    void signupStoresSessionPhoneAndVerifiedAt() {
        String token = prepareVerifiedPhone("010-1234-5678");

        Long userId = given().contentType(ContentType.JSON).body(validBody(token))
                .when().post("/api/v1/auth/signup")
                .then().statusCode(HttpStatus.CREATED.value())
                .body("data", notNullValue())
                .extract().jsonPath().getLong("data");

        User saved = userRepository.findById(userId).orElseThrow();
        assertThat(saved.getPhone()).isEqualTo("010-1234-5678");
        assertThat(saved.getPhoneVerifiedAt()).isNotNull();
        assertThat(saved.getTermsAgreedAt()).isNotNull();
        assertThat(saved.getMajor()).isEqualTo("컴퓨터정보공학부");
    }

    @Test
    @DisplayName("가입이 완료되면 세션 행은 삭제되고 userId 가 포함된 CONSUMED 감사 이벤트가 남는다")
    void signupConsumesSessionAndRecordsAuditEvent() {
        String token = prepareVerifiedPhone("010-1234-5678");

        Long userId = given().contentType(ContentType.JSON).body(validBody(token))
                .when().post("/api/v1/auth/signup")
                .then().statusCode(HttpStatus.CREATED.value())
                .extract().jsonPath().getLong("data");

        assertThat(phoneVerificationRepository.findByToken(token)).isEmpty();
        List<PhoneVerificationEvent> consumedEvents = phoneVerificationEventRepository.findAll().stream()
                .filter(event -> event.getEventType() == PhoneVerificationEventType.CONSUMED)
                .toList();
        assertThat(consumedEvents).hasSize(1);
        assertThat(consumedEvents.get(0).getUserId()).isEqualTo(userId);
        assertThat(consumedEvents.get(0).getPhone()).isEqualTo("010-1234-5678");
    }

    @Test
    @DisplayName("같은 토큰으로 두 번 가입할 수 없다 — 두 번째 시도는 403 을 반환한다")
    void signupRejectsTokenReuse() {
        String token = prepareVerifiedPhone("010-1234-5678");
        given().contentType(ContentType.JSON).body(validBody(token))
                .when().post("/api/v1/auth/signup")
                .then().statusCode(HttpStatus.CREATED.value());

        Map<String, Object> secondBody = new HashMap<>(validBody(token));
        secondBody.put("studentId", "20240002");

        given().contentType(ContentType.JSON).body(secondBody)
                .when().post("/api/v1/auth/signup")
                .then().statusCode(HttpStatus.FORBIDDEN.value())
                .body("code", equalTo("PHONE_NOT_VERIFIED"));
    }

    @Test
    @DisplayName("존재하지 않는 토큰으로 가입하면 403 과 PHONE_NOT_VERIFIED 코드를 반환한다")
    void signupRejectsUnknownToken() {
        given().contentType(ContentType.JSON).body(validBody(UUID.randomUUID().toString()))
                .when().post("/api/v1/auth/signup")
                .then().statusCode(HttpStatus.FORBIDDEN.value())
                .body("code", equalTo("PHONE_NOT_VERIFIED"));
    }

    @Test
    @DisplayName("아직 인증되지 않은(PENDING) 세션 토큰으로 가입하면 403 을 반환한다")
    void signupRejectsPendingSession() {
        PhoneVerification pending = phoneVerificationRepository.save(PhoneVerification.issue(
                "010-1234-5678", UUID.randomUUID().toString(), VerificationPurpose.SIGNUP, null,
                LocalDateTime.now(clock)));

        given().contentType(ContentType.JSON).body(validBody(pending.getToken()))
                .when().post("/api/v1/auth/signup")
                .then().statusCode(HttpStatus.FORBIDDEN.value())
                .body("code", equalTo("PHONE_NOT_VERIFIED"));
    }

    @Test
    @DisplayName("인증 후 완료 창(30분)이 지난 세션 토큰으로 가입하면 403 을 반환한다")
    void signupRejectsSessionPastCompletionWindow() {
        LocalDateTime now = LocalDateTime.now(clock);
        PhoneVerification staleSession = PhoneVerification.issue(
                "010-1234-5678", UUID.randomUUID().toString(), VerificationPurpose.SIGNUP, null, now);
        staleSession.markVerified(now.minusMinutes(31));
        phoneVerificationRepository.save(staleSession);

        given().contentType(ContentType.JSON).body(validBody(staleSession.getToken()))
                .when().post("/api/v1/auth/signup")
                .then().statusCode(HttpStatus.FORBIDDEN.value())
                .body("code", equalTo("PHONE_NOT_VERIFIED"));
    }

    @Test
    @DisplayName("학번·전화번호 중 무엇이 중복이어도 동일한 409 메시지를 반환한다(계정 열거 방지)")
    void signupDuplicateMessageDoesNotRevealWhichField() {
        String firstToken = prepareVerifiedPhone("010-1234-5678");
        given().contentType(ContentType.JSON).body(validBody(firstToken))
                .when().post("/api/v1/auth/signup")
                .then().statusCode(HttpStatus.CREATED.value());

        // 학번만 중복 (전화번호는 새 번호)
        String studentIdCollisionToken = prepareVerifiedPhone("010-9999-0001");
        Map<String, Object> studentIdCollisionBody = new HashMap<>(validBody(studentIdCollisionToken));
        String studentIdCollisionMessage = given().contentType(ContentType.JSON).body(studentIdCollisionBody)
                .when().post("/api/v1/auth/signup")
                .then().statusCode(HttpStatus.CONFLICT.value())
                .extract().jsonPath().getString("message");

        // 전화번호만 중복 (세션 번호가 이미 가입된 번호 — 인증~가입 사이 창의 TOCTOU 재검증)
        String phoneCollisionToken = prepareVerifiedPhone("010-1234-5678");
        Map<String, Object> phoneCollisionBody = new HashMap<>(validBody(phoneCollisionToken));
        phoneCollisionBody.put("studentId", "20249992");
        String phoneCollisionMessage = given().contentType(ContentType.JSON).body(phoneCollisionBody)
                .when().post("/api/v1/auth/signup")
                .then().statusCode(HttpStatus.CONFLICT.value())
                .extract().jsonPath().getString("message");

        assertThat(studentIdCollisionMessage)
                .isEqualTo(phoneCollisionMessage)
                .doesNotContain("학번").doesNotContain("전화번호");
    }

    @Test
    @DisplayName("verificationToken 이 없으면 400 을 반환한다")
    void signupRejectsMissingVerificationToken() {
        Map<String, Object> body = new HashMap<>(validBody("placeholder"));
        body.remove("verificationToken");

        given().contentType(ContentType.JSON).body(body)
                .when().post("/api/v1/auth/signup")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("이용약관 또는 개인정보 동의가 false 면 400 을 반환한다")
    void signupRejectsWhenTermsNotAgreed() {
        Map<String, Object> body = new HashMap<>(validBody(prepareVerifiedPhone("010-1234-5678")));
        body.put("privacyPolicyAgreed", false);

        given().contentType(ContentType.JSON).body(body)
                .when().post("/api/v1/auth/signup")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("비밀번호가 영문만으로 구성되면 400 을 반환한다")
    void signupRejectsWeakPasswordAlphaOnly() {
        Map<String, Object> body = new HashMap<>(validBody(prepareVerifiedPhone("010-1234-5678")));
        body.put("password", "abcdefghij");

        given().contentType(ContentType.JSON).body(body)
                .when().post("/api/v1/auth/signup")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("단과대학 enum 외 값을 보내면 400 을 반환한다")
    void signupRejectsUnknownCollege() {
        Map<String, Object> body = new HashMap<>(validBody(prepareVerifiedPhone("010-1234-5678")));
        body.put("college", "UNKNOWN_COLLEGE");

        given().contentType(ContentType.JSON).body(body)
                .when().post("/api/v1/auth/signup")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("발급→문자 수신→폴링 VERIFIED→가입까지 스텁 전체 플로우가 통과한다")
    void signupFullFlowWithStubProvider() {
        JsonPath issueBody = given().contentType(ContentType.JSON).body(Map.of("phone", "010-1234-5678"))
                .when().post("/api/v1/auth/phone-verifications")
                .then().statusCode(HttpStatus.CREATED.value())
                .extract().jsonPath();
        String token = issueBody.getString("data.verificationToken");
        String code = issueBody.getString("data.code");

        stubMoClient.registerInboundMessage("01012345678", code);
        moPollThrottle.reset(); // 발급 직후 폴링의 2.5초 스로틀 대기 생략

        given().when().get("/api/v1/auth/phone-verifications/" + token)
                .then().statusCode(HttpStatus.OK.value())
                .body("data.status", equalTo("VERIFIED"));

        given().contentType(ContentType.JSON).body(validBody(token))
                .when().post("/api/v1/auth/signup")
                .then().statusCode(HttpStatus.CREATED.value());
    }
}
```

- [ ] **Step 3-2: 실패 확인**

Run: `./gradlew test --tests 'com.duing.domain.user.controller.AuthControllerSignupTest'`
Expected: FAIL — `validBody` 의 `verificationToken` 필드를 SignupRequest 가 모른다(400) 및 email/phone 누락으로 기존 검증(400). 컴파일은 성공(테스트가 프로덕션 심볼을 새로 참조하지 않음).

- [ ] **Step 3-3: `SignupRequest` 재작성** — 파일 전체를 아래로 교체.

```java
package com.duing.domain.user.controller.dto.request;

import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.service.dto.command.SignupCommand;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record SignupRequest(
        @NotBlank(message = "학번은 필수 입력값입니다.")
        @Pattern(regexp = "\\d{8}", message = "학번은 8자리 숫자여야 합니다.")
        String studentId,

        @NotBlank(message = "이름은 필수 입력값입니다.")
        @Size(max = 50, message = "이름은 50자 이하여야 합니다.")
        String name,

        @NotBlank(message = "비밀번호는 필수 입력값입니다.")
        @Pattern(
                regexp = "^(?=.{8,20}$)(?:(?=.*[A-Za-z])(?=.*\\d)|(?=.*[A-Za-z])(?=.*[!@#$%^&*()_+\\-=\\[\\]{};':\",./<>?])|(?=.*\\d)(?=.*[!@#$%^&*()_+\\-=\\[\\]{};':\",./<>?])).+$",
                message = "비밀번호는 8~20자이며 영문/숫자/특수문자 중 2종 이상을 포함해야 합니다."
        )
        String password,

        @NotNull(message = "학년은 필수 입력값입니다.")
        Grade grade,

        @NotNull(message = "단과대학은 필수 입력값입니다.")
        College college,

        @NotBlank(message = "전공 학과는 필수 입력값입니다.")
        @Size(max = 50, message = "전공 학과는 50자 이하여야 합니다.")
        String major,

        // 전화번호 입력란은 없다 — 번호는 MO 인증 스텝에서 입력되고, 저장 값은 항상 인증 세션에서 나온다 (spec §7.3).
        @NotBlank(message = "휴대폰 인증을 완료해주세요.")
        String verificationToken,

        @AssertTrue(message = "이용약관에 동의해야 합니다.")
        Boolean termsOfServiceAgreed,

        @AssertTrue(message = "개인정보 수집·이용에 동의해야 합니다.")
        Boolean privacyPolicyAgreed
) {
    public SignupCommand toCommand() {
        return new SignupCommand(studentId, name, password, grade, college, major, verificationToken);
    }
}
```

- [ ] **Step 3-4: `SignupCommand` 재작성**

```java
package com.duing.domain.user.service.dto.command;

import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;

public record SignupCommand(
        String studentId,
        String name,
        String rawPassword,
        Grade grade,
        College college,
        String major,
        String verificationToken
) {}
```

- [ ] **Step 3-5: `UserService` 시그니처 변경**

`Long signup(SignupCommand signupCommand);` → 아래로 교체:

```java
    Long signup(SignupCommand signupCommand, String clientIp, String userAgent);
```

- [ ] **Step 3-6: `GeneralUserService.signup` 재작성**

의존성 교체: `EmailVerificationService emailVerificationService` 필드는 그대로 두고(삭제는 Task 5), 다음 2개를 필드에 추가한다 — `private final PhoneVerificationSessionManager phoneVerificationSessionManager;`, `private final Clock clock;` (import `com.duing.domain.user.entity.PhoneVerification`, `com.duing.domain.user.entity.VerificationPurpose`, `com.duing.domain.user.service.PhoneVerificationSessionManager` — 동일 패키지라 서비스는 import 불요, `java.time.Clock`).

signup 메서드 전체를 아래로 교체:

```java
    @Override
    @Transactional
    public Long signup(SignupCommand signupCommand, String clientIp, String userAgent) {
        // 가입 한 건의 시각 필드(세션 판정·phoneVerifiedAt·termsAgreedAt)가 서로 다른 기준을 갖지 않도록
        // 단일 now 를 쓴다. 세션 만료·완료 창 판정은 발급(seoulClock) 과 같은 기준이어야 한다 (prod JVM 은 UTC).
        LocalDateTime now = LocalDateTime.now(clock);

        // 세션 검증(403)을 중복(409)보다 먼저 둔다 — 전화번호가 세션에서 나오므로 순서상 선행이 필수이고,
        // 유효한 인증 없이는 가입 여부(409)를 응답으로 노출하지 않는다 (spec §7.3). 행잠금은 같은 토큰의
        // 동시 가입(이중 소비)을 직렬화한다.
        PhoneVerification verifiedSession = phoneVerificationSessionManager
                .getVerifiedSessionForUpdate(signupCommand.verificationToken(), VerificationPurpose.SIGNUP, now);
        String verifiedPhone = verifiedSession.getPhone();

        // 발급 시점의 existsByPhone(409)은 UX 안내일 뿐 — 인증~가입 사이 창에서 생긴 중복은 여기서
        // 재검증한다(TOCTOU). 최종 방어는 uk_users_student_id_active·ux_users_phone 유니크 인덱스.
        if (userRepository.existsByStudentId(signupCommand.studentId())
                || userRepository.existsByPhone(verifiedPhone)) {
            throw new UserException.DuplicateAccountException();
        }

        String passwordHash = passwordEncoder.encode(signupCommand.rawPassword());
        User user = User.create(
                signupCommand.studentId(),
                signupCommand.name(),
                null,               // email — 컬럼은 V80 으로 nullable, 파라미터 제거는 Task 7
                passwordHash,
                UserRole.STUDENT,
                signupCommand.grade(),
                signupCommand.college(),
                signupCommand.major(),
                verifiedPhone,
                now
        );
        user.markPhoneVerified(now);
        Long userId = userRepository.save(user).getId();
        phoneVerificationSessionManager.consume(verifiedSession, userId, clientIp, userAgent);
        return userId;
    }
```

주의: 클래스에 남는 email 관련 사용처는 이 메서드가 유일했다 — `existsByEmail`·`assertVerified`·`consume(email)` 호출이 모두 사라진다. `EmailVerificationService` 필드가 미사용이 되지만 삭제는 Task 5 에서 일괄 수행한다.

- [ ] **Step 3-7: `AuthApi.signup` 시그니처·문서 갱신**

`@Tag` 를 교체:

```java
@Tag(name = "인증", description = "회원가입, 로그인 및 휴대폰 MO 인증")
```

signup 선언을 아래로 교체 (`HttpServletRequest` import 는 이미 있음):

```java
    @Operation(summary = "회원가입",
            description = "학번(8자리)/이름/비밀번호와 MO 인증 토큰(verificationToken)으로 STUDENT 계정을 생성한다. "
                    + "전화번호는 인증 세션에서 확정된 값이 저장되며, 사용된 세션은 즉시 소비(삭제)된다.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "201", description = "생성됨"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403",
                    description = "미인증·만료·용도 불일치 세션(PHONE_NOT_VERIFIED)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "이미 가입된 학번 또는 전화번호")
    })
    @PostMapping("/auth/signup")
    ResponseEntity<ApiResponse<Long>> signup(
            @Valid @RequestBody SignupRequest signupRequest,
            HttpServletRequest httpServletRequest);
```

- [ ] **Step 3-8: `AuthController.signup` 갱신**

```java
    @Override
    public ResponseEntity<ApiResponse<Long>> signup(
            @Valid @RequestBody SignupRequest signupRequest,
            HttpServletRequest httpServletRequest) {
        String clientIp = httpServletRequest.getRemoteAddr();
        String userAgent = httpServletRequest.getHeader("User-Agent");
        Long userId = userService.signup(signupRequest.toCommand(), clientIp, userAgent);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(userId));
    }
```

- [ ] **Step 3-9: 테스트 통과 확인** (기존 인증 플로우 회귀 포함)

Run: `./gradlew test --tests 'com.duing.domain.user.controller.AuthControllerSignupTest' --tests 'com.duing.domain.user.controller.AuthPhoneVerificationTest' --tests 'com.duing.domain.user.service.PhoneVerificationSessionConsumeTest'`
Expected: PASS

참고: 이 시점부터 Task 5 전까지 `AuthEmailVerificationTest` 중 signup 연계 케이스는 깨질 수 있다(구 SignupRequest 계약 기준 — Task 5 에서 파일째 삭제 예정). 전체 `./gradlew test` 는 Task 7 에서 돌리고, Task 3·4 는 위에 지정된 테스트만 실행한다.

- [ ] **Step 3-10: 커밋**

```bash
git add -A src/main/java/com/duing/domain/user src/test/java/com/duing/domain/user
git commit -m "feat(backend): 회원가입을 MO 인증 토큰 소비 방식으로 전환"
```

---

### Task 4: 로그인 전환 — 이메일 → 학번(8자리)

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/user/controller/dto/request/LoginRequest.java`
- Modify: `backend/src/main/java/com/duing/domain/user/service/dto/command/LoginCommand.java`
- Modify: `backend/src/main/java/com/duing/domain/user/repository/UserRepository.java` (`findByStudentIdForUpdate` 추가 — email 계열 삭제는 Task 5)
- Modify: `backend/src/main/java/com/duing/domain/user/service/GeneralUserService.java` (login 식별자 교체)
- Modify: `backend/src/main/java/com/duing/domain/user/exception/UserException.java` (메시지)
- Modify: `backend/src/main/java/com/duing/domain/user/api/AuthApi.java` (login Swagger 문구)
- Test: `backend/src/test/java/com/duing/domain/user/controller/AuthStudentIdLoginTest.java` (신규)
- Test: `backend/src/test/java/com/duing/domain/user/LoginRateLimitAcceptanceTest.java` (식별자 교체)

**Interfaces:**
- Produces:
  - `LoginCommand(String studentId, String rawPassword)`
  - `UserRepository.findByStudentIdForUpdate(String studentId): Optional<User>` (PESSIMISTIC_WRITE)
  - `POST /api/v1/auth/login` 요청 계약: `{ "studentId": "\d{8}", "password": "..." }`
  - `InvalidCredentialsException` 메시지: "학번 또는 비밀번호가 올바르지 않습니다."
- Consumes: `User.recordFailedLogin/recordSuccessfulLogin/isLocked`, `LoginAttemptRateLimiter` — 전부 무변경.

- [ ] **Step 4-1: 실패하는 테스트 작성** — `AuthStudentIdLoginTest.java` 신규 파일.

```java
package com.duing.domain.user.controller;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.notNullValue;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import com.duing.domain.user.service.LoginAttemptRateLimiter;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AuthStudentIdLoginTest extends IntegrationTestBase {

    private static final String RAW_PASSWORD = "Abcd1234!";

    @LocalServerPort
    private int port;

    @Autowired UserRepository userRepository;
    @Autowired PasswordEncoder passwordEncoder;
    @Autowired LoginAttemptRateLimiter loginAttemptRateLimiter;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        loginAttemptRateLimiter.reset();
    }

    /** 8자리 학번 사용자를 저장하고 학번을 반환한다. */
    private String saveUserWithPassword() {
        long seq = sequence.incrementAndGet();
        String studentId = String.format("%08d", seq % 100_000_000L);
        String phone = String.format("010-%04d-%04d", (seq / 10_000) % 10_000, seq % 10_000);
        userRepository.save(User.create(
                studentId, "로그인테스터", "login" + seq + "@daegu.ac.kr",
                passwordEncoder.encode(RAW_PASSWORD), UserRole.STUDENT,
                Grade.FRESHMAN, College.IT_ENGINEERING, "미설정", phone, LocalDateTime.now()));
        return studentId;
    }

    @Test
    @DisplayName("학번과 비밀번호로 로그인하면 200 과 Bearer 토큰, 사용자 정보를 반환한다")
    void loginSucceedsWithStudentId() {
        String studentId = saveUserWithPassword();

        given().contentType(ContentType.JSON)
                .body(Map.of("studentId", studentId, "password", RAW_PASSWORD))
                .when().post("/api/v1/auth/login")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.accessToken", notNullValue())
                .body("data.tokenType", equalTo("Bearer"))
                .body("data.user.studentId", equalTo(studentId));
    }

    @Test
    @DisplayName("존재하지 않는 학번으로 로그인하면 401 과 학번 기준 실패 메시지를 반환한다")
    void loginFailsForUnknownStudentId() {
        given().contentType(ContentType.JSON)
                .body(Map.of("studentId", "99999999", "password", RAW_PASSWORD))
                .when().post("/api/v1/auth/login")
                .then().statusCode(HttpStatus.UNAUTHORIZED.value())
                .body("message", equalTo("학번 또는 비밀번호가 올바르지 않습니다."));
    }

    @Test
    @DisplayName("비밀번호가 틀리면 401 을 반환한다")
    void loginFailsForWrongPassword() {
        String studentId = saveUserWithPassword();

        given().contentType(ContentType.JSON)
                .body(Map.of("studentId", studentId, "password", "Wrong1234!"))
                .when().post("/api/v1/auth/login")
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());
    }

    @Test
    @DisplayName("8자리 숫자가 아닌 학번은 400 으로 거부된다")
    void loginRejectsMalformedStudentId() {
        given().contentType(ContentType.JSON)
                .body(Map.of("studentId", "2024001", "password", RAW_PASSWORD))
                .when().post("/api/v1/auth/login")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }
}
```

- [ ] **Step 4-2: 실패 확인**

Run: `./gradlew test --tests 'com.duing.domain.user.controller.AuthStudentIdLoginTest'`
Expected: FAIL — LoginRequest 가 studentId 를 모른다 (`email` NotBlank 위반 400 등)

- [ ] **Step 4-3: `LoginRequest` 재작성**

```java
package com.duing.domain.user.controller.dto.request;

import com.duing.domain.user.service.dto.command.LoginCommand;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public record LoginRequest(
        @NotBlank(message = "학번은 필수 입력값입니다.")
        @Pattern(regexp = "\\d{8}", message = "학번은 8자리 숫자여야 합니다.")
        String studentId,

        @NotBlank(message = "비밀번호는 필수 입력값입니다.")
        String password
) {
    public LoginCommand toCommand() {
        return new LoginCommand(studentId, password);
    }
}
```

- [ ] **Step 4-4: `LoginCommand` 재작성**

```java
package com.duing.domain.user.service.dto.command;

public record LoginCommand(
        String studentId,
        String rawPassword
) {}
```

- [ ] **Step 4-5: `UserRepository` 에 학번 행잠금 조회 추가** — `findByEmailForUpdate` 아래에 추가 (email 계열 제거는 Task 5).

```java
    /**
     * 로그인 실패 카운터 증가의 동시성 보호를 위해 사용자 행을 잠그고 조회한다.
     * 같은 계정에 대한 동시 로그인 시도가 실패 카운터를 덮어써 잠금을 무력화하는 것을 막는다.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT u FROM User u WHERE u.studentId = :studentId")
    Optional<User> findByStudentIdForUpdate(@Param("studentId") String studentId);
```

- [ ] **Step 4-6: `GeneralUserService.login` 식별자 교체** — 로직·시각·리미터 무변경, 아래 두 곳만.

```java
        // 같은 계정에 대한 동시 실패가 실패 카운터 증가를 덮어쓰지 않도록 행을 잠그고 조회한다.
        User user = userRepository.findByStudentIdForUpdate(loginCommand.studentId()).orElse(null);
        if (user == null) {
            // 존재하지 않는 학번도 BCrypt 비교 비용을 동일하게 소비해 타이밍 기반 학번 열거를 막는다.
            burnPasswordComparison(loginCommand.rawPassword());
```

`burnPasswordComparison` 의 Javadoc 과 필드 주석도 갱신:

```java
    // 존재하지 않는 학번 분기의 BCrypt 타이밍 평탄화용 더미 해시 (지연 초기화, 비밀 아님).
    private volatile String dummyPasswordHash;
```

```java
    /** 존재하지 않는 학번 분기에서도 BCrypt 비교 비용을 소비해 타이밍 오라클을 제거한다. */
```

- [ ] **Step 4-7: `InvalidCredentialsException` 메시지 교체**

```java
    public static class InvalidCredentialsException extends UserException {
        private static final String MESSAGE = "학번 또는 비밀번호가 올바르지 않습니다.";
```

- [ ] **Step 4-8: `AuthApi.login` Swagger 문구 교체**

```java
    @Operation(summary = "로그인", description = "학번(8자리)과 비밀번호로 인증 후 JWT를 발급한다.")
```

- [ ] **Step 4-9: `LoginRateLimitAcceptanceTest` 식별자 교체** — 파일 내 모든 로그인 바디와 헬퍼를 교체한다.

`saveUserWithPassword()` 를 아래로 교체 (반환값: 학번):

```java
    private String saveUserWithPassword() {
        long seq = sequence.incrementAndGet();
        String studentId = String.format("%08d", seq % 100_000_000L);
        userRepository.save(User.create(
                studentId, "U" + seq, "u" + seq + "@daegu.ac.kr",
                passwordEncoder.encode(RAW_PASSWORD), UserRole.STUDENT,
                Grade.FRESHMAN, College.IT_ENGINEERING, "미설정", "010-0000-0000", LocalDateTime.now()));
        return studentId;
    }
```

본문 치환 (변수명 `email` → `studentId`, `emails` → `studentIds` 일괄):
- `Map.of("email", email, ...)` → `Map.of("studentId", studentId, "password", RAW_PASSWORD)`
- 실패 케이스의 `"nobody" + attempt + "@daegu.ac.kr"` → `String.format("%08d", 90_000_000L + attempt)` (존재하지 않는 8자리 학번 — `90...` 대역은 저장 헬퍼의 나머지 연산 결과와 겹칠 확률이 무시 가능하고, 겹쳐도 비밀번호 불일치로 동일하게 401 실패가 기록된다)
- `String email = "nobody" + index + "@daegu.ac.kr";` → `String studentId = String.format("%08d", 90_000_000L + index);` (주석 "존재하지 않는 계정 — 계정 잠금과 무관" 유지)

- [ ] **Step 4-10: 테스트 통과 확인**

Run: `./gradlew test --tests 'com.duing.domain.user.controller.AuthStudentIdLoginTest' --tests 'com.duing.domain.user.LoginRateLimitAcceptanceTest' --tests 'com.duing.domain.user.service.LoginAttemptRateLimiterTest' --tests 'com.duing.domain.user.entity.UserLoginLockoutTest'`
Expected: PASS

- [ ] **Step 4-11: 커밋**

```bash
git add -A src/main/java/com/duing/domain/user src/test/java/com/duing/domain/user
git commit -m "feat(backend): 로그인 식별자를 이메일에서 학번으로 전환"
```

---

### Task 5: 이메일 인증 API·도메인 삭제 + PII 잡 수정

**Files:**
- Delete (main 10개): `domain/user/entity/EmailVerification.java`, `repository/EmailVerificationRepository.java`, `service/EmailVerificationService.java`, `service/GeneralEmailVerificationService.java`, `service/EmailVerificationRateLimiter.java`, `service/VerificationCodeManager.java`, `exception/EmailVerificationException.java`, `controller/dto/request/SendEmailVerificationRequest.java`, `controller/dto/request/ConfirmEmailVerificationRequest.java`, `controller/dto/response/EmailVerificationResponse.java`
- Delete (main dto 3개): `service/dto/command/SendEmailVerificationCommand.java`, `service/dto/command/ConfirmEmailVerificationCommand.java`, `service/dto/query/EmailVerificationSendResult.java`
- Delete (test 5개): `AuthEmailVerificationTest.java`, `entity/EmailVerificationTest.java`, `service/EmailVerificationRateLimiterTest.java`, `service/VerificationCodeManagerTest.java`, `controller/dto/request/SignupRequestEmailValidationTest.java`
- Modify: `AuthApi.java`·`AuthController.java` (이메일 엔드포인트 2개 제거), `UserRepository.java` (email 조회 3종 제거), `GeneralUserService.java` (미사용 `EmailVerificationService` 의존 제거), `PiiRetentionJob.java`, `PiiRetentionJobTest.java`, Javadoc 참조 3곳 (`LoginAttemptRateLimiter`, `MoPollThrottle`, `FileUploadRateLimiter`)
- 유지: `global/email/**`, `MailProviderConfig`, `ResendClientConfig`, yml 메일 키 (PR5), `IntegrationTestBase` 의 `email_verifications` TRUNCATE (테이블은 PR5 까지 존재)

**Interfaces:**
- Consumes: Task 3·4 가 이미 email 소비처(signup·login)를 제거한 상태.
- Produces: `POST /api/v1/auth/email-verifications`·`/confirm` 404 (라우트 제거), `PiiRetentionJob` 생성자 `(RetentionProperties, Clock, UserRepository, ApplicationRepository, PhoneVerificationRepository, PhoneVerificationEventRepository)` — 6개 인자.

- [ ] **Step 5-1: 실패하는 테스트 준비** — `PiiRetentionJobTest.java` 를 다음과 같이 수정한다.

1. `deletesExpiredEmailVerifications` 테스트 메서드 삭제, `EmailVerification`·`EmailVerificationRepository` import 와 `@Autowired EmailVerificationRepository emailVerificationRepository;` 필드 삭제.
2. `noopWhenDisabled`·`noopWhenWindowNonPositive` 의 `PiiRetentionJob` 생성자 호출에서 `emailVerificationRepository` 인자 제거:

```java
        PiiRetentionJob disabledJob = new PiiRetentionJob(
                new RetentionProperties(false, Period.ofYears(1)),
                clock, userRepository, applicationRepository,
                phoneVerificationRepository, phoneVerificationEventRepository);
```

```java
        PiiRetentionJob zeroWindowJob = new PiiRetentionJob(
                new RetentionProperties(true, Period.ZERO),
                clock, userRepository, applicationRepository,
                phoneVerificationRepository, phoneVerificationEventRepository);
```

3. email 마커 기반 단언을 email 비의존으로 교체한다 (email 컬럼 NULL 화는 Task 6 에서 반영되지만, 마커 교체는 여기서 선행해 Task 6 의 테스트 수정을 없앤다):

`userEmail(Long)` 헬퍼를 삭제하고 아래 2개 헬퍼로 교체:

```java
    private String userName(Long id) {
        return jdbcTemplate.queryForObject("SELECT name FROM users WHERE id = ?", String.class, id);
    }

    private java.sql.Timestamp userAnonymizedAt(Long id) {
        return jdbcTemplate.queryForObject(
                "SELECT anonymized_at FROM users WHERE id = ?", java.sql.Timestamp.class, id);
    }
```

- `anonymizesExpiredSoftDeletedUser`: `assertThat(row.get("email")).isEqualTo("deleted+" ... )` 라인을 **삭제**한다 (anonymize 의 email NULL 화 구현과 그 단언 추가는 Task 6 — 태스크마다 그린 상태로 커밋하기 위해 여기서는 단언을 남기지 않는다).
- `keepsRecentlyDeletedUser`: email 단언 2줄을 `assertThat(userAnonymizedAt(user.getId())).isNull();` + `assertThat(userName(user.getId())).isEqualTo("보관테스터");` 로 교체.
- `isIdempotentForAlreadyAnonymized`: `String firstEmail = userEmail(...)` / `secondEmail` 비교를 `java.sql.Timestamp firstAnonymizedAt = userAnonymizedAt(user.getId());` / `secondAnonymizedAt` 비교로 교체 (`assertThat(secondAnonymizedAt).isEqualTo(firstAnonymizedAt);` — anonymized_at 가드가 무너지면 두 번째 실행이 새 NOW() 를 기록해 달라진다).
- `neverTouchesActiveUser`·`noopWhenDisabled`·`noopWhenWindowNonPositive`: `assertThat(userEmail(...)).isEqualTo("...")` 를 `assertThat(userAnonymizedAt(user.getId())).isNull();` 로 교체.
- `saveUser(String email)` 는 시그니처 유지 (User.create 가 아직 email 을 받는다 — 정리는 Task 7).

- [ ] **Step 5-2: main 삭제·수정 수행**

1. 위 Delete 목록의 main 13개 파일 삭제 (`git rm`).
2. `AuthApi.java`: `sendEmailVerification`·`confirmEmailVerification` 선언 2개와 관련 import (`ConfirmEmailVerificationRequest`, `SendEmailVerificationRequest`, `EmailVerificationResponse`) 제거.
3. `AuthController.java`: 동일 메서드 2개, `EmailVerificationService` 필드, 관련 import (`ConfirmEmailVerificationRequest`, `SendEmailVerificationRequest`, `EmailVerificationResponse`, `EmailVerificationService`, `EmailVerificationSendResult`) 제거.
4. `GeneralUserService.java`: `EmailVerificationService` 필드와 import 제거 (Task 3 이후 미사용).
5. `UserRepository.java`: `findByEmail`, `findByEmailForUpdate`, `existsByEmail` 3개 메서드 제거.
6. `PiiRetentionJob.java`: `EmailVerificationRepository` 필드·import·`deleteExpiredVerifications` 호출·로그의 `verificationsDeleted` 항목 제거. Javadoc 마지막 문장에서 email_verifications 언급 제거:

```java
    @Scheduled(cron = "0 30 4 * * *", zone = "Asia/Seoul")
    @Transactional
    public void run() {
        if (!properties.enabled()) {
            return;
        }
        Period window = properties.window();
        if (window.isZero() || window.isNegative()) {
            // 보관기간이 0/음수면 활성 직후 삭제된 데이터(심하면 미래 cutoff 로 모든 soft-delete 행)까지
            // 즉시 파기되는 비가역 사고가 난다 — 오설정 시 실행하지 않고 안전하게 건너뛴다.
            log.error("[PII 보관기간 파기] 보관기간(window={})이 유효하지 않아 실행을 건너뜁니다.", window);
            return;
        }
        LocalDateTime cutoff = LocalDateTime.now(clock).minus(window);
        int anonymizedUsers = userRepository.anonymizeExpiredUsers(cutoff);
        int scrubbedApplications = applicationRepository.scrubExpiredApplicationAnswers(cutoff);
        int deletedPhoneVerifications = phoneVerificationRepository
                .deleteExpiredVerifications(LocalDateTime.now(clock).minus(PHONE_VERIFICATION_RETENTION));
        int deletedPhoneVerificationEvents = phoneVerificationEventRepository.deleteExpiredEvents(cutoff);
        log.info("[PII 보관기간 파기] usersAnonymized={}, applicationsScrubbed={}, "
                        + "phoneVerificationsDeleted={}, phoneVerificationEventsDeleted={}, cutoff={}",
                anonymizedUsers, scrubbedApplications,
                deletedPhoneVerifications, deletedPhoneVerificationEvents, cutoff);
    }
```

7. Javadoc 참조 정리 (삭제된 클래스를 가리키는 `{@link}`·언급 3곳):
   - `LoginAttemptRateLimiter.java` 29행: `({@link EmailVerificationRateLimiter} 의 전역 쿼터 패턴)` → `({@link MoPollThrottle} 의 일일 쿼터 예약·반환 패턴)`
   - `MoPollThrottle.java` 87행: `(EmailVerificationRateLimiter.releaseGlobalQuota 와 동일 패턴)` → `(구 이메일 인증 리미터의 releaseGlobalQuota 에서 온 패턴)`
   - `FileUploadRateLimiter.java` 17행: `{@link com.duing.domain.user.service.EmailVerificationRateLimiter} 의 IP 윈도우와 동일한 전략.` → `{@link com.duing.domain.user.service.PhoneVerificationRateLimiter} 의 IP 윈도우와 동일한 전략.`
8. test 5개 파일 삭제 (`git rm`).

- [ ] **Step 5-3: 컴파일·핵심 테스트 확인**

Run: `./gradlew compileJava compileTestJava` → Expected: BUILD SUCCESSFUL (email 잔존 참조가 있으면 여기서 전부 드러난다 — 나오는 대로 위 원칙(삭제 대상은 지우고, 유지 대상은 참조 교체)으로 정리)
Run: `./gradlew test --tests 'com.duing.global.privacy.*' --tests 'com.duing.domain.user.controller.AuthControllerSignupTest' --tests 'com.duing.domain.user.controller.AuthStudentIdLoginTest'`
Expected: PASS

- [ ] **Step 5-4: 커밋**

```bash
git add -A
git commit -m "feat(backend): 이메일 인증 API·도메인 제거 및 PII 파기 잡에서 이메일 정리 분리"
```

---

### Task 6: 백엔드 email 노출 전수 제거

**Files:**
- Modify: `domain/user/service/dto/query/UserQuery.java`, `domain/user/controller/dto/response/UserResponse.java`, `domain/user/service/dto/query/UserSearchResultQuery.java`, `domain/user/controller/dto/response/AdminUserSearchResponse.java`
- Modify: `domain/application/service/dto/query/ApplicantQuery.java`, `domain/application/controller/dto/response/ApplicantResponse.java`, `domain/application/service/dto/query/ApplicantDetailQuery.java` (`ApplicantInfoQuery`), `domain/application/controller/dto/response/ApplicantDetailResponse.java`
- Modify: `domain/user/repository/UserRepository.java` (`searchForAdmin` JPQL, `anonymizeExpiredUsers`), `domain/user/service/GeneralUserService.java` (`ALLOWED_ADMIN_USER_SORT`), `domain/user/api/AdminUserApi.java` (설명)
- Test: `AdminUsersSearchControllerTest.java`, `UserProfileControllerTest.java` (+ Task 5 에서 준비한 `PiiRetentionJobTest` 통과 확인)

**Interfaces:**
- Produces: `UserQuery(Long id, String studentId, String name, String phone, UserRole role, Grade grade)` — email 위치 제거, 이하 응답 DTO 동일. `GET /users/me`·`POST /auth/login`·admin 검색·지원자 조회 응답에서 email 키 소멸.

- [ ] **Step 6-1: 실패하는 테스트 작성**

`UserProfileControllerTest` 에 추가 (import `static org.hamcrest.Matchers.not`, `static org.hamcrest.Matchers.hasKey`):

```java
    @Test
    @DisplayName("내 정보 응답에 email 필드가 더 이상 존재하지 않는다")
    void getMeDoesNotExposeEmail() {
        User user = saveUser(Grade.JUNIOR);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenFor(user))
                .when().get("/api/v1/users/me")
                .then()
                .statusCode(HttpStatus.OK.value())
                .body("data", not(hasKey("email")));
    }
```

`AdminUsersSearchControllerTest`:
- `searchByEmailContains` 테스트 삭제 (검색 대상 필드가 사라짐).
- `responseDoesNotLeakSensitiveFields` 에 단언 1줄 추가:

```java
                    .body("data.content[0]", not(hasKey("email")))
```

(import 에 `static org.hamcrest.Matchers.hasKey` 추가)

`PiiRetentionJobTest.anonymizesExpiredSoftDeletedUser` 에 단언 1줄 추가 (Task 5 에서 자리를 비워 둔 검증 — 레거시 email 값이 파기되는지):

```java
        assertThat(row.get("email")).isNull();
```

- [ ] **Step 6-2: 실패 확인**

Run: `./gradlew test --tests 'com.duing.domain.user.controller.UserProfileControllerTest' --tests 'com.duing.domain.user.controller.AdminUsersSearchControllerTest'`
Expected: 신규/수정 단언 2건 FAIL (email 키가 아직 존재)

- [ ] **Step 6-3: user 응답 DTO 4종에서 email 제거**

`UserQuery.java`:

```java
package com.duing.domain.user.service.dto.query;

import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;

public record UserQuery(
        Long id,
        String studentId,
        String name,
        String phone,
        UserRole role,
        Grade grade
) {
    public static UserQuery from(User user) {
        return new UserQuery(
                user.getId(),
                user.getStudentId(),
                user.getName(),
                user.getPhone(),
                user.getRole(),
                user.getGrade()
        );
    }
}
```

`UserResponse.java`:

```java
package com.duing.domain.user.controller.dto.response;

import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.service.dto.query.UserQuery;

public record UserResponse(
        Long id,
        String studentId,
        String name,
        String phone,
        UserRole role,
        Grade grade
) {
    public static UserResponse from(UserQuery userQuery) {
        return new UserResponse(
                userQuery.id(),
                userQuery.studentId(),
                userQuery.name(),
                userQuery.phone(),
                userQuery.role(),
                userQuery.grade()
        );
    }
}
```

`UserSearchResultQuery.java`:

```java
package com.duing.domain.user.service.dto.query;

import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;

/**
 * ADMIN 사용자 검색 결과 행. 비밀번호 해시·전화번호 등 민감 필드는 노출하지 않는다.
 */
public record UserSearchResultQuery(
        Long id,
        String studentId,
        String name,
        UserRole role
) {
    public static UserSearchResultQuery from(User user) {
        return new UserSearchResultQuery(
                user.getId(),
                user.getStudentId(),
                user.getName(),
                user.getRole()
        );
    }
}
```

`AdminUserSearchResponse.java`:

```java
package com.duing.domain.user.controller.dto.response;

import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.service.dto.query.UserSearchResultQuery;

public record AdminUserSearchResponse(
        Long id,
        String studentId,
        String name,
        UserRole role
) {
    public static AdminUserSearchResponse from(UserSearchResultQuery searchResult) {
        return new AdminUserSearchResponse(
                searchResult.id(),
                searchResult.studentId(),
                searchResult.name(),
                searchResult.role()
        );
    }
}
```

- [ ] **Step 6-4: 지원자 DTO 4종에서 email 제거** — `ApplicantQuery`(컴포넌트 `String email` + `of()` 의 `application.getUser().getEmail()` 인자), `ApplicantResponse`(컴포넌트 + `from()` 인자), `ApplicantDetailQuery.ApplicantInfoQuery`(컴포넌트 `String email` + `fromAll()` 의 `applicationUser.getEmail()` 인자), `ApplicantDetailResponse`(컴포넌트 + `from()` 의 `detailQuery.applicant().email()` 인자) 각각 한 줄씩 제거.

- [ ] **Step 6-5: admin 검색 JPQL·정렬 화이트리스트·API 설명 갱신**

`UserRepository.searchForAdmin`:

```java
    /**
     * ADMIN 사용자 검색.
     * studentId 가 q 로 시작하거나, name 이 q 를 포함(대소문자 무시)할 때 매치.
     * 입력은 trim 된 비어있지 않은 문자열을 가정한다 (서비스 레벨에서 검증).
     */
    @Query("""
            SELECT u FROM User u
            WHERE u.studentId LIKE CONCAT(:q, '%')
               OR LOWER(u.name) LIKE LOWER(CONCAT('%', :q, '%'))
            """)
    Page<User> searchForAdmin(@Param("q") String q, Pageable pageable);
```

`GeneralUserService`:

```java
    private static final Set<String> ALLOWED_ADMIN_USER_SORT =
            Set.of("studentId", "name", "createdAt");
```

`AdminUserApi` 검색 설명:

```java
            description = "동아리 등록 시 leader 후보를 학번/이름으로 검색한다. studentId 는 prefix 일치, name 은 contains(case-insensitive) 일치.")
```

- [ ] **Step 6-6: `anonymizeExpiredUsers` 의 email 라인 NULL 화** — 레거시 사용자의 실제 이메일 값 파기는 계속 필요하므로 라인을 지우지 않고 NULL 로 바꾼다 (컬럼과 함께 삭제는 PR5). 주석의 email 언급도 정리.

```java
    /**
     * 보관기간(cutoff)을 넘겨 soft-delete 된 사용자의 PII 컬럼을 비식별화한다(이미 익명화된 행은 제외 — 멱등).
     * student_id 는 partial unique 보존을 위해 id 파생값으로, phone 은 CHECK 제약을 만족하는
     * placeholder('010-0000-0000')로 둔다. email 은 전환기 레거시 값 파기를 위해 NULL 로 지운다(컬럼 drop 은 PR5).
     * 대상이 soft-delete 행이라 @SQLRestriction 을 우회하려 nativeQuery.
     */
    @Modifying(clearAutomatically = true)
    @Query(value = """
            UPDATE users SET
                student_id = LEFT(CONCAT('anon_', id), 20),
                name = '탈퇴회원',
                email = NULL,
                password_hash = '',
                major = '',
                phone = '010-0000-0000',
                anonymized_at = NOW()
            WHERE deleted_at < :cutoff AND anonymized_at IS NULL
            """, nativeQuery = true)
    int anonymizeExpiredUsers(@Param("cutoff") LocalDateTime cutoff);
```

- [ ] **Step 6-7: email 잔존 참조 컴파일 확인**

Run: `./gradlew compileJava compileTestJava`
Expected: BUILD SUCCESSFUL. 실패 시 에러가 가리키는 잔존 `*.email()` 참조를 같은 방식으로 제거 (테스트 코드가 삭제된 DTO 컴포넌트를 읽는 경우 해당 단언 라인 제거).

- [ ] **Step 6-8: 테스트 통과 확인** (Task 5 에서 준비한 PII 단언 포함)

Run: `./gradlew test --tests 'com.duing.domain.user.controller.UserProfileControllerTest' --tests 'com.duing.domain.user.controller.AdminUsersSearchControllerTest' --tests 'com.duing.global.privacy.PiiRetentionJobTest' --tests 'com.duing.domain.application.*'`
Expected: PASS (지원자 조회 통합 테스트가 email 단언을 갖고 있으면 6-7 에서 이미 정리됨)

- [ ] **Step 6-9: 커밋**

```bash
git add -A
git commit -m "feat(backend): 사용자·지원자 응답과 관리자 검색에서 email 노출 제거"
```

---

### Task 7: `User.create` 시그니처에서 email 제거 (108개 테스트 파일 일괄 정리)

**Files:**
- Modify: `domain/user/entity/User.java` (email 필드·빌더·create 인자 제거), `domain/user/service/GeneralUserService.java` (signup 의 `null` 인자 제거)
- Modify: `src/test/**` 의 모든 `User.create(...)` 호출부 (~108개 파일 — `common/fixture/UserFixture.java` 포함), `UserCreateTest.java`

**Interfaces:**
- Produces (최종형): `User.create(String studentId, String name, String passwordHash, UserRole role, Grade grade, College college, String major, String phone, LocalDateTime termsAgreedAt)` — 9개 인자 (기존 10개에서 3번째 email 제거).

- [ ] **Step 7-1: 실패하는 테스트 갱신** — `UserCreateTest` 의 두 테스트에서 `User.create` 호출의 3번째 인자(email 문자열)를 제거한다. 예:

```java
        User user = User.create(
                "20240001", "홍길동", "hashed", UserRole.STUDENT,
                Grade.JUNIOR, College.IT_ENGINEERING, "컴퓨터정보공학부", "010-1234-5678",
                verifiedAt.minusMinutes(1));
```

Run: `./gradlew test --tests 'com.duing.domain.user.entity.UserCreateTest'` → Expected: COMPILE FAIL (인자 불일치)

- [ ] **Step 7-2: `User` 엔티티에서 email 제거** — `email` 필드(@Column 포함), 빌더 생성자의 `String email` 파라미터·대입, `create()` 의 `String email` 파라미터·`.email(email)` 라인을 제거한다. DB 컬럼은 V80 으로 nullable 이므로 INSERT 에서 빠지면 NULL 로 저장된다 (파기 잡의 native SQL 만 컬럼을 계속 다룬다).

- [ ] **Step 7-3: main 호출부 정리** — `GeneralUserService.signup` 의 `User.create(...)` 에서 `null,               // email — ...` 라인을 삭제한다. main 에 다른 호출부는 없다.

- [ ] **Step 7-4: 테스트 호출부 일괄 치환** — 3번째 인자가 `@` 를 포함하는 리터럴/연결식인 호출을 기계 치환한다:

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend
grep -rl "User\.create(" src/test --include="*.java" | while read -r testFile; do
  perl -0777 -pi -e 's/(User\.create\(\s*[^,]+,\s*[^,]+,)\s*[^,]*\@[^,]*,/$1/gs' "$testFile"
done
```

(1·2번째 인자는 이 코드베이스에서 콤마·괄호를 포함하지 않는 단순식이고, 3번째 인자에만 `@` 가 나타나므로 오매칭이 없다. `UserFixture`·각 테스트의 인라인 `saveUser` 헬퍼가 모두 이 패턴이다.)

- [ ] **Step 7-5: 컴파일 기반 잔존 정리**

Run: `./gradlew compileTestJava`
Expected: 3번째 인자가 변수인 소수 파일(예: `AdminUsersSearchControllerTest.saveUser(String email)` 파라미터 전달, `PiiRetentionJobTest.saveUser(String email)`)이 컴파일 에러로 드러난다. 각 파일에서:
- `User.create` 호출의 email 인자 제거
- 이제 안 쓰이는 `String email` 파라미터를 헬퍼 시그니처에서 제거하고 호출부의 `"...@daegu.ac.kr"` 인자 삭제 (헬퍼가 email 을 다른 용도로 쓰지 않는 경우에 한함)

에러가 0이 될 때까지 반복. 마지막으로 남은 `@daegu.ac.kr` 리터럴 사용처를 훑어 미사용 로컬 변수를 정리한다: `grep -rn "daegu\.ac\.kr" src/test --include="*.java"` (남는 것은 email 을 도메인 값으로 쓰지 않는 무해한 잔존이 없어야 정상 — club `contactEmail` 등 동아리 연락처 필드는 유지).

- [ ] **Step 7-6: 전체 테스트**

Run: `./gradlew test`
Expected: BUILD SUCCESSFUL — 출력에서 `BUILD SUCCESSFUL` 문자열을 직접 확인 (tail 파이프 금지)

- [ ] **Step 7-7: 커밋**

```bash
git add -A
git commit -m "refactor(backend): User.create 시그니처와 엔티티에서 email 제거"
```

---

### Task 8: REQUIREMENTS.md 개정 + 최종 검증

**Files:**
- Modify: `REQUIREMENTS.md` (§2.1, §6 변경 이력 — 리포 루트)

- [ ] **Step 8-1: §2.1 교체** — 56행 `### 2.1 User (사용자)` 부터 72행 `---` 직전까지를 아래로 교체.

```markdown
### 2.1 User (사용자)

**엔티티 필드**: `id`, `studentId`, `name`, `passwordHash`, `role`, `grade`, `college`, `major`, `phone`, `phoneVerifiedAt`

| ID | 기능 | 입력 | 출력 | 예외 |
|---|---|---|---|---|
| U-1 | 회원가입 | `studentId`(8자리 숫자), `name`(≤50), `password`(8~20자·2종 조합), `grade`, `college`, `major`, `verificationToken`(MO 인증 세션), 약관 동의 2종 | 생성된 `userId` (201) | 미인증·만료·용도 불일치 토큰 403(`PHONE_NOT_VERIFIED`), 중복 학번·전화번호 409, 입력 검증 실패 400 |
| U-2 | 로그인 | `studentId`(8자리 숫자), `password` | `accessToken`, `tokenType="Bearer"`, `user` (200) | 자격 증명 실패 401 |
| U-3 | 내 정보 조회 | (JWT) | `id`, `studentId`, `name`, `phone`, `role`, `grade` (200) | 미인증 401 |
| U-4 | 휴대폰 MO 인증 시작 | `phone`, `?qr=true` | `verificationToken`, `code`, `moNumber`, `qrCode?`, 만료 정보 (201) | 가입된 번호 409, 쿨다운·IP 한도 429 |
| U-5 | 휴대폰 MO 인증 상태 조회 | `verificationToken` (path) | `status`(PENDING/VERIFIED/EXPIRED), `expiresInSeconds`, `maskedPhone` (200) | 미존재 토큰 404, IP 한도 429, 일일 쿼터 초과 503 |

**비기능 요구사항**
- 비밀번호는 `BCryptPasswordEncoder` 로 해싱 후 저장 (평문 저장 금지).
- JWT 는 `HS256`, 만료 시간은 `JWT_EXPIRY_MS` 환경변수로 제어.
- 가입 시 기본 role 은 `STUDENT`. `LEADER` / `ADMIN` 승격은 별도 admin API 로만 가능(현재 미구현).
- 가입 진위 확인은 휴대폰 MO 인증(Octomo, 대표번호 1666-3538)으로만 수행한다 — 전화번호는 인증 세션에서 확정된 값이 저장되고, 사용된 세션은 즉시 소비된다. 이메일 필드·이메일 인증은 제거됨(물리 컬럼 drop 은 안정화 후). 상세는 docs/superpowers/specs/2026-07-09-student-id-login-mo-auth-design.md
```

- [ ] **Step 8-2: §6 변경 이력에 행 추가** (표 마지막 행 아래)

```markdown
| 2026-07-10 | 학번 로그인 + 휴대폰 MO 인증 전환 (PR2): U-1~U-3 개정, U-4·U-5(MO 인증 API) 추가. 로그인 식별자 email→studentId(8자리), 가입은 verificationToken 소비 방식, 이메일 인증 API·email 노출 제거, users.email nullable(V80). 상세는 docs/superpowers/specs/2026-07-09-student-id-login-mo-auth-design.md |
```

- [ ] **Step 8-3: 전체 빌드 최종 확인**

Run: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew build`
Expected: BUILD SUCCESSFUL (출력에서 문자열 직접 확인)

- [ ] **Step 8-4: 커밋**

```bash
git add ../REQUIREMENTS.md
git commit -m "docs: REQUIREMENTS 학번 로그인·MO 인증 전환 반영"
```

- [ ] **Step 8-5: PR 직전 self-check (7항목— 컨트롤러가 직접 수행 후 사용자에게 보고)**

1. 컴파일/빌드/테스트 전부 SUCCESS (`./gradlew build` 출력 확인)
2. 변경 범위 vs spec §16 PR2 행 일치 — 누락 0건(V80·로그인·signup·이메일 API 삭제·email 노출 제거·PII 잡·REQUIREMENTS), 요청 외 변경 0건(메일 인프라·updateProfile phone·purpose 노출 미변경)
3. 다른 측면 영향 명시 — **breaking**: 구 FE 의 로그인·가입만 실패(기존 세션 무영향), PR3 근접 배포 필요. `/users/me`·지원자 응답에서 email 키 소멸(FE 는 PR3 에서 정리)
4. 모든 task 의 spec + quality 리뷰 dispatch 완료 여부
5. 계획서 self-review 체크박스 — 실행 후 재검증
6. 커밋 메시지 규칙 (Conventional Commits 한국어, Co-Authored-By/🤖 없음)
7. 신규/수정 파일 EOF newline

**push·PR 생성은 이 체크 결과를 사용자에게 보고한 뒤 지시에 따라 수행한다.**

---

## 리뷰 체크포인트 (컨트롤러용)

- 태스크마다: spec 준수 리뷰 + duing-code-reviewer 품질 리뷰.
- PR 전 전체 diff: codex:review 기본 + **codex:adversarial-review 필수** — 본 PR 은 인증(권한)·상태 전이(세션 소비)·동시성(행잠금 이중 소비·중복 가입 race)·데이터 무결성(V80·PII 잡)·API contract(breaking) 전부에 해당한다.
- 리뷰 관전 포인트: ① signup 의 세션 잠금이 BCrypt(~100ms) 동안 유지되는 트레이드오프(단일 토큰 행, 저경합 — 의도된 선택) ② `getVerifiedSessionForUpdate` 가 REQUIRED 로 signup 트랜잭션에 참여하는지(REQUIRES_NEW 면 소비-저장 원자성이 깨진다) ③ 테스트 시드가 `LocalDateTime.now(clock)` 를 쓰는지(CI UTC 함정) ④ V80 이 기존 파일 수정 없이 신규 파일인지.
