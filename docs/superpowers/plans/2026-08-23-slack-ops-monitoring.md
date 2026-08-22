# Slack 운영 모니터링 + Octomo 사용량 표기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 회원가입·동아리·회비·시설·관리자 조치 이벤트와 배포 결과를 Slack 한 채널로 보내되, 외부(Slack) 장애가 핵심 서비스에 절대 영향을 주지 않게 한다. 회원가입 메시지에는 Octomo 일일 호출 자체 집계를 한 줄 싣는다.

**Architecture:** 기존 `record` 이벤트 + `ApplicationEventPublisher` + `@TransactionalEventListener(AFTER_COMMIT)` 패턴을 그대로 쓰고, 리스너만 `@Async(전용 executor)` 로 요청 스레드에서 떼어낸다. `global/monitoring/` 에 `SlackNotifier`(RestClient, 3s/5s, 5xx·429 에만 1회 재시도), `OpsSlackMessageFormatter`(명시 필드만 조립), `OpsSlackListener`(이벤트별 메서드, try/catch) 를 둔다. Octomo 벤더 quota API 는 존재하지 않으므로 `MoPollThrottle` 인메모리 일일 카운터를 읽기만 한다(외부 호출 없음). 배포 알림은 `deploy-backend.yml` 의 `if: always()` curl 스텝.

**Tech Stack:** Spring Boot 3.4 / Java 21 · `RestClient` + `SimpleClientHttpRequestFactory` · `@EnableAsync` + `ThreadPoolTaskExecutor` · JUnit 5 + AssertJ + Mockito + `MockRestServiceServer` + RestAssured/Testcontainers(통합) · GitHub Actions(curl+jq)

**Spec:** `docs/superpowers/specs/2026-08-23-slack-ops-monitoring-design.md`

## Global Constraints

- **작업 디렉터리:** 백엔드 명령은 전부 `cd /Users/ksy/orca/workspaces/Duing/cetacean/backend && ./gradlew ...`. 단위 테스트는 Docker 불필요, `@SpringBootTest` 통합 테스트는 Testcontainers(Docker 실행 중). `./gradlew test --tests "..." 2>&1 | tail` 은 exit code 를 가리므로 출력에서 `BUILD SUCCESSFUL`/`FAILED` 를 직접 확인한다.
- **브랜치:** `feat/ops-slack-monitoring` (develop 에서 분기, 이미 체크아웃됨). **push 금지. PR 생성 금지. 머지 금지.** 커밋만 한다 — push/PR 은 컨트롤러가 리뷰 후 수행한다.
- **커밋:** Conventional Commits 한국어, 제목은 `type(backend): 대상 — 변경점` 명사구. `Co-Authored-By`/`🤖 Generated` 라인 **절대 금지**.
- **네이밍:** `dto`/`r`/`e`/`res` 축약 금지, 역할이 드러나는 변수명. DTO/이벤트는 `record`. `@ConfigurationProperties` record 는 owning `@Configuration` 의 `@EnableConfigurationProperties` 로만 등록(`@Component` 금지).
- **로깅(PII·시크릿):** Slack webhook URL 은 시크릿이다. `RestClientResponseException`/`ResourceAccessException` 의 **메시지·객체를 절대 로그에 싣지 않는다**(메시지에 요청 URL·응답 바디가 포함된다). 상태코드·예외 클래스명만 기록. 이벤트 record 에 전화번호·비밀번호·토큰·계좌번호·예금주·자유 텍스트 사유를 넣지 않는다.
- **장애 격리 불변식:** `SlackNotifier.send` 와 `OpsSlackListener` 의 모든 메서드는 **예외를 던지지 않는다**. 발행은 `@Transactional` 안, 수신은 `AFTER_COMMIT` + `@Async`.
- **시크릿:** 코드·yml 에 실제 webhook URL 금지. env `SLACK_WEBHOOK_URL` 로만 주입. 테스트 URL 은 `https://hooks.slack.com/services/T000/B000/TEST` 같은 더미만.
- **절대 변경 금지:** 기존 `domain/notification/event/*` record 의 필드, 기존 리스너들, `MoPollThrottle` 의 기존 메서드 계약, `GeneralUserService.signup` 의 검증 순서·예외, `application-prod.yml` 의 다른 키.
- **테스트 `@DisplayName`:** 메서드명 금지, 요구사항 문장(한국어).
- **EOF newline:** 신규/수정 파일 모두 개행으로 끝낸다.

---

### Task 1: Slack 전송 인프라 — `SlackProperties` / `SlackClientConfig` / `SlackNotifier` + 설정

**Files:**
- Create: `backend/src/main/java/com/duing/global/monitoring/SlackProperties.java`
- Create: `backend/src/main/java/com/duing/global/monitoring/SlackClientConfig.java`
- Create: `backend/src/main/java/com/duing/global/monitoring/SlackNotifier.java`
- Modify: `backend/src/main/resources/application.yml` (sentry 블록 아래)
- Modify: `backend/src/main/resources/application-prod.yml` (sentry 블록 아래)
- Modify: `backend/src/test/resources/application.yml` (octomo 블록 아래)
- Modify: `backend/.env.example` (모니터링 섹션)
- Test: `backend/src/test/java/com/duing/global/monitoring/SlackNotifierTest.java`

**Interfaces:**
- Produces: `SlackProperties(String webhookUrl)` + `boolean enabled()`; `RestClient` 빈 `slackRestClient`; `SlackNotifier.send(String text)`(void, never throws), `SlackNotifier.isEnabled()`.

- [ ] **Step 1: 실패하는 테스트 작성** — `backend/src/test/java/com/duing/global/monitoring/SlackNotifierTest.java`

```java
package com.duing.global.monitoring;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.springframework.test.web.client.ExpectedCount.once;
import static org.springframework.test.web.client.ExpectedCount.times;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withBadRequest;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withException;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.io.IOException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class SlackNotifierTest {

    // 더미 URL — 실제 워크스페이스 경로가 아니다.
    private static final String WEBHOOK_URL = "https://hooks.slack.com/services/T000/B000/TEST";

    private MockRestServiceServer mockServer;
    private SlackNotifier slackNotifier;

    @BeforeEach
    void setUp() {
        RestClient.Builder restClientBuilder = RestClient.builder().baseUrl(WEBHOOK_URL);
        mockServer = MockRestServiceServer.bindTo(restClientBuilder).build();
        slackNotifier = new SlackNotifier(new SlackProperties(WEBHOOK_URL), restClientBuilder.build());
    }

    @Test
    @DisplayName("webhook URL 로 {\"text\": ...} JSON 을 POST 한다")
    void sendsTextPayloadToWebhook() {
        mockServer.expect(once(), requestTo(WEBHOOK_URL))
                .andExpect(method(HttpMethod.POST))
                .andExpect(content().contentType(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.text").value("🟢 신규 회원 가입\n이름: 홍길동"))
                .andRespond(withSuccess("ok", MediaType.TEXT_PLAIN));

        slackNotifier.send("🟢 신규 회원 가입\n이름: 홍길동");

        mockServer.verify();
    }

    @Test
    @DisplayName("5xx 응답이면 정확히 1회 재시도하고(총 2회) 그래도 실패하면 예외 없이 포기한다")
    void retriesOnceOnServerErrorThenGivesUp() {
        mockServer.expect(times(2), requestTo(WEBHOOK_URL)).andRespond(withServerError());

        assertThatCode(() -> slackNotifier.send("x")).doesNotThrowAnyException();

        mockServer.verify();
    }

    @Test
    @DisplayName("429 응답도 1회 재시도 대상이다 — 재시도가 성공하면 그걸로 끝난다")
    void retriesOnceOnTooManyRequests() {
        mockServer.expect(once(), requestTo(WEBHOOK_URL)).andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS));
        mockServer.expect(once(), requestTo(WEBHOOK_URL)).andRespond(withSuccess("ok", MediaType.TEXT_PLAIN));

        assertThatCode(() -> slackNotifier.send("x")).doesNotThrowAnyException();

        mockServer.verify();
    }

    @Test
    @DisplayName("그 외 4xx(잘못된 요청·폐기된 webhook)는 재시도하지 않고 예외 없이 종료한다")
    void doesNotRetryOnClientError() {
        mockServer.expect(once(), requestTo(WEBHOOK_URL)).andRespond(withBadRequest());

        assertThatCode(() -> slackNotifier.send("x")).doesNotThrowAnyException();

        mockServer.verify();
    }

    @Test
    @DisplayName("타임아웃·네트워크 오류는 요청이 이미 도달했을 수 있어 재시도하지 않는다(중복 게시 방지)")
    void doesNotRetryOnTransportFailure() {
        mockServer.expect(once(), requestTo(WEBHOOK_URL))
                .andRespond(withException(new IOException("Read timed out")));

        assertThatCode(() -> slackNotifier.send("x")).doesNotThrowAnyException();

        mockServer.verify();
    }

    @Test
    @DisplayName("webhook URL 이 비어 있으면 비활성 — 어떤 요청도 보내지 않는다(로컬·CI)")
    void disabledWhenWebhookUrlBlank() {
        RestClient.Builder restClientBuilder = RestClient.builder().baseUrl("http://localhost:0/slack-disabled");
        MockRestServiceServer disabledServer = MockRestServiceServer.bindTo(restClientBuilder).build();
        SlackNotifier disabledNotifier = new SlackNotifier(new SlackProperties(""), restClientBuilder.build());

        disabledNotifier.send("x");

        disabledServer.verify(); // 기대 요청 0건 — 요청이 나갔다면 AssertionError
    }
}
```

- [ ] **Step 2: 실패 확인**

Run: `cd /Users/ksy/orca/workspaces/Duing/cetacean/backend && ./gradlew test --tests "com.duing.global.monitoring.SlackNotifierTest"`
Expected: 컴파일 실패 (`SlackProperties`, `SlackNotifier` 없음)

- [ ] **Step 3: `SlackProperties` 작성**

```java
package com.duing.global.monitoring;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Slack 운영 알림(Incoming Webhook) 설정 — {@link SlackClientConfig} 가 등록한다. URL 은 환경변수로만 주입.
 *
 * <p>{@code @Validated} 를 쓰지 않는다 — 빈 값이 "비활성(로컬·CI)" 이라는 정상 상태이기 때문이다.
 * 운영은 application-prod.yml 이 {@code ${SLACK_WEBHOOK_URL}} 을 폴백 없이 요구해 키 누락을 부팅에서 잡는다.
 */
@ConfigurationProperties(prefix = "monitoring.slack")
public record SlackProperties(String webhookUrl) {

    public boolean enabled() {
        return webhookUrl != null && !webhookUrl.isBlank();
    }
}
```

- [ ] **Step 4: `SlackClientConfig` 작성**

```java
package com.duing.global.monitoring;

import java.time.Duration;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

/**
 * Slack Incoming Webhook RestClient — {@link SlackNotifier} 가 사용.
 *
 * <p>webhook URL 에는 시크릿 경로가 들어 있으므로 baseUrl 로만 넣고 요청마다 경로를 조립하지 않는다.
 * 비활성(빈 URL)일 때도 빈은 만들어 두되 더미 로컬 주소를 준다 — SlackNotifier 가 먼저 걸러 절대 호출되지 않는다.
 * 운영 알림이 요청 스레드를 오래 잡지 않도록 짧은 타임아웃을 강제한다(리스너는 @Async 지만 스레드 예산이 작다).
 */
@Configuration
@EnableConfigurationProperties(SlackProperties.class)
public class SlackClientConfig {

    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(3);
    private static final Duration READ_TIMEOUT = Duration.ofSeconds(5);
    private static final String DISABLED_BASE_URL = "http://localhost:0/slack-disabled";

    @Bean
    public RestClient slackRestClient(SlackProperties slackProperties) {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(CONNECT_TIMEOUT);
        requestFactory.setReadTimeout(READ_TIMEOUT);
        return RestClient.builder()
                .baseUrl(slackProperties.enabled() ? slackProperties.webhookUrl() : DISABLED_BASE_URL)
                .requestFactory(requestFactory)
                .build();
    }
}
```

- [ ] **Step 5: `SlackNotifier` 작성**

```java
package com.duing.global.monitoring;

import java.time.Duration;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

/**
 * Slack Incoming Webhook 전송기 — 운영 이벤트 채널용. 핵심 서비스와의 격리가 계약이다:
 * {@link #send} 는 어떤 경우에도 예외를 던지지 않으며, 호출부(리스너)는 커밋 이후 별도 스레드에서 돈다.
 *
 * <p>재시도 정책: <b>5xx·429 에만 1회</b> — 서버가 거절했음이 확실해 중복 게시가 없다. 타임아웃·네트워크 오류는
 * 요청이 이미 도달했을 수 있어 재시도하지 않는다(같은 메시지가 두 번 올라가는 것보다 한 번 빠지는 편이 낫다).
 * 그 외 4xx(잘못된 바디·폐기된 webhook)는 재시도해도 같다.
 *
 * <p>로깅 정책: {@code RestClientResponseException}/{@code ResourceAccessException} 의 메시지에는 요청 URL(=webhook
 * 시크릿)과 응답 바디가 섞인다 — 예외 객체·메시지를 로그에 싣지 않고 상태코드·클래스명만 남긴다.
 * 최종 실패는 ERROR(→ Sentry 이슈) 로 신호만 남긴다(스택 없음, 메일 제공자 ERROR 정책과 동일).
 */
@Slf4j
@Component
public class SlackNotifier {

    private static final int MAX_ATTEMPTS = 2;
    private static final Duration RETRY_DELAY = Duration.ofMillis(500);

    private final boolean enabled;
    private final RestClient slackRestClient;

    public SlackNotifier(SlackProperties slackProperties, RestClient slackRestClient) {
        this.enabled = slackProperties.enabled();
        this.slackRestClient = slackRestClient;
    }

    public boolean isEnabled() {
        return enabled;
    }

    /** 평문 메시지를 webhook 으로 보낸다. 비활성이면 즉시 반환. 절대 예외를 던지지 않는다. */
    public void send(String text) {
        if (!enabled) {
            log.debug("Slack 운영 알림 비활성(SLACK_WEBHOOK_URL 미설정) — 전송 생략");
            return;
        }
        for (int attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            try {
                // URI 를 지정하지 않으면 baseUrl(=webhook URL) 그대로 호출된다.
                slackRestClient.post()
                        .contentType(MediaType.APPLICATION_JSON)
                        .body(Map.of("text", text))
                        .retrieve()
                        .toBodilessEntity();
                log.debug("Slack 운영 알림 전송 완료(attempt={})", attempt);
                return;
            } catch (RestClientResponseException httpFailure) {
                int statusCode = httpFailure.getStatusCode().value();
                boolean retryable = statusCode >= 500 || statusCode == 429;
                if (retryable && attempt < MAX_ATTEMPTS) {
                    log.warn("Slack 운영 알림 전송 실패(HTTP {}) — {}ms 후 1회 재시도한다.",
                            statusCode, RETRY_DELAY.toMillis());
                    sleepBeforeRetry();
                    continue;
                }
                log.error("Slack 운영 알림 전송 실패 — reason=HTTP_{}", statusCode);
                return;
            } catch (RestClientException transportFailure) {
                log.error("Slack 운영 알림 전송 실패 — reason={}", transportFailure.getClass().getSimpleName());
                return;
            }
        }
    }

    private void sleepBeforeRetry() {
        try {
            Thread.sleep(RETRY_DELAY.toMillis());
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        }
    }
}
```

- [ ] **Step 6: 설정 추가**

`backend/src/main/resources/application.yml` — `sentry:` 블록(`minimum-breadcrumb-level: info` 줄) 바로 아래에 추가:

```yaml

# Slack 운영 알림(Incoming Webhook) — 주요 비즈니스 이벤트(회원가입·동아리·회비·시설·관리자 조치)를
# 운영 채널로 보낸다. 로그 집계·Sentry 복제가 아니다(deploy/MONITORING.md). 빈 값이면 완전 비활성(로컬·CI).
# 전송은 커밋 후(@TransactionalEventListener AFTER_COMMIT) 전용 스레드에서 하며, 실패해도 서비스에 영향이 없다.
monitoring:
  slack:
    webhook-url: ${SLACK_WEBHOOK_URL:}
```

`backend/src/main/resources/application-prod.yml` — `sentry:` 블록(`environment: production` 줄) 바로 아래에 추가:

```yaml

# 운영 Slack 알림 — SENTRY_DSN 과 같은 정책: 키를 폴백 없이 요구해 사일런트 결손을 막는다.
# 의도적으로 끄려면 빈 값(SLACK_WEBHOOK_URL=)을 준다. 키 자체가 없으면 부팅이 실패한다(배포 게이트가 롤백).
monitoring:
  slack:
    webhook-url: ${SLACK_WEBHOOK_URL}
```

`backend/src/test/resources/application.yml` — `octomo:` 블록 바로 아래에 추가:

```yaml

monitoring:
  slack:
    # 테스트 기본 비활성 — 실제 전송 없음. SlackNotifier 단위 테스트는 MockRestServiceServer 로 계약을 검증한다.
    webhook-url: ""
```

`backend/.env.example` — `SENTRY_ENVIRONMENT=production` 줄 아래에 추가:

```
# Slack 운영 알림 Incoming Webhook URL (운영 필수 키 — prod 는 키 자체가 없으면 부팅 실패, 빈 값이면 비활성).
# 로컬은 비워 둔다(운영 webhook 을 로컬에서 쓰지 말 것). 채널·이벤트 목록은 deploy/MONITORING.md.
SLACK_WEBHOOK_URL=
```

- [ ] **Step 7: 테스트 통과 확인**

Run: `cd /Users/ksy/orca/workspaces/Duing/cetacean/backend && ./gradlew test --tests "com.duing.global.monitoring.SlackNotifierTest"`
Expected: `BUILD SUCCESSFUL`, 6 tests passed

- [ ] **Step 8: 컨텍스트 부팅 회귀 1건** — 기존 통합 테스트 하나로 새 빈(`slackRestClient`, `SlackNotifier`)이 다른 RestClient 빈과 충돌 없이 뜨는지 확인

Run: `cd /Users/ksy/orca/workspaces/Duing/cetacean/backend && ./gradlew test --tests "com.duing.domain.user.controller.AuthControllerSignupTest"`
Expected: `BUILD SUCCESSFUL`

- [ ] **Step 9: 커밋**

```bash
cd /Users/ksy/orca/workspaces/Duing/cetacean
git add backend/src/main/java/com/duing/global/monitoring/SlackProperties.java backend/src/main/java/com/duing/global/monitoring/SlackClientConfig.java backend/src/main/java/com/duing/global/monitoring/SlackNotifier.java backend/src/test/java/com/duing/global/monitoring/SlackNotifierTest.java backend/src/main/resources/application.yml backend/src/main/resources/application-prod.yml backend/src/test/resources/application.yml backend/.env.example
git commit -m "feat(backend): Slack 운영 알림 전송기 — webhook RestClient·5xx/429 1회 재시도·비활성 게이트 + SLACK_WEBHOOK_URL 설정"
```

---

### Task 2: 이벤트 record 6종 + `MoPollThrottle.dailyUsage` + `OpsSlackMessageFormatter`

**Files:**
- Create: `backend/src/main/java/com/duing/global/monitoring/event/UserRegisteredEvent.java`
- Create: `backend/src/main/java/com/duing/global/monitoring/event/ClubCreatedEvent.java`
- Create: `backend/src/main/java/com/duing/global/monitoring/event/ClubStatusChangedEvent.java`
- Create: `backend/src/main/java/com/duing/global/monitoring/event/ClubClosedEvent.java`
- Create: `backend/src/main/java/com/duing/global/monitoring/event/FeeAccountCreatedEvent.java`
- Create: `backend/src/main/java/com/duing/global/monitoring/event/AdminUserActionEvent.java`
- Create: `backend/src/main/java/com/duing/global/monitoring/OpsSlackMessageFormatter.java`
- Modify: `backend/src/main/java/com/duing/domain/user/service/MoPollThrottle.java` (`consumedDailyCalls()` 위에 메서드·record 추가)
- Test: `backend/src/test/java/com/duing/domain/user/service/MoPollThrottleTest.java` (테스트 2개 추가)
- Test: `backend/src/test/java/com/duing/global/monitoring/OpsSlackMessageFormatterTest.java`

**Interfaces:**
- Produces:
  - `record UserRegisteredEvent(Long userId, String studentId, String name, LocalDateTime registeredAt)`
  - `record ClubCreatedEvent(Long clubId, String clubName, Long leaderUserId)`
  - `record ClubStatusChangedEvent(Long clubId, String clubName, ClubStatus previousStatus, ClubStatus nextStatus, Long actorUserId)`
  - `record ClubClosedEvent(Long clubId, String clubName, Long actorUserId)`
  - `record FeeAccountCreatedEvent(Long clubId, Long feeAccountId, Bank bank, Long actorUserId)`
  - `record AdminUserActionEvent(AdminUserAction action, Long targetUserId, Long actorUserId)`
  - `MoPollThrottle.DailyUsage(int usedCalls, int dailyLimit)` + `public synchronized DailyUsage dailyUsage(LocalDateTime now)`
  - `OpsSlackMessageFormatter(String environment, MoPollThrottle moPollThrottle, Clock clock)` 와 메서드 `userRegistered / clubCreated / clubStatusChanged / clubClosed / feeAccountCreated / adminUserAction / recruitmentOpened / facilityBookingSubmitted / facilityBookingCancelled / facilityBookingConflict` — 모두 `String` 반환.

- [ ] **Step 1: `MoPollThrottleTest` 에 실패 테스트 2개 추가** (`resetClearsState` 테스트 앞에)

```java
    @Test
    @DisplayName("일일 사용량 읽기는 오늘 예약된 실호출 수와 자체 상한을 함께 돌려준다(운영 모니터링용)")
    void dailyUsageReportsTodaysReservedCallsAndLimit() {
        assertThat(pollThrottle.dailyUsage(NOW)).isEqualTo(new MoPollThrottle.DailyUsage(0, DAILY_CALL_LIMIT));

        pollThrottle.reserveDailyQuota(NOW);
        pollThrottle.reserveDailyQuota(NOW);
        pollThrottle.reserveDailyQuota(NOW);

        assertThat(pollThrottle.dailyUsage(NOW)).isEqualTo(new MoPollThrottle.DailyUsage(3, DAILY_CALL_LIMIT));
    }

    @Test
    @DisplayName("날짜가 바뀐 뒤 첫 예약 전에 읽어도 전날 카운터가 아니라 0 으로 읽힌다(자정 롤오버를 읽기에도 반영)")
    void dailyUsageReadsZeroAfterMidnightBeforeFirstReservation() {
        pollThrottle.reserveDailyQuota(NOW);

        assertThat(pollThrottle.dailyUsage(NOW.plusDays(1))).isEqualTo(new MoPollThrottle.DailyUsage(0, DAILY_CALL_LIMIT));
        // 예약이 없었으니 전날 카운터는 아직 남아 있다 — 같은 날로 다시 읽으면 1.
        assertThat(pollThrottle.dailyUsage(NOW)).isEqualTo(new MoPollThrottle.DailyUsage(1, DAILY_CALL_LIMIT));
    }
```

- [ ] **Step 2: 실패 확인**

Run: `cd /Users/ksy/orca/workspaces/Duing/cetacean/backend && ./gradlew test --tests "com.duing.domain.user.service.MoPollThrottleTest"`
Expected: 컴파일 실패 (`dailyUsage`, `DailyUsage` 없음)

- [ ] **Step 3: `MoPollThrottle` 에 메서드·record 추가** — `/** 테스트 전용 — 오늘 소비된 일일 쿼터 수. ... */ public synchronized int consumedDailyCalls()` 바로 **위**에 삽입

```java
    /** 운영 모니터링용 일일 사용량 스냅샷 — 자체 집계(벤더 월 쿼터가 아니다). */
    public record DailyUsage(int usedCalls, int dailyLimit) {}

    /**
     * 오늘(호출부가 주입한 시각 기준) 예약된 Octomo 실호출 수와 자체 일일 상한을 읽는다 — Slack 운영 알림의
     * "Octomo 호출(자체 집계)" 줄. 읽기는 롤오버를 수행하지 않고(다음 {@link #reserveDailyQuota} 가 한다)
     * 카운터 날짜가 조회일보다 과거면 0 으로 읽는다 — 자정 직후 전날 수치가 오늘 것처럼 보이지 않게.
     */
    public synchronized DailyUsage dailyUsage(LocalDateTime now) {
        boolean counterIsCurrent = quotaDate != null && !quotaDate.isBefore(now.toLocalDate());
        return new DailyUsage(counterIsCurrent ? dailyCallCount : 0, dailyCallLimit);
    }

```

- [ ] **Step 4: 통과 확인**

Run: `cd /Users/ksy/orca/workspaces/Duing/cetacean/backend && ./gradlew test --tests "com.duing.domain.user.service.MoPollThrottleTest"`
Expected: `BUILD SUCCESSFUL`

- [ ] **Step 5: 이벤트 record 6종 작성** (패키지 `com.duing.global.monitoring.event`)

`UserRegisteredEvent.java`:
```java
package com.duing.global.monitoring.event;

import java.time.LocalDateTime;

/**
 * 회원가입 성공(커밋 후 Slack 운영 알림용). 이름·학번·UserId 만 싣는다 — 전화번호·비밀번호·토큰은
 * 필드 자체를 두지 않아 포매터가 실수로 내보낼 수 없다. 이메일은 서비스가 수집하지 않는다.
 * {@code registeredAt} 은 가입 트랜잭션의 단일 now(seoulClock 기준, KST).
 */
public record UserRegisteredEvent(Long userId, String studentId, String name, LocalDateTime registeredAt) {
}
```

`ClubCreatedEvent.java`:
```java
package com.duing.global.monitoring.event;

/** 동아리 생성(커밋 후 Slack 운영 알림용). 회장은 UserId 만 — 이름은 싣지 않는다. */
public record ClubCreatedEvent(Long clubId, String clubName, Long leaderUserId) {
}
```

`ClubStatusChangedEvent.java`:
```java
package com.duing.global.monitoring.event;

import com.duing.domain.club.entity.ClubStatus;

/** 총동연 동아리 상태 전이(승인·거절·운영중단·재개). 거절 사유(자유 텍스트)는 싣지 않는다. */
public record ClubStatusChangedEvent(
        Long clubId, String clubName, ClubStatus previousStatus, ClubStatus nextStatus, Long actorUserId) {
}
```

`ClubClosedEvent.java`:
```java
package com.duing.global.monitoring.event;

/** 총동연 동아리 폐쇄(soft-delete 커밋 후). 폐쇄 사유(자유 텍스트)는 싣지 않는다. */
public record ClubClosedEvent(Long clubId, String clubName, Long actorUserId) {
}
```

`FeeAccountCreatedEvent.java`:
```java
package com.duing.global.monitoring.event;

import com.duing.domain.fee.entity.Bank;

/** 회비 계좌 최초 등록(갱신·무변경 저장은 제외). 계좌번호·예금주는 싣지 않는다 — 은행 코드만. */
public record FeeAccountCreatedEvent(Long clubId, Long feeAccountId, Bank bank, Long actorUserId) {
}
```

`AdminUserActionEvent.java`:
```java
package com.duing.global.monitoring.event;

import com.duing.domain.user.entity.AdminUserAction;

/** 관리자 회원 조치(정지·해제·강제 로그아웃). 조치 사유(자유 텍스트)는 싣지 않는다. */
public record AdminUserActionEvent(AdminUserAction action, Long targetUserId, Long actorUserId) {
}
```

- [ ] **Step 6: 실패하는 포매터 테스트 작성** — `backend/src/test/java/com/duing/global/monitoring/OpsSlackMessageFormatterTest.java`

```java
package com.duing.global.monitoring;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.fee.entity.Bank;
import com.duing.domain.notification.event.FacilityBookingCancelledEvent;
import com.duing.domain.notification.event.FacilityBookingConflictEvent;
import com.duing.domain.notification.event.FacilityBookingSubmittedEvent;
import com.duing.domain.notification.event.RecruitmentOpenedEvent;
import com.duing.domain.user.entity.AdminUserAction;
import com.duing.domain.user.service.MoPollThrottle;
import com.duing.global.monitoring.event.AdminUserActionEvent;
import com.duing.global.monitoring.event.ClubClosedEvent;
import com.duing.global.monitoring.event.ClubCreatedEvent;
import com.duing.global.monitoring.event.ClubStatusChangedEvent;
import com.duing.global.monitoring.event.FeeAccountCreatedEvent;
import com.duing.global.monitoring.event.UserRegisteredEvent;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class OpsSlackMessageFormatterTest {

    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private static final LocalDateTime NOW = LocalDateTime.of(2026, 8, 22, 23, 41);
    private static final Clock FIXED_CLOCK = Clock.fixed(NOW.atZone(SEOUL).toInstant(), SEOUL);

    private final MoPollThrottle moPollThrottle = new MoPollThrottle(1_000);
    private final OpsSlackMessageFormatter formatter =
            new OpsSlackMessageFormatter("production", moPollThrottle, FIXED_CLOCK);

    @Test
    @DisplayName("회원가입 메시지는 이름·학번·UserId·환경·KST 가입시간·Octomo 자체 집계 줄을 명시 필드로만 조립한다")
    void userRegisteredMessageContainsExplicitFieldsOnly() {
        moPollThrottle.reserveDailyQuota(NOW);
        moPollThrottle.reserveDailyQuota(NOW);

        String message = formatter.userRegistered(new UserRegisteredEvent(812L, "20231234", "홍길동", NOW));

        assertThat(message).isEqualTo(String.join("\n",
                "🟢 신규 회원 가입",
                "서비스: Duing",
                "이벤트: USER_REGISTERED",
                "이름: 홍길동",
                "학번: 20231234",
                "UserId: 812",
                "환경: production",
                "가입시간: 2026-08-22 23:41 KST",
                "Octomo 호출(자체 집계, 오늘): 2 / 1,000"));
        assertThat(message).doesNotContain("이메일", "email", "전화", "010-", "password", "token");
    }

    @Test
    @DisplayName("Octomo 자체 집계 줄은 천 단위 구분자로 표기한다")
    void octomoUsageUsesThousandsSeparator() {
        MoPollThrottle largeLimitThrottle = new MoPollThrottle(10_000);
        OpsSlackMessageFormatter largeLimitFormatter =
                new OpsSlackMessageFormatter("local", largeLimitThrottle, FIXED_CLOCK);

        String message = largeLimitFormatter.userRegistered(new UserRegisteredEvent(1L, "20230001", "김두잉", NOW));

        assertThat(message).contains("Octomo 호출(자체 집계, 오늘): 0 / 10,000").contains("환경: local");
    }

    @Test
    @DisplayName("관리자 조치 메시지는 조치 종류·대상 UserId·관리자 UserId 만 싣고 사유는 싣지 않는다")
    void adminUserActionMessage() {
        String message = formatter.adminUserAction(new AdminUserActionEvent(AdminUserAction.ACCOUNT_SUSPENDED, 812L, 3L));

        assertThat(message).isEqualTo(String.join("\n",
                "🛡️ 관리자 조치",
                "서비스: Duing",
                "이벤트: ADMIN_USER_ACTION",
                "조치: ACCOUNT_SUSPENDED",
                "대상 UserId: 812",
                "관리자 UserId: 3",
                "환경: production",
                "시간: 2026-08-22 23:41 KST"));
    }

    @Test
    @DisplayName("동아리 생성·상태 변경·폐쇄 메시지는 동아리명·ClubId·상태 전이·행위자 UserId 를 싣는다")
    void clubMessages() {
        assertThat(formatter.clubCreated(new ClubCreatedEvent(7L, "두잉개발회", 5L))).isEqualTo(String.join("\n",
                "🏛️ 동아리 생성", "서비스: Duing", "이벤트: CLUB_CREATED",
                "동아리: 두잉개발회", "ClubId: 7", "회장 UserId: 5",
                "환경: production", "시간: 2026-08-22 23:41 KST"));

        assertThat(formatter.clubStatusChanged(new ClubStatusChangedEvent(
                7L, "두잉개발회", ClubStatus.PENDING_APPROVAL, ClubStatus.ACTIVE, 3L)))
                .contains("🔄 동아리 상태 변경", "이벤트: CLUB_STATUS_CHANGED",
                        "상태: PENDING_APPROVAL → ACTIVE", "관리자 UserId: 3");

        assertThat(formatter.clubClosed(new ClubClosedEvent(7L, "두잉개발회", 3L)))
                .contains("⛔ 동아리 폐쇄", "이벤트: CLUB_CLOSED", "동아리: 두잉개발회", "ClubId: 7", "관리자 UserId: 3");
    }

    @Test
    @DisplayName("회비 계좌 등록 메시지는 은행 코드와 id 만 싣는다")
    void feeAccountCreatedMessage() {
        String message = formatter.feeAccountCreated(new FeeAccountCreatedEvent(7L, 21L, Bank.KB, 5L));

        assertThat(message).contains("🏦 회비 계좌 등록", "이벤트: FEE_ACCOUNT_CREATED",
                "ClubId: 7", "계좌Id: 21", "은행: KB", "등록자 UserId: 5");
    }

    @Test
    @DisplayName("모집 오픈 메시지는 동아리·모집 제목·마감일을 싣고, 마감일이 없으면 '상시' 로 표기한다")
    void recruitmentOpenedMessage() {
        assertThat(formatter.recruitmentOpened(new RecruitmentOpenedEvent(
                33L, 7L, "두잉개발회", "2학기 신입 모집", LocalDate.of(2026, 9, 10))))
                .contains("📣 모집 오픈", "이벤트: RECRUITMENT_OPENED", "동아리: 두잉개발회", "ClubId: 7",
                        "모집: 2학기 신입 모집", "RecruitmentId: 33", "마감: 2026-09-10");

        assertThat(formatter.recruitmentOpened(new RecruitmentOpenedEvent(34L, 7L, "두잉개발회", "상시 모집", null)))
                .contains("마감: 상시");
    }

    @Test
    @DisplayName("시설 예약 메시지는 BookingId·ClubId 만 싣고 자유 텍스트(취소 사유·충돌 상세)는 절대 싣지 않는다")
    void facilityBookingMessagesExcludeFreeText() {
        assertThat(formatter.facilityBookingSubmitted(new FacilityBookingSubmittedEvent(90L, 7L)))
                .contains("🏟️ 시설 예약 신청", "이벤트: FACILITY_BOOKING_SUBMITTED", "BookingId: 90", "ClubId: 7");

        String cancelled = formatter.facilityBookingCancelled(
                new FacilityBookingCancelledEvent(90L, 7L, 400L, "학생 홍길동 010-1234-5678 요청"));
        assertThat(cancelled).contains("🏟️ 시설 예약 취소(관리자)", "이벤트: FACILITY_BOOKING_CANCELLED", "BookingId: 90")
                .doesNotContain("홍길동", "010-1234-5678");

        String conflict = formatter.facilityBookingConflict(
                new FacilityBookingConflictEvent(90L, 7L, 401L, "타 동아리 김철수 중복"));
        assertThat(conflict).contains("⚠️ 시설 예약 충돌", "이벤트: FACILITY_BOOKING_CONFLICT", "BookingId: 90")
                .doesNotContain("김철수");
    }

    @Test
    @DisplayName("시간은 주입된 시계(Asia/Seoul) 기준으로 KST 로 표기한다 — UTC 시계를 넣어도 변환되지 않는 raw now 가 아니다")
    void timeUsesInjectedClock() {
        Clock utcMidnight = Clock.fixed(LocalDateTime.of(2026, 8, 22, 15, 0).toInstant(ZoneOffset.UTC), SEOUL);
        OpsSlackMessageFormatter seoulFormatter = new OpsSlackMessageFormatter("production", moPollThrottle, utcMidnight);

        assertThat(seoulFormatter.clubClosed(new ClubClosedEvent(1L, "x", 1L))).contains("시간: 2026-08-23 00:00 KST");
    }
}
```

- [ ] **Step 7: 실패 확인**

Run: `cd /Users/ksy/orca/workspaces/Duing/cetacean/backend && ./gradlew test --tests "com.duing.global.monitoring.OpsSlackMessageFormatterTest"`
Expected: 컴파일 실패 (`OpsSlackMessageFormatter` 없음)

- [ ] **Step 8: `OpsSlackMessageFormatter` 작성**

```java
package com.duing.global.monitoring;

import com.duing.domain.notification.event.FacilityBookingCancelledEvent;
import com.duing.domain.notification.event.FacilityBookingConflictEvent;
import com.duing.domain.notification.event.FacilityBookingSubmittedEvent;
import com.duing.domain.notification.event.RecruitmentOpenedEvent;
import com.duing.domain.user.service.MoPollThrottle;
import com.duing.global.monitoring.event.AdminUserActionEvent;
import com.duing.global.monitoring.event.ClubClosedEvent;
import com.duing.global.monitoring.event.ClubCreatedEvent;
import com.duing.global.monitoring.event.ClubStatusChangedEvent;
import com.duing.global.monitoring.event.FeeAccountCreatedEvent;
import com.duing.global.monitoring.event.UserRegisteredEvent;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * 운영 이벤트 → Slack 평문 메시지. <b>이벤트 record 의 명시 필드만</b> 줄로 조립한다 — 요청 바디·헤더·
 * 자유 텍스트(사유·상세)는 어떤 메서드도 읽지 않는다. 골격: 헤더 / 서비스 / 이벤트 / 도메인 필드 / 환경 / 시간 (/ 부가줄).
 *
 * <p>환경 라벨은 {@code sentry.environment} 를 재사용한다(prod=production, 로컬=local) — 환경 이름의 단일 출처.
 * 시간은 seoulClock(Asia/Seoul) 기준 KST. Octomo 줄은 {@link MoPollThrottle#dailyUsage} 의 <b>자체 집계</b>다 —
 * Octomo 는 잔여 쿼터 조회 API 를 제공하지 않는다(벤더 월 쿼터는 Octomo 마이페이지에서만 확인).
 */
@Component
public class OpsSlackMessageFormatter {

    private static final String SERVICE_NAME = "Duing";
    private static final DateTimeFormatter KST_MINUTE = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");

    private final String environment;
    private final MoPollThrottle moPollThrottle;
    private final Clock clock;

    public OpsSlackMessageFormatter(@Value("${sentry.environment:local}") String environment,
                                    MoPollThrottle moPollThrottle,
                                    Clock clock) {
        this.environment = environment;
        this.moPollThrottle = moPollThrottle;
        this.clock = clock;
    }

    public String userRegistered(UserRegisteredEvent event) {
        MoPollThrottle.DailyUsage octomoUsage = moPollThrottle.dailyUsage(LocalDateTime.now(clock));
        return compose("🟢 신규 회원 가입", "USER_REGISTERED",
                Arrays.asList(field("이름", event.name()), field("학번", event.studentId()), field("UserId", event.userId())),
                "가입시간", event.registeredAt(),
                List.of(String.format(Locale.ROOT, "Octomo 호출(자체 집계, 오늘): %,d / %,d",
                        octomoUsage.usedCalls(), octomoUsage.dailyLimit())));
    }

    public String clubCreated(ClubCreatedEvent event) {
        return compose("🏛️ 동아리 생성", "CLUB_CREATED",
                Arrays.asList(field("동아리", event.clubName()), field("ClubId", event.clubId()),
                        field("회장 UserId", event.leaderUserId())));
    }

    public String clubStatusChanged(ClubStatusChangedEvent event) {
        return compose("🔄 동아리 상태 변경", "CLUB_STATUS_CHANGED",
                Arrays.asList(field("동아리", event.clubName()), field("ClubId", event.clubId()),
                        field("상태", event.previousStatus() + " → " + event.nextStatus()),
                        field("관리자 UserId", event.actorUserId())));
    }

    public String clubClosed(ClubClosedEvent event) {
        return compose("⛔ 동아리 폐쇄", "CLUB_CLOSED",
                Arrays.asList(field("동아리", event.clubName()), field("ClubId", event.clubId()),
                        field("관리자 UserId", event.actorUserId())));
    }

    public String feeAccountCreated(FeeAccountCreatedEvent event) {
        return compose("🏦 회비 계좌 등록", "FEE_ACCOUNT_CREATED",
                Arrays.asList(field("ClubId", event.clubId()), field("계좌Id", event.feeAccountId()),
                        field("은행", event.bank() == null ? null : event.bank().name()),
                        field("등록자 UserId", event.actorUserId())));
    }

    public String adminUserAction(AdminUserActionEvent event) {
        return compose("🛡️ 관리자 조치", "ADMIN_USER_ACTION",
                Arrays.asList(field("조치", event.action()), field("대상 UserId", event.targetUserId()),
                        field("관리자 UserId", event.actorUserId())));
    }

    public String recruitmentOpened(RecruitmentOpenedEvent event) {
        return compose("📣 모집 오픈", "RECRUITMENT_OPENED",
                Arrays.asList(field("동아리", event.clubName()), field("ClubId", event.clubId()),
                        field("모집", event.recruitmentTitle()), field("RecruitmentId", event.recruitmentId()),
                        field("마감", event.endDate() == null ? "상시" : event.endDate().toString())));
    }

    public String facilityBookingSubmitted(FacilityBookingSubmittedEvent event) {
        return compose("🏟️ 시설 예약 신청", "FACILITY_BOOKING_SUBMITTED",
                Arrays.asList(field("BookingId", event.bookingId()), field("ClubId", event.clubId())));
    }

    /** 관리자 취소만 이벤트가 있다(동아리 측 취소는 이벤트 미발행). reason(자유 텍스트)은 읽지 않는다. */
    public String facilityBookingCancelled(FacilityBookingCancelledEvent event) {
        return compose("🏟️ 시설 예약 취소(관리자)", "FACILITY_BOOKING_CANCELLED",
                Arrays.asList(field("BookingId", event.bookingId()), field("ClubId", event.clubId())));
    }

    /** detail(자유 텍스트)은 읽지 않는다. */
    public String facilityBookingConflict(FacilityBookingConflictEvent event) {
        return compose("⚠️ 시설 예약 충돌", "FACILITY_BOOKING_CONFLICT",
                Arrays.asList(field("BookingId", event.bookingId()), field("ClubId", event.clubId())));
    }

    private String compose(String header, String eventType, List<String> domainLines) {
        return compose(header, eventType, domainLines, "시간", LocalDateTime.now(clock), List.of());
    }

    private String compose(String header, String eventType, List<String> domainLines,
                           String timeLabel, LocalDateTime occurredAt, List<String> trailingLines) {
        List<String> lines = new ArrayList<>();
        lines.add(header);
        lines.add("서비스: " + SERVICE_NAME);
        lines.add("이벤트: " + eventType);
        domainLines.stream().filter(Objects::nonNull).forEach(lines::add);
        lines.add("환경: " + environment);
        lines.add(timeLabel + ": " + KST_MINUTE.format(occurredAt) + " KST");
        lines.addAll(trailingLines);
        return String.join("\n", lines);
    }

    /** 값이 없는 줄은 출력하지 않는다(스펙 §14) — null 을 돌려주고 compose 가 거른다. */
    private static String field(String label, Object value) {
        return value == null ? null : label + ": " + value;
    }
}
```

- [ ] **Step 9: 통과 확인**

Run: `cd /Users/ksy/orca/workspaces/Duing/cetacean/backend && ./gradlew test --tests "com.duing.global.monitoring.OpsSlackMessageFormatterTest" --tests "com.duing.domain.user.service.MoPollThrottleTest"`
Expected: `BUILD SUCCESSFUL`

- [ ] **Step 10: 커밋**

```bash
cd /Users/ksy/orca/workspaces/Duing/cetacean
git add backend/src/main/java/com/duing/global/monitoring/event backend/src/main/java/com/duing/global/monitoring/OpsSlackMessageFormatter.java backend/src/main/java/com/duing/domain/user/service/MoPollThrottle.java backend/src/test/java/com/duing/domain/user/service/MoPollThrottleTest.java backend/src/test/java/com/duing/global/monitoring/OpsSlackMessageFormatterTest.java
git commit -m "feat(backend): 운영 이벤트 record 6종·Slack 메시지 포매터 — 명시 필드만 조립 + Octomo 일일 자체 집계 읽기"
```

---

### Task 3: `MonitoringAsyncConfig` + `OpsSlackListener`

**Files:**
- Create: `backend/src/main/java/com/duing/global/monitoring/MonitoringAsyncConfig.java`
- Create: `backend/src/main/java/com/duing/global/monitoring/OpsSlackListener.java`
- Test: `backend/src/test/java/com/duing/global/monitoring/OpsSlackListenerTest.java`

**Interfaces:**
- Consumes: Task 1 `SlackNotifier.send(String)`, Task 2 `OpsSlackMessageFormatter` 메서드·이벤트 record.
- Produces: `MonitoringAsyncConfig.EXECUTOR_BEAN_NAME = "monitoringTaskExecutor"`; `OpsSlackListener` 의 `@Async @TransactionalEventListener(AFTER_COMMIT)` 메서드 10개 (`onUserRegistered`, `onClubCreated`, `onClubStatusChanged`, `onClubClosed`, `onFeeAccountCreated`, `onAdminUserAction`, `onRecruitmentOpened`, `onFacilityBookingSubmitted`, `onFacilityBookingCancelled`, `onFacilityBookingConflict`).

- [ ] **Step 1: 실패하는 단위 테스트 작성** — `backend/src/test/java/com/duing/global/monitoring/OpsSlackListenerTest.java`

```java
package com.duing.global.monitoring;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.duing.domain.notification.event.FacilityBookingSubmittedEvent;
import com.duing.domain.user.entity.AdminUserAction;
import com.duing.global.monitoring.event.AdminUserActionEvent;
import com.duing.global.monitoring.event.UserRegisteredEvent;
import java.time.LocalDateTime;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class OpsSlackListenerTest {

    private final OpsSlackMessageFormatter formatter = mock(OpsSlackMessageFormatter.class);
    private final SlackNotifier slackNotifier = mock(SlackNotifier.class);
    private final OpsSlackListener listener = new OpsSlackListener(formatter, slackNotifier);

    @Test
    @DisplayName("이벤트를 받으면 포매터 결과를 그대로 Slack 전송기에 넘긴다")
    void forwardsFormattedMessageToNotifier() {
        UserRegisteredEvent event = new UserRegisteredEvent(1L, "20230001", "홍길동", LocalDateTime.of(2026, 8, 22, 23, 41));
        when(formatter.userRegistered(event)).thenReturn("formatted");

        listener.onUserRegistered(event);

        verify(slackNotifier).send("formatted");
    }

    @Test
    @DisplayName("전송기가 예외를 던져도 리스너 밖으로 전파하지 않는다 — 비동기 예외 핸들러(ERROR→Sentry 폭주)로 새지 않게")
    void swallowsNotifierFailure() {
        when(formatter.adminUserAction(any())).thenReturn("formatted");
        doThrow(new IllegalStateException("slack down")).when(slackNotifier).send(anyString());

        assertThatCode(() -> listener.onAdminUserAction(new AdminUserActionEvent(AdminUserAction.FORCE_LOGOUT, 1L, 2L)))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("포매터가 예외를 던져도 전파하지 않고 전송도 하지 않는다")
    void swallowsFormatterFailure() {
        when(formatter.facilityBookingSubmitted(any())).thenThrow(new NullPointerException("boom"));

        assertThatCode(() -> listener.onFacilityBookingSubmitted(new FacilityBookingSubmittedEvent(1L, 2L)))
                .doesNotThrowAnyException();
        verify(slackNotifier, never()).send(anyString());
    }
}
```

- [ ] **Step 2: 실패 확인**

Run: `cd /Users/ksy/orca/workspaces/Duing/cetacean/backend && ./gradlew test --tests "com.duing.global.monitoring.OpsSlackListenerTest"`
Expected: 컴파일 실패 (`OpsSlackListener` 없음)

- [ ] **Step 3: `MonitoringAsyncConfig` 작성**

```java
package com.duing.global.monitoring;

import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

/**
 * 운영 알림 전용 비동기 실행기. {@link OpsSlackListener} 의 {@code @Async} 메서드만 이 풀에서 돈다 —
 * 커밋 후 Slack 전송이 요청 스레드의 응답 시간·결과에 영향을 주지 않게 한다.
 *
 * <p>{@code @EnableAsync} 는 레포에서 처음 켠다. 기존 리스너에는 {@code @Async} 가 없어 동작이 바뀌지 않는다.
 * 이 빈이 생기면 Boot 의 기본 {@code applicationTaskExecutor} 는 물러나는데(ConditionalOnMissingBean(Executor)),
 * MVC async(Callable/SseEmitter) 등 그 빈의 소비자가 코드베이스에 없음을 확인했다(2026-08-23).
 *
 * <p>풀은 작게(1~2 스레드, 큐 100) — 알림은 손실 허용이라 포화 시 폐기하고 warn 만 남긴다.
 * 종료 시 진행 중 전송을 최대 5초 기다려 배포 순간의 마지막 알림이 끊기지 않게 한다.
 */
@Slf4j
@Configuration
@EnableAsync
public class MonitoringAsyncConfig {

    public static final String EXECUTOR_BEAN_NAME = "monitoringTaskExecutor";

    @Bean(EXECUTOR_BEAN_NAME)
    public ThreadPoolTaskExecutor monitoringTaskExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(1);
        executor.setMaxPoolSize(2);
        executor.setQueueCapacity(100);
        executor.setThreadNamePrefix("ops-slack-");
        executor.setRejectedExecutionHandler((rejectedTask, pool) ->
                log.warn("운영 알림 큐 포화 — 이번 Slack 알림을 폐기한다(핵심 서비스 무영향). queue={}", pool.getQueue().size()));
        executor.setWaitForTasksToCompleteOnShutdown(true);
        executor.setAwaitTerminationSeconds(5);
        return executor;
    }
}
```

- [ ] **Step 4: `OpsSlackListener` 작성**

```java
package com.duing.global.monitoring;

import com.duing.domain.notification.event.FacilityBookingCancelledEvent;
import com.duing.domain.notification.event.FacilityBookingConflictEvent;
import com.duing.domain.notification.event.FacilityBookingSubmittedEvent;
import com.duing.domain.notification.event.RecruitmentOpenedEvent;
import com.duing.global.monitoring.event.AdminUserActionEvent;
import com.duing.global.monitoring.event.ClubClosedEvent;
import com.duing.global.monitoring.event.ClubCreatedEvent;
import com.duing.global.monitoring.event.ClubStatusChangedEvent;
import com.duing.global.monitoring.event.FeeAccountCreatedEvent;
import com.duing.global.monitoring.event.UserRegisteredEvent;
import java.util.function.Supplier;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * 운영 이벤트 → Slack. 커밋 후(AFTER_COMMIT)에만 수신하므로 롤백된 트랜잭션의 이벤트는 절대 오지 않고,
 * {@code @Async(monitoringTaskExecutor)} 라 발행한 요청 스레드와 분리된다. 각 메서드는 예외를 전파하지 않는다 —
 * 기본 AsyncUncaughtExceptionHandler 가 ERROR(=Sentry) 로 남기는 경로를 타지 않게 여기서 신호만 남긴다.
 *
 * <p>기존 알림 도메인 이벤트(모집 오픈·시설 예약)는 새 record 없이 그대로 구독한다 — 발행 지점·필드 불변.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class OpsSlackListener {

    private final OpsSlackMessageFormatter formatter;
    private final SlackNotifier slackNotifier;

    @Async(MonitoringAsyncConfig.EXECUTOR_BEAN_NAME)
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onUserRegistered(UserRegisteredEvent event) {
        notify("USER_REGISTERED", () -> formatter.userRegistered(event));
    }

    @Async(MonitoringAsyncConfig.EXECUTOR_BEAN_NAME)
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onClubCreated(ClubCreatedEvent event) {
        notify("CLUB_CREATED", () -> formatter.clubCreated(event));
    }

    @Async(MonitoringAsyncConfig.EXECUTOR_BEAN_NAME)
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onClubStatusChanged(ClubStatusChangedEvent event) {
        notify("CLUB_STATUS_CHANGED", () -> formatter.clubStatusChanged(event));
    }

    @Async(MonitoringAsyncConfig.EXECUTOR_BEAN_NAME)
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onClubClosed(ClubClosedEvent event) {
        notify("CLUB_CLOSED", () -> formatter.clubClosed(event));
    }

    @Async(MonitoringAsyncConfig.EXECUTOR_BEAN_NAME)
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onFeeAccountCreated(FeeAccountCreatedEvent event) {
        notify("FEE_ACCOUNT_CREATED", () -> formatter.feeAccountCreated(event));
    }

    @Async(MonitoringAsyncConfig.EXECUTOR_BEAN_NAME)
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onAdminUserAction(AdminUserActionEvent event) {
        notify("ADMIN_USER_ACTION", () -> formatter.adminUserAction(event));
    }

    @Async(MonitoringAsyncConfig.EXECUTOR_BEAN_NAME)
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onRecruitmentOpened(RecruitmentOpenedEvent event) {
        notify("RECRUITMENT_OPENED", () -> formatter.recruitmentOpened(event));
    }

    @Async(MonitoringAsyncConfig.EXECUTOR_BEAN_NAME)
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onFacilityBookingSubmitted(FacilityBookingSubmittedEvent event) {
        notify("FACILITY_BOOKING_SUBMITTED", () -> formatter.facilityBookingSubmitted(event));
    }

    @Async(MonitoringAsyncConfig.EXECUTOR_BEAN_NAME)
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onFacilityBookingCancelled(FacilityBookingCancelledEvent event) {
        notify("FACILITY_BOOKING_CANCELLED", () -> formatter.facilityBookingCancelled(event));
    }

    @Async(MonitoringAsyncConfig.EXECUTOR_BEAN_NAME)
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onFacilityBookingConflict(FacilityBookingConflictEvent event) {
        notify("FACILITY_BOOKING_CONFLICT", () -> formatter.facilityBookingConflict(event));
    }

    private void notify(String eventType, Supplier<String> messageSupplier) {
        try {
            slackNotifier.send(messageSupplier.get());
        } catch (RuntimeException failure) {
            // 예외 메시지에 PII·URL 이 섞일 수 있어 클래스명만 남긴다.
            log.error("Slack 운영 알림 처리 실패 — event={}, reason={}", eventType, failure.getClass().getSimpleName());
        }
    }
}
```

- [ ] **Step 5: 통과 확인**

Run: `cd /Users/ksy/orca/workspaces/Duing/cetacean/backend && ./gradlew test --tests "com.duing.global.monitoring.OpsSlackListenerTest"`
Expected: `BUILD SUCCESSFUL`, 3 tests passed

- [ ] **Step 6: 컨텍스트 부팅 회귀** — `@EnableAsync` + 새 executor 가 기존 통합 테스트 컨텍스트를 깨지 않는지

Run: `cd /Users/ksy/orca/workspaces/Duing/cetacean/backend && ./gradlew test --tests "com.duing.domain.user.controller.AuthControllerSignupTest" --tests "com.duing.domain.facility.FacilityOnDemandCrawlIntegrationTest"`
Expected: `BUILD SUCCESSFUL`

- [ ] **Step 7: 커밋**

```bash
cd /Users/ksy/orca/workspaces/Duing/cetacean
git add backend/src/main/java/com/duing/global/monitoring/MonitoringAsyncConfig.java backend/src/main/java/com/duing/global/monitoring/OpsSlackListener.java backend/src/test/java/com/duing/global/monitoring/OpsSlackListenerTest.java
git commit -m "feat(backend): 운영 Slack 리스너 — AFTER_COMMIT + 전용 @Async 실행기, 이벤트 10종 구독·예외 전파 0"
```

---

### Task 4: 발행 지점 6곳 + 통합 테스트(장애 격리·롤백·중복)

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/user/service/GeneralUserService.java` (필드 추가, `signup` 끝, `forceLogout` 끝)
- Modify: `backend/src/main/java/com/duing/domain/user/service/GeneralAdminUserCommandService.java` (필드 추가, `changeStatus` 끝)
- Modify: `backend/src/main/java/com/duing/domain/club/service/GeneralClubService.java` (필드 추가, `create` 끝, `updateStatus`)
- Modify: `backend/src/main/java/com/duing/domain/club/service/GeneralClubClosureService.java` (필드 추가, `close` 끝)
- Modify: `backend/src/main/java/com/duing/domain/fee/service/GeneralFeeAccountService.java` (필드 추가, `upsert` INSERT 분기 끝)
- Modify: `backend/src/test/java/com/duing/domain/user/service/SignupPhoneChangeRaceGuardTest.java:42-52` (생성자 인자 1개 추가)
- Modify: `backend/src/test/java/com/duing/domain/club/service/ClubNameRaceGuardTest.java:40-51` (생성자 인자 1개 추가)
- Modify: `backend/src/test/java/com/duing/domain/fee/service/FeeAccountRaceGuardTest.java:35-37` (생성자 인자 1개 추가)
- Test: `backend/src/test/java/com/duing/global/monitoring/OpsSlackMonitoringIntegrationTest.java`

**Interfaces:**
- Consumes: Task 2 이벤트 record 6종, Task 1 `SlackNotifier`(`@MockitoBean` 으로 대체), Task 3 리스너.
- Produces: 없음(서비스 시그니처 불변 — 생성자 인자만 `ApplicationEventPublisher eventPublisher` 가 **마지막**에 추가됨).

- [ ] **Step 1: 실패하는 통합 테스트 작성** — `backend/src/test/java/com/duing/global/monitoring/OpsSlackMonitoringIntegrationTest.java`

```java
package com.duing.global.monitoring;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.Mockito.after;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.verify;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.ClubFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.club.service.ClubClosureService;
import com.duing.domain.club.service.ClubService;
import com.duing.domain.club.service.dto.command.CloseClubCommand;
import com.duing.domain.club.service.dto.command.CreateClubCommand;
import com.duing.domain.club.service.dto.command.UpdateClubStatusCommand;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.fee.entity.Bank;
import com.duing.domain.fee.service.FeeAccountService;
import com.duing.domain.fee.service.dto.command.UpsertFeeAccountCommand;
import com.duing.domain.user.entity.PhoneVerification;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserStatus;
import com.duing.domain.user.entity.VerificationPurpose;
import com.duing.domain.user.repository.PhoneVerificationRepository;
import com.duing.domain.user.repository.UserRepository;
import com.duing.domain.user.service.AdminUserCommandService;
import com.duing.domain.user.service.UserService;
import com.duing.domain.user.service.dto.command.ChangeUserStatusCommand;
import com.duing.domain.user.service.dto.command.ForceLogoutCommand;
import com.duing.global.monitoring.event.UserRegisteredEvent;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 운영 Slack 알림의 end-to-end 계약 — 발행 지점 → AFTER_COMMIT → @Async 리스너 → 포매터 → SlackNotifier.
 * SlackNotifier 만 목으로 바꿔 "무엇이 전송되려 했는지" 와 "핵심 흐름이 Slack 실패와 무관한지" 를 고정한다.
 * 리스너는 별도 스레드라 verify(timeout)/after 로 기다린다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class OpsSlackMonitoringIntegrationTest extends IntegrationTestBase {

    private static final long ASYNC_WAIT_MS = 3_000;
    private static final long QUIET_WAIT_MS = 700;

    @LocalServerPort int port;

    @MockitoBean SlackNotifier slackNotifier;

    @Autowired UserRepository userRepository;
    @Autowired PhoneVerificationRepository phoneVerificationRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired JdbcTemplate jdbcTemplate;
    @Autowired Clock clock;
    @Autowired ApplicationEventPublisher eventPublisher;
    @Autowired PlatformTransactionManager transactionManager;
    @Autowired UserService userService;
    @Autowired AdminUserCommandService adminUserCommandService;
    @Autowired ClubService clubService;
    @Autowired ClubClosureService clubClosureService;
    @Autowired FeeAccountService feeAccountService;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
    }

    private String prepareVerifiedPhone(String phone) {
        LocalDateTime now = LocalDateTime.now(clock);
        PhoneVerification verification = PhoneVerification.issue(
                phone, UUID.randomUUID().toString(), VerificationPurpose.SIGNUP, null, now);
        verification.markVerified(now);
        return phoneVerificationRepository.save(verification).getToken();
    }

    private Map<String, Object> signupBody(String studentId, String verificationToken) {
        Map<String, Object> body = new HashMap<>();
        body.put("studentId", studentId);
        body.put("name", "홍길동");
        body.put("password", "Abcd1234!");
        body.put("grade", "JUNIOR");
        body.put("college", "IT_ENGINEERING");
        body.put("major", "컴퓨터정보공학부");
        body.put("verificationToken", verificationToken);
        body.put("termsOfServiceAgreed", true);
        body.put("privacyPolicyAgreed", true);
        return body;
    }

    @Test
    @DisplayName("회원가입이 커밋되면 이름·학번·UserId·환경·KST 시간·Octomo 자체 집계가 담긴 USER_REGISTERED 메시지가 Slack 으로 간다 — 전화번호·비밀번호는 없다")
    void signupSendsUserRegisteredMessage() {
        Long userId = given().contentType(ContentType.JSON).body(signupBody("20240001", prepareVerifiedPhone("010-1234-5678")))
                .when().post("/api/v1/auth/signup")
                .then().statusCode(HttpStatus.CREATED.value())
                .extract().jsonPath().getLong("data");

        ArgumentCaptor<String> messageCaptor = ArgumentCaptor.forClass(String.class);
        verify(slackNotifier, timeout(ASYNC_WAIT_MS)).send(messageCaptor.capture());
        String message = messageCaptor.getValue();
        assertThat(message)
                .contains("🟢 신규 회원 가입", "이벤트: USER_REGISTERED", "이름: 홍길동", "학번: 20240001",
                        "UserId: " + userId, "환경: ", " KST", "Octomo 호출(자체 집계, 오늘): ")
                .doesNotContain("010-1234-5678", "01012345678", "Abcd1234!", "이메일", "Bearer ");
    }

    @Test
    @DisplayName("중복 학번 가입(409)은 롤백되므로 Slack 메시지가 추가로 가지 않는다 — 첫 가입 1건만")
    void duplicateSignupDoesNotNotify() {
        given().contentType(ContentType.JSON).body(signupBody("20240001", prepareVerifiedPhone("010-1234-5678")))
                .when().post("/api/v1/auth/signup")
                .then().statusCode(HttpStatus.CREATED.value());
        verify(slackNotifier, timeout(ASYNC_WAIT_MS)).send(anyString());

        given().contentType(ContentType.JSON).body(signupBody("20240001", prepareVerifiedPhone("010-9999-0000")))
                .when().post("/api/v1/auth/signup")
                .then().statusCode(HttpStatus.CONFLICT.value());

        verify(slackNotifier, after(QUIET_WAIT_MS).times(1)).send(anyString());
    }

    @Test
    @DisplayName("이벤트를 발행한 트랜잭션이 롤백되면 리스너는 호출되지 않는다(AFTER_COMMIT)")
    void rolledBackTransactionDoesNotNotify() {
        TransactionTemplate transactionTemplate = new TransactionTemplate(transactionManager);
        transactionTemplate.executeWithoutResult(status -> {
            eventPublisher.publishEvent(new UserRegisteredEvent(1L, "20240001", "홍길동", LocalDateTime.now(clock)));
            status.setRollbackOnly();
        });

        verify(slackNotifier, after(QUIET_WAIT_MS).never()).send(anyString());
    }

    @Test
    @DisplayName("Slack 전송기가 예외를 던져도 회원가입은 201 로 성공하고 사용자는 저장된다 — Slack 장애는 핵심 서비스와 격리된다")
    void slackFailureDoesNotAffectSignup() {
        doThrow(new IllegalStateException("slack down")).when(slackNotifier).send(anyString());

        Long userId = given().contentType(ContentType.JSON).body(signupBody("20240002", prepareVerifiedPhone("010-2222-3333")))
                .when().post("/api/v1/auth/signup")
                .then().statusCode(HttpStatus.CREATED.value())
                .extract().jsonPath().getLong("data");

        assertThat(userRepository.findById(userId)).isPresent();
        verify(slackNotifier, timeout(ASYNC_WAIT_MS)).send(anyString());
    }

    @Test
    @DisplayName("동아리 생성·승인·폐쇄는 각각 CLUB_CREATED·CLUB_STATUS_CHANGED·CLUB_CLOSED 메시지를 낸다")
    void clubLifecycleNotifies() {
        User leader = userRepository.save(UserFixture.unique());
        User admin = userRepository.save(UserFixture.unique());

        Long clubId = clubService.create(new CreateClubCommand(
                "두잉운영동아리", ClubCategory.ACADEMIC, null, "설명", null,
                leader.getId(), false, null, null));
        verify(slackNotifier, timeout(ASYNC_WAIT_MS)).send(contains("이벤트: CLUB_CREATED"));
        verify(slackNotifier, timeout(ASYNC_WAIT_MS)).send(contains("동아리: 두잉운영동아리"));

        clubService.updateStatus(new UpdateClubStatusCommand(clubId, ClubStatus.ACTIVE, null, admin.getId()));
        verify(slackNotifier, timeout(ASYNC_WAIT_MS)).send(contains("상태: PENDING_APPROVAL → ACTIVE"));

        clubService.updateStatus(new UpdateClubStatusCommand(clubId, ClubStatus.INACTIVE, null, admin.getId()));
        verify(slackNotifier, timeout(ASYNC_WAIT_MS)).send(contains("상태: ACTIVE → INACTIVE"));

        clubClosureService.close(new CloseClubCommand(clubId, admin.getId(), "해체"));
        ArgumentCaptor<String> closedCaptor = ArgumentCaptor.forClass(String.class);
        verify(slackNotifier, timeout(ASYNC_WAIT_MS).atLeast(4)).send(closedCaptor.capture());
        assertThat(closedCaptor.getAllValues()).anySatisfy(message ->
                assertThat(message).contains("이벤트: CLUB_CLOSED", "ClubId: " + clubId).doesNotContain("해체"));
    }

    @Test
    @DisplayName("회비 계좌는 최초 등록에만 FEE_ACCOUNT_CREATED 를 내고, 같은 값 재저장·갱신에는 내지 않으며 계좌번호·예금주는 싣지 않는다")
    void feeAccountCreatedNotifiesOnlyOnFirstRegistration() {
        Club club = clubRepository.save(ClubFixture.academic("회비동아리"));
        User leader = userRepository.save(UserFixture.unique());
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        jdbcTemplate.update("UPDATE club SET status = 'ACTIVE' WHERE id = ?", club.getId());

        feeAccountService.upsert(new UpsertFeeAccountCommand(club.getId(), leader.getId(), Bank.KB, "111-222-333333", "홍예금주"));
        ArgumentCaptor<String> messageCaptor = ArgumentCaptor.forClass(String.class);
        verify(slackNotifier, timeout(ASYNC_WAIT_MS)).send(messageCaptor.capture());
        assertThat(messageCaptor.getValue())
                .contains("이벤트: FEE_ACCOUNT_CREATED", "ClubId: " + club.getId(), "은행: KB")
                .doesNotContain("111-222-333333", "홍예금주");

        feeAccountService.upsert(new UpsertFeeAccountCommand(club.getId(), leader.getId(), Bank.KB, "111-222-333333", "홍예금주"));
        feeAccountService.upsert(new UpsertFeeAccountCommand(club.getId(), leader.getId(), Bank.NH, "444-555-666666", "홍예금주"));
        verify(slackNotifier, after(QUIET_WAIT_MS).times(1)).send(anyString());
    }

    @Test
    @DisplayName("관리자 정지·해제·강제 로그아웃은 ADMIN_USER_ACTION 메시지를 내고 사유는 싣지 않는다")
    void adminUserActionsNotify() {
        User admin = userRepository.save(UserFixture.admin());
        User target = userRepository.save(UserFixture.unique());

        adminUserCommandService.changeStatus(new ChangeUserStatusCommand(target.getId(), admin.getId(), UserStatus.SUSPENDED, "욕설 신고 3건"));
        verify(slackNotifier, timeout(ASYNC_WAIT_MS)).send(contains("조치: ACCOUNT_SUSPENDED"));

        adminUserCommandService.changeStatus(new ChangeUserStatusCommand(target.getId(), admin.getId(), UserStatus.ACTIVE, "소명 완료"));
        verify(slackNotifier, timeout(ASYNC_WAIT_MS)).send(contains("조치: ACCOUNT_UNSUSPENDED"));

        userService.forceLogout(new ForceLogoutCommand(target.getId(), admin.getId()));
        ArgumentCaptor<String> messageCaptor = ArgumentCaptor.forClass(String.class);
        verify(slackNotifier, timeout(ASYNC_WAIT_MS).times(3)).send(messageCaptor.capture());
        assertThat(messageCaptor.getAllValues())
                .anySatisfy(message -> assertThat(message).contains("조치: FORCE_LOGOUT", "대상 UserId: " + target.getId()))
                .allSatisfy(message -> assertThat(message).doesNotContain("욕설 신고", "소명 완료"));
    }
}
```

> 구현자 주의: 픽스처는 `UserFixture.unique()`·`UserFixture.admin()`·`ClubFixture.academic(String)` 만 존재한다(확인됨). `ClubCategory.ACADEMIC`·`Bank.KB/NH` 는 실제 상수다. `UserStatus.SUSPENDED` 로 바꾸려면 대상이 ADMIN 이 아니어야 한다(`assertSuspendable`). `adminUserCommandService.changeStatus` 는 `@PreAuthorize` 가 서비스가 아닌 컨트롤러에 있으므로 직접 호출 가능하다 — 만약 서비스에도 보안 애너테이션이 있어 인증 컨텍스트가 필요하면 `AdminForceLogoutControllerTest` 처럼 HTTP 경로로 바꾼다.

- [ ] **Step 2: 실패 확인**

Run: `cd /Users/ksy/orca/workspaces/Duing/cetacean/backend && ./gradlew test --tests "com.duing.global.monitoring.OpsSlackMonitoringIntegrationTest"`
Expected: 테스트 실패 (`verify` 타임아웃 — 아직 발행 지점 없음) 또는 컴파일 오류(픽스처 시그니처) → 픽스처 시그니처 오류면 주석대로 맞춘 뒤 재실행해 "verify 실패" 상태를 확인

- [ ] **Step 3: `GeneralUserService` — 필드·발행 2곳**

import 추가(알파벳 순 위치):
```java
import com.duing.global.monitoring.event.AdminUserActionEvent;
import com.duing.global.monitoring.event.UserRegisteredEvent;
import org.springframework.context.ApplicationEventPublisher;
```
필드 — `private final Clock clock;` 바로 아래(마지막 주입 필드):
```java
    // 운영 Slack 알림용 이벤트 발행 — 커밋 후(AFTER_COMMIT) 비동기로 소비된다(global/monitoring).
    private final ApplicationEventPublisher eventPublisher;
```
`signup` — `phoneVerificationSessionManager.consume(verifiedSession, userId, clientIp, userAgent);` 와 `return userId;` 사이:
```java
        // 운영 모니터링 — 커밋 후 Slack 으로 간다. 이름·학번·UserId 만 싣는다(전화번호·비밀번호 제외).
        eventPublisher.publishEvent(new UserRegisteredEvent(userId, user.getStudentId(), user.getName(), now));
```
`forceLogout` — `adminUserActionLogRepository.save(AdminUserActionLog.of(... AdminUserAction.FORCE_LOGOUT, null));` 바로 아래:
```java
        eventPublisher.publishEvent(new AdminUserActionEvent(
                AdminUserAction.FORCE_LOGOUT, user.getId(), forceLogoutCommand.actorUserId()));
```

- [ ] **Step 4: `GeneralAdminUserCommandService` — 필드·발행**

import 추가: `import com.duing.global.monitoring.event.AdminUserActionEvent;`, `import org.springframework.context.ApplicationEventPublisher;`
필드 — `private final AuthSessionService authSessionService;` 아래:
```java
    private final ApplicationEventPublisher eventPublisher;
```
`changeStatus` — `adminUserActionLogRepository.save(AdminUserActionLog.of(...));` 바로 아래(기존 `log.info` 위):
```java
        // 운영 Slack 알림 — 조치 종류·대상·관리자 id 만(사유 제외). 커밋 후 비동기 소비.
        eventPublisher.publishEvent(new AdminUserActionEvent(action, target.getId(), changeStatusCommand.actorUserId()));
```

- [ ] **Step 5: `GeneralClubService` — 필드·발행 2곳**

import 추가: `import com.duing.global.monitoring.event.ClubCreatedEvent;`, `import com.duing.global.monitoring.event.ClubStatusChangedEvent;`, `import org.springframework.context.ApplicationEventPublisher;`
필드 — `private final Clock clock;` 바로 아래:
```java
    // 운영 Slack 알림용 이벤트 발행 — 커밋 후(AFTER_COMMIT) 비동기로 소비된다(global/monitoring).
    private final ApplicationEventPublisher eventPublisher;
```
`create` — `clubMemberRepository.save(ClubMember.asLeader(savedClub, leader));` 와 `return savedClub.getId();` 사이:
```java
        eventPublisher.publishEvent(new ClubCreatedEvent(savedClub.getId(), savedClub.getName(), leader.getId()));
```
`updateStatus` — `club.changeStatus(...)` 호출 **앞**에 이전 상태를 잡고, 호출 **뒤**(INACTIVE 분기 앞)에 발행:
```java
        ClubStatus previousStatus = club.getStatus();
        club.changeStatus(
                updateClubStatusCommand.status(),
                updateClubStatusCommand.rejectionReason(),
                updateClubStatusCommand.actorUserId()
        );
        // 운영 Slack 알림 — 전이가 검증을 통과한 뒤에만(거절 사유는 싣지 않는다).
        eventPublisher.publishEvent(new ClubStatusChangedEvent(
                club.getId(), club.getName(), previousStatus, updateClubStatusCommand.status(),
                updateClubStatusCommand.actorUserId()));
```

- [ ] **Step 6: `GeneralClubClosureService` — 필드·발행**

import 추가: `import com.duing.global.monitoring.event.ClubClosedEvent;`, `import org.springframework.context.ApplicationEventPublisher;`
필드 — `private final EntityManager entityManager;` 아래:
```java
    private final ApplicationEventPublisher eventPublisher;
```
`close` — `club.validateClosable();` 바로 아래에 이름을 잡아 두고(clear 이후엔 detached 라 안전하게 미리 읽는다):
```java
        String clubName = club.getName();
```
`clubRepository.delete(clubToDelete);` 바로 아래(메서드 끝):
```java
        // 운영 Slack 알림 — soft-delete 까지 커밋된 뒤에만 간다(폐쇄 사유는 싣지 않는다).
        eventPublisher.publishEvent(new ClubClosedEvent(clubId, clubName, actorAdminUserId));
```

- [ ] **Step 7: `GeneralFeeAccountService` — 필드·발행**

import 추가: `import com.duing.global.monitoring.event.FeeAccountCreatedEvent;`, `import org.springframework.context.ApplicationEventPublisher;`
필드 — `private final ClubAuditEventRepository clubAuditEventRepository;` 아래:
```java
    private final ApplicationEventPublisher eventPublisher;
```
`upsert` — `saveAccountAudit(ClubAuditEventType.FEE_ACCOUNT_REGISTERED, command);` 와 `return newAccount.getId();` 사이(갱신 분기에는 넣지 않는다):
```java
        // 운영 Slack 알림 — 최초 등록만. 계좌번호·예금주는 싣지 않는다(은행 코드·id 만).
        eventPublisher.publishEvent(new FeeAccountCreatedEvent(
                command.clubId(), newAccount.getId(), command.bank(), command.actorId()));
```

- [ ] **Step 8: 수동 생성자 테스트 3곳 보정** (각 생성자 호출의 마지막 인자 뒤에 추가)

`SignupPhoneChangeRaceGuardTest` — `Clock.system(ZoneId.of("Asia/Seoul")));` → `Clock.system(ZoneId.of("Asia/Seoul")),` + 다음 줄 `mock(ApplicationEventPublisher.class));` (`import org.springframework.context.ApplicationEventPublisher;` 추가)

`ClubNameRaceGuardTest` — 동일하게 `Clock.system(ZoneId.of("Asia/Seoul")),` + `mock(ApplicationEventPublisher.class));` (import 추가)

`FeeAccountRaceGuardTest` — `bankMatchingAdminService, clubAuditEventRepository);` → `bankMatchingAdminService, clubAuditEventRepository, mock(ApplicationEventPublisher.class));` (import 추가)

- [ ] **Step 9: 통과 확인 (신규 통합 + 보정한 단위 3개)**

Run: `cd /Users/ksy/orca/workspaces/Duing/cetacean/backend && ./gradlew test --tests "com.duing.global.monitoring.OpsSlackMonitoringIntegrationTest" --tests "com.duing.domain.user.service.SignupPhoneChangeRaceGuardTest" --tests "com.duing.domain.club.service.ClubNameRaceGuardTest" --tests "com.duing.domain.fee.service.FeeAccountRaceGuardTest"`
Expected: `BUILD SUCCESSFUL`

- [ ] **Step 10: 발행 지점 도메인 회귀**

Run: `cd /Users/ksy/orca/workspaces/Duing/cetacean/backend && ./gradlew test --tests "com.duing.domain.user.*" --tests "com.duing.domain.club.controller.AdminClubClosureControllerTest" --tests "com.duing.domain.club.controller.AdminClubStatusAndCentralClubControllerTest" --tests "com.duing.domain.fee.FeeAccountControllerTest" --tests "com.duing.domain.fee.FeeAccountConcurrencyTest"`
Expected: `BUILD SUCCESSFUL`

- [ ] **Step 11: 커밋**

```bash
cd /Users/ksy/orca/workspaces/Duing/cetacean
git add backend/src/main/java/com/duing/domain/user/service/GeneralUserService.java backend/src/main/java/com/duing/domain/user/service/GeneralAdminUserCommandService.java backend/src/main/java/com/duing/domain/club/service/GeneralClubService.java backend/src/main/java/com/duing/domain/club/service/GeneralClubClosureService.java backend/src/main/java/com/duing/domain/fee/service/GeneralFeeAccountService.java backend/src/test/java/com/duing/domain/user/service/SignupPhoneChangeRaceGuardTest.java backend/src/test/java/com/duing/domain/club/service/ClubNameRaceGuardTest.java backend/src/test/java/com/duing/domain/fee/service/FeeAccountRaceGuardTest.java backend/src/test/java/com/duing/global/monitoring/OpsSlackMonitoringIntegrationTest.java
git commit -m "feat(backend): 운영 이벤트 발행 — 회원가입·동아리 생성/상태/폐쇄·회비 계좌 최초 등록·관리자 조치 + 장애 격리·롤백·중복 통합 테스트"
```

---

### Task 5: 배포 결과 Slack 스텝 + `deploy/MONITORING.md` + 문서 포인터

**Files:**
- Modify: `.github/workflows/deploy-backend.yml` (`Deploy over SSH` 스텝 뒤)
- Create: `deploy/MONITORING.md`
- Modify: `deploy/UPTIME.md` (알림 정책 섹션에 한 줄)
- Modify: `backend/AGENTS.md` (환경변수 블록에 한 줄)

**Interfaces:** 없음(문서·CI).

- [ ] **Step 1: `deploy-backend.yml` 에 알림 스텝 추가** — `Deploy over SSH` 스텝의 `env:` 블록(`DEPLOY_DIR: ...` 줄) 바로 아래, 같은 `steps:` 들여쓰기로:

```yaml

      # 배포 결과 Slack 알림(성공·실패·취소 모두). GitHub Secret SLACK_WEBHOOK_URL 이 없으면 조용히 생략한다.
      # 서드파티 액션 없이 curl+jq 만 쓴다 — SSH 키를 다루는 잡이라 공급망 표면을 늘리지 않는다.
      # 알림 실패는 배포 결과를 바꾸지 않는다(항상 exit 0). 채널·형식은 deploy/MONITORING.md.
      - name: Notify Slack (deploy result)
        if: always()
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
          JOB_STATUS: ${{ job.status }}
          RELEASE_SHA: ${{ github.sha }}
          RUN_URL: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}
        run: |
          if [ -z "$SLACK_WEBHOOK_URL" ]; then
            echo "SLACK_WEBHOOK_URL 미설정 — 배포 알림 생략"
            exit 0
          fi
          case "$JOB_STATUS" in
            success)   ICON="🚀"; STATUS="SUCCESS" ;;
            cancelled) ICON="⚪"; STATUS="CANCELLED" ;;
            *)         ICON="🔴"; STATUS="FAILURE (헬스 게이트 실패면 직전 이미지로 자동 롤백 시도됨 — 실행 로그 확인)" ;;
          esac
          TEXT="$(printf '%s\n' \
            "${ICON} Deployment" \
            "서비스: Duing" \
            "환경: production" \
            "release: ${RELEASE_SHA}" \
            "status: ${STATUS}" \
            "시간: $(TZ=Asia/Seoul date '+%Y-%m-%d %H:%M') KST" \
            "실행: ${RUN_URL}")"
          PAYLOAD="$(jq -cn --arg text "$TEXT" '{text: $text}')"
          # URL 은 시크릿 — 실패 시에도 에러 본문을 출력하지 않는다.
          if ! curl -sS -o /dev/null --max-time 10 -X POST -H 'Content-Type: application/json' \
               --data "$PAYLOAD" "$SLACK_WEBHOOK_URL" 2>/dev/null; then
            echo "::warning::Slack 배포 알림 전송 실패(배포 결과와 무관)"
          fi
          exit 0
```

- [ ] **Step 2: YAML 문법 검증**

Run: `cd /Users/ksy/orca/workspaces/Duing/cetacean && python3 -c "import yaml,sys; d=yaml.safe_load(open('.github/workflows/deploy-backend.yml')); steps=d['jobs']['deploy']['steps']; print(len(steps), steps[-1]['name'], steps[-1]['if'])"`
Expected: `8 Notify Slack (deploy result) always()` (기존 7 스텝 + 1). `yaml` 모듈이 없으면 `pip3 install pyyaml` 대신 `ruby -ryaml -e 'p YAML.load_file(".github/workflows/deploy-backend.yml")["jobs"]["deploy"]["steps"].last["name"]'` 로 대체.

- [ ] **Step 3: `deploy/MONITORING.md` 작성**

```markdown
# Slack 운영 모니터링 (#duing-monitoring)

> 설계: `docs/superpowers/specs/2026-08-23-slack-ops-monitoring-design.md`. 가용성 모니터·장애 런북은 `UPTIME.md`.

## 역할 분리 — 어디서 무엇을 보나

| 시스템 | 역할 | Slack 으로 오는 것 |
|---|---|---|
| **Sentry** | 예외·스택·릴리스 회귀·장애 분석 | High/Critical 이슈만(Sentry Slack 연동, 아래 수동 설정) |
| **PostHog** | 사용자 행동·pageview (FE 전용) | 없음 |
| **Better Stack** | 가용성(BE health·API·FE·liveness·인증 가드) | 다운/복구 알림(연결 완료) |
| **Slack 채널 자체** | 운영 이벤트·주요 비즈니스 이벤트·배포 결과 | 아래 이벤트 카탈로그 + 배포 |

보내지 않는 것: 일반 API 요청·일반 로그인·pageview·debug 로그·일반 CRUD·모든 4xx·스케줄러 실행 로그·쿼리 로그·5xx 건별 알림.
**Slack 은 로그 집계기가 아니다.** 새 이벤트를 추가할 땐 "운영자가 즉시 알아야 하는가" 를 먼저 묻는다.

## 채널

`#duing-monitoring` 하나로 시작한다(세분화는 소음이 문제가 될 때). Better Stack·Sentry·배포·앱 이벤트 모두 같은 채널.

## 앱 이벤트 카탈로그 (백엔드 `global/monitoring/`)

| 이벤트 | 발생 시점 | 메시지 필드(전부 명시 필드 — 그 외는 구조적으로 없음) |
|---|---|---|
| `USER_REGISTERED` | 회원가입 커밋 | 이름·학번·UserId·환경·가입시간(KST)·**Octomo 호출(자체 집계, 오늘) n / 상한** |
| `CLUB_CREATED` | 동아리 생성 | 동아리명·ClubId·회장 UserId |
| `CLUB_STATUS_CHANGED` | 총동연 승인/거절/운영중단/재개 | 동아리명·ClubId·상태 전이·관리자 UserId (거절 사유 제외) |
| `CLUB_CLOSED` | 총동연 폐쇄 | 동아리명·ClubId·관리자 UserId (사유 제외) |
| `FEE_ACCOUNT_CREATED` | 회비 계좌 **최초** 등록 | ClubId·계좌Id·은행 코드·등록자 UserId (계좌번호·예금주 제외) |
| `ADMIN_USER_ACTION` | 계정 정지/해제/강제 로그아웃 | 조치·대상 UserId·관리자 UserId (사유 제외) |
| `RECRUITMENT_OPENED` | 모집 생성 시점에 이미 오픈 | 동아리명·ClubId·모집 제목·RecruitmentId·마감 |
| `FACILITY_BOOKING_SUBMITTED` / `_CANCELLED`(관리자) / `_CONFLICT` | 시설 예약 | BookingId·ClubId (취소 사유·충돌 상세 제외) |

의도적으로 싣는 개인정보: **이름·학번·UserId**(회원가입). 절대 싣지 않는 것: 이메일(수집 안 함)·전화번호·비밀번호·JWT/refresh/cookie/Authorization·요청 바디·계좌번호·예금주·자유 텍스트 사유.

### Octomo 줄에 대하여
Octomo(octoverse.kr) 는 **잔여 쿼터 조회 API 를 제공하지 않는다**(공개 엔드포인트는 `message/exists`·`qr-code` 둘뿐, 한도 초과는 429 로만 드러남).
메시지의 `Octomo 호출(자체 집계, 오늘): n / 1,000` 은 앱 인메모리 카운터(`MoPollThrottle`, KST 자정 리셋, 재기동 시 0, 단일 인스턴스)의
**우리 쪽 측정값**이다. 벤더 월 쿼터(Free 10,000/월)·잔여량은 Octomo 마이페이지 > 사용량에서만 확인한다.

### 동작 방식·장애 격리
- 발행은 서비스 트랜잭션 안, 수신은 `@TransactionalEventListener(AFTER_COMMIT)` + `@Async("monitoringTaskExecutor")`.
  → 롤백(중복 가입 409 등)이면 아무것도 가지 않고, Slack 지연·실패는 HTTP 응답에 영향이 없다.
- `SlackNotifier`: connect 3s / read 5s. **5xx·429 에만 1회 재시도**(서버 거절 = 미반영 확정), 타임아웃·네트워크 오류는 재시도 안 함(중복 게시 방지).
  최종 실패는 ERROR 로그(스택·URL·응답 바디 없음) → Sentry 이슈 `Slack 운영 알림 전송 실패`.
- 큐(100) 포화 시 알림 폐기 + warn. 알림은 손실 허용, 서비스는 비손실.

## 설정

| 위치 | 키 | 값 |
|---|---|---|
| 서버 `deploy/.env` | `SLACK_WEBHOOK_URL` | Slack Incoming Webhook URL. **prod 는 키 자체가 없으면 부팅 실패(배포 게이트 롤백)**, 빈 값이면 비활성 |
| GitHub Secrets | `SLACK_WEBHOOK_URL` | 배포 결과 알림용(선택 — 없으면 스텝 생략) |
| 로컬 `backend/.env` | `SLACK_WEBHOOK_URL` | 비워 둔다. 운영 webhook 을 로컬에서 쓰지 말 것 |

Webhook 발급: Slack → 앱 디렉터리 "Incoming Webhooks" → 채널 `#duing-monitoring` 선택 → URL 복사.
**릴리스 순서**: ① 서버 `.env` 에 `SLACK_WEBHOOK_URL=...` 추가 → ② GitHub Secret 추가 → ③ develop→main 릴리스. (①을 빼먹으면 새 백엔드가 부팅에 실패하고 직전 이미지로 롤백된다.)

## P0 — Sentry → Slack (수동, 약 5분)

1. Sentry → Settings → Integrations → **Slack** → Add to workspace(OAuth) → 채널 `#duing-monitoring` 허용.
2. Alerts → 프로젝트 `java-spring-boot` 규칙 **"Send a notification for high priority issues"**(id 3609658) → Edit → Actions 에 "Send a Slack notification to #duing-monitoring" 추가(이메일 액션은 유지).
3. (선택) 5xx 급증: Alerts → Create Alert → Metric alert "Number of errors" ≥ 10 / 5 min → Slack 액션.
4. `next-duing`(FE) 도 같은 규칙이 있으면 동일하게 Slack 액션 추가.

Sentry 에 스택트레이스를 Slack 으로 그대로 복제하는 별도 코드는 두지 않는다 — Sentry 알림이 그 역할이다.

## 검증 — 실채널 없이 end-to-end

```bash
# 1) mock webhook — 받은 페이로드를 그대로 찍는다 (MODE=500 이면 5xx 로 응답해 재시도를 본다)
python3 - <<'EOF' &
import json, os
from http.server import BaseHTTPRequestHandler, HTTPServer
MODE = os.environ.get("MODE", "200")
class H(BaseHTTPRequestHandler):
    def do_POST(self):
        body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        print("=== webhook hit ===", flush=True); print(json.loads(body)["text"], flush=True)
        self.send_response(int(MODE)); self.end_headers(); self.wfile.write(b"ok")
    def log_message(self, *a): pass
HTTPServer(("127.0.0.1", 8099), H).serve_forever()
EOF
# 2) 백엔드 기동 시 SLACK_WEBHOOK_URL=http://127.0.0.1:8099/hook 을 주입하고 가입 API 를 한 번 호출한다.
# 3) 터미널에 "🟢 신규 회원 가입 … Octomo 호출(자체 집계, 오늘): n / 1,000" 이 찍히고, 가입 응답은 201 이어야 한다.
#    MODE=500 으로 다시 돌리면 webhook hit 이 정확히 2번 찍히고(1회 재시도) 가입은 여전히 201, 백엔드 로그에 ERROR 1줄.
```

실채널 확인은 위 2) 의 URL 만 진짜 webhook 으로 바꿔 같은 절차로 한다(로컬 서버·테스트 학번 — 운영 DB 에 가입 데이터를 만들지 않는다).

## 런북 — Slack 알림이 안 올 때

1. 서비스 영향은 없다(격리 설계). 급하지 않다.
2. Sentry 에 `Slack 운영 알림 전송 실패 — reason=HTTP_4xx/5xx/…` 이슈가 있으면: 4xx(특히 404/410) = webhook 폐기됨 → 재발급 후 `.env` 교체·재기동. 5xx/타임아웃 = Slack 측 장애, 자연 복구.
3. 이슈가 없고 조용하면: 서버 `.env` 의 `SLACK_WEBHOOK_URL` 이 비어 있는지(비활성), 컨테이너 기동 로그에 `Slack 운영 알림 비활성` debug 가 있는지 확인.
```

- [ ] **Step 4: `deploy/UPTIME.md` 알림 정책 섹션에 포인터 1줄** — `- SSL 만료 감시(제공 시 활성): ...` 줄 바로 아래:

```markdown
- **앱 운영 이벤트(회원가입·동아리·회비·시설·관리자 조치)와 배포 결과**도 같은 Slack 채널로 온다 — 백엔드 `global/monitoring/` + `deploy-backend.yml` 알림 스텝, 설정·카탈로그·검증 절차는 [`MONITORING.md`](./MONITORING.md).
```

- [ ] **Step 5: `backend/AGENTS.md` 환경변수 블록** — `SENTRY_*`/모니터링 관련 줄이 없으므로 `# 로컬 전용` 블록 위, `# DUING_AUTH_* ...` 주석 줄 아래에 추가:

```bash
SLACK_WEBHOOK_URL=                     # 운영 Slack 알림(Incoming Webhook). 로컬은 비움=비활성, prod 는 키 필수(빈 값=의도적 비활성). deploy/MONITORING.md
```

- [ ] **Step 6: 마크다운·워크플로 변경이 백엔드 빌드에 영향 없는지 확인(컴파일만)**

Run: `cd /Users/ksy/orca/workspaces/Duing/cetacean/backend && ./gradlew compileJava compileTestJava`
Expected: `BUILD SUCCESSFUL`

- [ ] **Step 7: 커밋**

```bash
cd /Users/ksy/orca/workspaces/Duing/cetacean
git add .github/workflows/deploy-backend.yml deploy/MONITORING.md deploy/UPTIME.md backend/AGENTS.md
git commit -m "ci: 백엔드 배포 결과 Slack 알림 스텝 + 운영 모니터링 문서(역할 분리·이벤트 카탈로그·Sentry 연동 절차·검증)"
```

---

### Task 6: 전체 검증 (컨트롤러가 직접 — 구현 subagent 대상 아님)

- [ ] 백엔드 전체: `cd /Users/ksy/orca/workspaces/Duing/cetacean/backend && ./gradlew test > /tmp/duing-test.log 2>&1; grep -E "BUILD (SUCCESSFUL|FAILED)|tests completed|FAILED" /tmp/duing-test.log | tail -5` → `BUILD SUCCESSFUL`
- [ ] 로컬 E2E: 임시 Postgres 컨테이너 + `SPRING_PROFILES_ACTIVE=local` + `MO_PROVIDER=stub` + `MO_STUB_AUTO_VERIFY_AFTER_SECONDS=1` + `SLACK_WEBHOOK_URL=http://127.0.0.1:8099/hook` 로 기동 → MO 세션 발급·상태조회·가입 → mock webhook 에 USER_REGISTERED 페이로드 수신(필드·PII 부재·Octomo 줄 n≥1) · `MODE=500` 재시도 2회·가입 201 확인.
- [ ] PR 직전 self-check 7항목(컴파일/테스트/변경범위/타 영역 영향/리뷰 완료/attribution 없음/EOF newline).

## Out of Scope (이번 범위에서 제외 — 보고만)

- Octomo 벤더 월 쿼터·잔여 호출(API 미제공)·월 누적 영속 카운터·Redis 카운터.
- 백엔드 5xx 건별 Slack 알림·Sentry 스택 복제·Sentry Slack 연동 설치/규칙 변경(수동 운영 작업)·Better Stack 변경.
- 동아리 측 시설 예약 취소 이벤트, 모집 마감/접수중단/강제마감, 회비 이상(VOID 등), 관리자 메모/전화 열람, 중앙동아리 플래그 — publish 한 줄 + 포매터 한 메서드로 추가 가능.
- 프론트(Vercel) 배포 알림, 채널 세분화, Block Kit, outbox/큐, 멀티 인스턴스 중복 방지.
