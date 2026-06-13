# 회원가입 이메일 인증 (Resend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 회원가입 전에 6자리 인증 코드를 이메일(Resend)로 발송·확인해 학교 이메일 소유를 검증한다.

**Architecture:** 가입 전 사전 인증 — `email_verifications` 테이블(이메일당 1행 upsert)로 인증 상태를 서버가 관리하고, signup 은 `verifiedAt != null && now < expiresAt` 가드로 이중 방어. 발송은 `EmailSender` 인터페이스 뒤에 RestClient 기반 Resend 구현체(타임아웃 3s/3s)와 로컬용 Logging 구현체를 둔다. 에러 응답에 machine-readable `code` 필드를 비파괴 추가해 프론트가 분기한다.

**Tech Stack:** Spring Boot 3.4 / Java 21 / Flyway / RestClient / HMAC-SHA256 · Next.js 15 / React 19 / TanStack Query / Zod / vitest

**Spec:** `docs/superpowers/specs/2026-06-13-email-verification-design.md`

**구현 분할:** Part A(백엔드) = 1 PR, Part B(프론트) = 1 PR. Part B 는 Part A 머지 후 시작.

**공통 규칙 (모든 Task):**
- 커밋 메시지는 Conventional Commits (`feat(backend): ...`, `test(web): ...`). `[#이슈]` 형식·Co-Authored-By/Generated 라인 금지.
- push·PR 생성 금지 — 구현 완료 후 사용자 지시를 기다린다.
- 백엔드 테스트 실행은 Docker 가 떠 있어야 한다 (TestContainers).

---

# Part A — 백엔드 (브랜치: `feat/{이슈번호}-email-verification-api`, develop 에서 분기)

## Task 1: V50 마이그레이션 + 테스트 TRUNCATE 목록 갱신

**Files:**
- Create: `backend/src/main/resources/db/migration/V50__create_email_verifications_table.sql`
- Modify: `backend/src/test/java/com/duing/common/IntegrationTestBase.java`

- [ ] **Step 1: 마이그레이션 파일 작성**

`backend/src/main/resources/db/migration/V50__create_email_verifications_table.sql`:

```sql
-- 회원가입 이메일 인증 코드 상태. 이메일당 1행 upsert 로 관리한다.
-- soft delete 미적용 (일회성 상태 — 가입 완료 시 행 삭제, 재발송 시 덮어씀).
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

- [ ] **Step 2: IntegrationTestBase TRUNCATE 목록에 추가**

`IntegrationTestBase.java` 의 TRUNCATE 문자열에서 `"users "` 바로 앞 줄에 한 줄 추가:

```java
                "promotion_request, " +
                "email_verifications, " +
                "club, " +
                "users " +
```

- [ ] **Step 3: 기존 테스트로 마이그레이션 검증**

Run: `cd backend && ./gradlew test --tests "AuthControllerSignupTest"`
Expected: PASS (Flyway V50 적용 성공 — `ddl-auto: validate` 이므로 스키마 오류 시 컨텍스트 기동 실패)

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/resources/db/migration/V50__create_email_verifications_table.sql backend/src/test/java/com/duing/common/IntegrationTestBase.java
git commit -m "feat(backend): email_verifications 테이블 마이그레이션 추가"
```

---

## Task 2: ApiResponse·ApplicationException 에 machine-readable code 비파괴 확장

**Files:**
- Modify: `backend/src/main/java/com/duing/global/response/ApiResponse.java`
- Modify: `backend/src/main/java/com/duing/global/exception/ApplicationException.java`
- Modify: `backend/src/main/java/com/duing/global/exception/GlobalExceptionHandler.java:33-43`

주의: `@JsonInclude(NON_NULL)` 은 **`code` 컴포넌트에만** 붙인다. 클래스 레벨에 붙이면 기존 응답의 `data: null`/`message: null` 이 사라져 프론트 `unwrap()` 계약이 깨진다.

- [ ] **Step 1: ApiResponse 에 code 필드 추가**

`ApiResponse.java` 전체를 다음으로 교체:

```java
package com.duing.global.response;

import com.fasterxml.jackson.annotation.JsonInclude;

public record ApiResponse<T>(
        boolean ok,
        T data,
        String message,
        @JsonInclude(JsonInclude.Include.NON_NULL) String code
) {
    public static <T> ApiResponse<T> success(T data) {
        return new ApiResponse<>(true, data, null, null);
    }

    public static ApiResponse<Void> success() {
        return new ApiResponse<>(true, null, null, null);
    }

    public static ApiResponse<Void> error(String message) {
        return new ApiResponse<>(false, null, message, null);
    }

    public static ApiResponse<Void> error(String message, String code) {
        return new ApiResponse<>(false, null, message, code);
    }
}
```

- [ ] **Step 2: ApplicationException 에 선택적 code 추가 (기존 생성자 유지)**

`ApplicationException.java` 전체를 다음으로 교체:

```java
package com.duing.global.exception;

import lombok.Getter;
import org.springframework.http.HttpStatus;

@Getter
public abstract class ApplicationException extends RuntimeException {

    private final HttpStatus status;
    /** 프론트 분기용 machine-readable 코드. 미지정 시 null → 응답에서 생략된다. */
    private final String code;

    protected ApplicationException(String message, HttpStatus status) {
        this(message, status, null);
    }

    protected ApplicationException(String message, HttpStatus status, String code) {
        super(message);
        this.status = status;
        this.code = code;
    }
}
```

- [ ] **Step 3: GlobalExceptionHandler 가 code 를 내려주도록 수정**

`GlobalExceptionHandler.java` 의 두 곳 수정.

`handleUnresolvedMembers` (라인 33-35) — 4번째 인자 `null` 추가:

```java
        return ResponseEntity.status(exception.getStatus())
                .body(new ApiResponse<>(false, UnresolvedMembersResponse.from(exception.getPayload()),
                        exception.getMessage(), null));
```

`handleApplicationException` (라인 38-43):

```java
    @ExceptionHandler(ApplicationException.class)
    public ResponseEntity<ApiResponse<Void>> handleApplicationException(ApplicationException exception) {
        log.warn("ApplicationException: {}", exception.getMessage());
        return ResponseEntity.status(exception.getStatus())
                .body(ApiResponse.error(exception.getMessage(), exception.getCode()));
    }
```

- [ ] **Step 4: 컴파일 + 기존 테스트 통과 확인**

Run: `cd backend && ./gradlew test`
Expected: PASS (기존 응답 JSON 불변 — code 는 null 이라 직렬화 생략)

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/duing/global/response/ApiResponse.java backend/src/main/java/com/duing/global/exception/ApplicationException.java backend/src/main/java/com/duing/global/exception/GlobalExceptionHandler.java
git commit -m "feat(backend): 에러 응답에 machine-readable code 필드 비파괴 추가"
```

---

## Task 3: 발송 인프라 — EmailSender / EmailMessage / EmailSendException / LoggingEmailSender + 설정

**Files:**
- Create: `backend/src/main/java/com/duing/global/email/EmailSender.java`
- Create: `backend/src/main/java/com/duing/global/email/EmailMessage.java`
- Create: `backend/src/main/java/com/duing/global/email/EmailSendException.java`
- Create: `backend/src/main/java/com/duing/global/email/LoggingEmailSender.java`
- Modify: `backend/src/main/resources/application.yml` (s3 블록 아래에 email/resend 블록 추가)
- Modify: `backend/src/test/resources/application.yml` (email 블록 추가)

설계 노트: `EmailSendFailedException` 은 spec §5.4 에서 `EmailVerificationException` 하위로 적었지만, `global/email` 이 `domain/user` 를 의존하면 레이어가 역전되므로 **`global/email/EmailSendException`** 으로 둔다 (HTTP 502 / code `EMAIL_SEND_FAILED` / 메시지는 spec 과 동일 — 의미는 그대로).

- [ ] **Step 1: 인터페이스·record·예외 작성**

`EmailSender.java`:

```java
package com.duing.global.email;

public interface EmailSender {

    /**
     * 이메일을 동기 발송한다.
     *
     * @throws EmailSendException 발송 실패(타임아웃·비 2xx 응답 등) 시
     */
    void send(EmailMessage emailMessage);
}
```

`EmailMessage.java`:

```java
package com.duing.global.email;

public record EmailMessage(
        String to,
        String subject,
        String html
) {}
```

`EmailSendException.java`:

```java
package com.duing.global.email;

import com.duing.global.exception.ApplicationException;
import org.springframework.http.HttpStatus;

public class EmailSendException extends ApplicationException {

    private static final String MESSAGE = "인증 메일 발송에 실패했습니다. 잠시 후 다시 시도해주세요.";
    private static final String CODE = "EMAIL_SEND_FAILED";

    public EmailSendException() {
        super(MESSAGE, HttpStatus.BAD_GATEWAY, CODE);
    }
}
```

- [ ] **Step 2: LoggingEmailSender 작성**

`LoggingEmailSender.java`:

```java
package com.duing.global.email;

import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * 로컬 개발용 EmailSender — 실제 발송 없이 본문을 로그로 출력한다.
 *
 * <p>{@code email.provider} 미설정 또는 {@code logging} 일 때 활성 (matchIfMissing).
 * 운영은 {@code EMAIL_PROVIDER=resend} 로 {@code ResendEmailSender} 가 대신 등록된다.
 */
@Slf4j
@Component
@ConditionalOnProperty(name = "email.provider", havingValue = "logging", matchIfMissing = true)
public class LoggingEmailSender implements EmailSender {

    @Override
    public void send(EmailMessage emailMessage) {
        log.info("[LoggingEmailSender] to={}, subject={}\n{}",
                emailMessage.to(), emailMessage.subject(), emailMessage.html());
    }
}
```

- [ ] **Step 3: application.yml 설정 추가**

`backend/src/main/resources/application.yml` 의 `s3:` 블록 아래에 추가:

```yaml
email:
  provider: ${EMAIL_PROVIDER:logging}   # logging | resend  (test 전용: stub)
  verification:
    secret: ${EMAIL_VERIFICATION_SECRET}   # HMAC 키 — 기본값 없음(필수), .env 로 주입

resend:
  api-key: ${RESEND_API_KEY:}
  from: ${RESEND_FROM:Du-ing <noreply@duings.com>}
```

`backend/src/test/resources/application.yml` 의 `file:` 블록 아래에 추가:

```yaml
email:
  provider: stub
  verification:
    # 테스트 전용 더미 키 — 실 시크릿 아님.
    secret: duing-test-email-verification-secret

resend:
  api-key: ""
  from: Du-ing <noreply@duings.com>
```

- [ ] **Step 4: backend/.env 에 로컬 키 추가 안내**

`backend/.env` 에 다음 줄을 추가한다 (`.env` 는 git 미추적 — 커밋 금지):

```
EMAIL_VERIFICATION_SECRET=local-dev-email-verification-secret
```

- [ ] **Step 5: 컴파일 확인**

Run: `cd backend && ./gradlew compileJava`
Expected: BUILD SUCCESSFUL

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/duing/global/email/ backend/src/main/resources/application.yml backend/src/test/resources/application.yml
git commit -m "feat(backend): EmailSender 추상화와 LoggingEmailSender, 이메일 설정 추가"
```

---

## Task 4: ResendEmailSender — RestClient 직접 호출 (타임아웃 3s/3s)

**Files:**
- Create: `backend/src/main/java/com/duing/global/email/ResendProperties.java`
- Create: `backend/src/main/java/com/duing/global/config/ResendClientConfig.java`
- Create: `backend/src/main/java/com/duing/global/email/ResendEmailSender.java`
- Test: `backend/src/test/java/com/duing/global/email/ResendEmailSenderTest.java`

설계 노트: 공식 SDK(resend-java)는 `new OkHttpClient()` 하드코딩으로 타임아웃 주입이 불가능해 RestClient 직접 호출로 구현한다 (spec §6.1). 필요한 API 는 `POST https://api.resend.com/emails` 하나.

- [ ] **Step 1: 실패하는 단위 테스트 작성**

`ResendEmailSenderTest.java`:

```java
package com.duing.global.email;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class ResendEmailSenderTest {

    private MockRestServiceServer mockServer;
    private ResendEmailSender resendEmailSender;

    @BeforeEach
    void setUp() {
        RestClient.Builder restClientBuilder = RestClient.builder().baseUrl("https://api.resend.com");
        mockServer = MockRestServiceServer.bindTo(restClientBuilder).build();
        ResendProperties resendProperties = new ResendProperties("test-api-key", "Du-ing <noreply@duings.com>");
        resendEmailSender = new ResendEmailSender(restClientBuilder.build(), resendProperties);
    }

    @Test
    @DisplayName("발송 성공 시 Resend API 에 from/to/subject/html 이 담긴 POST 요청을 보낸다")
    void sendPostsEmailPayloadToResend() {
        mockServer.expect(requestTo("https://api.resend.com/emails"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("Authorization", "Bearer test-api-key"))
                .andExpect(jsonPath("$.from").value("Du-ing <noreply@duings.com>"))
                .andExpect(jsonPath("$.to[0]").value("hong@daegu.ac.kr"))
                .andExpect(jsonPath("$.subject").value("[Du-ing] 이메일 인증 코드"))
                .andRespond(withSuccess("{\"id\":\"email-id\"}", MediaType.APPLICATION_JSON));

        assertThatCode(() -> resendEmailSender.send(
                new EmailMessage("hong@daegu.ac.kr", "[Du-ing] 이메일 인증 코드", "<p>123456</p>")))
                .doesNotThrowAnyException();
        mockServer.verify();
    }

    @Test
    @DisplayName("Resend 가 5xx 를 반환하면 EmailSendException 으로 변환된다")
    void sendConvertsServerErrorToEmailSendException() {
        mockServer.expect(requestTo("https://api.resend.com/emails"))
                .andRespond(withServerError());

        assertThatThrownBy(() -> resendEmailSender.send(
                new EmailMessage("hong@daegu.ac.kr", "제목", "<p>본문</p>")))
                .isInstanceOf(EmailSendException.class);
    }
}
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd backend && ./gradlew test --tests "ResendEmailSenderTest"`
Expected: COMPILE FAIL (`ResendProperties`, `ResendEmailSender` 미존재)

- [ ] **Step 3: 구현 작성**

`ResendProperties.java`:

```java
package com.duing.global.email;

import jakarta.validation.constraints.NotBlank;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

@Validated
@ConfigurationProperties(prefix = "resend")
public record ResendProperties(
        @NotBlank String apiKey,
        @NotBlank String from
) {}
```

`ResendClientConfig.java` (S3ClientConfig 패턴):

```java
package com.duing.global.config;

import com.duing.global.email.ResendProperties;
import java.time.Duration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

@Configuration
@ConditionalOnProperty(name = "email.provider", havingValue = "resend")
@EnableConfigurationProperties(ResendProperties.class)
public class ResendClientConfig {

    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(3);
    private static final Duration READ_TIMEOUT = Duration.ofSeconds(3);

    @Bean
    public RestClient resendRestClient() {
        // Resend 장애 시 발송 API 가 길게 블로킹되지 않도록 짧은 타임아웃을 강제한다.
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(CONNECT_TIMEOUT);
        requestFactory.setReadTimeout(READ_TIMEOUT);
        return RestClient.builder()
                .baseUrl("https://api.resend.com")
                .requestFactory(requestFactory)
                .build();
    }
}
```

`ResendEmailSender.java`:

```java
package com.duing.global.email;

import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

@Slf4j
@Component
@RequiredArgsConstructor
@ConditionalOnProperty(name = "email.provider", havingValue = "resend")
public class ResendEmailSender implements EmailSender {

    private final RestClient resendRestClient;
    private final ResendProperties resendProperties;

    @Override
    public void send(EmailMessage emailMessage) {
        try {
            resendRestClient.post()
                    .uri("/emails")
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + resendProperties.apiKey())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of(
                            "from", resendProperties.from(),
                            "to", List.of(emailMessage.to()),
                            "subject", emailMessage.subject(),
                            "html", emailMessage.html()
                    ))
                    .retrieve()
                    .toBodilessEntity();
        } catch (RestClientException sendFailure) {
            log.error("Resend 발송 실패: to={}", emailMessage.to(), sendFailure);
            throw new EmailSendException();
        }
    }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd backend && ./gradlew test --tests "ResendEmailSenderTest"`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/duing/global/email/ backend/src/main/java/com/duing/global/config/ResendClientConfig.java backend/src/test/java/com/duing/global/email/
git commit -m "feat(backend): RestClient 기반 ResendEmailSender 구현 (타임아웃 3s)"
```

---

## Task 5: EmailVerification 엔티티 + 도메인 예외

**Files:**
- Create: `backend/src/main/java/com/duing/domain/user/entity/EmailVerification.java`
- Create: `backend/src/main/java/com/duing/domain/user/exception/EmailVerificationException.java`
- Test: `backend/src/test/java/com/duing/domain/user/entity/EmailVerificationTest.java`

설계 노트: `BaseEntity` 는 `deleted_at` 컬럼을 요구하지만 이 테이블은 soft delete 미적용이므로 상속하지 않고 id/감사 필드를 직접 선언한다. 정책 상수(만료 20분·쿨다운 60초·시도 5회)는 도메인 정책으로서 엔티티에 둔다.

- [ ] **Step 1: 실패하는 단위 테스트 작성**

`EmailVerificationTest.java`:

```java
package com.duing.domain.user.entity;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDateTime;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class EmailVerificationTest {

    private static final LocalDateTime SENT_AT = LocalDateTime.of(2026, 6, 13, 12, 0, 0);
    private static final String EMAIL = "hong@daegu.ac.kr";
    private static final String CODE_HASH = "a".repeat(64);

    @Test
    @DisplayName("발급 직후에는 미인증·시도 0회·만료 시각은 발송 20분 뒤다")
    void issueInitializesPendingState() {
        EmailVerification emailVerification = EmailVerification.issue(EMAIL, CODE_HASH, SENT_AT);

        assertThat(emailVerification.isVerified()).isFalse();
        assertThat(emailVerification.getAttemptCount()).isZero();
        assertThat(emailVerification.getExpiresAt()).isEqualTo(SENT_AT.plusMinutes(20));
        assertThat(emailVerification.getLastSentAt()).isEqualTo(SENT_AT);
    }

    @Test
    @DisplayName("발송 60초 이내에는 쿨다운, 60초 경과 시점부터 재발송 가능하다")
    void cooldownLastsSixtySeconds() {
        EmailVerification emailVerification = EmailVerification.issue(EMAIL, CODE_HASH, SENT_AT);

        assertThat(emailVerification.isInCooldown(SENT_AT.plusSeconds(59))).isTrue();
        assertThat(emailVerification.isInCooldown(SENT_AT.plusSeconds(60))).isFalse();
    }

    @Test
    @DisplayName("만료 시각 전에는 유효하고 만료 시각부터 만료다")
    void expiresExactlyAtExpiryTime() {
        EmailVerification emailVerification = EmailVerification.issue(EMAIL, CODE_HASH, SENT_AT);

        assertThat(emailVerification.isExpired(SENT_AT.plusMinutes(20).minusSeconds(1))).isFalse();
        assertThat(emailVerification.isExpired(SENT_AT.plusMinutes(20))).isTrue();
    }

    @Test
    @DisplayName("5회 실패 시도 후에는 시도 한도를 초과한다")
    void attemptLimitIsFive() {
        EmailVerification emailVerification = EmailVerification.issue(EMAIL, CODE_HASH, SENT_AT);

        for (int attempt = 0; attempt < 5; attempt++) {
            assertThat(emailVerification.isAttemptExceeded()).isFalse();
            emailVerification.increaseAttempt();
        }
        assertThat(emailVerification.isAttemptExceeded()).isTrue();
    }

    @Test
    @DisplayName("인증 완료 후 만료 전이면 가입에 사용할 수 있다")
    void usableForSignupWhenVerifiedAndNotExpired() {
        EmailVerification emailVerification = EmailVerification.issue(EMAIL, CODE_HASH, SENT_AT);
        emailVerification.verify(SENT_AT.plusMinutes(1));

        assertThat(emailVerification.isUsableForSignup(SENT_AT.plusMinutes(19))).isTrue();
        assertThat(emailVerification.isUsableForSignup(SENT_AT.plusMinutes(20))).isFalse();
    }

    @Test
    @DisplayName("재발급하면 코드·만료·시도·인증 상태가 모두 리셋된다")
    void reissueResetsAllState() {
        EmailVerification emailVerification = EmailVerification.issue(EMAIL, CODE_HASH, SENT_AT);
        emailVerification.increaseAttempt();
        emailVerification.verify(SENT_AT.plusMinutes(1));

        LocalDateTime resentAt = SENT_AT.plusMinutes(5);
        String newCodeHash = "b".repeat(64);
        emailVerification.reissue(newCodeHash, resentAt);

        assertThat(emailVerification.getCodeHash()).isEqualTo(newCodeHash);
        assertThat(emailVerification.isVerified()).isFalse();
        assertThat(emailVerification.getAttemptCount()).isZero();
        assertThat(emailVerification.getExpiresAt()).isEqualTo(resentAt.plusMinutes(20));
        assertThat(emailVerification.getLastSentAt()).isEqualTo(resentAt);
    }
}
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd backend && ./gradlew test --tests "EmailVerificationTest"`
Expected: COMPILE FAIL (`EmailVerification` 미존재)

- [ ] **Step 3: 엔티티 구현**

`EmailVerification.java`:

```java
package com.duing.domain.user.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EntityListeners;
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
 * 회원가입 이메일 인증 상태. 이메일당 1행 upsert 로 관리한다.
 *
 * <p>만료 개념은 {@code expiresAt} 하나로 통합 — 코드 유효 시간과 인증 후 가입 유효 시간이 같다.
 * soft delete 미적용 (가입 완료 시 행 삭제, 재발송 시 덮어씀) 이라 BaseEntity 를 상속하지 않는다.
 */
@Getter
@Entity
@Table(name = "email_verifications")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@EntityListeners(AuditingEntityListener.class)
public class EmailVerification {

    public static final Duration VALIDITY = Duration.ofMinutes(20);
    public static final Duration RESEND_COOLDOWN = Duration.ofSeconds(60);
    public static final int MAX_ATTEMPTS = 5;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 100)
    private String email;

    @Column(name = "code_hash", nullable = false, length = 64)
    private String codeHash;

    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;

    @Column(name = "verified_at")
    private LocalDateTime verifiedAt;

    @Column(name = "attempt_count", nullable = false)
    private int attemptCount;

    @Column(name = "last_sent_at", nullable = false)
    private LocalDateTime lastSentAt;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @LastModifiedDate
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @Builder(access = AccessLevel.PRIVATE)
    private EmailVerification(String email, String codeHash, LocalDateTime expiresAt,
                              LocalDateTime lastSentAt) {
        this.email = email;
        this.codeHash = codeHash;
        this.expiresAt = expiresAt;
        this.attemptCount = 0;
        this.lastSentAt = lastSentAt;
    }

    public static EmailVerification issue(String email, String codeHash, LocalDateTime now) {
        return EmailVerification.builder()
                .email(email)
                .codeHash(codeHash)
                .expiresAt(now.plus(VALIDITY))
                .lastSentAt(now)
                .build();
    }

    /** 코드 재발급 — 만료·시도·인증 상태를 모두 리셋한다. */
    public void reissue(String codeHash, LocalDateTime now) {
        this.codeHash = codeHash;
        this.expiresAt = now.plus(VALIDITY);
        this.verifiedAt = null;
        this.attemptCount = 0;
        this.lastSentAt = now;
    }

    public void verify(LocalDateTime now) {
        this.verifiedAt = now;
    }

    public void increaseAttempt() {
        this.attemptCount++;
    }

    public boolean isVerified() {
        return verifiedAt != null;
    }

    public boolean isExpired(LocalDateTime now) {
        return !now.isBefore(expiresAt);
    }

    public boolean isAttemptExceeded() {
        return attemptCount >= MAX_ATTEMPTS;
    }

    public boolean isInCooldown(LocalDateTime now) {
        return now.isBefore(lastSentAt.plus(RESEND_COOLDOWN));
    }

    public boolean isUsableForSignup(LocalDateTime now) {
        return isVerified() && !isExpired(now);
    }
}
```

- [ ] **Step 4: 도메인 예외 작성**

`EmailVerificationException.java`:

```java
package com.duing.domain.user.exception;

import com.duing.global.exception.ApplicationException;
import org.springframework.http.HttpStatus;

public class EmailVerificationException extends ApplicationException {

    protected EmailVerificationException(String message, HttpStatus status, String code) {
        super(message, status, code);
    }

    public static class EmailVerificationNotFoundException extends EmailVerificationException {
        private static final String MESSAGE = "인증 요청 이력이 없습니다. 인증코드를 먼저 발송해주세요.";

        public EmailVerificationNotFoundException() {
            super(MESSAGE, HttpStatus.BAD_REQUEST, "EMAIL_VERIFICATION_NOT_FOUND");
        }
    }

    public static class EmailVerificationExpiredException extends EmailVerificationException {
        private static final String MESSAGE = "인증코드가 만료되었습니다. 다시 발송해주세요.";

        public EmailVerificationExpiredException() {
            super(MESSAGE, HttpStatus.BAD_REQUEST, "EMAIL_VERIFICATION_EXPIRED");
        }
    }

    public static class InvalidVerificationCodeException extends EmailVerificationException {
        private static final String MESSAGE = "인증코드가 올바르지 않습니다.";

        public InvalidVerificationCodeException() {
            super(MESSAGE, HttpStatus.BAD_REQUEST, "INVALID_VERIFICATION_CODE");
        }
    }

    public static class VerificationCooldownException extends EmailVerificationException {
        private static final String MESSAGE = "잠시 후 다시 발송할 수 있습니다.";

        public VerificationCooldownException() {
            super(MESSAGE, HttpStatus.TOO_MANY_REQUESTS, "VERIFICATION_COOLDOWN");
        }
    }

    public static class VerificationAttemptExceededException extends EmailVerificationException {
        private static final String MESSAGE = "시도 횟수를 초과했습니다. 인증코드를 다시 발송해주세요.";

        public VerificationAttemptExceededException() {
            super(MESSAGE, HttpStatus.TOO_MANY_REQUESTS, "VERIFICATION_ATTEMPT_EXCEEDED");
        }
    }

    public static class VerificationRateLimitedException extends EmailVerificationException {
        private static final String MESSAGE = "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.";

        public VerificationRateLimitedException() {
            super(MESSAGE, HttpStatus.TOO_MANY_REQUESTS, "VERIFICATION_RATE_LIMITED");
        }
    }

    public static class EmailNotVerifiedException extends EmailVerificationException {
        private static final String MESSAGE = "이메일 인증이 필요합니다.";

        public EmailNotVerifiedException() {
            super(MESSAGE, HttpStatus.FORBIDDEN, "EMAIL_NOT_VERIFIED");
        }
    }

    public static class EmailSendQuotaExceededException extends EmailVerificationException {
        private static final String MESSAGE = "일시적으로 발송이 제한되었습니다. 잠시 후 다시 시도해주세요.";

        public EmailSendQuotaExceededException() {
            super(MESSAGE, HttpStatus.SERVICE_UNAVAILABLE, "EMAIL_SEND_QUOTA_EXCEEDED");
        }
    }
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd backend && ./gradlew test --tests "EmailVerificationTest"`
Expected: PASS (6 tests)

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/duing/domain/user/entity/EmailVerification.java backend/src/main/java/com/duing/domain/user/exception/EmailVerificationException.java backend/src/test/java/com/duing/domain/user/entity/EmailVerificationTest.java
git commit -m "feat(backend): EmailVerification 엔티티·도메인 예외 추가"
```

---

## Task 6: VerificationCodeManager — 코드 생성·HMAC 해시

**Files:**
- Create: `backend/src/main/java/com/duing/domain/user/service/VerificationCodeManager.java`
- Test: `backend/src/test/java/com/duing/domain/user/service/VerificationCodeManagerTest.java`

- [ ] **Step 1: 실패하는 단위 테스트 작성**

`VerificationCodeManagerTest.java`:

```java
package com.duing.domain.user.service;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.RepeatedTest;
import org.junit.jupiter.api.Test;

class VerificationCodeManagerTest {

    private final VerificationCodeManager verificationCodeManager =
            new VerificationCodeManager("test-secret");

    @RepeatedTest(20)
    @DisplayName("생성되는 코드는 선행 0 을 포함해 항상 6자리 숫자다")
    void generatedCodeIsAlwaysSixDigits() {
        String code = verificationCodeManager.generateCode();
        assertThat(code).matches("\\d{6}");
    }

    @Test
    @DisplayName("같은 이메일·코드는 같은 해시, 코드가 다르면 다른 해시가 나온다")
    void hashIsDeterministicPerEmailAndCode() {
        String hash = verificationCodeManager.hash("hong@daegu.ac.kr", "123456");

        assertThat(hash).hasSize(64);
        assertThat(verificationCodeManager.hash("hong@daegu.ac.kr", "123456")).isEqualTo(hash);
        assertThat(verificationCodeManager.hash("hong@daegu.ac.kr", "654321")).isNotEqualTo(hash);
        assertThat(verificationCodeManager.hash("kim@daegu.ac.kr", "123456")).isNotEqualTo(hash);
    }

    @Test
    @DisplayName("matches 는 올바른 코드만 true 를 반환한다")
    void matchesComparesHashInConstantTime() {
        String storedHash = verificationCodeManager.hash("hong@daegu.ac.kr", "123456");

        assertThat(verificationCodeManager.matches("hong@daegu.ac.kr", "123456", storedHash)).isTrue();
        assertThat(verificationCodeManager.matches("hong@daegu.ac.kr", "000000", storedHash)).isFalse();
    }

    @Test
    @DisplayName("시크릿이 다르면 같은 입력도 다른 해시가 나온다")
    void differentSecretYieldsDifferentHash() {
        VerificationCodeManager otherSecretManager = new VerificationCodeManager("other-secret");
        assertThat(otherSecretManager.hash("hong@daegu.ac.kr", "123456"))
                .isNotEqualTo(verificationCodeManager.hash("hong@daegu.ac.kr", "123456"));
    }
}
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd backend && ./gradlew test --tests "VerificationCodeManagerTest"`
Expected: COMPILE FAIL

- [ ] **Step 3: 구현**

`VerificationCodeManager.java`:

```java
package com.duing.domain.user.service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.HexFormat;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * 인증 코드 생성과 HMAC-SHA256 해시를 담당한다.
 *
 * <p>6자리 코드는 해시되어도 전수 대입으로 역산 가능하므로 해시는 보조 장치이며,
 * 실질 방어선은 만료 20분 + 시도 5회 제한이다 (spec §4.1).
 */
@Component
public class VerificationCodeManager {

    private static final SecureRandom SECURE_RANDOM = new SecureRandom();
    private static final String HMAC_ALGORITHM = "HmacSHA256";

    private final String secret;

    public VerificationCodeManager(@Value("${email.verification.secret}") String secret) {
        this.secret = secret;
    }

    /** 선행 0 을 허용하는 6자리 숫자 코드 (000000~999999). */
    public String generateCode() {
        return String.format("%06d", SECURE_RANDOM.nextInt(1_000_000));
    }

    public String hash(String email, String code) {
        try {
            Mac mac = Mac.getInstance(HMAC_ALGORITHM);
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), HMAC_ALGORITHM));
            byte[] hmac = mac.doFinal((email + ":" + code).getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hmac);
        } catch (java.security.GeneralSecurityException hmacFailure) {
            // HmacSHA256 은 JDK 필수 알고리즘 — 발생 시 설정 오류이므로 즉시 노출한다.
            throw new IllegalStateException("HMAC 계산 실패", hmacFailure);
        }
    }

    public boolean matches(String email, String code, String storedHash) {
        byte[] computed = hash(email, code).getBytes(StandardCharsets.UTF_8);
        byte[] stored = storedHash.getBytes(StandardCharsets.UTF_8);
        return MessageDigest.isEqual(computed, stored);
    }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd backend && ./gradlew test --tests "VerificationCodeManagerTest"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/duing/domain/user/service/VerificationCodeManager.java backend/src/test/java/com/duing/domain/user/service/VerificationCodeManagerTest.java
git commit -m "feat(backend): 인증코드 생성·HMAC 해시 컴포넌트 추가"
```

---

## Task 7: EmailVerificationRateLimiter — IP 슬라이딩 윈도우 + 일일 상한 (in-memory)

**Files:**
- Create: `backend/src/main/java/com/duing/domain/user/service/EmailVerificationRateLimiter.java`
- Test: `backend/src/test/java/com/duing/domain/user/service/EmailVerificationRateLimiterTest.java`

설계 노트: 단일 인스턴스 전제의 in-memory 구현 (spec §4.2). IP 윈도우는 **검사 시점에 기록**한다 — 거절(409 등)된 요청도 카운트해 이메일 열거를 함께 제한한다. 일일 카운터는 실제 발송 시도 시 `recordSendAttempt()` 로 증가한다.

- [ ] **Step 1: 실패하는 단위 테스트 작성**

`EmailVerificationRateLimiterTest.java`:

```java
package com.duing.domain.user.service;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.domain.user.exception.EmailVerificationException;
import java.time.LocalDateTime;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class EmailVerificationRateLimiterTest {

    private static final LocalDateTime BASE = LocalDateTime.of(2026, 6, 13, 12, 0, 0);
    private static final String IP = "203.0.113.10";

    private EmailVerificationRateLimiter rateLimiter;

    @BeforeEach
    void setUp() {
        rateLimiter = new EmailVerificationRateLimiter();
    }

    @Test
    @DisplayName("같은 IP 에서 1분 내 5회까지 허용되고 6번째는 거부된다")
    void perMinuteLimitIsFive() {
        for (int request = 0; request < 5; request++) {
            rateLimiter.assertAndRecordIpRequest(IP, BASE.plusSeconds(request));
        }
        assertThatThrownBy(() -> rateLimiter.assertAndRecordIpRequest(IP, BASE.plusSeconds(10)))
                .isInstanceOf(EmailVerificationException.VerificationRateLimitedException.class);
    }

    @Test
    @DisplayName("1분 윈도우가 지나면 같은 IP 도 다시 허용된다")
    void perMinuteWindowSlides() {
        for (int request = 0; request < 5; request++) {
            rateLimiter.assertAndRecordIpRequest(IP, BASE.plusSeconds(request));
        }
        assertThatCode(() -> rateLimiter.assertAndRecordIpRequest(IP, BASE.plusSeconds(61)))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("같은 IP 에서 1시간 내 50회를 넘으면 거부된다")
    void perHourLimitIsFifty() {
        // 1분 5회 제한을 피해 12초 간격으로 50회 (총 9분 50초… 가 아니라 50*12초=10분)
        for (int request = 0; request < 50; request++) {
            rateLimiter.assertAndRecordIpRequest(IP, BASE.plusSeconds(request * 12L));
        }
        assertThatThrownBy(() -> rateLimiter.assertAndRecordIpRequest(IP, BASE.plusMinutes(11)))
                .isInstanceOf(EmailVerificationException.VerificationRateLimitedException.class);
    }

    @Test
    @DisplayName("다른 IP 는 서로 제한에 영향을 주지 않는다")
    void limitsAreIsolatedPerIp() {
        for (int request = 0; request < 5; request++) {
            rateLimiter.assertAndRecordIpRequest(IP, BASE.plusSeconds(request));
        }
        assertThatCode(() -> rateLimiter.assertAndRecordIpRequest("198.51.100.7", BASE.plusSeconds(10)))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("일일 발송 5000건 도달 시 거부되고 KST 날짜가 바뀌면 리셋된다")
    void dailyQuotaResetsOnNextDay() {
        for (int sendAttempt = 0; sendAttempt < 5_000; sendAttempt++) {
            rateLimiter.assertGlobalQuotaAvailable(BASE);
            rateLimiter.recordSendAttempt(BASE);
        }
        assertThatThrownBy(() -> rateLimiter.assertGlobalQuotaAvailable(BASE))
                .isInstanceOf(EmailVerificationException.EmailSendQuotaExceededException.class);

        LocalDateTime nextDay = BASE.plusDays(1);
        assertThatCode(() -> rateLimiter.assertGlobalQuotaAvailable(nextDay))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("reset 하면 모든 카운터가 초기화된다")
    void resetClearsAllState() {
        for (int request = 0; request < 5; request++) {
            rateLimiter.assertAndRecordIpRequest(IP, BASE.plusSeconds(request));
        }
        rateLimiter.reset();
        assertThatCode(() -> rateLimiter.assertAndRecordIpRequest(IP, BASE.plusSeconds(10)))
                .doesNotThrowAnyException();
    }
}
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd backend && ./gradlew test --tests "EmailVerificationRateLimiterTest"`
Expected: COMPILE FAIL

- [ ] **Step 3: 구현**

`EmailVerificationRateLimiter.java`:

```java
package com.duing.domain.user.service;

import com.duing.domain.user.exception.EmailVerificationException;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.stereotype.Component;

/**
 * 인증 메일 발송 레이트리밋 — in-memory, 단일 인스턴스 전제 (spec §4.2).
 *
 * <p>IP 슬라이딩 윈도우(1분 5회 / 1시간 50회)는 검사 시점에 기록한다 — 거절된 요청도
 * 카운트해 이메일 열거(409 응답 탐색)를 함께 제한한다. 전역 일일 상한(5,000건)은
 * Resend 쿼터 보호 목적이며 실제 발송 시도 시 증가한다. 재시작 시 리셋은 수용한다.
 * 인스턴스 증설 시 Redis 기반으로 교체 필요 (백로그).
 */
@Component
public class EmailVerificationRateLimiter {

    static final int PER_MINUTE_LIMIT = 5;
    static final int PER_HOUR_LIMIT = 50;
    static final int DAILY_GLOBAL_LIMIT = 5_000;

    private final ConcurrentHashMap<String, Deque<LocalDateTime>> requestTimesByIp = new ConcurrentHashMap<>();
    private final AtomicReference<DailyCounter> dailyCounter = new AtomicReference<>();

    /** IP 윈도우를 검사하고, 허용이면 이번 요청을 기록한다. 초과 시 429. */
    public void assertAndRecordIpRequest(String clientIp, LocalDateTime now) {
        requestTimesByIp.compute(clientIp, (ip, requestTimes) -> {
            Deque<LocalDateTime> windowTimes = requestTimes == null ? new ArrayDeque<>() : requestTimes;
            LocalDateTime hourAgo = now.minusHours(1);
            while (!windowTimes.isEmpty() && windowTimes.peekFirst().isBefore(hourAgo)) {
                windowTimes.pollFirst();
            }
            long lastMinuteCount = windowTimes.stream()
                    .filter(requestTime -> !requestTime.isBefore(now.minusMinutes(1)))
                    .count();
            if (lastMinuteCount >= PER_MINUTE_LIMIT || windowTimes.size() >= PER_HOUR_LIMIT) {
                throw new EmailVerificationException.VerificationRateLimitedException();
            }
            windowTimes.addLast(now);
            return windowTimes;
        });
    }

    /** 전역 일일 상한 검사. 초과 시 503. */
    public void assertGlobalQuotaAvailable(LocalDateTime now) {
        DailyCounter counter = currentCounter(now.toLocalDate());
        if (counter.count().get() >= DAILY_GLOBAL_LIMIT) {
            throw new EmailVerificationException.EmailSendQuotaExceededException();
        }
    }

    /** 발송 시도를 일일 카운터에 기록한다 (실패한 호출도 Resend 쿼터를 소비). */
    public void recordSendAttempt(LocalDateTime now) {
        currentCounter(now.toLocalDate()).count().incrementAndGet();
    }

    /** 테스트 전용 — 모든 카운터 초기화. */
    public void reset() {
        requestTimesByIp.clear();
        dailyCounter.set(null);
    }

    private DailyCounter currentCounter(LocalDate today) {
        return dailyCounter.updateAndGet(existing ->
                existing != null && existing.date().equals(today)
                        ? existing
                        : new DailyCounter(today, new AtomicInteger(0)));
    }

    private record DailyCounter(LocalDate date, AtomicInteger count) {}
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd backend && ./gradlew test --tests "EmailVerificationRateLimiterTest"`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/duing/domain/user/service/EmailVerificationRateLimiter.java backend/src/test/java/com/duing/domain/user/service/EmailVerificationRateLimiterTest.java
git commit -m "feat(backend): 인증 메일 발송 레이트리밋 컴포넌트 추가 (IP·전역 상한)"
```

---

## Task 8: EmailVerificationRepository + 서비스 DTO

**Files:**
- Create: `backend/src/main/java/com/duing/domain/user/repository/EmailVerificationRepository.java`
- Create: `backend/src/main/java/com/duing/domain/user/service/dto/command/SendEmailVerificationCommand.java`
- Create: `backend/src/main/java/com/duing/domain/user/service/dto/command/ConfirmEmailVerificationCommand.java`
- Create: `backend/src/main/java/com/duing/domain/user/service/dto/query/EmailVerificationSendResult.java`

- [ ] **Step 1: Repository 작성**

`EmailVerificationRepository.java`:

```java
package com.duing.domain.user.repository;

import com.duing.domain.user.entity.EmailVerification;
import jakarta.persistence.LockModeType;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface EmailVerificationRepository extends JpaRepository<EmailVerification, Long> {

    Optional<EmailVerification> findByEmail(String email);

    /**
     * 행 잠금 조회 — 동시 발송(코드 덮어쓰기·메일 2통)과 병렬 confirm 의
     * attempt 카운트 유실을 막는다 (spec §7.3).
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT emailVerification FROM EmailVerification emailVerification WHERE emailVerification.email = :email")
    Optional<EmailVerification> findByEmailForUpdate(@Param("email") String email);

    void deleteByEmail(String email);
}
```

- [ ] **Step 2: DTO 작성**

`SendEmailVerificationCommand.java`:

```java
package com.duing.domain.user.service.dto.command;

public record SendEmailVerificationCommand(
        String email
) {}
```

`ConfirmEmailVerificationCommand.java`:

```java
package com.duing.domain.user.service.dto.command;

public record ConfirmEmailVerificationCommand(
        String email,
        String code
) {}
```

`EmailVerificationSendResult.java`:

```java
package com.duing.domain.user.service.dto.query;

import java.time.LocalDateTime;

public record EmailVerificationSendResult(
        LocalDateTime expiresAt,
        long expiresInSeconds
) {}
```

- [ ] **Step 3: 컴파일 확인**

Run: `cd backend && ./gradlew compileJava`
Expected: BUILD SUCCESSFUL

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/java/com/duing/domain/user/repository/EmailVerificationRepository.java backend/src/main/java/com/duing/domain/user/service/dto/
git commit -m "feat(backend): EmailVerification 리포지토리·서비스 DTO 추가"
```

---

## Task 9: EmailVerificationService — 발송·확인·가입 가드 비즈니스 로직

**Files:**
- Create: `backend/src/main/java/com/duing/domain/user/service/EmailVerificationService.java`
- Create: `backend/src/main/java/com/duing/domain/user/service/GeneralEmailVerificationService.java`

핵심 트랜잭션 설계 (반드시 그대로 구현):
- **confirm 의 attempt 증가는 `noRollbackFor`** 로 커밋한다 — 예외로 롤백되면 시도 카운트가 유실돼 5회 제한이 무력화된다.
- **insert race 의 `DataIntegrityViolationException` 은 catch 후 재조회 금지** — PostgreSQL 은 제약 위반 후 같은 트랜잭션에서 추가 쿼리가 불가하다. 즉시 `VerificationCooldownException` 으로 변환한다 (동시 요청이 방금 발송했으므로 의미상 동일).
- 메일 발송은 트랜잭션 안에서 동기 수행 — 실패 시 롤백되어 쿨다운 페널티가 남지 않는다. 행 잠금 유지 시간은 타임아웃(3s+3s)으로 상한이 있다.

- [ ] **Step 1: 서비스 인터페이스 작성**

`EmailVerificationService.java`:

```java
package com.duing.domain.user.service;

import com.duing.domain.user.service.dto.command.ConfirmEmailVerificationCommand;
import com.duing.domain.user.service.dto.command.SendEmailVerificationCommand;
import com.duing.domain.user.service.dto.query.EmailVerificationSendResult;

public interface EmailVerificationService {

    EmailVerificationSendResult sendCode(SendEmailVerificationCommand sendCommand, String clientIp);

    void confirmCode(ConfirmEmailVerificationCommand confirmCommand);

    /** 가입 가능한(인증 완료 + 미만료) 상태가 아니면 EmailNotVerifiedException(403). */
    void assertVerified(String email);

    /** 가입 완료 후 인증 행 삭제 — 재사용 방지. */
    void consume(String email);
}
```

- [ ] **Step 2: 구현체 작성**

`GeneralEmailVerificationService.java`:

```java
package com.duing.domain.user.service;

import com.duing.domain.user.entity.EmailVerification;
import com.duing.domain.user.exception.EmailVerificationException;
import com.duing.domain.user.exception.UserException;
import com.duing.domain.user.repository.EmailVerificationRepository;
import com.duing.domain.user.repository.UserRepository;
import com.duing.domain.user.service.dto.command.ConfirmEmailVerificationCommand;
import com.duing.domain.user.service.dto.command.SendEmailVerificationCommand;
import com.duing.domain.user.service.dto.query.EmailVerificationSendResult;
import com.duing.global.email.EmailMessage;
import com.duing.global.email.EmailSender;
import java.time.Duration;
import java.time.LocalDateTime;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralEmailVerificationService implements EmailVerificationService {

    private static final String SUBJECT = "[Du-ing] 이메일 인증 코드";

    private final EmailVerificationRepository emailVerificationRepository;
    private final UserRepository userRepository;
    private final VerificationCodeManager verificationCodeManager;
    private final EmailVerificationRateLimiter rateLimiter;
    private final EmailSender emailSender;

    @Override
    @Transactional
    public EmailVerificationSendResult sendCode(SendEmailVerificationCommand sendCommand, String clientIp) {
        LocalDateTime now = LocalDateTime.now();
        rateLimiter.assertAndRecordIpRequest(clientIp, now);
        rateLimiter.assertGlobalQuotaAvailable(now);
        if (userRepository.existsByEmail(sendCommand.email())) {
            throw new UserException.DuplicateEmailException();
        }

        String code = verificationCodeManager.generateCode();
        String codeHash = verificationCodeManager.hash(sendCommand.email(), code);
        EmailVerification emailVerification = upsertVerification(sendCommand.email(), codeHash, now);

        rateLimiter.recordSendAttempt(now);
        // 발송 실패(EmailSendException) 시 트랜잭션 롤백 — 쿨다운 페널티가 남지 않는다.
        emailSender.send(new EmailMessage(sendCommand.email(), SUBJECT, buildHtml(code)));
        return new EmailVerificationSendResult(
                emailVerification.getExpiresAt(),
                Duration.between(now, emailVerification.getExpiresAt()).getSeconds());
    }

    @Override
    @Transactional(noRollbackFor = EmailVerificationException.InvalidVerificationCodeException.class)
    public void confirmCode(ConfirmEmailVerificationCommand confirmCommand) {
        LocalDateTime now = LocalDateTime.now();
        EmailVerification emailVerification = emailVerificationRepository
                .findByEmailForUpdate(confirmCommand.email())
                .orElseThrow(EmailVerificationException.EmailVerificationNotFoundException::new);

        if (emailVerification.isVerified()) {
            return; // 멱등 — 네트워크 재시도·더블클릭 허용 (spec §5.2)
        }
        if (emailVerification.isExpired(now)) {
            throw new EmailVerificationException.EmailVerificationExpiredException();
        }
        if (emailVerification.isAttemptExceeded()) {
            throw new EmailVerificationException.VerificationAttemptExceededException();
        }
        if (!verificationCodeManager.matches(
                confirmCommand.email(), confirmCommand.code(), emailVerification.getCodeHash())) {
            // noRollbackFor 로 증가분이 커밋된다 — 롤백되면 5회 제한이 무력화됨
            emailVerification.increaseAttempt();
            throw new EmailVerificationException.InvalidVerificationCodeException();
        }
        emailVerification.verify(now);
    }

    @Override
    public void assertVerified(String email) {
        boolean usableForSignup = emailVerificationRepository.findByEmail(email)
                .map(emailVerification -> emailVerification.isUsableForSignup(LocalDateTime.now()))
                .orElse(false);
        if (!usableForSignup) {
            throw new EmailVerificationException.EmailNotVerifiedException();
        }
    }

    @Override
    @Transactional
    public void consume(String email) {
        emailVerificationRepository.deleteByEmail(email);
    }

    private EmailVerification upsertVerification(String email, String codeHash, LocalDateTime now) {
        EmailVerification existingVerification =
                emailVerificationRepository.findByEmailForUpdate(email).orElse(null);
        if (existingVerification != null) {
            if (existingVerification.isInCooldown(now)) {
                throw new EmailVerificationException.VerificationCooldownException();
            }
            existingVerification.reissue(codeHash, now);
            return existingVerification;
        }
        try {
            return emailVerificationRepository.saveAndFlush(EmailVerification.issue(email, codeHash, now));
        } catch (DataIntegrityViolationException concurrentInsertRace) {
            // 동시 요청이 방금 행을 생성·발송함 — 쿨다운과 동일하게 응답하고 롤백한다.
            // (PostgreSQL 은 제약 위반 후 같은 트랜잭션에서 추가 쿼리 불가 → 재조회 금지)
            throw new EmailVerificationException.VerificationCooldownException();
        }
    }

    private String buildHtml(String code) {
        return """
                <div style="font-family: sans-serif; line-height: 1.6;">
                  <h2>Du-ing 이메일 인증</h2>
                  <p>아래 인증코드를 회원가입 화면에 입력해주세요.</p>
                  <p style="font-size: 28px; font-weight: bold; letter-spacing: 6px;">%s</p>
                  <p>이 코드는 발송 시점부터 20분간 유효합니다.</p>
                  <p style="color: #888; font-size: 12px;">본인이 요청하지 않았다면 이 메일을 무시해주세요.</p>
                </div>
                """.formatted(code);
    }
}
```

- [ ] **Step 3: 컴파일 확인**

Run: `cd backend && ./gradlew compileJava`
Expected: BUILD SUCCESSFUL (행위 검증은 Task 10 통합 테스트에서)

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/java/com/duing/domain/user/service/EmailVerificationService.java backend/src/main/java/com/duing/domain/user/service/GeneralEmailVerificationService.java
git commit -m "feat(backend): 이메일 인증 발송·확인·가입가드 서비스 구현"
```

---

## Task 10: 인증 API 2개 — Request/Response DTO + AuthApi/AuthController + StubEmailSender + 통합 테스트

**Files:**
- Create: `backend/src/main/java/com/duing/domain/user/controller/dto/request/SendEmailVerificationRequest.java`
- Create: `backend/src/main/java/com/duing/domain/user/controller/dto/request/ConfirmEmailVerificationRequest.java`
- Create: `backend/src/main/java/com/duing/domain/user/controller/dto/response/EmailVerificationResponse.java`
- Modify: `backend/src/main/java/com/duing/domain/user/api/AuthApi.java`
- Modify: `backend/src/main/java/com/duing/domain/user/controller/AuthController.java`
- Create: `backend/src/test/java/com/duing/common/StubEmailSender.java`
- Test: `backend/src/test/java/com/duing/domain/user/controller/AuthEmailVerificationTest.java`

- [ ] **Step 1: Request/Response DTO 작성**

`SendEmailVerificationRequest.java`:

```java
package com.duing.domain.user.controller.dto.request;

import com.duing.domain.user.service.dto.command.SendEmailVerificationCommand;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record SendEmailVerificationRequest(
        @NotBlank(message = "이메일은 필수 입력값입니다.")
        @Email(message = "올바른 이메일 형식이 아닙니다.")
        @Pattern(
                regexp = "^[A-Za-z0-9._%+-]+@(?:[A-Za-z0-9-]+\\.)*daegu\\.ac\\.kr$",
                message = "대구대학교 이메일(@daegu.ac.kr)만 사용할 수 있습니다."
        )
        @Size(max = 100, message = "이메일은 100자 이하여야 합니다.")
        String email
) {
    public SendEmailVerificationCommand toCommand() {
        return new SendEmailVerificationCommand(email);
    }
}
```

`ConfirmEmailVerificationRequest.java`:

```java
package com.duing.domain.user.controller.dto.request;

import com.duing.domain.user.service.dto.command.ConfirmEmailVerificationCommand;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record ConfirmEmailVerificationRequest(
        @NotBlank(message = "이메일은 필수 입력값입니다.")
        @Email(message = "올바른 이메일 형식이 아닙니다.")
        @Size(max = 100, message = "이메일은 100자 이하여야 합니다.")
        String email,

        @NotBlank(message = "인증코드는 필수 입력값입니다.")
        @Pattern(regexp = "\\d{6}", message = "인증코드는 6자리 숫자여야 합니다.")
        String code
) {
    public ConfirmEmailVerificationCommand toCommand() {
        return new ConfirmEmailVerificationCommand(email, code);
    }
}
```

`EmailVerificationResponse.java`:

```java
package com.duing.domain.user.controller.dto.response;

import com.duing.domain.user.service.dto.query.EmailVerificationSendResult;
import java.time.LocalDateTime;

public record EmailVerificationResponse(
        LocalDateTime expiresAt,
        long expiresInSeconds
) {
    public static EmailVerificationResponse from(EmailVerificationSendResult sendResult) {
        return new EmailVerificationResponse(sendResult.expiresAt(), sendResult.expiresInSeconds());
    }
}
```

- [ ] **Step 2: AuthApi 에 엔드포인트 2개 추가**

`AuthApi.java` — import 에 다음 추가:

```java
import com.duing.domain.user.controller.dto.request.ConfirmEmailVerificationRequest;
import com.duing.domain.user.controller.dto.request.SendEmailVerificationRequest;
import com.duing.domain.user.controller.dto.response.EmailVerificationResponse;
import jakarta.servlet.http.HttpServletRequest;
```

인터페이스 본문 끝(`login` 메서드 뒤)에 추가:

```java
    @Operation(summary = "이메일 인증코드 발송",
            description = "회원가입용 6자리 인증코드를 학교 이메일로 발송한다. 코드는 20분 유효, 재발송은 60초 쿨다운.")
    @ApiResponses(@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "201", description = "발송됨"))
    @PostMapping("/auth/email-verifications")
    ResponseEntity<ApiResponse<EmailVerificationResponse>> sendEmailVerification(
            @Valid @RequestBody SendEmailVerificationRequest sendRequest,
            HttpServletRequest httpServletRequest);

    @Operation(summary = "이메일 인증코드 확인",
            description = "발송된 6자리 코드를 검증한다. 5회 실패 시 무효화. 이미 인증된 경우 200(멱등).")
    @ApiResponses(@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "인증 성공"))
    @PostMapping("/auth/email-verifications/confirm")
    ResponseEntity<ApiResponse<Void>> confirmEmailVerification(
            @Valid @RequestBody ConfirmEmailVerificationRequest confirmRequest);
```

- [ ] **Step 3: AuthController 구현 추가**

`AuthController.java` — import 추가:

```java
import com.duing.domain.user.controller.dto.request.ConfirmEmailVerificationRequest;
import com.duing.domain.user.controller.dto.request.SendEmailVerificationRequest;
import com.duing.domain.user.controller.dto.response.EmailVerificationResponse;
import com.duing.domain.user.service.EmailVerificationService;
import com.duing.domain.user.service.dto.query.EmailVerificationSendResult;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.util.StringUtils;
```

필드 추가 (`userService` 아래):

```java
    private final EmailVerificationService emailVerificationService;
```

메서드 추가 (`login` 아래):

```java
    @Override
    public ResponseEntity<ApiResponse<EmailVerificationResponse>> sendEmailVerification(
            @Valid @RequestBody SendEmailVerificationRequest sendRequest,
            HttpServletRequest httpServletRequest) {
        String clientIp = resolveClientIp(httpServletRequest);
        EmailVerificationSendResult sendResult =
                emailVerificationService.sendCode(sendRequest.toCommand(), clientIp);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(EmailVerificationResponse.from(sendResult)));
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> confirmEmailVerification(
            @Valid @RequestBody ConfirmEmailVerificationRequest confirmRequest) {
        emailVerificationService.confirmCode(confirmRequest.toCommand());
        return ResponseEntity.ok(ApiResponse.success());
    }

    /** prod 는 LB/프록시 뒤 — X-Forwarded-For 첫 값을 사용, 없으면 remoteAddr (spec §4.2). */
    private static String resolveClientIp(HttpServletRequest httpServletRequest) {
        String forwardedFor = httpServletRequest.getHeader("X-Forwarded-For");
        if (StringUtils.hasText(forwardedFor)) {
            return forwardedFor.split(",")[0].trim();
        }
        return httpServletRequest.getRemoteAddr();
    }
```

- [ ] **Step 4: StubEmailSender 작성 (test 소스)**

`backend/src/test/java/com/duing/common/StubEmailSender.java`:

```java
package com.duing.common;

import com.duing.global.email.EmailMessage;
import com.duing.global.email.EmailSender;
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * test 프로파일 전용 기록형 EmailSender — 마지막 발송 메시지를 보관한다.
 * 통합 테스트가 본문에서 인증코드를 추출해 confirm 까지 검증할 수 있게 한다.
 */
@Component
@ConditionalOnProperty(name = "email.provider", havingValue = "stub")
public class StubEmailSender implements EmailSender {

    private final AtomicReference<EmailMessage> lastMessage = new AtomicReference<>();

    @Override
    public void send(EmailMessage emailMessage) {
        lastMessage.set(emailMessage);
    }

    public EmailMessage lastMessage() {
        return lastMessage.get();
    }
}
```

- [ ] **Step 5: 통합 테스트 작성**

`AuthEmailVerificationTest.java`:

```java
package com.duing.domain.user.controller;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.nullValue;

import com.duing.common.IntegrationTestBase;
import com.duing.common.StubEmailSender;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.user.service.EmailVerificationRateLimiter;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AuthEmailVerificationTest extends IntegrationTestBase {

    private static final Pattern CODE_PATTERN = Pattern.compile("(\\d{6})");
    private static final String EMAIL = "hong@daegu.ac.kr";

    @LocalServerPort
    private int port;

    @Autowired
    private StubEmailSender stubEmailSender;

    @Autowired
    private EmailVerificationRateLimiter rateLimiter;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        rateLimiter.reset();
    }

    private void requestSend(String email, int expectedStatus) {
        given().contentType(ContentType.JSON).body(Map.of("email", email))
                .when().post("/api/v1/auth/email-verifications")
                .then().statusCode(expectedStatus);
    }

    private String sendAndExtractCode(String email) {
        given().contentType(ContentType.JSON).body(Map.of("email", email))
                .when().post("/api/v1/auth/email-verifications")
                .then().statusCode(HttpStatus.CREATED.value())
                .body("data.expiresInSeconds", equalTo(1200));
        Matcher codeMatcher = CODE_PATTERN.matcher(stubEmailSender.lastMessage().html());
        assertThat(codeMatcher.find()).isTrue();
        return codeMatcher.group(1);
    }

    private void confirm(String email, String code, int expectedStatus) {
        given().contentType(ContentType.JSON).body(Map.of("email", email, "code", code))
                .when().post("/api/v1/auth/email-verifications/confirm")
                .then().statusCode(expectedStatus);
    }

    @Test
    @DisplayName("발송된 코드로 확인하면 200, 응답에 만료 정보가 담긴다")
    void sendThenConfirmSucceeds() {
        String code = sendAndExtractCode(EMAIL);
        confirm(EMAIL, code, HttpStatus.OK.value());
    }

    @Test
    @DisplayName("학교 도메인이 아닌 이메일은 400 을 반환한다")
    void sendRejectsNonSchoolEmail() {
        requestSend("hong@gmail.com", HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("60초 쿨다운 내 재발송 요청은 429 와 VERIFICATION_COOLDOWN 코드를 반환한다")
    void resendWithinCooldownReturns429() {
        sendAndExtractCode(EMAIL);
        given().contentType(ContentType.JSON).body(Map.of("email", EMAIL))
                .when().post("/api/v1/auth/email-verifications")
                .then().statusCode(HttpStatus.TOO_MANY_REQUESTS.value())
                .body("code", equalTo("VERIFICATION_COOLDOWN"));
    }

    @Test
    @DisplayName("쿨다운 경과 후 재발송하면 이전 코드는 무효가 되고 새 코드만 유효하다")
    void reissueInvalidatesPreviousCode() {
        String firstCode = sendAndExtractCode(EMAIL);
        jdbcTemplate.update(
                "UPDATE email_verifications SET last_sent_at = last_sent_at - INTERVAL '61 seconds' WHERE email = ?",
                EMAIL);
        String secondCode = sendAndExtractCode(EMAIL);

        if (firstCode.equals(secondCode)) {
            return; // 1/100만 확률로 같은 코드가 재발급되면 구분 불가 — 스킵
        }
        given().contentType(ContentType.JSON).body(Map.of("email", EMAIL, "code", firstCode))
                .when().post("/api/v1/auth/email-verifications/confirm")
                .then().statusCode(HttpStatus.BAD_REQUEST.value())
                .body("code", equalTo("INVALID_VERIFICATION_CODE"));
        confirm(EMAIL, secondCode, HttpStatus.OK.value());
    }

    @Test
    @DisplayName("만료된 코드 확인은 400 과 EMAIL_VERIFICATION_EXPIRED 코드를 반환한다")
    void confirmExpiredCodeReturns400() {
        String code = sendAndExtractCode(EMAIL);
        jdbcTemplate.update(
                "UPDATE email_verifications SET expires_at = NOW() - INTERVAL '1 second' WHERE email = ?",
                EMAIL);
        given().contentType(ContentType.JSON).body(Map.of("email", EMAIL, "code", code))
                .when().post("/api/v1/auth/email-verifications/confirm")
                .then().statusCode(HttpStatus.BAD_REQUEST.value())
                .body("code", equalTo("EMAIL_VERIFICATION_EXPIRED"));
    }

    @Test
    @DisplayName("코드 5회 불일치 후 6번째 시도는 429 와 VERIFICATION_ATTEMPT_EXCEEDED 를 반환한다")
    void attemptLimitInvalidatesCode() {
        String code = sendAndExtractCode(EMAIL);
        String wrongCode = code.equals("000000") ? "000001" : "000000";

        for (int attempt = 0; attempt < 5; attempt++) {
            confirm(EMAIL, wrongCode, HttpStatus.BAD_REQUEST.value());
        }
        given().contentType(ContentType.JSON).body(Map.of("email", EMAIL, "code", code))
                .when().post("/api/v1/auth/email-verifications/confirm")
                .then().statusCode(HttpStatus.TOO_MANY_REQUESTS.value())
                .body("code", equalTo("VERIFICATION_ATTEMPT_EXCEEDED"));
    }

    @Test
    @DisplayName("인증 완료 후 동일 confirm 재호출은 200 을 반환한다 (멱등)")
    void confirmIsIdempotentAfterVerified() {
        String code = sendAndExtractCode(EMAIL);
        confirm(EMAIL, code, HttpStatus.OK.value());
        confirm(EMAIL, code, HttpStatus.OK.value());
    }

    @Test
    @DisplayName("인증 이력이 없는 이메일 confirm 은 400 과 EMAIL_VERIFICATION_NOT_FOUND 를 반환한다")
    void confirmWithoutSendReturns400() {
        given().contentType(ContentType.JSON).body(Map.of("email", EMAIL, "code", "123456"))
                .when().post("/api/v1/auth/email-verifications/confirm")
                .then().statusCode(HttpStatus.BAD_REQUEST.value())
                .body("code", equalTo("EMAIL_VERIFICATION_NOT_FOUND"));
    }

    @Test
    @DisplayName("같은 IP 에서 1분 내 6번째 발송 요청은 429 와 VERIFICATION_RATE_LIMITED 를 반환한다")
    void ipRateLimitReturns429() {
        // 쿨다운(이메일 단위)에 걸리지 않도록 서로 다른 이메일 사용
        for (int request = 1; request <= 5; request++) {
            requestSend("student" + request + "@daegu.ac.kr", HttpStatus.CREATED.value());
        }
        given().contentType(ContentType.JSON).body(Map.of("email", "student6@daegu.ac.kr"))
                .when().post("/api/v1/auth/email-verifications")
                .then().statusCode(HttpStatus.TOO_MANY_REQUESTS.value())
                .body("code", equalTo("VERIFICATION_RATE_LIMITED"));
    }

    @Test
    @DisplayName("기존 API 에러 응답에는 code 필드가 노출되지 않는다 (비파괴)")
    void legacyErrorResponsesOmitCodeField() {
        given().contentType(ContentType.JSON).body(Map.of("email", EMAIL, "password", "wrong-pass1"))
                .when().post("/api/v1/auth/login")
                .then().statusCode(HttpStatus.UNAUTHORIZED.value())
                .body("code", nullValue());
    }
}
```

참고: 일일 전역 상한(5,000건)은 통합 테스트로 검증하지 않는다 (5,000회 호출은 비실용적) — Task 7 단위 테스트가 커버한다. 이미 가입된 이메일 409 는 Task 11 에서 user 생성과 함께 검증한다.

- [ ] **Step 6: 테스트 실행**

Run: `cd backend && ./gradlew test --tests "AuthEmailVerificationTest"`
Expected: PASS (10 tests)

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/com/duing/domain/user/ backend/src/test/java/com/duing/common/StubEmailSender.java backend/src/test/java/com/duing/domain/user/controller/AuthEmailVerificationTest.java
git commit -m "feat(backend): 이메일 인증코드 발송·확인 API 구현"
```

---

## Task 11: signup 가드 — 인증된 이메일만 가입 허용

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/user/service/GeneralUserService.java:30-57`
- Modify: `backend/src/test/java/com/duing/domain/user/controller/AuthControllerSignupTest.java`

- [ ] **Step 1: 실패하는 테스트 먼저 — AuthControllerSignupTest 수정**

기존 테스트는 인증 없이 signup 이 성공한다고 가정하므로 가드 추가 시 깨진다. 테스트를 먼저 새 계약으로 수정한다.

클래스에 import·필드·헬퍼 추가:

```java
import com.duing.domain.user.entity.EmailVerification;
import com.duing.domain.user.repository.EmailVerificationRepository;
import java.time.LocalDateTime;
import org.springframework.jdbc.core.JdbcTemplate;
import static org.hamcrest.Matchers.equalTo;
```

```java
    @Autowired
    private EmailVerificationRepository emailVerificationRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    /** 인증 완료 상태의 email_verifications 행을 만든다 — 가드 통과용. */
    private void prepareVerifiedEmail(String email) {
        LocalDateTime now = LocalDateTime.now();
        EmailVerification emailVerification = EmailVerification.issue(email, "x".repeat(64), now);
        emailVerification.verify(now);
        emailVerificationRepository.save(emailVerification);
    }
```

기존 테스트 중 **signup 이 201/409 까지 도달하는 테스트**에 인증 준비를 추가한다:

`signupSucceedsWithProfileFields` — 메서드 첫 줄에 추가하고, 가입 후 인증 행 삭제 검증을 끝에 추가:

```java
        prepareVerifiedEmail("hong@daegu.ac.kr");
```

```java
        // 가입 성공 시 인증 행이 삭제된다 (재사용 방지)
        assertThat(emailVerificationRepository.findByEmail("hong@daegu.ac.kr")).isEmpty();
```

`signupRejectsDuplicatePhone` — 두 이메일 모두 인증 준비 (메서드 첫 줄):

```java
        prepareVerifiedEmail("hong@daegu.ac.kr");
        prepareVerifiedEmail("second@daegu.ac.kr");
```

Bean Validation 단계에서 끝나는 테스트(`signupRejectsWhenTermsNotAgreed`, `signupRejectsInvalidPhoneFormat`, `signupRejectsWeakPasswordAlphaOnly`, `signupRejectsUnknownCollege`)는 수정 불필요.

신규 테스트 3개 추가:

```java
    @Test
    @DisplayName("이메일 인증 없이 가입하면 403 과 EMAIL_NOT_VERIFIED 코드를 반환한다")
    void signupRejectsUnverifiedEmail() {
        given().contentType(ContentType.JSON).body(validBody())
                .when().post("/api/v1/auth/signup")
                .then().statusCode(HttpStatus.FORBIDDEN.value())
                .body("code", equalTo("EMAIL_NOT_VERIFIED"));
    }

    @Test
    @DisplayName("인증 후 만료 시각이 지나면 가입할 수 없다")
    void signupRejectsExpiredVerification() {
        prepareVerifiedEmail("hong@daegu.ac.kr");
        jdbcTemplate.update(
                "UPDATE email_verifications SET expires_at = NOW() - INTERVAL '1 second' WHERE email = ?",
                "hong@daegu.ac.kr");

        given().contentType(ContentType.JSON).body(validBody())
                .when().post("/api/v1/auth/signup")
                .then().statusCode(HttpStatus.FORBIDDEN.value())
                .body("code", equalTo("EMAIL_NOT_VERIFIED"));
    }

    @Test
    @DisplayName("이미 가입된 이메일로 인증코드 발송을 요청하면 409 를 반환한다")
    void sendVerificationRejectsRegisteredEmail() {
        prepareVerifiedEmail("hong@daegu.ac.kr");
        given().contentType(ContentType.JSON).body(validBody())
                .when().post("/api/v1/auth/signup")
                .then().statusCode(HttpStatus.CREATED.value());

        given().contentType(ContentType.JSON).body(Map.of("email", "hong@daegu.ac.kr"))
                .when().post("/api/v1/auth/email-verifications")
                .then().statusCode(HttpStatus.CONFLICT.value());
    }
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd backend && ./gradlew test --tests "AuthControllerSignupTest"`
Expected: FAIL — `signupRejectsUnverifiedEmail` 이 201 을 받아 실패 (가드 미구현)

- [ ] **Step 3: GeneralUserService 에 가드 구현**

`GeneralUserService.java` — import 추가:

```java
import com.duing.domain.user.service.EmailVerificationService;
```

필드 추가:

```java
    private final EmailVerificationService emailVerificationService;
```

`signup` 메서드 수정 — 첫 줄에 가드, 저장 후 consume:

```java
    @Override
    @Transactional
    public Long signup(SignupCommand signupCommand) {
        emailVerificationService.assertVerified(signupCommand.email());
        if (userRepository.existsByEmail(signupCommand.email())) {
            throw new UserException.DuplicateEmailException();
        }
        if (userRepository.existsByStudentId(signupCommand.studentId())) {
            throw new UserException.DuplicateStudentIdException();
        }
        if (userRepository.existsByPhone(signupCommand.phone())) {
            throw new UserException.PhoneAlreadyExistsException();
        }

        String passwordHash = passwordEncoder.encode(signupCommand.rawPassword());
        User user = User.create(
                signupCommand.studentId(),
                signupCommand.name(),
                signupCommand.email(),
                passwordHash,
                UserRole.STUDENT,
                signupCommand.grade(),
                signupCommand.college(),
                signupCommand.major(),
                signupCommand.phone(),
                java.time.LocalDateTime.now()
        );
        Long userId = userRepository.save(user).getId();
        emailVerificationService.consume(signupCommand.email());
        return userId;
    }
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd backend && ./gradlew test --tests "AuthControllerSignupTest"`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/duing/domain/user/service/GeneralUserService.java backend/src/test/java/com/duing/domain/user/controller/AuthControllerSignupTest.java
git commit -m "feat(backend): 회원가입에 이메일 인증 가드 적용"
```

---

## Task 12: Part A 마무리 검증

- [ ] **Step 1: 전체 테스트**

Run: `cd backend && ./gradlew test`
Expected: BUILD SUCCESSFUL — 전체 PASS

- [ ] **Step 2: Self-check (PR 생성 전 7항목 — 보고만, PR 은 만들지 않는다)**

1. 컴파일/빌드/테스트 모두 SUCCESS
2. 변경 범위 vs spec 일치 — 누락 0건, 요청 외 변경 0건 (spec §5~7 대조)
3. 다른 측면 영향 — 프론트는 Part B 에서 대응 예정, `code` 필드는 비파괴(기존 응답 불변) 명시
4. 모든 task review 완료 (duing-code-reviewer + codex:review; 동시성·레이트리밋·Migration 포함이므로 codex:adversarial-review 추가)
5. Plan self-review 체크박스 — 실행 후 재검증
6. 커밋 메시지 Conventional Commits, Co-Authored-By/Generated 라인 없음
7. 신규/수정 파일 EOF newline

**STOP — push·PR 생성은 사용자 지시 후 진행.**

---

# Part B — 프론트엔드 (브랜치: `feat/{이슈번호}-signup-email-verification-ui`, Part A 머지 후 develop 에서 분기)

현황 주의: `SignupStepAccount.tsx`/`SignupStepProfile.tsx` 는 **미사용 잔존 컴포넌트**다 (어디서도 import 되지 않음). 실제 렌더되는 폼은 `SignupFormPanel.tsx` 단일 폼이며, 인증 UI 는 여기에 통합한다.

## Task 13: 타입·스키마 — ApiResponse code, 인증 payload, 코드 스키마

**Files:**
- Modify: `frontend/packages/types/src/api.ts`
- Modify: `frontend/packages/types/src/user.ts` (끝에 추가)
- Modify: `frontend/packages/schemas/src/index.ts` (signupSchema 의 email 을 분리 재사용)

- [ ] **Step 1: ApiResponse 에 code 추가**

`packages/types/src/api.ts` 의 `ApiResponse` 를 다음으로 교체 (백엔드는 code 가 null 이면 직렬화 생략 → optional):

```ts
export type ApiResponse<T> = {
  ok: boolean;
  data: T | null;
  message: string | null;
  code?: string;
};
```

- [ ] **Step 2: 인증 payload 타입 추가**

`packages/types/src/user.ts` 끝에 추가:

```ts
export type SendEmailVerificationPayload = {
  email: string;
};

export type ConfirmEmailVerificationPayload = {
  email: string;
  code: string;
};

export type EmailVerificationResult = {
  expiresAt: string;
  expiresInSeconds: number;
};
```

`packages/types/src/index.ts` 가 `export * from './user'` 형태가 아니면 위 3개 타입을 export 목록에 추가한다 (파일을 열어 기존 방식 확인).

- [ ] **Step 3: 스키마 분리·추가**

`packages/schemas/src/index.ts` — `signupSchema` 정의 위에 추가하고, `signupSchema` 의 `email:` 값을 `schoolEmailSchema` 로 교체:

```ts
export const schoolEmailSchema = z
  .string()
  .min(1, '이메일은 필수 입력값입니다.')
  .email('올바른 이메일 형식이 아닙니다.')
  .max(100, '이메일은 100자 이하여야 합니다.')
  .regex(
    /^[A-Za-z0-9._%+-]+@(?:[A-Za-z0-9-]+\.)*daegu\.ac\.kr$/,
    '대구대학교 이메일(@daegu.ac.kr)만 사용할 수 있습니다.',
  );

export const verificationCodeSchema = z
  .string()
  .regex(/^\d{6}$/, '인증코드는 6자리 숫자입니다.');
```

```ts
  email: schoolEmailSchema,
```

- [ ] **Step 4: typecheck**

Run: `cd frontend && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/packages/types/src/api.ts frontend/packages/types/src/user.ts frontend/packages/schemas/src/index.ts
git commit -m "feat(web): 이메일 인증 타입·스키마 추가, ApiResponse code 필드 반영"
```

---

## Task 14: API 클라이언트 — ApiError.code + auth 메서드 2개

**Files:**
- Modify: `frontend/packages/api/src/client.ts`

- [ ] **Step 1: ApiError 에 code 추가**

`client.ts` 의 `ApiError` 클래스를 다음으로 교체 (파라미터 뒤에 추가라 기존 호출부 호환):

```ts
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly payload?: unknown,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
```

`toApiError` 를 다음으로 교체:

```ts
async function toApiError(error: unknown): Promise<never> {
  if (error instanceof HTTPError) {
    let message = `요청 실패 (${error.response.status})`;
    let payload: unknown;
    let code: string | undefined;
    try {
      const body = (await error.response.json()) as ApiResponse<unknown>;
      if (body && typeof body.message === 'string') {
        message = body.message;
      }
      if (body && typeof body.code === 'string') {
        code = body.code;
      }
      payload = body.data;
    } catch {
      // ignore json parse failure
    }
    throw new ApiError(error.response.status, message, payload, code);
  }
  throw error;
}
```

- [ ] **Step 2: auth 메서드 추가**

타입 import 블록(`SignupPayload` 가 있는 import)에 추가:

```ts
  SendEmailVerificationPayload,
  ConfirmEmailVerificationPayload,
  EmailVerificationResult,
```

`DuingApiClient` 타입의 `auth` 를 다음으로 교체:

```ts
  auth: {
    signup(payload: SignupPayload): Promise<number>;
    login(payload: LoginPayload): Promise<LoginResult>;
    sendEmailVerification(payload: SendEmailVerificationPayload): Promise<EmailVerificationResult>;
    confirmEmailVerification(payload: ConfirmEmailVerificationPayload): Promise<void>;
  };
```

구현부 `auth` 를 다음으로 교체:

```ts
    auth: {
      signup: (payload) =>
        jsonOk<number>(http.post('auth/signup', { json: payload })),
      login: (payload) =>
        jsonOk<LoginResult>(http.post('auth/login', { json: payload })),
      sendEmailVerification: (payload) =>
        jsonOk<EmailVerificationResult>(http.post('auth/email-verifications', { json: payload })),
      confirmEmailVerification: (payload) =>
        jsonVoid(http.post('auth/email-verifications/confirm', { json: payload })),
    },
```

- [ ] **Step 3: typecheck + Commit**

Run: `cd frontend && pnpm typecheck`
Expected: PASS

```bash
git add frontend/packages/api/src/client.ts
git commit -m "feat(web): 이메일 인증 API 클라이언트 메서드·ApiError code 추가"
```

---

## Task 15: React Query 훅

**Files:**
- Modify: `frontend/packages/hooks/src/auth.ts`
- Modify: `frontend/packages/hooks/src/index.ts:2`

- [ ] **Step 1: 훅 추가**

`packages/hooks/src/auth.ts` — type import 에 `SendEmailVerificationPayload`, `ConfirmEmailVerificationPayload` 추가 후 파일 끝에 추가:

```ts
export function useSendEmailVerificationMutation() {
  const client = useApiClient();
  return useMutation({
    mutationFn: (payload: SendEmailVerificationPayload) =>
      client.auth.sendEmailVerification(payload),
  });
}

export function useConfirmEmailVerificationMutation() {
  const client = useApiClient();
  return useMutation({
    mutationFn: (payload: ConfirmEmailVerificationPayload) =>
      client.auth.confirmEmailVerification(payload),
  });
}
```

- [ ] **Step 2: index export 갱신**

`packages/hooks/src/index.ts` 라인 2 를 다음으로 교체:

```ts
export {
  useLoginMutation,
  useSignupMutation,
  useLogout,
  useMeQuery,
  useSendEmailVerificationMutation,
  useConfirmEmailVerificationMutation,
} from './auth';
```

- [ ] **Step 3: typecheck + Commit**

Run: `cd frontend && pnpm typecheck`
Expected: PASS

```bash
git add frontend/packages/hooks/src/auth.ts frontend/packages/hooks/src/index.ts
git commit -m "feat(web): 이메일 인증 mutation 훅 추가"
```

---

## Task 16: 인증 헬퍼(_lib) — 포맷터·에러 매핑 + useEmailVerification 훅

**Files:**
- Create: `frontend/apps/web/app/(auth)/signup/_lib/email-verification.ts`
- Create: `frontend/apps/web/app/(auth)/signup/_lib/use-email-verification.ts`
- Test: `frontend/apps/web/test/(auth)/signup/email-verification.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성 (순수 헬퍼)**

`test/(auth)/signup/email-verification.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ApiError } from '@duing/api';
import {
  formatSeconds,
  mapConfirmError,
  mapSendError,
} from '../../../app/(auth)/signup/_lib/email-verification';

describe('formatSeconds', () => {
  it('1200초를 20:00 으로 포맷한다', () => {
    expect(formatSeconds(1200)).toBe('20:00');
  });

  it('61초를 01:01 로 포맷한다', () => {
    expect(formatSeconds(61)).toBe('01:01');
  });

  it('0초를 00:00 으로 포맷한다', () => {
    expect(formatSeconds(0)).toBe('00:00');
  });
});

describe('mapSendError', () => {
  it('409 는 이미 가입된 이메일 안내를 반환한다', () => {
    expect(mapSendError(new ApiError(409, '이미 사용 중인 이메일입니다.'))).toContain('이미 가입된 이메일');
  });

  it('VERIFICATION_RATE_LIMITED 코드는 요청 과다 안내를 반환한다', () => {
    expect(
      mapSendError(new ApiError(429, '요청이 너무 많습니다.', undefined, 'VERIFICATION_RATE_LIMITED')),
    ).toContain('요청이 너무 많아요');
  });

  it('EMAIL_SEND_FAILED 코드는 발송 실패 안내를 반환한다', () => {
    expect(
      mapSendError(new ApiError(502, '발송 실패', undefined, 'EMAIL_SEND_FAILED')),
    ).toContain('발송에 실패했어요');
  });

  it('ApiError 가 아니면 기본 발송 실패 안내를 반환한다', () => {
    expect(mapSendError(new Error('network'))).toContain('발송에 실패했어요');
  });
});

describe('mapConfirmError', () => {
  it('INVALID_VERIFICATION_CODE 코드는 코드 불일치 안내를 반환한다', () => {
    expect(
      mapConfirmError(new ApiError(400, '인증코드가 올바르지 않습니다.', undefined, 'INVALID_VERIFICATION_CODE')),
    ).toContain('올바르지 않아요');
  });

  it('EMAIL_VERIFICATION_EXPIRED 코드는 재발송 안내를 반환한다', () => {
    expect(
      mapConfirmError(new ApiError(400, '만료', undefined, 'EMAIL_VERIFICATION_EXPIRED')),
    ).toContain('다시 발송');
  });

  it('VERIFICATION_ATTEMPT_EXCEEDED 코드는 시도 초과 안내를 반환한다', () => {
    expect(
      mapConfirmError(new ApiError(429, '초과', undefined, 'VERIFICATION_ATTEMPT_EXCEEDED')),
    ).toContain('시도 횟수를 초과했어요');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd frontend/apps/web && pnpm test -- --run "test/(auth)/signup/email-verification.test.ts"`
Expected: FAIL (모듈 미존재)

- [ ] **Step 3: 순수 헬퍼 구현**

`app/(auth)/signup/_lib/email-verification.ts`:

```ts
import { ApiError } from '@duing/api';

export const RESEND_COOLDOWN_SECONDS = 60;

export function formatSeconds(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function mapSendError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 409) return '이미 가입된 이메일이에요. 로그인해 주세요.';
    if (error.code === 'VERIFICATION_COOLDOWN') return '잠시 후 다시 발송할 수 있어요.';
    if (error.code === 'VERIFICATION_RATE_LIMITED') return '요청이 너무 많아요. 잠시 후 다시 시도해주세요.';
    if (error.code === 'EMAIL_SEND_FAILED' || error.code === 'EMAIL_SEND_QUOTA_EXCEEDED') {
      return '발송에 실패했어요. 잠시 후 다시 시도해주세요.';
    }
    return error.message;
  }
  return '발송에 실패했어요. 잠시 후 다시 시도해주세요.';
}

export function mapConfirmError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'INVALID_VERIFICATION_CODE') return '인증코드가 올바르지 않아요.';
    if (error.code === 'VERIFICATION_ATTEMPT_EXCEEDED') {
      return '시도 횟수를 초과했어요. 인증코드를 다시 발송해주세요.';
    }
    if (error.code === 'EMAIL_VERIFICATION_EXPIRED' || error.code === 'EMAIL_VERIFICATION_NOT_FOUND') {
      return '인증코드가 만료되었어요. 다시 발송해주세요.';
    }
    return error.message;
  }
  return '확인에 실패했어요. 다시 시도해주세요.';
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd frontend/apps/web && pnpm test -- --run "test/(auth)/signup/email-verification.test.ts"`
Expected: PASS (10 tests)

- [ ] **Step 5: useEmailVerification 훅 구현**

`app/(auth)/signup/_lib/use-email-verification.ts`:

```ts
'use client';

import { useEffect, useRef, useState } from 'react';
import {
  useConfirmEmailVerificationMutation,
  useSendEmailVerificationMutation,
} from '@duing/hooks';
import { schoolEmailSchema } from '@duing/schemas';
import {
  RESEND_COOLDOWN_SECONDS,
  mapConfirmError,
  mapSendError,
} from './email-verification';

export type EmailVerificationStatus = 'idle' | 'codeSent' | 'verified';

/**
 * 회원가입 이메일 인증 상태 머신.
 * idle → (발송) → codeSent → (확인) → verified. 이메일이 바뀌면 idle 로 리셋.
 */
export function useEmailVerification(email: string) {
  const sendMutation = useSendEmailVerificationMutation();
  const confirmMutation = useConfirmEmailVerificationMutation();
  const [status, setStatus] = useState<EmailVerificationStatus>('idle');
  const [code, setCode] = useState('');
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [resendCooldownSeconds, setResendCooldownSeconds] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 이메일이 바뀌면 인증 상태 리셋 (spec §8.1-4)
  const previousEmailRef = useRef(email);
  useEffect(() => {
    if (previousEmailRef.current === email) return;
    previousEmailRef.current = email;
    setStatus('idle');
    setCode('');
    setRemainingSeconds(0);
    setResendCooldownSeconds(0);
    setErrorMessage(null);
  }, [email]);

  // 1초 틱 — 만료·재발송 카운트다운
  useEffect(() => {
    if (status !== 'codeSent') return;
    const timerId = setInterval(() => {
      setRemainingSeconds((seconds) => Math.max(0, seconds - 1));
      setResendCooldownSeconds((seconds) => Math.max(0, seconds - 1));
    }, 1000);
    return () => clearInterval(timerId);
  }, [status]);

  const emailValid = schoolEmailSchema.safeParse(email).success;

  async function send() {
    setErrorMessage(null);
    try {
      const sendResult = await sendMutation.mutateAsync({ email });
      setStatus('codeSent');
      setCode('');
      setRemainingSeconds(sendResult.expiresInSeconds);
      setResendCooldownSeconds(RESEND_COOLDOWN_SECONDS);
    } catch (sendError) {
      setErrorMessage(mapSendError(sendError));
    }
  }

  async function confirm() {
    setErrorMessage(null);
    try {
      await confirmMutation.mutateAsync({ email, code });
      setStatus('verified');
    } catch (confirmError) {
      setErrorMessage(mapConfirmError(confirmError));
    }
  }

  function reset() {
    setStatus('idle');
    setCode('');
    setRemainingSeconds(0);
    setResendCooldownSeconds(0);
    setErrorMessage(null);
  }

  return {
    status,
    verified: status === 'verified',
    code,
    setCode,
    remainingSeconds,
    resendCooldownSeconds,
    sending: sendMutation.isPending,
    confirming: confirmMutation.isPending,
    canSend: emailValid && !sendMutation.isPending,
    errorMessage,
    send,
    confirm,
    reset,
  };
}
```

- [ ] **Step 6: typecheck + Commit**

Run: `cd frontend && pnpm typecheck`
Expected: PASS

```bash
git add "frontend/apps/web/app/(auth)/signup/_lib/email-verification.ts" "frontend/apps/web/app/(auth)/signup/_lib/use-email-verification.ts" "frontend/apps/web/test/(auth)/signup/email-verification.test.ts"
git commit -m "feat(web): 이메일 인증 상태 훅·에러 매핑 헬퍼 추가"
```

---

## Task 17: EmailVerificationField — presentational 컴포넌트

**Files:**
- Create: `frontend/apps/web/app/(auth)/signup/_components/EmailVerificationField.tsx`
- Test: `frontend/apps/web/test/(auth)/signup/EmailVerificationField.test.tsx`

presentational 설계 (기존 컴포넌트 테스트 컨벤션 — props in / 콜백 out, API 모킹 없음).

- [ ] **Step 1: 실패하는 컴포넌트 테스트 작성**

`test/(auth)/signup/EmailVerificationField.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EmailVerificationField } from '../../../app/(auth)/signup/_components/EmailVerificationField';

const baseProps = {
  email: 'hong@daegu.ac.kr',
  onEmailChange: () => {},
  status: 'idle' as const,
  code: '',
  onCodeChange: () => {},
  remainingSeconds: 0,
  resendCooldownSeconds: 0,
  sending: false,
  confirming: false,
  canSend: true,
  errorMessage: null,
  onSend: () => {},
  onConfirm: () => {},
  onEditEmail: () => {},
};

describe('EmailVerificationField', () => {
  it('idle 상태에서 발송 버튼 클릭 시 onSend 가 호출된다', async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<EmailVerificationField {...baseProps} onSend={onSend} />);
    await user.click(screen.getByRole('button', { name: '인증코드 발송' }));
    expect(onSend).toHaveBeenCalled();
  });

  it('canSend=false 면 발송 버튼이 비활성화된다', () => {
    render(<EmailVerificationField {...baseProps} canSend={false} />);
    expect(screen.getByRole('button', { name: '인증코드 발송' })).toBeDisabled();
  });

  it('codeSent 상태에서 코드 입력 필드와 만료 카운트다운이 표시된다', () => {
    render(
      <EmailVerificationField {...baseProps} status="codeSent" remainingSeconds={1200} resendCooldownSeconds={60} />,
    );
    expect(screen.getByLabelText('인증코드')).toBeInTheDocument();
    expect(screen.getByText(/20:00/)).toBeInTheDocument();
  });

  it('재발송 쿨다운 중에는 재발송 버튼이 비활성화되고 남은 초가 표시된다', () => {
    render(
      <EmailVerificationField {...baseProps} status="codeSent" remainingSeconds={1190} resendCooldownSeconds={50} />,
    );
    const resendButton = screen.getByRole('button', { name: /재발송/ });
    expect(resendButton).toBeDisabled();
    expect(resendButton).toHaveTextContent('50');
  });

  it('6자리 코드 입력 후 확인 클릭 시 onConfirm 이 호출된다', async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(
      <EmailVerificationField
        {...baseProps}
        status="codeSent"
        code="123456"
        remainingSeconds={1000}
        onConfirm={onConfirm}
      />,
    );
    await user.click(screen.getByRole('button', { name: '확인' }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it('코드가 6자리 미만이면 확인 버튼이 비활성화된다', () => {
    render(
      <EmailVerificationField {...baseProps} status="codeSent" code="123" remainingSeconds={1000} />,
    );
    expect(screen.getByRole('button', { name: '확인' })).toBeDisabled();
  });

  it('만료(remainingSeconds=0) 시 만료 안내가 표시되고 확인 버튼이 비활성화된다', () => {
    render(
      <EmailVerificationField {...baseProps} status="codeSent" code="123456" remainingSeconds={0} />,
    );
    expect(screen.getByText(/만료/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '확인' })).toBeDisabled();
  });

  it('verified 상태에서 인증 완료 배지가 보이고 이메일이 잠긴다', () => {
    render(<EmailVerificationField {...baseProps} status="verified" />);
    expect(screen.getByText('인증 완료')).toBeInTheDocument();
    expect(screen.getByLabelText('학교 이메일')).toHaveAttribute('readOnly');
  });

  it('verified 상태에서 변경 버튼 클릭 시 onEditEmail 이 호출된다', async () => {
    const onEditEmail = vi.fn();
    const user = userEvent.setup();
    render(<EmailVerificationField {...baseProps} status="verified" onEditEmail={onEditEmail} />);
    await user.click(screen.getByRole('button', { name: '변경' }));
    expect(onEditEmail).toHaveBeenCalled();
  });

  it('errorMessage 가 있으면 표시된다', () => {
    render(<EmailVerificationField {...baseProps} errorMessage="인증코드가 올바르지 않아요." />);
    expect(screen.getByText('인증코드가 올바르지 않아요.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd frontend/apps/web && pnpm test -- --run "test/(auth)/signup/EmailVerificationField.test.tsx"`
Expected: FAIL (컴포넌트 미존재)

- [ ] **Step 3: 컴포넌트 구현**

`app/(auth)/signup/_components/EmailVerificationField.tsx` (스타일은 SignupFormPanel 의 `inputCls`/btn 클래스 톤 유지):

```tsx
'use client';

import { formatSeconds } from '../_lib/email-verification';
import type { EmailVerificationStatus } from '../_lib/use-email-verification';

const inputCls =
  'w-full rounded-md border border-line bg-paper px-3.5 py-3 text-sm text-charcoal outline-none transition focus:border-ink focus:ring-1 focus:ring-ink/20 placeholder:text-charcoal-3/50';

type Props = {
  email: string;
  onEmailChange: (email: string) => void;
  status: EmailVerificationStatus;
  code: string;
  onCodeChange: (code: string) => void;
  remainingSeconds: number;
  resendCooldownSeconds: number;
  sending: boolean;
  confirming: boolean;
  canSend: boolean;
  errorMessage: string | null;
  onSend: () => void;
  onConfirm: () => void;
  onEditEmail: () => void;
};

export function EmailVerificationField({
  email,
  onEmailChange,
  status,
  code,
  onCodeChange,
  remainingSeconds,
  resendCooldownSeconds,
  sending,
  confirming,
  canSend,
  errorMessage,
  onSend,
  onConfirm,
  onEditEmail,
}: Props) {
  const verified = status === 'verified';
  const codeSent = status === 'codeSent';
  const expired = codeSent && remainingSeconds === 0;
  const canConfirm = codeSent && !expired && code.length === 6 && !confirming;
  const canResend = resendCooldownSeconds === 0 && !sending;

  return (
    <div>
      <label htmlFor="signup-email" className="mb-1.5 block text-sm font-medium text-charcoal">
        학교 이메일
      </label>
      <div className="flex gap-2">
        <input
          id="signup-email"
          required
          type="email"
          autoComplete="username"
          autoFocus
          readOnly={verified}
          value={email}
          onChange={(changeEvent) => onEmailChange(changeEvent.target.value)}
          placeholder="2021123456@daegu.ac.kr"
          className={`${inputCls} flex-1 ${verified ? 'bg-line/30' : ''}`}
        />
        {!verified && status === 'idle' && (
          <button
            type="button"
            disabled={!canSend}
            onClick={onSend}
            className="btn shrink-0 whitespace-nowrap disabled:opacity-50"
          >
            {sending ? '발송 중…' : '인증코드 발송'}
          </button>
        )}
        {verified && (
          <button
            type="button"
            onClick={onEditEmail}
            className="btn shrink-0 whitespace-nowrap"
          >
            변경
          </button>
        )}
      </div>
      {verified ? (
        <p className="mt-1.5 text-xs font-medium text-emerald-600">인증 완료</p>
      ) : (
        <p className="mt-1.5 text-xs text-charcoal-3">@daegu.ac.kr 메일만 가입 가능</p>
      )}

      {codeSent && (
        <div className="mt-3">
          <label htmlFor="signup-verification-code" className="mb-1.5 block text-sm font-medium text-charcoal">
            인증코드
          </label>
          <div className="flex gap-2">
            <input
              id="signup-verification-code"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(changeEvent) => onCodeChange(changeEvent.target.value.replace(/\D/g, ''))}
              placeholder="6자리 숫자"
              className={`${inputCls} flex-1`}
            />
            <button
              type="button"
              disabled={!canConfirm}
              onClick={onConfirm}
              className="btn shrink-0 whitespace-nowrap disabled:opacity-50"
            >
              {confirming ? '확인 중…' : '확인'}
            </button>
            <button
              type="button"
              disabled={!canResend}
              onClick={onSend}
              className="btn shrink-0 whitespace-nowrap disabled:opacity-50"
            >
              재발송{resendCooldownSeconds > 0 ? ` (${resendCooldownSeconds}s)` : ''}
            </button>
          </div>
          {expired ? (
            <p className="mt-1.5 text-xs text-coral" aria-live="polite">
              인증코드가 만료되었어요. 다시 발송해주세요.
            </p>
          ) : (
            <p className="mt-1.5 text-xs text-charcoal-3">남은 시간 {formatSeconds(remainingSeconds)}</p>
          )}
        </div>
      )}

      {errorMessage && (
        <p className="mt-1.5 text-xs text-coral" aria-live="polite">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd frontend/apps/web && pnpm test -- --run "test/(auth)/signup/EmailVerificationField.test.tsx"`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add "frontend/apps/web/app/(auth)/signup/_components/EmailVerificationField.tsx" "frontend/apps/web/test/(auth)/signup/EmailVerificationField.test.tsx"
git commit -m "feat(web): 이메일 인증 입력 컴포넌트 추가"
```

---

## Task 18: SignupFormPanel 통합 — 인증 게이팅

**Files:**
- Modify: `frontend/apps/web/app/(auth)/signup/_components/SignupFormPanel.tsx`

- [ ] **Step 1: 인증 훅·컴포넌트 연결**

`SignupFormPanel.tsx` 수정 사항:

(1) import 추가:

```tsx
import { ApiError } from '@duing/api';
import { useEmailVerification } from '../_lib/use-email-verification';
import { EmailVerificationField } from './EmailVerificationField';
```

(2) 컴포넌트 본문에서 `IconMail` 함수와 기존 Email 블록(주석 `{/* Email */}` 의 `<div>...</div>` 전체)을 제거하고, `useReducer` 아래에 훅 연결:

```tsx
  const emailVerification = useEmailVerification(state.email);
```

(3) 기존 Email 블록 자리에 다음 배치:

```tsx
            {/* Email + 인증 */}
            <EmailVerificationField
              email={state.email}
              onEmailChange={(email) => setField('email', email)}
              status={emailVerification.status}
              code={emailVerification.code}
              onCodeChange={emailVerification.setCode}
              remainingSeconds={emailVerification.remainingSeconds}
              resendCooldownSeconds={emailVerification.resendCooldownSeconds}
              sending={emailVerification.sending}
              confirming={emailVerification.confirming}
              canSend={emailVerification.canSend}
              errorMessage={emailVerification.errorMessage}
              onSend={emailVerification.send}
              onConfirm={emailVerification.confirm}
              onEditEmail={emailVerification.reset}
            />
```

(4) `canSubmit` 에 인증 게이트 추가:

```tsx
  const canSubmit =
    state.termsOfServiceAgreed &&
    state.privacyPolicyAgreed &&
    !signup.isPending &&
    !passwordMismatch &&
    emailVerification.verified;
```

(5) `handleSubmit` 의 catch 를 다음으로 교체 — 인증 만료(403) 시 인증 단계로 복귀 (spec §8.1-6):

```tsx
    } catch (signupError) {
      if (signupError instanceof ApiError && signupError.code === 'EMAIL_NOT_VERIFIED') {
        emailVerification.reset();
        setError('이메일 인증이 만료되었어요. 다시 인증해주세요.');
        return;
      }
      setError(signupError instanceof Error ? signupError.message : '회원가입에 실패했습니다.');
    }
```

(6) 제출 버튼 위 안내 — 미인증 시 비활성 이유를 알 수 있게 버튼 텍스트는 유지하되, `disabled` 조건은 (4)의 `canSubmit` 그대로 사용.

- [ ] **Step 2: lint·typecheck·테스트·빌드**

Run: `cd frontend && pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: 모두 PASS

- [ ] **Step 3: Commit**

```bash
git add "frontend/apps/web/app/(auth)/signup/_components/SignupFormPanel.tsx"
git commit -m "feat(web): 회원가입 폼에 이메일 인증 게이팅 적용"
```

---

## Task 19: Part B 마무리 검증

- [ ] **Step 1: 전체 검증**

Run: `cd frontend && pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: 모두 PASS (frontend-ci.yml 과 동일 체크)

- [ ] **Step 2: 수동 검증 (백엔드 로컬 기동 시)**

1. `cd backend && ./gradlew bootRun` (`.env` 에 `EMAIL_VERIFICATION_SECRET` 필요, `EMAIL_PROVIDER` 미설정 → 코드가 백엔드 콘솔 로그에 출력됨)
2. `cd frontend && pnpm dev` → `/signup` 접속
3. 이메일 입력 → 발송 → 백엔드 로그에서 코드 확인 → 입력 → 인증 완료 배지 → 가입 성공 확인
4. 이메일 수정 시 인증 리셋 확인

- [ ] **Step 3: Self-check (PR 생성 전 7항목 — 보고만, PR 은 만들지 않는다)**

Part A Task 12 와 동일한 7항목을 Part B 변경분에 대해 수행한다.

**STOP — push·PR 생성은 사용자 지시 후 진행.**

---

# Self-Review (plan 작성 후 점검 결과)

- **Spec 커버리지**: §4 정책(20분/60초/5회/IP/전역) → Task 5·7·9 / §5 API·코드 → Task 2·5·10 / §6 인프라(RestClient 3s) → Task 3·4 / §7 모델·동시성(잠금·noRollbackFor) → Task 5·8·9 / §8 프론트 → Task 13~18 / §9 테스트 → 각 Task 내 TDD + Task 10·11 통합. 갭 없음.
- **의도적 결정 2건**: ① `EmailSendException` 은 레이어 역전 방지를 위해 `global/email` 에 배치 (spec §5.4 의 코드·상태·메시지는 동일). ② insert race 의 DIVE 는 PostgreSQL aborted-tx 제약으로 재조회 없이 즉시 429 변환 (spec §7.3 의 의도 — 메일 2통·덮어쓰기 방지 — 는 동일하게 달성).
- **타입 일관성**: `EmailVerificationSendResult`(expiresAt, expiresInSeconds) ↔ `EmailVerificationResponse` ↔ FE `EmailVerificationResult` 필드명 일치 확인. `useEmailVerification` 반환 필드 ↔ `EmailVerificationField` props 일치 확인.
- **플레이스홀더**: 없음 — 모든 코드 블록은 완성 코드.
