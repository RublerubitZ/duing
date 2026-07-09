# PR1 — 휴대폰 MO 인증 API (백엔드) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사용자가 Octomo 대표번호(1666-3538)로 인증코드를 문자 전송하면 서버가 조회(exists) API 로 확인하는 MO 인증 세션 도메인 + 발급·상태조회 API 를 추가한다. 기존 이메일 인증·로그인 플로우는 건드리지 않는다(전환은 PR2).

**Architecture:** `phone_verifications` 테이블(번호당 1행 upsert, 5분 TTL). 인증 코드는 DB 에 저장하지 않고 세션 토큰에서 HMAC-SHA256 파생(8자 Crockford Base32). 프론트는 발급 토큰으로 상태를 폴링하고, 서버는 PENDING 일 때만 Octomo `message/exists` 를 poll-through(세션당 2.5초 스로틀 + 전역 일일 1,000콜 상한)한다. Octomo 는 `MoVerificationClient` 포트 뒤에 격리(stub 기본). 인증 성공은 `phone_verification_events` 감사 테이블에 기록한다.

**Tech Stack:** Spring Boot 3.4 / Java 21 / Flyway V79 / RestClient / HMAC-SHA256 / TestContainers PG16 + RestAssured

**Spec:** `docs/superpowers/specs/2026-07-09-student-id-login-mo-auth-design.md` (v2.1) — 본 계획은 spec §16 의 **PR1 만** 다룬다. PR2(학번 로그인 전환)~PR5(정리)는 각 선행 PR 머지 후 별도 계획으로 작성한다.

**공통 규칙 (모든 Task):**
- 커밋 메시지는 Conventional Commits (`feat(backend): ...`). `[#이슈]` 형식·Co-Authored-By/Generated 라인 금지.
- push·PR 생성 금지 — 구현 완료 후 사용자 지시를 기다린다.
- 백엔드 테스트는 Docker 가 떠 있어야 한다 (TestContainers). 실행은 반드시 `backend/` 에서 (`cd backend && ./gradlew ...`), `| tail` 파이프 금지 — 출력에서 `BUILD SUCCESSFUL` 을 직접 확인한다.
- 테스트 날짜는 상대값만 사용한다 (하드코딩 미래 절대날짜 금지 — CI 타임밤).

**파일 구조 (생성 12 / 수정 6):**

| 구분 | 경로 | 책임 |
|---|---|---|
| Create | `db/migration/V79__create_phone_verifications_and_events.sql` | 세션·감사 테이블 + users.phone_verified_at |
| Create | `domain/user/entity/PhoneVerification.java` | 세션 상태·시간 규칙 (도메인 로직) |
| Create | `domain/user/entity/VerificationPurpose.java` | 용도 + 용도별 완료 창 |
| Create | `domain/user/entity/PhoneVerificationStatus.java` | PENDING/VERIFIED/EXPIRED |
| Create | `domain/user/entity/PhoneVerificationEvent.java` (+`PhoneVerificationEventType.java`) | 감사 이벤트 |
| Create | `domain/user/repository/PhoneVerificationRepository.java` / `PhoneVerificationEventRepository.java` | 잠금 조회·정리 쿼리 |
| Create | `domain/user/exception/PhoneVerificationException.java` | 에러 코드 5종 |
| Create | `domain/user/service/PhoneVerificationCodeDeriver.java` | token→코드 HMAC 파생 |
| Create | `domain/user/service/PhoneVerificationRateLimiter.java` | 발급/조회 IP 윈도우 |
| Create | `domain/user/service/MoPollThrottle.java` | 세션 간격 + 일일 쿼터 |
| Create | `domain/user/service/PhoneVerificationService.java` / `GeneralPhoneVerificationService.java` | 발급·상태조회 오케스트레이션 |
| Create | `global/mo/` (MoVerificationClient·MoProviderException·OctomoProperties·OctomoMoVerificationClient·StubMoVerificationClient) + `global/config/OctomoClientConfig.java` | Octomo 포트/어댑터 |
| Modify | `domain/user/api/AuthApi.java`, `domain/user/controller/AuthController.java` (+ request/response DTO 4개 Create) | API 2개 추가 |
| Modify | `global/privacy/PiiRetentionJob.java` | 세션·이벤트 파기 편입 |
| Modify | `application.yml`(main·test), `IntegrationTestBase.java`, `backend/.env.example` | 설정·테스트 기반 |

경로 약어: 이하 `backend/src/main/java/com/duing/` = `main/`, `backend/src/test/java/com/duing/` = `test/`, `backend/src/main/resources/` = `resources/`.

---

## Task 1: 브랜치 생성 + 설계서·계획서 커밋

- [ ] **Step 1: develop 에서 브랜치 분기**

```bash
git checkout develop && git pull origin develop
git checkout -b feat/phone-mo-verification-api
```

- [ ] **Step 2: 문서 커밋**

```bash
git add docs/superpowers/specs/2026-07-09-student-id-login-mo-auth-design.md docs/superpowers/plans/2026-07-09-phone-mo-verification-api.md
git commit -m "docs: 학번 로그인·MO 인증 전환 설계서와 PR1 구현 계획 추가"
```

---

## Task 2: V79 마이그레이션 + 설정(yml·env) + 테스트 기반

**Files:**
- Create: `resources/db/migration/V79__create_phone_verifications_and_events.sql`
- Modify: `resources/application.yml` (mo/phone-verification/octomo 블록 추가)
- Modify: `backend/src/test/resources/application.yml`
- Modify: `test/common/IntegrationTestBase.java`
- Modify: `backend/.env.example`

- [ ] **Step 1: 마이그레이션 파일 작성**

`resources/db/migration/V79__create_phone_verifications_and_events.sql`:

```sql
-- MO(문자 발신) 인증 세션. 번호당 1행 upsert 로 관리한다 (spec §5.1).
-- 인증 코드 컬럼이 없다 — 코드는 token 에서 HMAC 파생하며 DB 에 저장하지 않는다 (spec §5.2).
-- soft delete 미적용 (일회성 상태 — 용도 완료 시 행 삭제, 재발급 시 덮어씀).
CREATE TABLE IF NOT EXISTS phone_verifications (
    id              BIGSERIAL    PRIMARY KEY,
    phone           VARCHAR(13)  NOT NULL,
    token           VARCHAR(36)  NOT NULL,
    purpose         VARCHAR(20)  NOT NULL,
    target_user_id  BIGINT,
    expires_at      TIMESTAMP    NOT NULL,
    verified_at     TIMESTAMP,
    last_issued_at  TIMESTAMP    NOT NULL,
    created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_phone_verifications_phone ON phone_verifications (phone);
CREATE UNIQUE INDEX IF NOT EXISTS uk_phone_verifications_token ON phone_verifications (token);

-- 인증 감사 이벤트 (insert-only, spec §9.3). raw phone(PII) 포함 — PiiRetentionJob 이 45일 후 물리 삭제.
CREATE TABLE IF NOT EXISTS phone_verification_events (
    id          BIGSERIAL    PRIMARY KEY,
    user_id     BIGINT,
    phone       VARCHAR(13)  NOT NULL,
    purpose     VARCHAR(20)  NOT NULL,
    event_type  VARCHAR(20)  NOT NULL,
    client_ip   VARCHAR(45),
    user_agent  VARCHAR(300),
    created_at  TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pve_phone ON phone_verification_events (phone);
CREATE INDEX IF NOT EXISTS idx_pve_user ON phone_verification_events (user_id);

-- MO 인증 완료 시각. null = 미인증(레거시 자기신고 번호). 엔티티 매핑·기록은 PR2 에서 (spec §9.1).
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMP;
```

- [ ] **Step 2: main application.yml 에 설정 블록 추가**

`resources/application.yml` 의 `bank-api:` 블록 바로 위에 추가:

```yaml
# MO(문자 발신) 인증 — 사용자가 Octomo 대표번호로 인증코드를 문자 전송하면 exists 조회 API 로 확인한다.
mo:
  provider: ${MO_PROVIDER:stub}       # stub(로컬·CI — Octomo 미호출) | octomo(실조회)
  inbound-number: "16663538"          # 수신 대표번호(1666-3538) — 안내 문구·딥링크·QR 본문용
  stub:
    # 양수(N)면 stub 이 최초 조회 후 N초 지난 세션을 수신된 것으로 간주 — 로컬 수동 플로우 확인용. 0 = 비활성.
    auto-verify-after-seconds: ${MO_STUB_AUTO_VERIFY_AFTER_SECONDS:0}

phone-verification:
  secret: ${PHONE_VERIFICATION_SECRET}   # 코드 파생 HMAC 키 — 기본값 없음(필수), .env 로 주입

# Octomo(octoverse.kr) MO 조회 — mo.provider=octomo 일 때만 활성. 키는 환경변수로만 주입.
octomo:
  api-key: ${OCTOMO_API_KEY:}
  base-url: https://api.octoverse.kr
```

- [ ] **Step 3: test application.yml 에 설정 추가**

`backend/src/test/resources/application.yml` 의 `email:` 블록 아래에 추가:

```yaml
mo:
  provider: stub
  inbound-number: "16663538"
  stub:
    auto-verify-after-seconds: 0

phone-verification:
  # 테스트 전용 더미 키 — 실 시크릿 아님.
  secret: duing-test-phone-verification-secret
```

- [ ] **Step 4: IntegrationTestBase TRUNCATE 목록에 추가**

`test/common/IntegrationTestBase.java` 의 `"email_verifications, "` 줄 바로 아래에 두 줄 추가:

```java
                "email_verifications, " +
                "phone_verification_events, " +
                "phone_verifications, " +
                "club, " +
```

- [ ] **Step 5: .env.example 갱신 + 로컬 .env 안내**

`backend/.env.example` 의 `EMAIL_VERIFICATION_SECRET=` 줄 아래에 추가:

```
# MO 인증 코드 파생 HMAC 키 (필수) — 임의의 긴 랜덤 문자열
PHONE_VERIFICATION_SECRET=
# Octomo MO 조회 (mo.provider=octomo 일 때만 필요)
OCTOMO_API_KEY=
```

로컬 `backend/.env` 에도 `PHONE_VERIFICATION_SECRET=<랜덤값>` 을 추가한다 (Task 3 이후 로컬 부팅에 필요. 테스트는 test yml 더미 키를 쓰므로 무관).

- [ ] **Step 6: 마이그레이션 검증 (기존 테스트로 컨텍스트 기동)**

Run: `cd backend && ./gradlew test --tests "AuthControllerSignupTest"`
Expected: `BUILD SUCCESSFUL` (Flyway V79 적용 + `ddl-auto: validate` 통과 — 스키마 오류면 기동 실패)

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/resources/db/migration/V79__create_phone_verifications_and_events.sql backend/src/main/resources/application.yml backend/src/test/resources/application.yml backend/src/test/java/com/duing/common/IntegrationTestBase.java backend/.env.example
git commit -m "feat(backend): MO 인증 세션·감사 테이블(V79)과 설정 기반 추가"
```

---

## Task 3: PhoneVerificationCodeDeriver — 토큰→코드 HMAC 파생 (TDD)

**Files:**
- Create: `main/domain/user/service/PhoneVerificationCodeDeriver.java`
- Test: `test/domain/user/service/PhoneVerificationCodeDeriverTest.java`

- [ ] **Step 1: 실패하는 테스트 작성**

`test/domain/user/service/PhoneVerificationCodeDeriverTest.java`:

```java
package com.duing.domain.user.service;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class PhoneVerificationCodeDeriverTest {

    private final PhoneVerificationCodeDeriver codeDeriver =
            new PhoneVerificationCodeDeriver("unit-test-phone-verification-secret");

    @Test
    @DisplayName("같은 토큰에서는 항상 같은 코드가 파생된다 (결정성 — 발급 응답과 exists 질의가 일치해야 한다)")
    void sameTokenDerivesSameCode() {
        String token = "550e8400-e29b-41d4-a716-446655440000";
        assertThat(codeDeriver.deriveCode(token)).isEqualTo(codeDeriver.deriveCode(token));
    }

    @Test
    @DisplayName("코드는 8자이며 Crockford Base32(혼동 문자 I/L/O/U 제외)만 사용한다")
    void codeUsesCrockfordAlphabet() {
        String code = codeDeriver.deriveCode("550e8400-e29b-41d4-a716-446655440000");
        assertThat(code).hasSize(8).matches("^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{8}$");
    }

    @Test
    @DisplayName("토큰이 다르면 코드도 다르다 — 재발급 시 구 코드가 자연 무효되는 근거")
    void differentTokensDeriveDifferentCodes() {
        assertThat(codeDeriver.deriveCode("token-a")).isNotEqualTo(codeDeriver.deriveCode("token-b"));
    }

    @Test
    @DisplayName("secret 이 다르면 같은 토큰이라도 코드가 다르다 — DB 유출만으로는 코드를 계산할 수 없다")
    void differentSecretsDeriveDifferentCodes() {
        PhoneVerificationCodeDeriver otherSecretDeriver = new PhoneVerificationCodeDeriver("other-secret");
        assertThat(codeDeriver.deriveCode("token-a")).isNotEqualTo(otherSecretDeriver.deriveCode("token-a"));
    }
}
```

- [ ] **Step 2: 실패 확인**

Run: `cd backend && ./gradlew test --tests "PhoneVerificationCodeDeriverTest"`
Expected: 컴파일 실패 (`PhoneVerificationCodeDeriver` 미존재)

- [ ] **Step 3: 구현**

`main/domain/user/service/PhoneVerificationCodeDeriver.java`:

```java
package com.duing.domain.user.service;

import java.nio.charset.StandardCharsets;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * MO 인증 코드를 세션 토큰에서 파생한다 — DB 에 코드를 저장하지 않기 위한 장치 (spec §5.2).
 *
 * <p>{@code code = Base32(HMAC-SHA256(secret, token))[0..8)}. DB 가 유출돼도 secret(env) 없이는
 * 활성 코드를 계산할 수 없다. 발급 응답 시점과 Octomo exists 질의 직전에 각각 재계산한다.
 * 바이트당 하위 5비트만 사용하므로 문자 분포가 균등하다 (8자 × 5bit = 40bit 엔트로피).
 */
@Component
public class PhoneVerificationCodeDeriver {

    /** Crockford Base32 — 혼동 문자 I/L/O/U 제외. 사용자가 문자로 옮겨 적는 값이라 가독성이 중요하다. */
    private static final char[] ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ".toCharArray();
    private static final int CODE_LENGTH = 8;
    private static final String HMAC_ALGORITHM = "HmacSHA256";

    private final String secret;

    public PhoneVerificationCodeDeriver(@Value("${phone-verification.secret}") String secret) {
        this.secret = secret;
    }

    public String deriveCode(String token) {
        byte[] hmac = hmac(token);
        StringBuilder code = new StringBuilder(CODE_LENGTH);
        for (int index = 0; index < CODE_LENGTH; index++) {
            code.append(ALPHABET[hmac[index] & 31]);
        }
        return code.toString();
    }

    private byte[] hmac(String token) {
        try {
            Mac mac = Mac.getInstance(HMAC_ALGORITHM);
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), HMAC_ALGORITHM));
            return mac.doFinal(token.getBytes(StandardCharsets.UTF_8));
        } catch (java.security.GeneralSecurityException hmacFailure) {
            // HmacSHA256 은 JDK 필수 알고리즘 — 발생 시 설정 오류이므로 즉시 노출한다.
            throw new IllegalStateException("HMAC 계산 실패", hmacFailure);
        }
    }
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd backend && ./gradlew test --tests "PhoneVerificationCodeDeriverTest"`
Expected: `BUILD SUCCESSFUL`

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/duing/domain/user/service/PhoneVerificationCodeDeriver.java backend/src/test/java/com/duing/domain/user/service/PhoneVerificationCodeDeriverTest.java
git commit -m "feat(backend): MO 인증 코드 토큰 파생기 추가 (HMAC-SHA256, DB 미저장)"
```

---

## Task 4: PhoneVerification 엔티티 + 용도·상태 enum (TDD)

**Files:**
- Create: `main/domain/user/entity/VerificationPurpose.java`
- Create: `main/domain/user/entity/PhoneVerificationStatus.java`
- Create: `main/domain/user/entity/PhoneVerification.java`
- Test: `test/domain/user/entity/PhoneVerificationTest.java`

- [ ] **Step 1: 실패하는 테스트 작성**

`test/domain/user/entity/PhoneVerificationTest.java`:

```java
package com.duing.domain.user.entity;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDateTime;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class PhoneVerificationTest {

    private static final String PHONE = "010-1234-5678";
    private static final String TOKEN = "550e8400-e29b-41d4-a716-446655440000";
    private static final LocalDateTime NOW = LocalDateTime.of(2026, 1, 10, 12, 0);

    private PhoneVerification issueAtNow() {
        return PhoneVerification.issue(PHONE, TOKEN, VerificationPurpose.SIGNUP, null, NOW);
    }

    @Test
    @DisplayName("발급 직후에는 PENDING 이며 남은 시간은 세션 유효시간(5분)이다")
    void issuedSessionIsPending() {
        PhoneVerification phoneVerification = issueAtNow();
        assertThat(phoneVerification.status(NOW)).isEqualTo(PhoneVerificationStatus.PENDING);
        assertThat(phoneVerification.remainingSeconds(NOW))
                .isEqualTo(PhoneVerification.VALIDITY.getSeconds());
    }

    @Test
    @DisplayName("만료 시각 정각부터 EXPIRED 로 판정한다 (경계 exclusive — 이메일 인증 규칙 계승)")
    void expiresExactlyAtDeadline() {
        PhoneVerification phoneVerification = issueAtNow();
        LocalDateTime deadline = NOW.plus(PhoneVerification.VALIDITY);
        assertThat(phoneVerification.status(deadline.minusSeconds(1))).isEqualTo(PhoneVerificationStatus.PENDING);
        assertThat(phoneVerification.status(deadline)).isEqualTo(PhoneVerificationStatus.EXPIRED);
        assertThat(phoneVerification.remainingSeconds(deadline)).isZero();
    }

    @Test
    @DisplayName("인증 완료 후에는 VERIFIED 이며 남은 시간은 용도별 완료 창 기준으로 계산된다")
    void verifiedSessionUsesCompletionWindow() {
        PhoneVerification phoneVerification = issueAtNow();
        phoneVerification.markVerified(NOW.plusMinutes(1));
        assertThat(phoneVerification.status(NOW.plusMinutes(1))).isEqualTo(PhoneVerificationStatus.VERIFIED);
        assertThat(phoneVerification.remainingSeconds(NOW.plusMinutes(1)))
                .isEqualTo(VerificationPurpose.SIGNUP.completionValidity().getSeconds());
    }

    @Test
    @DisplayName("SIGNUP 은 인증 후 30분이 지나면 EXPIRED 로 판정한다 (완료 창 초과 — 재인증 유도)")
    void signupCompletionWindowExpires() {
        PhoneVerification phoneVerification = issueAtNow();
        phoneVerification.markVerified(NOW);
        LocalDateTime completionDeadline = NOW.plus(VerificationPurpose.SIGNUP.completionValidity());
        assertThat(phoneVerification.status(completionDeadline.minusSeconds(1)))
                .isEqualTo(PhoneVerificationStatus.VERIFIED);
        assertThat(phoneVerification.status(completionDeadline)).isEqualTo(PhoneVerificationStatus.EXPIRED);
    }

    @Test
    @DisplayName("PHONE_CHANGE·PASSWORD_RESET 의 완료 창은 10분이다")
    void nonSignupPurposesHaveTenMinuteCompletionWindow() {
        assertThat(VerificationPurpose.PHONE_CHANGE.completionValidity())
                .isEqualTo(java.time.Duration.ofMinutes(10));
        assertThat(VerificationPurpose.PASSWORD_RESET.completionValidity())
                .isEqualTo(java.time.Duration.ofMinutes(10));
    }

    @Test
    @DisplayName("재발급은 토큰을 교체하고 인증 상태·만료·쿨다운 기준을 모두 리셋한다")
    void reissueResetsSession() {
        PhoneVerification phoneVerification = issueAtNow();
        phoneVerification.markVerified(NOW);

        LocalDateTime reissuedAt = NOW.plusMinutes(2);
        phoneVerification.reissue("new-token", VerificationPurpose.SIGNUP, null, reissuedAt);

        assertThat(phoneVerification.getToken()).isEqualTo("new-token");
        assertThat(phoneVerification.isVerified()).isFalse();
        assertThat(phoneVerification.status(reissuedAt)).isEqualTo(PhoneVerificationStatus.PENDING);
        assertThat(phoneVerification.getExpiresAt()).isEqualTo(reissuedAt.plus(PhoneVerification.VALIDITY));
        assertThat(phoneVerification.getLastIssuedAt()).isEqualTo(reissuedAt);
    }

    @Test
    @DisplayName("재발급 쿨다운(60초)은 마지막 발급 시각 기준이며 60초 정각부터 재발급할 수 있다")
    void cooldownBoundary() {
        PhoneVerification phoneVerification = issueAtNow();
        assertThat(phoneVerification.isInCooldown(NOW.plusSeconds(59))).isTrue();
        assertThat(phoneVerification.isInCooldown(NOW.plusSeconds(60))).isFalse();
    }
}
```

- [ ] **Step 2: 실패 확인**

Run: `cd backend && ./gradlew test --tests "PhoneVerificationTest"`
Expected: 컴파일 실패 (엔티티 미존재)

- [ ] **Step 3: enum 2종 구현**

`main/domain/user/entity/VerificationPurpose.java`:

```java
package com.duing.domain.user.entity;

import java.time.Duration;

/**
 * MO 인증 세션의 용도 — 인증 후 완료(소비)까지의 유효 시간이 용도별로 다르다 (spec §5.1).
 * SIGNUP 은 남은 가입 폼 작성 시간을 넉넉히, 그 외는 짧게 둔다.
 * PHONE_CHANGE·PASSWORD_RESET 플로우는 PR4 에서 구현되며 여기서는 값만 정의한다.
 */
public enum VerificationPurpose {
    SIGNUP(Duration.ofMinutes(30)),
    PHONE_CHANGE(Duration.ofMinutes(10)),
    PASSWORD_RESET(Duration.ofMinutes(10));

    private final Duration completionValidity;

    VerificationPurpose(Duration completionValidity) {
        this.completionValidity = completionValidity;
    }

    public Duration completionValidity() {
        return completionValidity;
    }
}
```

`main/domain/user/entity/PhoneVerificationStatus.java`:

```java
package com.duing.domain.user.entity;

/** MO 인증 세션의 파생 상태 — DB 컬럼이 아니라 시각 기준 계산값이다 (spec §5.1). */
public enum PhoneVerificationStatus {
    PENDING, VERIFIED, EXPIRED
}
```

- [ ] **Step 4: 엔티티 구현**

`main/domain/user/entity/PhoneVerification.java`:

```java
package com.duing.domain.user.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Duration;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

/**
 * MO(문자 발신) 인증 세션. 번호당 1행 upsert 로 관리한다 (spec §5.1).
 *
 * <p>인증 코드는 필드가 없다 — {@code token} 에서 HMAC 파생한다 (spec §5.2, PhoneVerificationCodeDeriver).
 * PENDING 만료는 {@code expiresAt}(발급+5분), VERIFIED 이후에는 용도별 완료 창(verifiedAt 기준)을
 * 따른다. soft delete 미적용 (용도 완료 시 행 삭제, 재발급 시 덮어씀) 이라 BaseEntity 를 상속하지 않는다.
 */
@Getter
@Entity
@Table(name = "phone_verifications")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@EntityListeners(AuditingEntityListener.class)
public class PhoneVerification {

    public static final Duration VALIDITY = Duration.ofMinutes(5);
    public static final Duration REISSUE_COOLDOWN = Duration.ofSeconds(60);

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 13)
    private String phone;

    @Column(nullable = false, unique = true, length = 36)
    private String token;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private VerificationPurpose purpose;

    @Column(name = "target_user_id")
    private Long targetUserId;

    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;

    @Column(name = "verified_at")
    private LocalDateTime verifiedAt;

    @Column(name = "last_issued_at", nullable = false)
    private LocalDateTime lastIssuedAt;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @LastModifiedDate
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @Builder(access = AccessLevel.PRIVATE)
    private PhoneVerification(String phone, String token, VerificationPurpose purpose,
                              Long targetUserId, LocalDateTime expiresAt, LocalDateTime lastIssuedAt) {
        this.phone = phone;
        this.token = token;
        this.purpose = purpose;
        this.targetUserId = targetUserId;
        this.expiresAt = expiresAt;
        this.lastIssuedAt = lastIssuedAt;
    }

    public static PhoneVerification issue(String phone, String token, VerificationPurpose purpose,
                                          Long targetUserId, LocalDateTime now) {
        return PhoneVerification.builder()
                .phone(phone)
                .token(token)
                .purpose(purpose)
                .targetUserId(targetUserId)
                .expiresAt(now.plus(VALIDITY))
                .lastIssuedAt(now)
                .build();
    }

    /** 재발급 — 토큰(=파생 코드)·용도·만료·인증 상태를 모두 리셋한다. 구 토큰·구 코드는 즉시 무효. */
    public void reissue(String token, VerificationPurpose purpose, Long targetUserId, LocalDateTime now) {
        this.token = token;
        this.purpose = purpose;
        this.targetUserId = targetUserId;
        this.expiresAt = now.plus(VALIDITY);
        this.verifiedAt = null;
        this.lastIssuedAt = now;
    }

    public void markVerified(LocalDateTime now) {
        this.verifiedAt = now;
    }

    public boolean isVerified() {
        return verifiedAt != null;
    }

    /** 만료 시각 "부터" 만료로 본다 (now >= expiresAt) — EmailVerification 경계 규칙 계승. */
    public boolean isExpired(LocalDateTime now) {
        return !now.isBefore(expiresAt);
    }

    public boolean isInCooldown(LocalDateTime now) {
        return now.isBefore(lastIssuedAt.plus(REISSUE_COOLDOWN));
    }

    /** 인증 후 용도별 완료 창(SIGNUP 30분 / 그 외 10분)이 지났는지 (spec §5.1). */
    public boolean isCompletionExpired(LocalDateTime now) {
        return isVerified() && !now.isBefore(verifiedAt.plus(purpose.completionValidity()));
    }

    /** EXPIRED 우선 판정 (spec §5.1) — 인증됐어도 완료 창이 지나면 EXPIRED 로 노출해 재인증을 유도한다. */
    public PhoneVerificationStatus status(LocalDateTime now) {
        if (isVerified()) {
            return isCompletionExpired(now) ? PhoneVerificationStatus.EXPIRED : PhoneVerificationStatus.VERIFIED;
        }
        return isExpired(now) ? PhoneVerificationStatus.EXPIRED : PhoneVerificationStatus.PENDING;
    }

    /** 남은 유효 시간(초) — PENDING 은 세션 만료까지, VERIFIED 는 완료 창 마감까지, 지났으면 0. */
    public long remainingSeconds(LocalDateTime now) {
        LocalDateTime deadline = isVerified() ? verifiedAt.plus(purpose.completionValidity()) : expiresAt;
        return Math.max(Duration.between(now, deadline).getSeconds(), 0);
    }
}
```

- [ ] **Step 5: 통과 확인**

Run: `cd backend && ./gradlew test --tests "PhoneVerificationTest"`
Expected: `BUILD SUCCESSFUL`

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/duing/domain/user/entity/PhoneVerification.java backend/src/main/java/com/duing/domain/user/entity/VerificationPurpose.java backend/src/main/java/com/duing/domain/user/entity/PhoneVerificationStatus.java backend/src/test/java/com/duing/domain/user/entity/PhoneVerificationTest.java
git commit -m "feat(backend): MO 인증 세션 엔티티와 용도별 완료 창 규칙 추가"
```

---

## Task 5: 감사 이벤트 엔티티 + 리포지토리 2종

동작 검증은 Task 11 통합 테스트가 담당한다 — 여기서는 컴파일·컨텍스트 기동만 확인한다.

**Files:**
- Create: `main/domain/user/entity/PhoneVerificationEventType.java`
- Create: `main/domain/user/entity/PhoneVerificationEvent.java`
- Create: `main/domain/user/repository/PhoneVerificationRepository.java`
- Create: `main/domain/user/repository/PhoneVerificationEventRepository.java`

- [ ] **Step 1: 이벤트 타입 enum**

`main/domain/user/entity/PhoneVerificationEventType.java`:

```java
package com.duing.domain.user.entity;

/** 감사 이벤트 종류 — VERIFIED(인증 성공), CONSUMED(용도 완료 — PR2/PR4 에서 기록). */
public enum PhoneVerificationEventType {
    VERIFIED, CONSUMED
}
```

- [ ] **Step 2: 이벤트 엔티티**

`main/domain/user/entity/PhoneVerificationEvent.java`:

```java
package com.duing.domain.user.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

/**
 * MO 인증 감사 이벤트 (insert-only, spec §9.3) — 학번 도용 분쟁·번호 변경 이력·abuse 추적 근거.
 * raw phone(PII)을 포함하므로 PiiRetentionJob 이 45일 후 물리 삭제한다. 조회 화면은 없다(운영자 DB 콘솔).
 */
@Getter
@Entity
@Table(name = "phone_verification_events")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@EntityListeners(AuditingEntityListener.class)
public class PhoneVerificationEvent {

    private static final int USER_AGENT_MAX_LENGTH = 300;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id")
    private Long userId;

    @Column(nullable = false, length = 13)
    private String phone;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private VerificationPurpose purpose;

    @Enumerated(EnumType.STRING)
    @Column(name = "event_type", nullable = false, length = 20)
    private PhoneVerificationEventType eventType;

    @Column(name = "client_ip", length = 45)
    private String clientIp;

    @Column(name = "user_agent", length = 300)
    private String userAgent;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Builder(access = AccessLevel.PRIVATE)
    private PhoneVerificationEvent(Long userId, String phone, VerificationPurpose purpose,
                                   PhoneVerificationEventType eventType, String clientIp, String userAgent) {
        this.userId = userId;
        this.phone = phone;
        this.purpose = purpose;
        this.eventType = eventType;
        this.clientIp = clientIp;
        this.userAgent = userAgent;
    }

    public static PhoneVerificationEvent verified(PhoneVerification phoneVerification,
                                                  String clientIp, String userAgent) {
        return PhoneVerificationEvent.builder()
                .userId(phoneVerification.getTargetUserId())
                .phone(phoneVerification.getPhone())
                .purpose(phoneVerification.getPurpose())
                .eventType(PhoneVerificationEventType.VERIFIED)
                .clientIp(clientIp)
                .userAgent(truncateUserAgent(userAgent))
                .build();
    }

    /** User-Agent 는 임의 길이 헤더 — 컬럼(300자)에 맞춰 자른다 (초과분은 감사 가치가 없다). */
    private static String truncateUserAgent(String userAgent) {
        if (userAgent == null || userAgent.length() <= USER_AGENT_MAX_LENGTH) {
            return userAgent;
        }
        return userAgent.substring(0, USER_AGENT_MAX_LENGTH);
    }
}
```

- [ ] **Step 3: 리포지토리 2종**

`main/domain/user/repository/PhoneVerificationRepository.java`:

```java
package com.duing.domain.user.repository;

import com.duing.domain.user.entity.PhoneVerification;
import jakarta.persistence.LockModeType;
import java.time.LocalDateTime;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PhoneVerificationRepository extends JpaRepository<PhoneVerification, Long> {

    Optional<PhoneVerification> findByToken(String token);

    /** 행 잠금 조회 — 동시 발급의 코드 덮어쓰기·쿨다운 우회를 막는다 (spec §9.5). */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT pv FROM PhoneVerification pv WHERE pv.phone = :phone")
    Optional<PhoneVerification> findByPhoneForUpdate(@Param("phone") String phone);

    /** 행 잠금 조회 — 동시 상태조회의 이중 인증 확정을 멱등하게 만든다 (spec §9.5). */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT pv FROM PhoneVerification pv WHERE pv.token = :token")
    Optional<PhoneVerification> findByTokenForUpdate(@Param("token") String token);

    /**
     * 만료 후 24시간 지난 세션(raw 전화번호 = PII)을 물리 삭제한다 — PiiRetentionJob (spec §9.4).
     * 버려진(가입 미완료) 세션의 번호가 무기한 잔존하지 않게 한다. cutoff = now - 1일 을 expires_at 과 비교.
     */
    @Modifying(clearAutomatically = true)
    @Query(value = "DELETE FROM phone_verifications WHERE expires_at < :cutoff", nativeQuery = true)
    int deleteExpiredVerifications(@Param("cutoff") LocalDateTime cutoff);
}
```

`main/domain/user/repository/PhoneVerificationEventRepository.java`:

```java
package com.duing.domain.user.repository;

import com.duing.domain.user.entity.PhoneVerificationEvent;
import java.time.LocalDateTime;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PhoneVerificationEventRepository extends JpaRepository<PhoneVerificationEvent, Long> {

    /** 보관기간(45일)을 넘긴 감사 이벤트(raw phone = PII) 물리 삭제 — PiiRetentionJob (spec §9.3). */
    @Modifying(clearAutomatically = true)
    @Query(value = "DELETE FROM phone_verification_events WHERE created_at < :cutoff", nativeQuery = true)
    int deleteExpiredEvents(@Param("cutoff") LocalDateTime cutoff);
}
```

- [ ] **Step 4: 컨텍스트 기동 확인 (엔티티 매핑 ↔ V79 스키마 validate)**

Run: `cd backend && ./gradlew test --tests "PhoneVerificationCodeDeriverTest" --tests "AuthControllerSignupTest"`
Expected: `BUILD SUCCESSFUL` (`ddl-auto: validate` 가 새 엔티티 매핑을 V79 스키마와 대조)

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/duing/domain/user/entity/PhoneVerificationEvent.java backend/src/main/java/com/duing/domain/user/entity/PhoneVerificationEventType.java backend/src/main/java/com/duing/domain/user/repository/PhoneVerificationRepository.java backend/src/main/java/com/duing/domain/user/repository/PhoneVerificationEventRepository.java
git commit -m "feat(backend): MO 인증 감사 이벤트 엔티티·리포지토리 추가"
```

---

## Task 6: 예외 클래스 + IP 레이트리미터 (TDD)

**Files:**
- Create: `main/domain/user/exception/PhoneVerificationException.java`
- Create: `main/domain/user/service/PhoneVerificationRateLimiter.java`
- Test: `test/domain/user/service/PhoneVerificationRateLimiterTest.java`

- [ ] **Step 1: 예외 클래스 작성** (기존 `EmailVerificationException` static inner class 컨벤션)

`main/domain/user/exception/PhoneVerificationException.java`:

```java
package com.duing.domain.user.exception;

import com.duing.global.exception.ApplicationException;
import org.springframework.http.HttpStatus;

public class PhoneVerificationException extends ApplicationException {

    protected PhoneVerificationException(String message, HttpStatus status, String code) {
        super(message, status, code);
    }

    public static class PhoneAlreadyRegisteredException extends PhoneVerificationException {
        private static final String MESSAGE = "이미 가입된 휴대폰 번호입니다. 로그인 후 이용해주세요.";

        public PhoneAlreadyRegisteredException() {
            super(MESSAGE, HttpStatus.CONFLICT, "PHONE_ALREADY_REGISTERED");
        }
    }

    public static class PhoneVerificationCooldownException extends PhoneVerificationException {
        private static final String MESSAGE = "잠시 후 다시 시도할 수 있습니다.";

        public PhoneVerificationCooldownException() {
            super(MESSAGE, HttpStatus.TOO_MANY_REQUESTS, "PHONE_VERIFICATION_COOLDOWN");
        }
    }

    /** 코드 문자열은 이메일 인증과 공유하지만 클래스는 분리한다 — PR2 에서 EmailVerificationException 이 삭제된다. */
    public static class VerificationRateLimitedException extends PhoneVerificationException {
        private static final String MESSAGE = "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.";

        public VerificationRateLimitedException() {
            super(MESSAGE, HttpStatus.TOO_MANY_REQUESTS, "VERIFICATION_RATE_LIMITED");
        }
    }

    public static class PhoneVerificationNotFoundException extends PhoneVerificationException {
        private static final String MESSAGE = "인증 요청을 찾을 수 없습니다. 인증을 다시 시작해주세요.";

        public PhoneVerificationNotFoundException() {
            super(MESSAGE, HttpStatus.NOT_FOUND, "PHONE_VERIFICATION_NOT_FOUND");
        }
    }

    public static class SmsPollQuotaExceededException extends PhoneVerificationException {
        private static final String MESSAGE = "일시적으로 인증 확인이 제한되었습니다. 잠시 후 다시 시도해주세요.";

        public SmsPollQuotaExceededException() {
            super(MESSAGE, HttpStatus.SERVICE_UNAVAILABLE, "SMS_POLL_QUOTA_EXCEEDED");
        }
    }
}
```

- [ ] **Step 2: 실패하는 레이트리미터 테스트 작성**

`test/domain/user/service/PhoneVerificationRateLimiterTest.java`:

```java
package com.duing.domain.user.service;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.domain.user.exception.PhoneVerificationException;
import java.time.LocalDateTime;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class PhoneVerificationRateLimiterTest {

    private static final String CLIENT_IP = "10.0.0.1";
    private static final LocalDateTime NOW = LocalDateTime.of(2026, 1, 10, 12, 0);

    private final PhoneVerificationRateLimiter rateLimiter = new PhoneVerificationRateLimiter();

    @Test
    @DisplayName("같은 IP 의 발급 요청은 1분에 10회까지 허용하고 11번째는 429 를 던진다")
    void issueWindowLimitsPerMinute() {
        for (int attempt = 0; attempt < PhoneVerificationRateLimiter.ISSUE_PER_MINUTE_LIMIT; attempt++) {
            rateLimiter.assertAndRecordIssueIpRequest(CLIENT_IP, NOW.plusSeconds(attempt));
        }
        assertThatThrownBy(() -> rateLimiter.assertAndRecordIssueIpRequest(CLIENT_IP, NOW.plusSeconds(30)))
                .isInstanceOf(PhoneVerificationException.VerificationRateLimitedException.class);
    }

    @Test
    @DisplayName("1분 창을 벗어난 발급 기록은 분당 한도에서 제외된다 (시간당 한도 내라면 허용)")
    void issueMinuteWindowSlides() {
        for (int attempt = 0; attempt < PhoneVerificationRateLimiter.ISSUE_PER_MINUTE_LIMIT; attempt++) {
            rateLimiter.assertAndRecordIssueIpRequest(CLIENT_IP, NOW.plusSeconds(attempt));
        }
        assertThatCode(() -> rateLimiter.assertAndRecordIssueIpRequest(CLIENT_IP, NOW.plusMinutes(2)))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("같은 IP 의 발급 요청은 1시간에 60회를 넘을 수 없다")
    void issueWindowLimitsPerHour() {
        for (int attempt = 0; attempt < PhoneVerificationRateLimiter.ISSUE_PER_HOUR_LIMIT; attempt++) {
            // 분당 한도(10)에 걸리지 않도록 7초 간격으로 넓게 분산한다 (60회 × 7초 = 7분).
            rateLimiter.assertAndRecordIssueIpRequest(CLIENT_IP, NOW.plusSeconds(attempt * 7L));
        }
        assertThatThrownBy(() -> rateLimiter.assertAndRecordIssueIpRequest(CLIENT_IP, NOW.plusMinutes(10)))
                .isInstanceOf(PhoneVerificationException.VerificationRateLimitedException.class);
    }

    @Test
    @DisplayName("상태조회 창(분 30/시 200)은 발급 창과 독립이다")
    void statusWindowIsIndependent() {
        for (int attempt = 0; attempt < PhoneVerificationRateLimiter.ISSUE_PER_MINUTE_LIMIT; attempt++) {
            rateLimiter.assertAndRecordIssueIpRequest(CLIENT_IP, NOW.plusSeconds(attempt));
        }
        // 발급 창이 가득 차도 상태조회는 별도 창으로 허용된다.
        assertThatCode(() -> rateLimiter.assertAndRecordStatusIpRequest(CLIENT_IP, NOW.plusSeconds(30)))
                .doesNotThrowAnyException();

        for (int attempt = 1; attempt < PhoneVerificationRateLimiter.STATUS_PER_MINUTE_LIMIT; attempt++) {
            rateLimiter.assertAndRecordStatusIpRequest(CLIENT_IP, NOW.plusSeconds(30).plusNanos(attempt));
        }
        assertThatThrownBy(() -> rateLimiter.assertAndRecordStatusIpRequest(CLIENT_IP, NOW.plusSeconds(31)))
                .isInstanceOf(PhoneVerificationException.VerificationRateLimitedException.class);
    }

    @Test
    @DisplayName("reset 은 모든 창을 초기화한다 (통합 테스트 격리용)")
    void resetClearsWindows() {
        for (int attempt = 0; attempt < PhoneVerificationRateLimiter.ISSUE_PER_MINUTE_LIMIT; attempt++) {
            rateLimiter.assertAndRecordIssueIpRequest(CLIENT_IP, NOW.plusSeconds(attempt));
        }
        rateLimiter.reset();
        assertThatCode(() -> rateLimiter.assertAndRecordIssueIpRequest(CLIENT_IP, NOW.plusSeconds(30)))
                .doesNotThrowAnyException();
    }
}
```

- [ ] **Step 3: 실패 확인**

Run: `cd backend && ./gradlew test --tests "PhoneVerificationRateLimiterTest"`
Expected: 컴파일 실패 (리미터 미존재)

- [ ] **Step 4: 레이트리미터 구현** (기존 `EmailVerificationRateLimiter` 의 슬라이딩 윈도우 로직 계승 — 전역 일일 쿼터는 MoPollThrottle 소관이라 없음)

`main/domain/user/service/PhoneVerificationRateLimiter.java`:

```java
package com.duing.domain.user.service;

import com.duing.domain.user.exception.PhoneVerificationException;
import java.time.LocalDateTime;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

/**
 * MO 인증 발급·상태조회 IP 레이트리밋 — in-memory, 단일 인스턴스 전제 (spec §11).
 *
 * <p>발급(분 10/시 60)은 문자 발송이 없어 이메일 인증의 발송 창(20/120)보다 좁게 잡아도 캠퍼스
 * 공유 IP 의 단체 가입을 막지 않는다 — 발급 자체는 1인 1회면 충분하고 재시도는 쿨다운(60초)이 별도로
 * 제한하기 때문이다. 상태조회(분 30/시 200)는 confirm 창 값을 계승 — 3초 폴링(분당 20회)에 다중 탭
 * 여유를 더한 값이다. 두 창은 독립이며 <b>허용된 요청만</b> 기록한다(거절 미기록 — 메모리 고갈 방지).
 *
 * <p>재시작 시 리셋은 수용한다. 멀티 인스턴스 전환 시 Redis 로 교체한다 (spec §11.1).
 */
@Component
public class PhoneVerificationRateLimiter {

    static final int ISSUE_PER_MINUTE_LIMIT = 10;
    static final int ISSUE_PER_HOUR_LIMIT = 60;
    static final int STATUS_PER_MINUTE_LIMIT = 30;
    static final int STATUS_PER_HOUR_LIMIT = 200;

    private final ConcurrentHashMap<String, Deque<LocalDateTime>> issueTimesByIp = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Deque<LocalDateTime>> statusTimesByIp = new ConcurrentHashMap<>();

    /** 발급 IP 윈도우(분 10/시 60)를 검사하고 허용이면 기록한다. 초과 시 429. */
    public void assertAndRecordIssueIpRequest(String clientIp, LocalDateTime now) {
        assertAndRecordWithin(issueTimesByIp, clientIp, now, ISSUE_PER_MINUTE_LIMIT, ISSUE_PER_HOUR_LIMIT);
    }

    /** 상태조회 IP 윈도우(분 30/시 200) — 폴링(3초 간격) 대비 여유를 둔다. 초과 시 429. */
    public void assertAndRecordStatusIpRequest(String clientIp, LocalDateTime now) {
        assertAndRecordWithin(statusTimesByIp, clientIp, now, STATUS_PER_MINUTE_LIMIT, STATUS_PER_HOUR_LIMIT);
    }

    /** 슬라이딩 윈도우 공통 로직 — EmailVerificationRateLimiter 와 동일한 규칙(경계 exclusive·거절 미기록). */
    private void assertAndRecordWithin(ConcurrentHashMap<String, Deque<LocalDateTime>> timesByIp,
                                       String clientIp, LocalDateTime now, int perMinuteLimit, int perHourLimit) {
        LocalDateTime hourAgo = now.minusHours(1);
        LocalDateTime minuteAgo = now.minusMinutes(1);
        timesByIp.compute(clientIp, (ip, requestTimes) -> {
            Deque<LocalDateTime> windowTimes = requestTimes == null ? new ArrayDeque<>() : requestTimes;
            while (!windowTimes.isEmpty() && !windowTimes.peekFirst().isAfter(hourAgo)) {
                windowTimes.pollFirst();
            }
            long lastMinuteCount = windowTimes.stream()
                    .filter(requestTime -> requestTime.isAfter(minuteAgo))
                    .count();
            if (lastMinuteCount >= perMinuteLimit || windowTimes.size() >= perHourLimit) {
                throw new PhoneVerificationException.VerificationRateLimitedException();
            }
            windowTimes.addLast(now);
            return windowTimes;
        });
    }

    /** 테스트 전용 — @SpringBootTest 컨텍스트 공유로 누적된 창을 초기화한다. 프로덕션 호출 금지. */
    public void reset() {
        issueTimesByIp.clear();
        statusTimesByIp.clear();
    }
}
```

- [ ] **Step 5: 통과 확인**

Run: `cd backend && ./gradlew test --tests "PhoneVerificationRateLimiterTest"`
Expected: `BUILD SUCCESSFUL`

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/duing/domain/user/exception/PhoneVerificationException.java backend/src/main/java/com/duing/domain/user/service/PhoneVerificationRateLimiter.java backend/src/test/java/com/duing/domain/user/service/PhoneVerificationRateLimiterTest.java
git commit -m "feat(backend): MO 인증 예외 체계와 발급·조회 IP 레이트리미터 추가"
```

---

## Task 7: MoPollThrottle — 세션 간격 + 일일 쿼터 (TDD)

**Files:**
- Create: `main/domain/user/service/MoPollThrottle.java`
- Test: `test/domain/user/service/MoPollThrottleTest.java`

- [ ] **Step 1: 실패하는 테스트 작성**

`test/domain/user/service/MoPollThrottleTest.java`:

```java
package com.duing.domain.user.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.domain.user.exception.PhoneVerificationException;
import java.time.LocalDateTime;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class MoPollThrottleTest {

    private static final String TOKEN = "token-a";
    private static final LocalDateTime NOW = LocalDateTime.of(2026, 1, 10, 12, 0);

    private final MoPollThrottle pollThrottle = new MoPollThrottle();

    @Test
    @DisplayName("같은 세션의 Octomo 실호출은 2.5초 간격을 지켜야 한다 — 첫 호출 허용, 직후 거절, 간격 후 허용")
    void enforcesMinIntervalPerSession() {
        assertThat(pollThrottle.tryAcquire(TOKEN, NOW)).isTrue();
        assertThat(pollThrottle.tryAcquire(TOKEN, NOW.plusSeconds(1))).isFalse();
        assertThat(pollThrottle.tryAcquire(TOKEN, NOW.plus(MoPollThrottle.MIN_POLL_INTERVAL))).isTrue();
    }

    @Test
    @DisplayName("세션이 다르면 간격을 서로 공유하지 않는다")
    void sessionsAreIndependent() {
        assertThat(pollThrottle.tryAcquire("token-a", NOW)).isTrue();
        assertThat(pollThrottle.tryAcquire("token-b", NOW)).isTrue();
    }

    @Test
    @DisplayName("전역 일일 상한(1,000콜)을 넘기면 503 을 던지고, 날짜가 바뀌면 카운터가 리셋된다")
    void dailyQuotaLimitsAndRollsOver() {
        for (int call = 0; call < MoPollThrottle.DAILY_CALL_LIMIT; call++) {
            pollThrottle.reserveDailyQuota(NOW);
        }
        assertThatThrownBy(() -> pollThrottle.reserveDailyQuota(NOW))
                .isInstanceOf(PhoneVerificationException.SmsPollQuotaExceededException.class);
        assertThatCode(() -> pollThrottle.reserveDailyQuota(NOW.plusDays(1)))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("reset 은 간격 기록과 일일 카운터를 모두 초기화한다 (통합 테스트 격리용)")
    void resetClearsState() {
        pollThrottle.tryAcquire(TOKEN, NOW);
        for (int call = 0; call < MoPollThrottle.DAILY_CALL_LIMIT; call++) {
            pollThrottle.reserveDailyQuota(NOW);
        }
        pollThrottle.reset();
        assertThat(pollThrottle.tryAcquire(TOKEN, NOW.plusSeconds(1))).isTrue();
        assertThatCode(() -> pollThrottle.reserveDailyQuota(NOW)).doesNotThrowAnyException();
    }
}
```

- [ ] **Step 2: 실패 확인**

Run: `cd backend && ./gradlew test --tests "MoPollThrottleTest"`
Expected: 컴파일 실패

- [ ] **Step 3: 구현**

`main/domain/user/service/MoPollThrottle.java`:

```java
package com.duing.domain.user.service;

import com.duing.domain.user.exception.PhoneVerificationException;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.stereotype.Component;

/**
 * Octomo 실호출 보호 장치 — in-memory, 단일 인스턴스 전제 (spec §6·11).
 *
 * <p>① 세션(token)당 최소 간격 2.5초: 프론트 3초 폴링보다 약간 짧아 정상 폴링은 통과시키되,
 * 다중 탭·과폴링이 Octomo 콜로 증폭되는 것을 막는다. ② 전역 일일 상한 1,000콜: 폭주·루프 버그로부터
 * Free 쿼터(월 1만 콜)를 보호하는 안전판 — 초과 시 503 이며 로그(ERROR→Sentry)로 Pro 전환을 판단한다.
 *
 * <p>실패한 호출도 쿼터를 소비한 것으로 둔다(반환 없음) — "보호" 목적상 과대 계상이 안전한 방향이다
 * (EmailVerificationRateLimiter 전역 쿼터와 동일 철학). 완료·만료 세션의 간격 엔트리 정리와
 * 멀티 인스턴스 대응(Redis)은 백로그다 (spec §11.1).
 */
@Component
public class MoPollThrottle {

    static final Duration MIN_POLL_INTERVAL = Duration.ofMillis(2500);
    static final int DAILY_CALL_LIMIT = 1_000;

    private final ConcurrentHashMap<String, LocalDateTime> lastPolledAtByToken = new ConcurrentHashMap<>();
    private final AtomicReference<DailyCounter> dailyCounter = new AtomicReference<>();

    /** 세션당 최소 간격을 검사하고, 허용이면 이번 시각을 기록한다. compute 콜백이라 검사+기록이 원자적이다. */
    public boolean tryAcquire(String token, LocalDateTime now) {
        boolean[] acquired = {false};
        lastPolledAtByToken.compute(token, (key, lastPolledAt) -> {
            if (lastPolledAt == null || !now.isBefore(lastPolledAt.plus(MIN_POLL_INTERVAL))) {
                acquired[0] = true;
                return now;
            }
            return lastPolledAt;
        });
        return acquired[0];
    }

    /** 전역 일일 쿼터를 원자적으로 예약한다 (검사+증가 일체). 한도 초과 시 503. */
    public void reserveDailyQuota(LocalDateTime now) {
        LocalDate requestDate = now.toLocalDate();
        DailyCounter counter = dailyCounter.updateAndGet(existing ->
                (existing == null || existing.date().isBefore(requestDate))
                        ? new DailyCounter(requestDate, new AtomicInteger(0))
                        : existing);
        int reserved = counter.count().incrementAndGet();
        if (reserved > DAILY_CALL_LIMIT) {
            counter.count().decrementAndGet();
            throw new PhoneVerificationException.SmsPollQuotaExceededException();
        }
    }

    /** 테스트 전용 — 간격 기록·일일 카운터 초기화. 프로덕션 호출 금지. */
    public void reset() {
        lastPolledAtByToken.clear();
        dailyCounter.set(null);
    }

    private record DailyCounter(LocalDate date, AtomicInteger count) {}
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd backend && ./gradlew test --tests "MoPollThrottleTest"`
Expected: `BUILD SUCCESSFUL`

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/duing/domain/user/service/MoPollThrottle.java backend/src/test/java/com/duing/domain/user/service/MoPollThrottleTest.java
git commit -m "feat(backend): Octomo 폴링 스로틀(세션 간격·일일 쿼터) 추가"
```

---

## Task 8: `global/mo/` — Octomo 포트/어댑터 + 스텁 (TDD)

**Files:**
- Create: `main/global/mo/MoVerificationClient.java`
- Create: `main/global/mo/MoProviderException.java`
- Create: `main/global/mo/OctomoProperties.java`
- Create: `main/global/config/OctomoClientConfig.java`
- Create: `main/global/mo/OctomoMoVerificationClient.java`
- Create: `main/global/mo/StubMoVerificationClient.java`
- Test: `test/global/mo/OctomoMoVerificationClientTest.java`

- [ ] **Step 1: 포트 인터페이스 + 예외 + 프로퍼티 작성**

`main/global/mo/MoVerificationClient.java`:

```java
package com.duing.global.mo;

import java.util.Optional;

/**
 * MO(문자 발신) 인증 벤더 포트 (spec §8). 현재 어댑터는 Octomo — exists 형(발신번호+본문 쌍 확인) 벤더까지만
 * 이 포트로 교체 가능하며, PASS/NICE 등 리다이렉트형 본인확인은 별개 설계다.
 */
public interface MoVerificationClient {

    /**
     * (발신번호, 본문) 쌍이 최근 withinMinutes 분 내 대표번호로 수신됐는지 확인한다 — Octomo Message Exists.
     * 조회 실패(비2xx·타임아웃·네트워크)는 {@link MoProviderException} — 호출부는 PENDING 을 유지한다.
     */
    boolean messageExists(String mobileNum, String text, int withinMinutes);

    /** SMSTO 딥링크 QR(data URL) 발급. 실패 시 empty — 호출부가 코드 텍스트 안내로 폴백한다 (spec §2.2). */
    Optional<String> createSmsQrCode(String text);
}
```

`main/global/mo/MoProviderException.java`:

```java
package com.duing.global.mo;

/** MO 벤더 호출 실패 래핑 — 상태조회는 이를 삼키고 PENDING 을 유지한다 (폴링이 자연 재시도). */
public class MoProviderException extends RuntimeException {

    public MoProviderException(String message, Throwable cause) {
        super(message, cause);
    }
}
```

`main/global/mo/OctomoProperties.java`:

```java
package com.duing.global.mo;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** Octomo 연동 설정 — mo.provider=octomo 일 때만 등록된다 (OctomoClientConfig). 키는 환경변수로만 주입. */
@ConfigurationProperties(prefix = "octomo")
public record OctomoProperties(String apiKey, String baseUrl) {
}
```

- [ ] **Step 2: RestClient 설정 작성** (기존 `ResendClientConfig` 패턴 — 타임아웃 3s/3s)

`main/global/config/OctomoClientConfig.java`:

```java
package com.duing.global.config;

import com.duing.global.mo.OctomoProperties;
import java.time.Duration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpHeaders;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

/**
 * Octomo RestClient 설정 — {@link com.duing.global.mo.OctomoMoVerificationClient} 가 사용.
 *
 * <p>{@code mo.provider=octomo} 일 때만 활성 (로컬·CI 는 stub 이라 빈이 등록되지 않는다).
 * 인증은 공식 샘플 계약대로 {@code Authorization: Octomo {API_KEY}} 헤더. Octomo 장애 시
 * 상태조회 API 가 길게 블로킹되지 않도록 짧은 타임아웃을 강제한다 (ResendClientConfig 와 동일 철학).
 */
@Configuration
@ConditionalOnProperty(name = "mo.provider", havingValue = "octomo")
@EnableConfigurationProperties(OctomoProperties.class)
public class OctomoClientConfig {

    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(3);
    private static final Duration READ_TIMEOUT = Duration.ofSeconds(3);

    @Bean
    public RestClient octomoRestClient(OctomoProperties octomoProperties) {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(CONNECT_TIMEOUT);
        requestFactory.setReadTimeout(READ_TIMEOUT);
        return RestClient.builder()
                .baseUrl(octomoProperties.baseUrl())
                .defaultHeader(HttpHeaders.AUTHORIZATION, "Octomo " + octomoProperties.apiKey())
                .requestFactory(requestFactory)
                .build();
    }
}
```

- [ ] **Step 3: 실패하는 Octomo 어댑터 테스트 작성**

`test/global/mo/OctomoMoVerificationClientTest.java`:

```java
package com.duing.global.mo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withException;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.io.IOException;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class OctomoMoVerificationClientTest {

    private static final String BASE_URL = "https://api.octoverse.kr";

    private MockRestServiceServer mockServer;
    private OctomoMoVerificationClient octomoClient;

    @BeforeEach
    void setUp() {
        RestClient.Builder restClientBuilder = RestClient.builder()
                .baseUrl(BASE_URL)
                .defaultHeader(HttpHeaders.AUTHORIZATION, "Octomo test-api-key");
        mockServer = MockRestServiceServer.bindTo(restClientBuilder).build();
        octomoClient = new OctomoMoVerificationClient(restClientBuilder.build());
    }

    @Test
    @DisplayName("exists 조회는 공식 계약(엔드포인트·Octomo 헤더·mobileNum/text/withinMinutes)대로 호출하고 exists 값을 반환한다")
    void messageExistsCallsOctomoContract() {
        mockServer.expect(requestTo(BASE_URL + "/octomo/v1/public/message/exists"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header(HttpHeaders.AUTHORIZATION, "Octomo test-api-key"))
                .andExpect(content().contentType(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.mobileNum").value("01012345678"))
                .andExpect(jsonPath("$.text").value("7K3M9PXQ"))
                .andExpect(jsonPath("$.withinMinutes").value(5))
                .andRespond(withSuccess("{\"exists\": true}", MediaType.APPLICATION_JSON));

        assertThat(octomoClient.messageExists("01012345678", "7K3M9PXQ", 5)).isTrue();
        mockServer.verify();
    }

    @Test
    @DisplayName("exists=false 응답이면 false 를 반환한다 (아직 수신 안 됨)")
    void messageExistsReturnsFalse() {
        mockServer.expect(requestTo(BASE_URL + "/octomo/v1/public/message/exists"))
                .andRespond(withSuccess("{\"exists\": false}", MediaType.APPLICATION_JSON));

        assertThat(octomoClient.messageExists("01012345678", "7K3M9PXQ", 5)).isFalse();
    }

    @Test
    @DisplayName("exists 조회의 5xx·네트워크 오류는 MoProviderException 으로 변환된다 (호출부가 PENDING 유지)")
    void messageExistsWrapsFailures() {
        mockServer.expect(requestTo(BASE_URL + "/octomo/v1/public/message/exists"))
                .andRespond(withServerError());
        assertThatThrownBy(() -> octomoClient.messageExists("01012345678", "7K3M9PXQ", 5))
                .isInstanceOf(MoProviderException.class);

        mockServer.reset();
        mockServer.expect(requestTo(BASE_URL + "/octomo/v1/public/message/exists"))
                .andRespond(withException(new IOException("connection timed out")));
        assertThatThrownBy(() -> octomoClient.messageExists("01012345678", "7K3M9PXQ", 5))
                .isInstanceOf(MoProviderException.class);
    }

    @Test
    @DisplayName("QR 발급 성공 시 data URL 을 반환한다")
    void createSmsQrCodeReturnsDataUrl() {
        mockServer.expect(requestTo(BASE_URL + "/octomo/v1/public/message/qr-code"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(jsonPath("$.text").value("7K3M9PXQ"))
                .andRespond(withSuccess("{\"qrCode\": \"data:image/png;base64,QQ==\"}", MediaType.APPLICATION_JSON));

        assertThat(octomoClient.createSmsQrCode("7K3M9PXQ")).contains("data:image/png;base64,QQ==");
    }

    @Test
    @DisplayName("QR 발급 실패는 empty 로 폴백한다 — 발급 API 자체를 실패시키지 않는다")
    void createSmsQrCodeFallsBackToEmpty() {
        mockServer.expect(requestTo(BASE_URL + "/octomo/v1/public/message/qr-code"))
                .andRespond(withServerError());

        assertThat(octomoClient.createSmsQrCode("7K3M9PXQ")).isEqualTo(Optional.empty());
    }
}
```

- [ ] **Step 4: 실패 확인**

Run: `cd backend && ./gradlew test --tests "OctomoMoVerificationClientTest"`
Expected: 컴파일 실패

- [ ] **Step 5: Octomo 어댑터 구현**

`main/global/mo/OctomoMoVerificationClient.java`:

```java
package com.duing.global.mo;

import java.util.Map;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * Octomo(octoverse.kr) MO 조회 어댑터 — 공식 샘플 코드의 계약을 따른다 (spec §2).
 *
 * <p>exists: {@code POST /octomo/v1/public/message/exists} body {mobileNum, text, withinMinutes}
 * → {exists}. QR: {@code POST /octomo/v1/public/message/qr-code} body {text} → {qrCode(data URL)}.
 * 인증 헤더({@code Authorization: Octomo {key}})와 타임아웃은 OctomoClientConfig 가 주입한다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
@ConditionalOnProperty(name = "mo.provider", havingValue = "octomo")
public class OctomoMoVerificationClient implements MoVerificationClient {

    private final RestClient octomoRestClient;

    record ExistsResponse(boolean exists) {}

    record QrCodeResponse(String qrCode) {}

    @Override
    public boolean messageExists(String mobileNum, String text, int withinMinutes) {
        try {
            ExistsResponse existsResponse = octomoRestClient.post()
                    .uri("/octomo/v1/public/message/exists")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of("mobileNum", mobileNum, "text", text, "withinMinutes", withinMinutes))
                    .retrieve()
                    .body(ExistsResponse.class);
            return existsResponse != null && existsResponse.exists();
        } catch (RestClientException existsFailure) {
            throw new MoProviderException("Octomo exists 조회 실패", existsFailure);
        }
    }

    @Override
    public Optional<String> createSmsQrCode(String text) {
        try {
            QrCodeResponse qrCodeResponse = octomoRestClient.post()
                    .uri("/octomo/v1/public/message/qr-code")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of("text", text))
                    .retrieve()
                    .body(QrCodeResponse.class);
            return Optional.ofNullable(qrCodeResponse == null ? null : qrCodeResponse.qrCode());
        } catch (RestClientException qrFailure) {
            // QR 은 부가 기능 — 발급 플로우를 죽이지 않고 코드 텍스트 안내로 폴백한다 (spec §7.1).
            log.warn("Octomo QR 발급 실패 — 텍스트 안내로 폴백한다.", qrFailure);
            return Optional.empty();
        }
    }
}
```

- [ ] **Step 6: 통과 확인**

Run: `cd backend && ./gradlew test --tests "OctomoMoVerificationClientTest"`
Expected: `BUILD SUCCESSFUL`

- [ ] **Step 7: 스텁 어댑터 작성** (main classpath — 로컬 기본값이자 테스트 주입 지점. 기존 LoggingEmailSender 포지션 + StubEmailSender 역할 겸용)

`main/global/mo/StubMoVerificationClient.java`:

```java
package com.duing.global.mo;

import java.time.LocalDateTime;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * {@code mo.provider=stub}(기본) 전용 — 로컬·CI 에서 Octomo 없이 동작한다.
 *
 * <p>테스트: {@link #registerInboundMessage} 로 (발신번호, 본문) 쌍을 주입해 수신을 시뮬레이션한다.
 * 로컬 수동 확인: {@code mo.stub.auto-verify-after-seconds} 가 양수(N)면 최초 조회 후 N초 지난
 * 세션을 수신된 것으로 간주한다 (기본 0 = 비활성. 자동화 테스트에서는 사용 금지 — 시간 의존 플래키).
 */
@Component
@ConditionalOnProperty(name = "mo.provider", havingValue = "stub", matchIfMissing = true)
public class StubMoVerificationClient implements MoVerificationClient {

    public static final String STUB_QR_DATA_URL = "data:image/png;base64,c3R1Yi1xcg==";

    private final long autoVerifyAfterSeconds;
    private final Set<String> inboundMessages = ConcurrentHashMap.newKeySet();
    private final ConcurrentHashMap<String, LocalDateTime> firstQueriedAt = new ConcurrentHashMap<>();

    public StubMoVerificationClient(
            @Value("${mo.stub.auto-verify-after-seconds:0}") long autoVerifyAfterSeconds) {
        this.autoVerifyAfterSeconds = autoVerifyAfterSeconds;
    }

    @Override
    public boolean messageExists(String mobileNum, String text, int withinMinutes) {
        String messageKey = key(mobileNum, text);
        if (inboundMessages.contains(messageKey)) {
            return true;
        }
        if (autoVerifyAfterSeconds <= 0) {
            return false;
        }
        LocalDateTime firstAsked = firstQueriedAt.computeIfAbsent(messageKey, ignored -> LocalDateTime.now());
        return !LocalDateTime.now().isBefore(firstAsked.plusSeconds(autoVerifyAfterSeconds));
    }

    @Override
    public Optional<String> createSmsQrCode(String text) {
        return Optional.of(STUB_QR_DATA_URL);
    }

    /** 테스트 전용 — (발신번호, 본문) 수신을 시뮬레이션한다. 발신번호는 하이픈 없는 숫자만(서비스 정규화와 동일). */
    public void registerInboundMessage(String mobileNum, String text) {
        inboundMessages.add(key(mobileNum, text));
    }

    /** 테스트 전용 — 등록된 수신·최초 조회 기록 초기화. */
    public void clear() {
        inboundMessages.clear();
        firstQueriedAt.clear();
    }

    private String key(String mobileNum, String text) {
        return mobileNum + ":" + text;
    }
}
```

- [ ] **Step 8: Commit**

```bash
git add backend/src/main/java/com/duing/global/mo/ backend/src/main/java/com/duing/global/config/OctomoClientConfig.java backend/src/test/java/com/duing/global/mo/OctomoMoVerificationClientTest.java
git commit -m "feat(backend): Octomo MO 조회 포트·어댑터·스텁 추가"
```

---

## Task 9: 서비스 계층 — 발급·상태조회 오케스트레이션

동작 검증은 Task 11 통합 테스트가 담당한다 (Octomo poll-through 는 실 PG + HTTP 레벨에서 검증해야 의미가 있다). 여기서는 컴파일까지.

**Files:**
- Create: `main/domain/user/service/dto/command/IssuePhoneVerificationCommand.java`
- Create: `main/domain/user/service/dto/query/PhoneVerificationIssueResult.java`
- Create: `main/domain/user/service/dto/query/PhoneVerificationStatusResult.java`
- Create: `main/domain/user/service/PhoneVerificationService.java`
- Create: `main/domain/user/service/GeneralPhoneVerificationService.java`

- [ ] **Step 1: command·query DTO 작성**

`main/domain/user/service/dto/command/IssuePhoneVerificationCommand.java`:

```java
package com.duing.domain.user.service.dto.command;

import com.duing.domain.user.entity.VerificationPurpose;

/** PR1 은 SIGNUP 전용 — 컨트롤러가 purpose 를 고정한다. PHONE_CHANGE/PASSWORD_RESET 발급은 PR4. */
public record IssuePhoneVerificationCommand(
        String phone,
        VerificationPurpose purpose,
        boolean includeQr
) {
}
```

`main/domain/user/service/dto/query/PhoneVerificationIssueResult.java`:

```java
package com.duing.domain.user.service.dto.query;

import java.time.LocalDateTime;

/** qrCode 는 요청 시(includeQr)에만 채워지며 발급 실패 시 null — 프론트가 텍스트 안내로 폴백한다. */
public record PhoneVerificationIssueResult(
        String verificationToken,
        String code,
        String moNumber,
        String qrCode,
        LocalDateTime expiresAt,
        long expiresInSeconds
) {
}
```

`main/domain/user/service/dto/query/PhoneVerificationStatusResult.java`:

```java
package com.duing.domain.user.service.dto.query;

import com.duing.domain.user.entity.PhoneVerificationStatus;

public record PhoneVerificationStatusResult(
        PhoneVerificationStatus status,
        long expiresInSeconds,
        String maskedPhone
) {
}
```

- [ ] **Step 2: 서비스 인터페이스 작성**

`main/domain/user/service/PhoneVerificationService.java`:

```java
package com.duing.domain.user.service;

import com.duing.domain.user.service.dto.command.IssuePhoneVerificationCommand;
import com.duing.domain.user.service.dto.query.PhoneVerificationIssueResult;
import com.duing.domain.user.service.dto.query.PhoneVerificationStatusResult;

public interface PhoneVerificationService {

    /** MO 인증 세션 발급(번호당 1행 upsert) — 이미 가입된 번호 409, 60초 쿨다운 429. */
    PhoneVerificationIssueResult issue(IssuePhoneVerificationCommand issueCommand, String clientIp);

    /**
     * 폴링용 상태 조회 — PENDING 이면 스로틀·쿼터 안에서 Octomo exists 를 poll-through 해
     * 인증을 확정한다. clientIp/userAgent 는 VERIFIED 감사 이벤트에 기록된다.
     */
    PhoneVerificationStatusResult getStatus(String verificationToken, String clientIp, String userAgent);
}
```

- [ ] **Step 3: 구현체 작성**

`main/domain/user/service/GeneralPhoneVerificationService.java`:

```java
package com.duing.domain.user.service;

import com.duing.domain.user.entity.PhoneVerification;
import com.duing.domain.user.entity.PhoneVerificationEvent;
import com.duing.domain.user.entity.PhoneVerificationStatus;
import com.duing.domain.user.entity.VerificationPurpose;
import com.duing.domain.user.exception.PhoneVerificationException;
import com.duing.domain.user.repository.PhoneVerificationEventRepository;
import com.duing.domain.user.repository.PhoneVerificationRepository;
import com.duing.domain.user.repository.UserRepository;
import com.duing.domain.user.service.dto.command.IssuePhoneVerificationCommand;
import com.duing.domain.user.service.dto.query.PhoneVerificationIssueResult;
import com.duing.domain.user.service.dto.query.PhoneVerificationStatusResult;
import com.duing.domain.user.support.PhoneMasker;
import com.duing.global.mo.MoProviderException;
import com.duing.global.mo.MoVerificationClient;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Slf4j
@Service
@Transactional(readOnly = true)
public class GeneralPhoneVerificationService implements PhoneVerificationService {

    /** Octomo exists 조회 창(분) — 세션 유효시간(5분)과 정렬한다 (spec §2.1). */
    private static final int EXISTS_WITHIN_MINUTES = (int) PhoneVerification.VALIDITY.toMinutes();

    private final PhoneVerificationRepository phoneVerificationRepository;
    private final PhoneVerificationEventRepository phoneVerificationEventRepository;
    private final UserRepository userRepository;
    private final PhoneVerificationCodeDeriver codeDeriver;
    private final PhoneVerificationRateLimiter rateLimiter;
    private final MoPollThrottle moPollThrottle;
    private final MoVerificationClient moVerificationClient;
    private final String moInboundNumber;

    public GeneralPhoneVerificationService(PhoneVerificationRepository phoneVerificationRepository,
                                           PhoneVerificationEventRepository phoneVerificationEventRepository,
                                           UserRepository userRepository,
                                           PhoneVerificationCodeDeriver codeDeriver,
                                           PhoneVerificationRateLimiter rateLimiter,
                                           MoPollThrottle moPollThrottle,
                                           MoVerificationClient moVerificationClient,
                                           @Value("${mo.inbound-number}") String moInboundNumber) {
        this.phoneVerificationRepository = phoneVerificationRepository;
        this.phoneVerificationEventRepository = phoneVerificationEventRepository;
        this.userRepository = userRepository;
        this.codeDeriver = codeDeriver;
        this.rateLimiter = rateLimiter;
        this.moPollThrottle = moPollThrottle;
        this.moVerificationClient = moVerificationClient;
        this.moInboundNumber = moInboundNumber;
    }

    @Override
    @Transactional
    public PhoneVerificationIssueResult issue(IssuePhoneVerificationCommand issueCommand, String clientIp) {
        LocalDateTime now = LocalDateTime.now();
        rateLimiter.assertAndRecordIssueIpRequest(clientIp, now);

        // 이미 가입된 번호면 발급하지 않고 즉시 409 — 이메일 인증의 발송 전 409 와 동일한 UX 우선
        // 트레이드오프 (가입 여부 노출은 IP 리밋이 제한, 권위 있는 차단은 PR2 signup 의 existsByPhone
        // 재검증이 담당 — spec §7.1).
        if (userRepository.existsByPhone(issueCommand.phone())) {
            throw new PhoneVerificationException.PhoneAlreadyRegisteredException();
        }

        String token = UUID.randomUUID().toString();
        PhoneVerification phoneVerification =
                upsertVerification(issueCommand.phone(), token, issueCommand.purpose(), now);
        String code = codeDeriver.deriveCode(phoneVerification.getToken());
        String qrCode = issueCommand.includeQr()
                ? moVerificationClient.createSmsQrCode(code).orElse(null)
                : null;
        return new PhoneVerificationIssueResult(
                phoneVerification.getToken(), code, moInboundNumber, qrCode,
                phoneVerification.getExpiresAt(), phoneVerification.remainingSeconds(now));
    }

    /**
     * PENDING 세션은 Octomo poll-through 로 인증을 확정할 수 있어 <b>쓰기 트랜잭션</b>이다 —
     * 클래스 기본 readOnly 가 쓰기 오케스트레이션을 감싸면 실 PG 에서 500 이 난다.
     */
    @Override
    @Transactional
    public PhoneVerificationStatusResult getStatus(String verificationToken, String clientIp, String userAgent) {
        LocalDateTime now = LocalDateTime.now();
        rateLimiter.assertAndRecordStatusIpRequest(clientIp, now);
        PhoneVerification phoneVerification = phoneVerificationRepository.findByToken(verificationToken)
                .orElseThrow(PhoneVerificationException.PhoneVerificationNotFoundException::new);

        if (phoneVerification.status(now) == PhoneVerificationStatus.PENDING
                && moPollThrottle.tryAcquire(verificationToken, now)) {
            moPollThrottle.reserveDailyQuota(now);
            if (inboundMessageArrived(phoneVerification)) {
                confirmVerified(verificationToken, clientIp, userAgent, now);
            }
        }
        // confirmVerified 는 같은 영속성 컨텍스트의 동일 인스턴스를 갱신하므로 여기서 최신 상태가 반영된다.
        return new PhoneVerificationStatusResult(
                phoneVerification.status(now),
                phoneVerification.remainingSeconds(now),
                PhoneMasker.mask(phoneVerification.getPhone()));
    }

    private boolean inboundMessageArrived(PhoneVerification phoneVerification) {
        // Octomo 는 하이픈 없는 숫자 형식(공식 샘플 예시 기준) — 저장 형식(010-XXXX-XXXX)에서 정규화한다.
        String mobileNum = phoneVerification.getPhone().replace("-", "");
        String code = codeDeriver.deriveCode(phoneVerification.getToken());
        try {
            return moVerificationClient.messageExists(mobileNum, code, EXISTS_WITHIN_MINUTES);
        } catch (MoProviderException providerFailure) {
            // 조회는 부작용이 없어 다음 폴링이 자연 재시도한다 — PENDING 유지. ERROR 로그는 Sentry 이벤트가 된다.
            log.error("Octomo 수신 조회 실패 — PENDING 을 유지한다.", providerFailure);
            return false;
        }
    }

    /** 동시 폴링 race — 행잠금 후 아직 PENDING 일 때만 확정한다 (멱등, spec §9.5). */
    private void confirmVerified(String verificationToken, String clientIp, String userAgent, LocalDateTime now) {
        PhoneVerification lockedVerification = phoneVerificationRepository
                .findByTokenForUpdate(verificationToken)
                .orElseThrow(PhoneVerificationException.PhoneVerificationNotFoundException::new);
        if (lockedVerification.isVerified() || lockedVerification.isExpired(now)) {
            return;
        }
        lockedVerification.markVerified(now);
        phoneVerificationEventRepository.save(
                PhoneVerificationEvent.verified(lockedVerification, clientIp, userAgent));
    }

    private PhoneVerification upsertVerification(String phone, String token,
                                                 VerificationPurpose purpose, LocalDateTime now) {
        PhoneVerification existingVerification =
                phoneVerificationRepository.findByPhoneForUpdate(phone).orElse(null);
        if (existingVerification != null) {
            if (existingVerification.isInCooldown(now)) {
                throw new PhoneVerificationException.PhoneVerificationCooldownException();
            }
            existingVerification.reissue(token, purpose, null, now);
            return existingVerification;
        }
        try {
            return phoneVerificationRepository.saveAndFlush(
                    PhoneVerification.issue(phone, token, purpose, null, now));
        } catch (DataIntegrityViolationException concurrentInsertRace) {
            // 동시 요청이 방금 행을 생성했다 — 쿨다운과 동일하게 응답하고 롤백한다.
            // (PostgreSQL 은 제약 위반 후 같은 트랜잭션에서 추가 쿼리 불가 → 재조회 금지)
            throw new PhoneVerificationException.PhoneVerificationCooldownException();
        }
    }
}
```

- [ ] **Step 4: 컴파일 확인**

Run: `cd backend && ./gradlew compileJava`
Expected: `BUILD SUCCESSFUL`

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/duing/domain/user/service/PhoneVerificationService.java backend/src/main/java/com/duing/domain/user/service/GeneralPhoneVerificationService.java backend/src/main/java/com/duing/domain/user/service/dto/
git commit -m "feat(backend): MO 인증 발급·상태조회 서비스 추가 (Octomo poll-through)"
```

---

## Task 10: API 계층 — request/response DTO + AuthApi·AuthController 확장

**Files:**
- Create: `main/domain/user/controller/dto/request/IssuePhoneVerificationRequest.java`
- Create: `main/domain/user/controller/dto/response/PhoneVerificationIssueResponse.java`
- Create: `main/domain/user/controller/dto/response/PhoneVerificationStatusResponse.java`
- Modify: `main/domain/user/api/AuthApi.java` (메서드 2개 추가)
- Modify: `main/domain/user/controller/AuthController.java` (구현 2개 + 서비스 주입 추가)

- [ ] **Step 1: request DTO 작성**

`main/domain/user/controller/dto/request/IssuePhoneVerificationRequest.java`:

```java
package com.duing.domain.user.controller.dto.request;

import com.duing.domain.user.entity.VerificationPurpose;
import com.duing.domain.user.service.dto.command.IssuePhoneVerificationCommand;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public record IssuePhoneVerificationRequest(
        @NotBlank(message = "전화번호는 필수 입력값입니다.")
        @Pattern(regexp = "^010-\\d{4}-\\d{4}$", message = "전화번호는 010-XXXX-XXXX 형식이어야 합니다.")
        String phone
) {
    /** PR1 은 회원가입 용도 고정 — purpose 필드 노출은 PR4 에서 (기본값 SIGNUP 으로 비파괴 확장). */
    public IssuePhoneVerificationCommand toCommand(boolean includeQr) {
        return new IssuePhoneVerificationCommand(phone, VerificationPurpose.SIGNUP, includeQr);
    }
}
```

- [ ] **Step 2: response DTO 2종 작성**

`main/domain/user/controller/dto/response/PhoneVerificationIssueResponse.java`:

```java
package com.duing.domain.user.controller.dto.response;

import com.duing.domain.user.service.dto.query.PhoneVerificationIssueResult;
import java.time.LocalDateTime;

public record PhoneVerificationIssueResponse(
        String verificationToken,
        String code,
        String moNumber,
        String qrCode,
        LocalDateTime expiresAt,
        long expiresInSeconds
) {
    public static PhoneVerificationIssueResponse from(PhoneVerificationIssueResult issueResult) {
        return new PhoneVerificationIssueResponse(
                issueResult.verificationToken(), issueResult.code(), issueResult.moNumber(),
                issueResult.qrCode(), issueResult.expiresAt(), issueResult.expiresInSeconds());
    }
}
```

`main/domain/user/controller/dto/response/PhoneVerificationStatusResponse.java`:

```java
package com.duing.domain.user.controller.dto.response;

import com.duing.domain.user.entity.PhoneVerificationStatus;
import com.duing.domain.user.service.dto.query.PhoneVerificationStatusResult;

public record PhoneVerificationStatusResponse(
        PhoneVerificationStatus status,
        long expiresInSeconds,
        String maskedPhone
) {
    public static PhoneVerificationStatusResponse from(PhoneVerificationStatusResult statusResult) {
        return new PhoneVerificationStatusResponse(
                statusResult.status(), statusResult.expiresInSeconds(), statusResult.maskedPhone());
    }
}
```

- [ ] **Step 3: AuthApi 에 메서드 2개 추가**

`main/domain/user/api/AuthApi.java` — import 에 `IssuePhoneVerificationRequest`, `PhoneVerificationIssueResponse`, `PhoneVerificationStatusResponse`, `org.springframework.web.bind.annotation.GetMapping`, `org.springframework.web.bind.annotation.PathVariable`, `org.springframework.web.bind.annotation.RequestParam` 추가 후, `confirmEmailVerification` 메서드 아래에 추가:

```java
    @Operation(summary = "휴대폰 MO 인증 시작",
            description = "회원가입용 MO 인증 세션을 발급한다. 사용자가 수신 대표번호로 코드를 문자 전송하면 "
                    + "상태 조회가 VERIFIED 로 바뀐다. 세션 5분 유효, 재발급 60초 쿨다운. "
                    + "이미 가입된 번호는 409(PHONE_ALREADY_REGISTERED). "
                    + "qr=true 면 SMSTO 딥링크 QR(data URL)을 함께 반환한다(발급 실패 시 null — 텍스트 폴백).")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "201", description = "발급됨"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "이미 가입된 번호")
    })
    @PostMapping("/auth/phone-verifications")
    ResponseEntity<ApiResponse<PhoneVerificationIssueResponse>> issuePhoneVerification(
            @Valid @RequestBody IssuePhoneVerificationRequest issueRequest,
            @RequestParam(name = "qr", defaultValue = "false") boolean includeQr,
            HttpServletRequest httpServletRequest);

    @Operation(summary = "휴대폰 MO 인증 상태 조회",
            description = "발급 토큰으로 인증 상태(PENDING/VERIFIED/EXPIRED)를 조회한다. 프론트 폴링용(3초 간격 권장) — "
                    + "PENDING 이면 서버가 Octomo 수신 여부를 확인한다(세션당 2.5초 스로틀, 일일 상한 초과 시 503).")
    @ApiResponses(@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "조회 성공"))
    @GetMapping("/auth/phone-verifications/{verificationToken}")
    ResponseEntity<ApiResponse<PhoneVerificationStatusResponse>> getPhoneVerificationStatus(
            @PathVariable("verificationToken") String verificationToken,
            HttpServletRequest httpServletRequest);
```

- [ ] **Step 4: AuthController 에 구현 추가**

`main/domain/user/controller/AuthController.java` — 필드에 `private final PhoneVerificationService phoneVerificationService;` 추가(import 포함), 클래스 끝에 추가:

```java
    @Override
    public ResponseEntity<ApiResponse<PhoneVerificationIssueResponse>> issuePhoneVerification(
            @Valid @RequestBody IssuePhoneVerificationRequest issueRequest,
            @RequestParam(name = "qr", defaultValue = "false") boolean includeQr,
            HttpServletRequest httpServletRequest) {
        String clientIp = httpServletRequest.getRemoteAddr();
        PhoneVerificationIssueResult issueResult =
                phoneVerificationService.issue(issueRequest.toCommand(includeQr), clientIp);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(PhoneVerificationIssueResponse.from(issueResult)));
    }

    @Override
    public ResponseEntity<ApiResponse<PhoneVerificationStatusResponse>> getPhoneVerificationStatus(
            String verificationToken, HttpServletRequest httpServletRequest) {
        String clientIp = httpServletRequest.getRemoteAddr();
        String userAgent = httpServletRequest.getHeader("User-Agent");
        PhoneVerificationStatusResult statusResult =
                phoneVerificationService.getStatus(verificationToken, clientIp, userAgent);
        return ResponseEntity.ok(ApiResponse.success(PhoneVerificationStatusResponse.from(statusResult)));
    }
```

(import 추가: `IssuePhoneVerificationRequest`, `PhoneVerificationIssueResponse`, `PhoneVerificationStatusResponse`, `PhoneVerificationService`, `PhoneVerificationIssueResult`, `PhoneVerificationStatusResult`, `org.springframework.web.bind.annotation.RequestParam`)

`/api/v1/auth/**` 는 SecurityConfig permitAll 에 이미 포함되므로 보안 설정 변경은 없다.

- [ ] **Step 5: 컨텍스트 기동 확인**

Run: `cd backend && ./gradlew test --tests "AuthControllerSignupTest"`
Expected: `BUILD SUCCESSFUL`

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/duing/domain/user/api/AuthApi.java backend/src/main/java/com/duing/domain/user/controller/AuthController.java backend/src/main/java/com/duing/domain/user/controller/dto/
git commit -m "feat(backend): MO 인증 시작·상태조회 API 추가"
```

---

## Task 11: 통합 테스트 — 발급→수신→폴링→검증 전 시나리오

**Files:**
- Test: `test/domain/user/controller/AuthPhoneVerificationTest.java`

- [ ] **Step 1: 통합 테스트 작성** (기존 `AuthEmailVerificationTest` 컨벤션 — RestAssured + Stub 주입 + 리미터 reset)

`test/domain/user/controller/AuthPhoneVerificationTest.java`:

```java
package com.duing.domain.user.controller;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.lessThanOrEqualTo;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.PhoneVerification;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.exception.PhoneVerificationException;
import com.duing.domain.user.repository.PhoneVerificationEventRepository;
import com.duing.domain.user.repository.PhoneVerificationRepository;
import com.duing.domain.user.repository.UserRepository;
import com.duing.domain.user.service.MoPollThrottle;
import com.duing.domain.user.service.PhoneVerificationRateLimiter;
import com.duing.global.mo.StubMoVerificationClient;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import io.restassured.path.json.JsonPath;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AuthPhoneVerificationTest extends IntegrationTestBase {

    private static final String PHONE = "010-1234-5678";
    private static final int SESSION_VALIDITY_SECONDS = (int) PhoneVerification.VALIDITY.getSeconds();

    @LocalServerPort
    private int port;

    @Autowired
    private StubMoVerificationClient stubMoClient;

    @Autowired
    private PhoneVerificationRateLimiter rateLimiter;

    @Autowired
    private MoPollThrottle moPollThrottle;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PhoneVerificationRepository phoneVerificationRepository;

    @Autowired
    private PhoneVerificationEventRepository phoneVerificationEventRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    // 가입 사용자·발급 번호 유일성 보장용 시퀀스.
    private final AtomicLong sequence = new AtomicLong(0);

    private record IssuedSession(String token, String code) {}

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        // @SpringBootTest 컨텍스트 공유로 in-memory 상태가 누적되므로 테스트마다 초기화한다.
        rateLimiter.reset();
        moPollThrottle.reset();
        stubMoClient.clear();
    }

    private IssuedSession issue(String phone) {
        JsonPath issueBody = given().contentType(ContentType.JSON).body(Map.of("phone", phone))
                .when().post("/api/v1/auth/phone-verifications")
                .then().statusCode(HttpStatus.CREATED.value())
                .extract().jsonPath();
        return new IssuedSession(
                issueBody.getString("data.verificationToken"), issueBody.getString("data.code"));
    }

    /** 수신 시뮬레이션 — 서비스가 하이픈을 제거해 조회하므로 스텁에도 숫자만으로 등록한다. */
    private void registerInbound(String phone, String code) {
        stubMoClient.registerInboundMessage(phone.replace("-", ""), code);
    }

    private String getStatus(String token) {
        return given().when().get("/api/v1/auth/phone-verifications/" + token)
                .then().statusCode(HttpStatus.OK.value())
                .extract().jsonPath().getString("data.status");
    }

    /** 스로틀(2.5초) 대기 없이 다음 폴링이 Octomo 를 조회하게 한다. */
    private String getStatusAfterThrottleReset(String token) {
        moPollThrottle.reset();
        return getStatus(token);
    }

    private void bypassCooldown(String phone) {
        jdbcTemplate.update("UPDATE phone_verifications SET last_issued_at = ? WHERE phone = ?",
                LocalDateTime.now().minusMinutes(2), phone);
    }

    private void saveRegisteredUser(String phone) {
        long seq = sequence.incrementAndGet();
        userRepository.save(User.create(
                String.valueOf(20250000 + seq), "가입자" + seq, "u" + seq + "@daegu.ac.kr", "h",
                UserRole.STUDENT, Grade.JUNIOR, College.IT_ENGINEERING, "컴퓨터정보공학부",
                phone, LocalDateTime.now()));
    }

    private String uniquePhone() {
        return String.format("010-9%03d-0000", sequence.incrementAndGet());
    }

    @Test
    @DisplayName("발급 응답에는 토큰·8자 코드·수신 대표번호·만료 정보가 담기고 QR 미요청 시 qrCode 는 null 이다")
    void issueReturnsSessionPayload() {
        JsonPath issueBody = given().contentType(ContentType.JSON).body(Map.of("phone", PHONE))
                .when().post("/api/v1/auth/phone-verifications")
                .then().statusCode(HttpStatus.CREATED.value())
                .body("data.moNumber", equalTo("16663538"))
                .body("data.expiresInSeconds", equalTo(SESSION_VALIDITY_SECONDS))
                .extract().jsonPath();

        assertThat(issueBody.getString("data.verificationToken")).hasSize(36);
        assertThat(issueBody.getString("data.code")).matches("^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{8}$");
        assertThat(issueBody.getString("data.qrCode")).isNull();
    }

    @Test
    @DisplayName("qr=true 로 발급하면 QR data URL 이 함께 반환된다")
    void issueWithQrReturnsDataUrl() {
        given().contentType(ContentType.JSON).body(Map.of("phone", PHONE))
                .when().post("/api/v1/auth/phone-verifications?qr=true")
                .then().statusCode(HttpStatus.CREATED.value())
                .body("data.qrCode", equalTo(StubMoVerificationClient.STUB_QR_DATA_URL));
    }

    @Test
    @DisplayName("전화번호 형식이 올바르지 않으면 400 을 반환한다")
    void invalidPhoneFormatReturnsBadRequest() {
        given().contentType(ContentType.JSON).body(Map.of("phone", "01012345678"))
                .when().post("/api/v1/auth/phone-verifications")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("이미 가입된 번호로 발급을 요청하면 409 와 PHONE_ALREADY_REGISTERED 를 반환한다")
    void registeredPhoneReturnsConflict() {
        String registeredPhone = uniquePhone();
        saveRegisteredUser(registeredPhone);

        given().contentType(ContentType.JSON).body(Map.of("phone", registeredPhone))
                .when().post("/api/v1/auth/phone-verifications")
                .then().statusCode(HttpStatus.CONFLICT.value())
                .body("code", equalTo("PHONE_ALREADY_REGISTERED"));
    }

    @Test
    @DisplayName("문자가 아직 수신되지 않았으면 PENDING 과 마스킹 번호·남은 시간이 반환된다")
    void statusStaysPendingWithoutInbound() {
        IssuedSession session = issue(PHONE);

        given().when().get("/api/v1/auth/phone-verifications/" + session.token())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.status", equalTo("PENDING"))
                .body("data.maskedPhone", equalTo("010-****-5678"))
                .body("data.expiresInSeconds", lessThanOrEqualTo(SESSION_VALIDITY_SECONDS));
    }

    @Test
    @DisplayName("발급 코드가 선언 번호에서 수신되면 VERIFIED 로 바뀌고 재조회해도 VERIFIED 다 (멱등)")
    void statusBecomesVerifiedAfterInbound() {
        IssuedSession session = issue(PHONE);
        registerInbound(PHONE, session.code());

        assertThat(getStatus(session.token())).isEqualTo("VERIFIED");
        assertThat(getStatus(session.token())).isEqualTo("VERIFIED");
    }

    @Test
    @DisplayName("다른 코드가 수신돼도 PENDING 을 유지한다")
    void wrongCodeStaysPending() {
        IssuedSession session = issue(PHONE);
        registerInbound(PHONE, "AAAAAAAA");

        assertThat(getStatus(session.token())).isEqualTo("PENDING");
    }

    @Test
    @DisplayName("같은 코드라도 다른 번호에서 수신되면 PENDING 을 유지한다 — 번호 대조는 Octomo(exists 쌍 확인) 소관")
    void inboundFromDifferentPhoneStaysPending() {
        IssuedSession session = issue(PHONE);
        registerInbound("010-9999-9999", session.code());

        assertThat(getStatus(session.token())).isEqualTo("PENDING");
    }

    @Test
    @DisplayName("세션 만료 후에는 문자가 수신돼 있어도 EXPIRED 이며 남은 시간은 0 이다")
    void expiredSessionReturnsExpired() {
        IssuedSession session = issue(PHONE);
        registerInbound(PHONE, session.code());
        jdbcTemplate.update("UPDATE phone_verifications SET expires_at = ? WHERE token = ?",
                LocalDateTime.now().minusMinutes(1), session.token());

        given().when().get("/api/v1/auth/phone-verifications/" + session.token())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.status", equalTo("EXPIRED"))
                .body("data.expiresInSeconds", equalTo(0));
    }

    @Test
    @DisplayName("인증 후 완료 창(SIGNUP 30분)이 지나면 EXPIRED 로 판정된다 — 재인증 유도")
    void verifiedSessionExpiresAfterCompletionWindow() {
        IssuedSession session = issue(PHONE);
        registerInbound(PHONE, session.code());
        assertThat(getStatus(session.token())).isEqualTo("VERIFIED");

        jdbcTemplate.update("UPDATE phone_verifications SET verified_at = ? WHERE token = ?",
                LocalDateTime.now().minusMinutes(31), session.token());

        assertThat(getStatus(session.token())).isEqualTo("EXPIRED");
    }

    @Test
    @DisplayName("존재하지 않는 토큰 조회는 404 와 PHONE_VERIFICATION_NOT_FOUND 를 반환한다")
    void unknownTokenReturnsNotFound() {
        given().when().get("/api/v1/auth/phone-verifications/no-such-token")
                .then().statusCode(HttpStatus.NOT_FOUND.value())
                .body("code", equalTo("PHONE_VERIFICATION_NOT_FOUND"));
    }

    @Test
    @DisplayName("60초 쿨다운 내 재발급은 429, 쿨다운 후 재발급은 새 토큰·새 코드를 발급하고 구 토큰·구 코드를 무효화한다")
    void reissueInvalidatesOldSession() {
        IssuedSession firstSession = issue(PHONE);

        given().contentType(ContentType.JSON).body(Map.of("phone", PHONE))
                .when().post("/api/v1/auth/phone-verifications")
                .then().statusCode(HttpStatus.TOO_MANY_REQUESTS.value())
                .body("code", equalTo("PHONE_VERIFICATION_COOLDOWN"));

        bypassCooldown(PHONE);
        IssuedSession secondSession = issue(PHONE);
        assertThat(secondSession.token()).isNotEqualTo(firstSession.token());
        assertThat(secondSession.code()).isNotEqualTo(firstSession.code());

        // 구 토큰은 즉시 무효(404), 구 코드가 수신돼도 새 세션은 PENDING 을 유지한다.
        given().when().get("/api/v1/auth/phone-verifications/" + firstSession.token())
                .then().statusCode(HttpStatus.NOT_FOUND.value());
        registerInbound(PHONE, firstSession.code());
        assertThat(getStatus(secondSession.token())).isEqualTo("PENDING");

        // 새 코드가 수신되면 인증된다.
        registerInbound(PHONE, secondSession.code());
        assertThat(getStatusAfterThrottleReset(secondSession.token())).isEqualTo("VERIFIED");
    }

    @Test
    @DisplayName("세션당 2.5초 스로틀 — 직전 폴링 직후의 재조회는 Octomo 를 건너뛰어 PENDING 을 유지한다")
    void throttleSkipsImmediateSecondPoll() {
        IssuedSession session = issue(PHONE);
        assertThat(getStatus(session.token())).isEqualTo("PENDING"); // 스로틀 슬롯 소비

        registerInbound(PHONE, session.code());
        assertThat(getStatus(session.token())).isEqualTo("PENDING"); // 스로틀에 막혀 미조회

        assertThat(getStatusAfterThrottleReset(session.token())).isEqualTo("VERIFIED");
    }

    @Test
    @DisplayName("같은 IP 의 발급 요청이 분당 한도(10회)를 넘으면 429 와 VERIFICATION_RATE_LIMITED 를 반환한다")
    void issueIpRateLimitReturnsTooManyRequests() {
        for (int attempt = 0; attempt < 10; attempt++) {
            issue(uniquePhone());
        }
        given().contentType(ContentType.JSON).body(Map.of("phone", uniquePhone()))
                .when().post("/api/v1/auth/phone-verifications")
                .then().statusCode(HttpStatus.TOO_MANY_REQUESTS.value())
                .body("code", equalTo("VERIFICATION_RATE_LIMITED"));
    }

    @Test
    @DisplayName("Octomo 일일 호출 상한을 소진하면 상태 조회가 503 과 SMS_POLL_QUOTA_EXCEEDED 를 반환한다")
    void dailyQuotaExhaustedReturnsServiceUnavailable() {
        IssuedSession session = issue(PHONE);
        exhaustDailyQuota();

        given().when().get("/api/v1/auth/phone-verifications/" + session.token())
                .then().statusCode(HttpStatus.SERVICE_UNAVAILABLE.value())
                .body("code", equalTo("SMS_POLL_QUOTA_EXCEEDED"));
    }

    private void exhaustDailyQuota() {
        LocalDateTime now = LocalDateTime.now();
        try {
            while (true) {
                moPollThrottle.reserveDailyQuota(now);
            }
        } catch (PhoneVerificationException.SmsPollQuotaExceededException quotaExhausted) {
            // 한도 도달 — 의도된 종료.
        }
    }

    @Test
    @DisplayName("인증 성공 시 VERIFIED 감사 이벤트가 번호·용도와 함께 기록된다")
    void verifiedEventIsRecorded() {
        IssuedSession session = issue(PHONE);
        registerInbound(PHONE, session.code());
        assertThat(getStatus(session.token())).isEqualTo("VERIFIED");

        Integer verifiedEventCount = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM phone_verification_events "
                        + "WHERE phone = ? AND purpose = 'SIGNUP' AND event_type = 'VERIFIED'",
                Integer.class, PHONE);
        assertThat(verifiedEventCount).isEqualTo(1);
    }

    @Test
    @DisplayName("같은 번호의 동시 발급 요청은 한 건만 성공하고 나머지는 쿨다운(429)으로 수렴한다 — 세션 행 1개 보장")
    void concurrentIssueCreatesSingleSession() throws InterruptedException {
        int threadCount = 5;
        ExecutorService executor = Executors.newFixedThreadPool(threadCount);
        CountDownLatch readyLatch = new CountDownLatch(threadCount);
        CountDownLatch startLatch = new CountDownLatch(1);
        List<Integer> statusCodes = Collections.synchronizedList(new ArrayList<>());
        for (int thread = 0; thread < threadCount; thread++) {
            executor.submit(() -> {
                readyLatch.countDown();
                try {
                    startLatch.await();
                    statusCodes.add(given().contentType(ContentType.JSON).body(Map.of("phone", PHONE))
                            .when().post("/api/v1/auth/phone-verifications").getStatusCode());
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                }
            });
        }
        readyLatch.await();
        startLatch.countDown();
        executor.shutdown();
        assertThat(executor.awaitTermination(30, TimeUnit.SECONDS)).isTrue();

        // insert race 패자는 unique 위반 → 429, 잠금 대기자는 쿨다운 재평가 → 429 (spec §9.5).
        assertThat(statusCodes).hasSize(threadCount);
        assertThat(statusCodes.stream().filter(statusCode -> statusCode == 201).count()).isEqualTo(1);
        assertThat(statusCodes.stream().filter(statusCode -> statusCode == 429).count())
                .isEqualTo(threadCount - 1L);
        Integer sessionCount = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM phone_verifications WHERE phone = ?", Integer.class, PHONE);
        assertThat(sessionCount).isEqualTo(1);
    }

    @Test
    @Transactional // @Modifying 네이티브 삭제 쿼리는 트랜잭션이 필요하다 (운영은 PiiRetentionJob 의 @Transactional).
    @DisplayName("만료 후 24시간 지난 인증 세션만 물리 삭제된다 — PII 파기")
    void purgeDeletesOnlyStaleSessions() {
        LocalDateTime now = LocalDateTime.now();
        insertSessionRow("010-9801-0000", "stale-token", now.minusDays(2));
        insertSessionRow("010-9802-0000", "fresh-token", now.plusMinutes(5));

        int deletedCount = phoneVerificationRepository.deleteExpiredVerifications(now.minusDays(1));

        assertThat(deletedCount).isEqualTo(1);
        assertThat(phoneVerificationRepository.findByToken("fresh-token")).isPresent();
        assertThat(phoneVerificationRepository.findByToken("stale-token")).isEmpty();
    }

    @Test
    @Transactional
    @DisplayName("45일 지난 감사 이벤트만 물리 삭제된다 — PII 파기")
    void purgeDeletesOnlyStaleEvents() {
        LocalDateTime now = LocalDateTime.now();
        insertEventRow("010-9803-0000", now.minusDays(46));
        insertEventRow("010-9804-0000", now.minusDays(1));

        int deletedCount = phoneVerificationEventRepository.deleteExpiredEvents(now.minusDays(45));

        assertThat(deletedCount).isEqualTo(1);
        Integer remainingCount = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM phone_verification_events", Integer.class);
        assertThat(remainingCount).isEqualTo(1);
    }

    private void insertSessionRow(String phone, String token, LocalDateTime expiresAt) {
        jdbcTemplate.update(
                "INSERT INTO phone_verifications "
                        + "(phone, token, purpose, expires_at, last_issued_at, created_at, updated_at) "
                        + "VALUES (?, ?, 'SIGNUP', ?, NOW(), NOW(), NOW())",
                phone, token, expiresAt);
    }

    private void insertEventRow(String phone, LocalDateTime createdAt) {
        jdbcTemplate.update(
                "INSERT INTO phone_verification_events (phone, purpose, event_type, created_at) "
                        + "VALUES (?, 'SIGNUP', 'VERIFIED', ?)",
                phone, createdAt);
    }
}
```

- [ ] **Step 2: 실행·통과 확인**

Run: `cd backend && ./gradlew test --tests "AuthPhoneVerificationTest"`
Expected: `BUILD SUCCESSFUL` (전 시나리오 PASS. 실패 시 구현을 고친다 — 테스트 기대를 낮추지 않는다)

- [ ] **Step 3: Commit**

```bash
git add backend/src/test/java/com/duing/domain/user/controller/AuthPhoneVerificationTest.java
git commit -m "test(backend): MO 인증 발급·폴링·검증 통합 테스트 추가"
```

---

## Task 12: PiiRetentionJob 에 세션·이벤트 파기 편입

**Files:**
- Modify: `main/global/privacy/PiiRetentionJob.java`
- Modify: `test/global/privacy/PiiRetentionJobTest.java`

- [ ] **Step 1: 잡에 파기 대상 2개 추가**

`main/global/privacy/PiiRetentionJob.java` — import 에 `PhoneVerificationRepository`, `PhoneVerificationEventRepository` 추가, 필드에 추가(`@RequiredArgsConstructor` 가 주입):

```java
    private final PhoneVerificationRepository phoneVerificationRepository;
    private final PhoneVerificationEventRepository phoneVerificationEventRepository;
```

클래스에 상수 추가:

```java
    /** MO 인증 세션은 단명 데이터 — 만료 후 1일이면 파기한다 (보관기간 window 와 별도, spec §9.4). */
    private static final Period PHONE_VERIFICATION_RETENTION = Period.ofDays(1);
```

`run()` 의 `deleteExpiredVerifications` 호출 아래에 추가하고 log.info 라인을 확장:

```java
        int deletedPhoneVerifications = phoneVerificationRepository
                .deleteExpiredVerifications(LocalDateTime.now(clock).minus(PHONE_VERIFICATION_RETENTION));
        int deletedPhoneVerificationEvents = phoneVerificationEventRepository.deleteExpiredEvents(cutoff);
        log.info("[PII 보관기간 파기] usersAnonymized={}, applicationsScrubbed={}, verificationsDeleted={}, "
                        + "phoneVerificationsDeleted={}, phoneVerificationEventsDeleted={}, cutoff={}",
                anonymizedUsers, scrubbedApplications, deletedVerifications,
                deletedPhoneVerifications, deletedPhoneVerificationEvents, cutoff);
```

(기존 log.info 는 이 확장판으로 교체한다.)

- [ ] **Step 2: 기존 잡 테스트 보수**

`test/global/privacy/PiiRetentionJobTest.java` 를 열어 잡 생성 방식을 확인한다:
- 생성자/mock 주입 방식이면 기존 `emailVerificationRepository` 와 동일한 패턴으로 `phoneVerificationRepository`·`phoneVerificationEventRepository` mock 2개를 추가한다 (각 delete 메서드는 기본 0 반환 stub 이면 충분).
- 실행 검증이 있으면 두 repository 의 delete 메서드가 호출되는지(각 1회) 검증을 같은 스타일로 추가한다.

Run: `cd backend && ./gradlew test --tests "PiiRetentionJobTest" --tests "PrivacyRetentionSchedulingWiringTest"`
Expected: `BUILD SUCCESSFUL`

- [ ] **Step 3: Commit**

```bash
git add backend/src/main/java/com/duing/global/privacy/PiiRetentionJob.java backend/src/test/java/com/duing/global/privacy/PiiRetentionJobTest.java
git commit -m "feat(backend): MO 인증 세션·감사 이벤트를 PII 파기 잡에 편입"
```

---

## Task 13: 전체 테스트 + 마무리 점검

- [ ] **Step 1: 백엔드 전체 테스트**

Run: `cd backend && ./gradlew test`
Expected: `BUILD SUCCESSFUL` — 출력에서 직접 확인 (파이프로 가리지 않는다). 실패 시 원인을 고치고 재실행.

- [ ] **Step 2: 범위 자가 점검 (spec §16 PR1)**

- 기존 이메일 인증·로그인·가입 플로우 코드가 **변경되지 않았는지** `git diff develop --stat` 로 확인 (AuthApi/AuthController 는 메서드 추가만, GeneralUserService 등 미변경)
- 신규 엔드포인트 2개가 permitAll 하에 동작하고, JWT 없이 curl 로 호출 가능한 상태인지 확인
- push·PR 생성은 하지 않는다 — 사용자 지시 대기

- [ ] **Step 3: 커밋 이력 확인**

Run: `git log --oneline develop..HEAD`
Expected: docs 1 + feat/test 커밋 8개 내외, 메시지 전부 Conventional Commits 형식

---

## 계획 범위 밖 — 배포 전 선행 작업 리마인더 (spec §17, 사용자 수행)

- Octomo 회원가입 → `OCTOMO_API_KEY` 발급, 로그인 문서로 exists 본문 매칭 방식(정확 일치 vs 포함)·`mobileNum` 하이픈 유무 확인 → 다르면 `OctomoMoVerificationClient`/`inboundMessageArrived` 정규화만 조정
- prod env: `MO_PROVIDER=octomo`, `OCTOMO_API_KEY`, `PHONE_VERIFICATION_SECRET` 주입
- 배포 후 실기기 스모크: 실번호로 발급 → 문자 전송 → VERIFIED 확인 (통신 3사 + 알뜰폰)
- PR2(학번 로그인 전환) 계획은 본 PR 머지 후 작성 — 그 전에 prod `student_id` 8자리 전수 확인

