# 지원서 자유서술 답변 보관·파기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 회원 탈퇴 45일·모집 마감 6개월이 지난 지원서의 자유서술(TEXT) 답변과 미제출 초안을 기존 `PiiRetentionJob` 이 매일 파기하고, 질문 빌더·지원 폼에 수집 최소화 안내를 붙이며, 처리방침에 6개월 조항을 반영한다.

**Architecture:** 새 잡·테이블·Config 없이 `RetentionProperties` 에 두 번째 보관기간(`applicationAnswerWindow`)을 추가하고, `PiiRetentionJob.run()` 의 단일 트랜잭션에 native UPDATE(`ApplicationRepository.purgeExpiredTextAnswers`)와 native DELETE(`ApplicationDraftRepository.deleteExpired`)를 넣는다. 멱등성·파기 기록은 V126 의 `application.answers_purged_at`(엔티티 미매핑) 한 컬럼이 맡는다. 같은 잡의 system regime cutoff 를 `TimeMapper.systemNow(clock)` 으로 정정한다. 프론트는 힌트 문구 2줄과 처리방침 1항목만 바꾼다.

**Tech Stack:** Spring Boot 3.4 / Java 21 / Spring Data JPA native `@Query` / Flyway / Testcontainers PostgreSQL 16 / Mockito / Next.js 15 + React 19 / vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-07-application-answer-retention-design.md` — 각 태스크는 스펙의 §번호를 인용한다. 구현자는 스펙을 먼저 읽는다.

## Global Constraints

- 브랜치 `feat/application-answer-retention`(이 워크트리에 체크아웃됨, base develop `b717d625`). **push·PR 생성·머지는 절대 하지 마라** — 컨트롤러가 리뷰 후 수행한다(Task 6).
- 백엔드 빌드/테스트는 반드시 `cd /Users/ksy/orca/workspaces/Duing/hagfish/backend && ./gradlew …` 로 실행(루트에 gradlew 없음). 파이프 `| tail`·`| head` 금지 — exit code 를 가린다. 통합 테스트는 Docker 필요.
- 프론트 테스트는 `cd /Users/ksy/orca/workspaces/Duing/hagfish/frontend/apps/web && pnpm exec vitest run <파일>`; 태스크 완료 전 `cd /Users/ksy/orca/workspaces/Duing/hagfish/frontend && pnpm typecheck && pnpm lint` 셋 다 GREEN(vitest 는 테스트 파일 TS 오류를 잡지 못한다).
- 커밋 메시지: Conventional Commits + 한국어, `feat(backend): 대상 — 변경점` 명사구. **Co-Authored-By / 🤖 Generated / Claude-Session 라인 절대 금지.**
- Flyway: 기존 파일 수정 금지. 새 파일은 `V126__application_answers_purged_at.sql` 하나(V125 는 다른 워크트리가 사용 중). 컬럼 삭제·`SET NOT NULL`·`DROP DEFAULT` 없음.
- 변수명 축약 금지(`dto`/`r`/`e` 등 — 단, SQL 별칭 `a`/`r`/`u` 는 스펙 §3.2 의 검증된 문장 그대로 허용). 모든 새 문자열 상수는 아래 값 그대로:
  - placeholder `"(보관기간 경과로 파기되었습니다)"` (`PiiRetentionJob.ANSWER_PURGED_PLACEHOLDER`, package-private static final)
  - 설정 키 `duing.privacy.retention.application-answer-window`, env `DUING_PII_APPLICATION_ANSWER_WINDOW`, 기본값 `P6M`
  - 질문 빌더 힌트 `학번·전화번호 등 개인정보는 지원자 프로필에서 확인할 수 있으니 질문으로 요청하지 않는 것을 권장합니다.`
  - 지원 폼 힌트 `학번·전화번호 등 개인정보는 꼭 필요한 경우에만 입력해주세요.`
  - 처리방침 상수 `APPLICATION_ANSWER_RETENTION_PERIOD = '모집 종료 후 6개월'`, `EFFECTIVE_DATE = '2026-09-21'`(다음 정기 릴리스 예정일 — 릴리스일이 바뀌면 릴리스 PR 에서 맞춘다)
  - 크론 `"0 30 4 * * *"` zone `Asia/Seoul` 불변, `PHONE_VERIFICATION_RETENTION = Period.ofDays(1)` 불변
- **건드리지 않는 것**: `ApplicationRepository.scrubExpiredApplicationAnswers`, `ApplicationDraftRepository.deleteByUserIdAndRecruitmentId`/`deleteAllByRecruitmentId`, `GeneralApplicationService`, `GeneralApplicationDraftService`, `Recruitment`/`RecruitmentStatus`(상태 자동 전이 금지), `Application` 엔티티(`answers_purged_at` 매핑 금지), FE 지원서 상세 3화면.
- 타임존: 유일한 Clock 빈은 `seoulClock`(Asia/Seoul), prod JVM 은 UTC, 로컬·CI JVM 은 KST, Testcontainers Postgres 는 UTC. system regime 컬럼(`users.deleted_at`·`application.deleted_at`·`phone_verification_events.created_at`) 경계는 `TimeMapper.systemNow(clock)`, seoul regime 컬럼(`phone_verifications.expires_at`·`recruitment.closed_at`)·KST DATE(`recruitment.end_date`) 경계는 `LocalDateTime.now(clock)`/`LocalDate.now(clock)`. 무클럭 `LocalDateTime.now()` 신규 도입 금지(`ClocklessNowGuardTest`).
- 통합 테스트는 상대 날짜만 쓰고(절대 날짜 금지), DB `NOW()`(UTC) 와 JVM(KST) 의 최대 9시간 차이를 흡수하는 **넉넉한 마진**(탈퇴 400일 vs 10일 — 테스트 클래스가 `window=P1Y` 로 오버라이드함, 마감 210일 vs 30일)을 쓴다. 정확한 경계는 단위 테스트(`PiiRetentionJobCutoffTest`)가 맡는다.
- 테스트 표시명은 요구사항 문장(`@DisplayName`)이고 메서드명은 영문 camelCase. 통합 테스트는 `@Import(TestcontainersConfiguration.class) @SpringBootTest` + `IntegrationTestBase`(매 테스트 전 전 테이블 TRUNCATE).
- 새 `private final` 필드는 **마지막**에 추가한다 — `@RequiredArgsConstructor` 인자 순서가 바뀌면 수동 `new` 하는 테스트가 깨진다.
- 파일 끝 개행 필수. 프론트는 prettier(printWidth 100, singleQuote) 준수.

---

## File Structure

| 경로 | 책임 |
|---|---|
| `backend/src/main/resources/db/migration/V126__application_answers_purged_at.sql` | 파기 마커 컬럼(expand-only) |
| `backend/src/main/java/com/duing/global/privacy/RetentionProperties.java` | `applicationAnswerWindow` 추가 |
| `backend/src/main/java/com/duing/global/privacy/PiiRetentionJob.java` | cutoff 정정(systemNow) · 오설정 가드 확장 · purge/draft 호출 · 로그 |
| `backend/src/main/java/com/duing/domain/application/repository/ApplicationRepository.java` | `purgeExpiredTextAnswers` native UPDATE |
| `backend/src/main/java/com/duing/domain/draft/repository/ApplicationDraftRepository.java` | `deleteExpired` native DELETE |
| `backend/src/main/resources/application.yml` · `backend/src/test/resources/application.yml` | `application-answer-window` |
| `backend/src/test/java/com/duing/global/privacy/PiiRetentionJobCutoffTest.java` | (신규) 타임존 경계 단위 테스트 |
| `backend/src/test/java/com/duing/global/privacy/PiiRetentionJobTest.java` | 통합 테스트 확장(지원서·초안) |
| `frontend/apps/web/app/manage/clubs/[clubId]/recruitments/_components/RecruitmentForm.tsx` | 질문 빌더 섹션 힌트 |
| `frontend/apps/web/app/apply/[recruitmentId]/_components/ApplyAnswersStep.tsx` | 지원 폼 힌트(주관식 있을 때만) |
| `frontend/apps/web/test/manage/recruitment-form.test.tsx` · `frontend/apps/web/test/apply/apply-page.test.tsx` | 힌트 단언 |
| `frontend/apps/web/app/terms/page.tsx` | 3조 항목 + 상수 + 시행일 |

---

### Task 1: 설정 확장 + V126 + system regime cutoff 정정 (스펙 §2·§3.1·§4)

**Files:**
- Create: `backend/src/main/resources/db/migration/V126__application_answers_purged_at.sql`
- Modify: `backend/src/main/java/com/duing/global/privacy/RetentionProperties.java`
- Modify: `backend/src/main/java/com/duing/global/privacy/PiiRetentionJob.java`
- Modify: `backend/src/main/resources/application.yml` (`duing.privacy.retention` 블록, 220~225행 부근)
- Modify: `backend/src/test/resources/application.yml` (`privacy.retention` 블록, 116~119행 부근)
- Modify: `backend/src/test/java/com/duing/global/privacy/PiiRetentionJobTest.java` (`new RetentionProperties(...)` 2곳)
- Test: `backend/src/test/java/com/duing/global/privacy/PiiRetentionJobCutoffTest.java` (신규)

**Interfaces:**
- Produces: `RetentionProperties(boolean enabled, Period window, Period applicationAnswerWindow)`; `PiiRetentionJob(RetentionProperties, Clock, UserRepository, ApplicationRepository, PhoneVerificationRepository, PhoneVerificationEventRepository)` (Task 3 에서 마지막 인자 하나 추가); `run()` 내부 지역변수 `withdrawnCutoff`(system)·`phoneVerificationCutoff`(seoul)·`closedCutoffDate`(KST LocalDate — Task 2 가 소비).

- [ ] **Step 1: 실패하는 단위 테스트 작성**

`backend/src/test/java/com/duing/global/privacy/PiiRetentionJobCutoffTest.java`:

```java
package com.duing.global.privacy;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.user.repository.PhoneVerificationEventRepository;
import com.duing.domain.user.repository.PhoneVerificationRepository;
import com.duing.domain.user.repository.UserRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.Period;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.TimeZone;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * cutoff 의 타임존 regime 을 고정한다(스펙 §3.1·§8.2). 드리프트는 JVM 기본 존이 KST 가 아닐 때만 드러나므로
 * 각 테스트가 기본 존을 UTC 로 잠시 바꾼다(테스트 JVM 은 순차 실행, 종료 시 복원). Clock 은 항상 seoulClock 과 같은 존.
 */
@ExtendWith(MockitoExtension.class)
class PiiRetentionJobCutoffTest {

    /** UTC 2026-09-07 20:00 = KST 2026-09-08 05:00 — 날짜와 시각이 존에 따라 갈리는 순간. */
    private static final Instant NOW = Instant.parse("2026-09-07T20:00:00Z");
    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private static final Clock SEOUL_CLOCK = Clock.fixed(NOW, SEOUL);

    @Mock UserRepository userRepository;
    @Mock ApplicationRepository applicationRepository;
    @Mock PhoneVerificationRepository phoneVerificationRepository;
    @Mock PhoneVerificationEventRepository phoneVerificationEventRepository;

    private TimeZone originalDefaultZone;

    @BeforeEach
    void rememberDefaultZone() {
        originalDefaultZone = TimeZone.getDefault();
    }

    @AfterEach
    void restoreDefaultZone() {
        TimeZone.setDefault(originalDefaultZone);
    }

    private PiiRetentionJob job(Period window, Period applicationAnswerWindow) {
        return new PiiRetentionJob(
                new RetentionProperties(true, window, applicationAnswerWindow),
                SEOUL_CLOCK, userRepository, applicationRepository,
                phoneVerificationRepository, phoneVerificationEventRepository);
    }

    @Test
    @DisplayName("탈퇴 45일 cutoff 는 JVM 기본 존이 UTC 여도 KST 벽시계가 아니라 저장 존(UTC) 벽시계로 계산된다")
    void withdrawnCutoffUsesSystemWallClock() {
        TimeZone.setDefault(TimeZone.getTimeZone("UTC"));

        job(Period.ofDays(45), Period.ofMonths(6)).run();

        // 저장 존(UTC) 벽시계 2026-09-07T20:00 - 45일. KST 벽시계(09-08T05:00)로 계산했다면 9시간 늦은 값이 된다.
        LocalDateTime expected = LocalDateTime.ofInstant(NOW, ZoneOffset.UTC).minusDays(45);
        verify(userRepository).anonymizeExpiredUsers(expected);
        verify(applicationRepository).scrubExpiredApplicationAnswers(expected);
        verify(phoneVerificationEventRepository).deleteExpiredEvents(expected);
    }

    @Test
    @DisplayName("MO 세션 1일 유예 cutoff 는 seoul regime 컬럼과 비교하므로 JVM 기본 존이 UTC 여도 KST 벽시계로 유지된다")
    void phoneVerificationCutoffStaysSeoulWallClock() {
        TimeZone.setDefault(TimeZone.getTimeZone("UTC"));

        job(Period.ofDays(45), Period.ofMonths(6)).run();

        // expires_at 은 발급 시 now(seoulClock) 으로 기록됐다 — KST 벽시계 2026-09-08T05:00 - 1일.
        LocalDateTime expected = LocalDateTime.ofInstant(NOW, SEOUL).minusDays(1);
        verify(phoneVerificationRepository).deleteExpiredVerifications(expected);
    }

    @Test
    @DisplayName("두 보관기간 중 하나라도 0/음수면 어떤 리포지토리도 호출하지 않는다 (오설정 안전장치)")
    void skipsEverythingWhenAnyWindowNonPositive() {
        job(Period.ofDays(45), Period.ZERO).run();
        job(Period.ZERO, Period.ofMonths(6)).run();

        verifyNoInteractions(userRepository, applicationRepository,
                phoneVerificationRepository, phoneVerificationEventRepository);
    }
}
```

- [ ] **Step 2: 실패 확인**

Run: `cd /Users/ksy/orca/workspaces/Duing/hagfish/backend && ./gradlew compileTestJava`
Expected: FAIL — `RetentionProperties` 생성자 인자 3개 없음(컴파일 오류).

- [ ] **Step 3: V126 마이그레이션**

`backend/src/main/resources/db/migration/V126__application_answers_purged_at.sql`:

```sql
-- 지원서 자유서술 답변 파기 마커(docs/superpowers/specs/2026-09-07-application-answer-retention-design.md §2).
-- NULL = 미파기, NOT NULL = PiiRetentionJob 이 보관기간(탈퇴 45일·모집 마감 6개월) 경과로 처리한 시각.
-- DB NOW() 로 기록해 users.anonymized_at 과 같은 regime 이며, 멱등 가드(재UPDATE 방지) 겸 파기 기록이다.
-- 엔티티(Application)에는 매핑하지 않는다 — 잡의 native SQL 만 읽고 쓰고 API 에 노출하지 않는다.
-- nullable·DEFAULT 없음(expand-only)이라 구 이미지·롤백에 안전하다.
ALTER TABLE application ADD COLUMN answers_purged_at TIMESTAMP;
COMMENT ON COLUMN application.answers_purged_at IS '자유서술 답변 파기 시각(PiiRetentionJob). NULL 이면 미파기. 멱등 가드 겸 파기 기록';
```

- [ ] **Step 4: RetentionProperties 확장**

`backend/src/main/java/com/duing/global/privacy/RetentionProperties.java` 전체:

```java
package com.duing.global.privacy;

import jakarta.validation.constraints.NotNull;
import java.time.Period;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/**
 * PII 보관기간 파기 잡 설정.
 *
 * <p>{@code enabled} 기본 비활성 — 법무/내부 방침으로 보관기간을 확정한 뒤 운영에서 켠다. 보관기간은 {@link Period}
 * (예: {@code P45D}, {@code P6M})로 환경변수 주입하며, 코드에 하드코딩하지 않는다.
 *
 * <ul>
 *   <li>{@code window} — 회원 탈퇴(soft-delete) 후 PII 보관기간. 사용자 비식별화, soft-delete 지원서 답변 비우기,
 *       탈퇴 회원의 지원서 자유서술 답변·미제출 초안 파기, MO 인증 감사 이벤트 삭제에 쓴다.</li>
 *   <li>{@code applicationAnswerWindow} — 모집 마감({@code LEAST(closed_at::date, end_date)}) 후 지원서 자유서술
 *       답변·미제출 초안 보관기간. 개인정보 처리방침 3조 "모집 종료 후 6개월" 과 일치시킨다.</li>
 * </ul>
 */
@Validated
@ConfigurationProperties(prefix = "duing.privacy.retention")
public record RetentionProperties(boolean enabled,
                                  @NotNull Period window,
                                  @NotNull Period applicationAnswerWindow) {
}
```

- [ ] **Step 5: yml 두 곳**

`backend/src/main/resources/application.yml` — 기존 블록

```yaml
  privacy:
    retention:
      # 탈퇴/폐쇄로 soft-delete 된 PII 의 보관기간 = 45일(P45D). 이후 파기 잡이 비식별화/삭제한다.
      # 기본 비활성 — 운영에서 DUING_PII_RETENTION_ENABLED=true 주입 시 활성화(개인정보 처리방침의 45일 보관과 일치).
      enabled: ${DUING_PII_RETENTION_ENABLED:false}
      window: ${DUING_PII_RETENTION_WINDOW:P45D}
```

을 아래로 교체(마지막 두 줄 추가):

```yaml
  privacy:
    retention:
      # 탈퇴/폐쇄로 soft-delete 된 PII 의 보관기간 = 45일(P45D). 이후 파기 잡이 비식별화/삭제한다.
      # 기본 비활성 — 운영에서 DUING_PII_RETENTION_ENABLED=true 주입 시 활성화(개인정보 처리방침의 45일 보관과 일치).
      enabled: ${DUING_PII_RETENTION_ENABLED:false}
      window: ${DUING_PII_RETENTION_WINDOW:P45D}
      # 모집 마감(LEAST(closed_at, end_date)) 후 지원서 자유서술 답변·미제출 초안 보관기간 = 6개월(P6M).
      # 개인정보 처리방침 3조 "모집 종료 후 6개월" 과 일치. 탈퇴 45일(window)과 같은 잡(PiiRetentionJob)이 처리한다.
      application-answer-window: ${DUING_PII_APPLICATION_ANSWER_WINDOW:P6M}
```

`backend/src/test/resources/application.yml` — 기존

```yaml
  privacy:
    retention:
      enabled: false
      window: P1Y
```

을

```yaml
  privacy:
    retention:
      enabled: false
      window: P1Y
      application-answer-window: P6M
```

으로. `application-prod.yml` 은 변경하지 않는다(`enabled` 만 오버라이드 중, window 는 base 기본값).

- [ ] **Step 6: PiiRetentionJob — cutoff 정정 + 가드 확장**

`backend/src/main/java/com/duing/global/privacy/PiiRetentionJob.java` 전체:

```java
package com.duing.global.privacy;

import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.user.repository.PhoneVerificationEventRepository;
import com.duing.domain.user.repository.PhoneVerificationRepository;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.time.TimeMapper;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.Period;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * PIPA 제21조(보관기간 종료 시 지체없는 파기) 대응 — 보관기간(window)을 넘긴 개인정보를 비식별화/삭제하는 스케줄 잡.
 *
 * <p>기본 비활성(enabled=false)이며 보관기간은 환경변수로 주입한다. 실제 보관기간은 법무/내부 방침
 * 확정 후 운영에서 활성화한다(코드에 하드코딩하지 않음).
 *
 * <p>네이티브 벌크 쿼리를 쓰는 이유: 대상이 soft-delete 된 행(@SQLRestriction 으로 JPA 가 못 보는 행)이라
 * JPQL 로는 접근할 수 없다. 사용자/지원서의 PII 컬럼은 비식별화하여(append-only 감사 로그·FK 무결성 보존)
 * PIPA 파기 의무를 만족시킨다.
 *
 * <p>cutoff 의 타임존 regime(TIMEZONE.md): users.deleted_at·application.deleted_at·phone_verification_events.created_at
 * 은 system regime(JPA 감사·DB NOW(), prod 는 UTC)이라 {@link TimeMapper#systemNow(Clock)} 로 경계를 만든다.
 * phone_verifications.expires_at 은 발급 시 now(seoulClock) 으로 기록된 seoul regime 이라 KST 벽시계 그대로 비교한다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class PiiRetentionJob {

    /** MO 인증 세션은 단명 데이터 — 만료 후 1일이면 파기한다 (보관기간 window 와 별도, spec §9.4). */
    private static final Period PHONE_VERIFICATION_RETENTION = Period.ofDays(1);

    private final RetentionProperties properties;
    private final Clock clock;
    private final UserRepository userRepository;
    private final ApplicationRepository applicationRepository;
    private final PhoneVerificationRepository phoneVerificationRepository;
    private final PhoneVerificationEventRepository phoneVerificationEventRepository;

    @Scheduled(cron = "0 30 4 * * *", zone = "Asia/Seoul")
    @Transactional
    public void run() {
        if (!properties.enabled()) {
            return;
        }
        Period window = properties.window();
        Period applicationAnswerWindow = properties.applicationAnswerWindow();
        if (isNonPositive(window) || isNonPositive(applicationAnswerWindow)) {
            // 보관기간이 0/음수면 활성 직후 삭제된 데이터(심하면 미래 cutoff 로 모든 soft-delete 행)까지
            // 즉시 파기되는 비가역 사고가 난다 — 오설정 시 실행하지 않고 안전하게 건너뛴다. 부분 실행도 하지 않는다.
            log.error("[PII 보관기간 파기] 보관기간(window={}, applicationAnswerWindow={})이 유효하지 않아 실행을 건너뜁니다.",
                    window, applicationAnswerWindow);
            return;
        }
        // 저장 존 벽시계 경계 — seoulClock 의 벽시계를 그대로 쓰면 prod(JVM=UTC)에서 45일이 9시간 이르게 끝난다.
        LocalDateTime withdrawnCutoff = TimeMapper.systemNow(clock).minus(window);
        // seoul regime 컬럼(expires_at) 경계 — KST 벽시계 그대로.
        LocalDateTime phoneVerificationCutoff = LocalDateTime.now(clock).minus(PHONE_VERIFICATION_RETENTION);
        // 마감 앵커(recruitment.closed_at 은 seoul 벽시계, end_date 는 KST 날짜)와 비교하는 KST "오늘" 기준 날짜.
        LocalDate closedCutoffDate = LocalDate.now(clock).minus(applicationAnswerWindow);

        int anonymizedUsers = userRepository.anonymizeExpiredUsers(withdrawnCutoff);
        int scrubbedApplications = applicationRepository.scrubExpiredApplicationAnswers(withdrawnCutoff);
        int deletedPhoneVerifications = phoneVerificationRepository.deleteExpiredVerifications(phoneVerificationCutoff);
        int deletedPhoneVerificationEvents = phoneVerificationEventRepository.deleteExpiredEvents(withdrawnCutoff);
        log.info("[PII 보관기간 파기] usersAnonymized={}, applicationsScrubbed={}, "
                        + "phoneVerificationsDeleted={}, phoneVerificationEventsDeleted={}, "
                        + "withdrawnCutoff={}, closedCutoffDate={}",
                anonymizedUsers, scrubbedApplications,
                deletedPhoneVerifications, deletedPhoneVerificationEvents, withdrawnCutoff, closedCutoffDate);
    }

    private static boolean isNonPositive(Period period) {
        return period.isZero() || period.isNegative();
    }
}
```

(`closedCutoffDate` 는 이 태스크에서 로그에만 쓰이고 Task 2 가 소비한다.)

- [ ] **Step 7: 기존 통합 테스트의 수동 생성자 2곳 갱신**

`PiiRetentionJobTest.java` 의 `noopWhenDisabled` 와 `noopWhenWindowNonPositive` 에서

```java
                new RetentionProperties(false, Period.ofYears(1)),
```
→
```java
                new RetentionProperties(false, Period.ofYears(1), Period.ofMonths(6)),
```
```java
                new RetentionProperties(true, Period.ZERO),
```
→
```java
                new RetentionProperties(true, Period.ZERO, Period.ofMonths(6)),
```

- [ ] **Step 8: 단위 + 통합 테스트 통과 확인**

Run: `cd /Users/ksy/orca/workspaces/Duing/hagfish/backend && ./gradlew test --tests 'com.duing.global.privacy.*' --tests 'com.duing.global.MigrationExpandContractGuardTest' --tests 'com.duing.global.ClocklessNowGuardTest'`
Expected: BUILD SUCCESSFUL. `PiiRetentionJobCutoffTest` 3건, `PiiRetentionJobTest` 기존 11건, `PrivacyRetentionSchedulingWiringTest` 전부 PASS. (KST JVM 에서 기존 통합 테스트 결과는 정정 전후 동일하다 — 스펙 §3.1.)

- [ ] **Step 9: 커밋**

```bash
cd /Users/ksy/orca/workspaces/Duing/hagfish
git add backend/src/main/resources/db/migration/V126__application_answers_purged_at.sql \
        backend/src/main/java/com/duing/global/privacy/RetentionProperties.java \
        backend/src/main/java/com/duing/global/privacy/PiiRetentionJob.java \
        backend/src/main/resources/application.yml backend/src/test/resources/application.yml \
        backend/src/test/java/com/duing/global/privacy/PiiRetentionJobTest.java \
        backend/src/test/java/com/duing/global/privacy/PiiRetentionJobCutoffTest.java
git commit -m "feat(backend): PII 파기 잡 — 마감 보관기간 설정(P6M)·answers_purged_at(V126) 추가, 탈퇴 45일 cutoff 를 저장 존 벽시계(systemNow)로 정정"
```

---

### Task 2: 지원서 TEXT 답변 파기 — `purgeExpiredTextAnswers` (스펙 §3.2·§3.4·§8.1)

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/application/repository/ApplicationRepository.java` (`scrubExpiredApplicationAnswers` 바로 뒤)
- Modify: `backend/src/main/java/com/duing/global/privacy/PiiRetentionJob.java` (상수·호출·로그)
- Modify: `backend/src/test/java/com/duing/global/privacy/PiiRetentionJobCutoffTest.java` (케이스 1개 추가)
- Test: `backend/src/test/java/com/duing/global/privacy/PiiRetentionJobTest.java` (지원서 케이스 11개 + 픽스처 헬퍼)

**Interfaces:**
- Consumes: Task 1 의 `closedCutoffDate`·`withdrawnCutoff`, V126 컬럼.
- Produces: `int ApplicationRepository.purgeExpiredTextAnswers(LocalDate closedCutoffDate, LocalDateTime withdrawnCutoff, String placeholder)`; `PiiRetentionJob.ANSWER_PURGED_PLACEHOLDER`(package-private `static final String`).

- [ ] **Step 1: 통합 테스트 픽스처 + 11 케이스 작성**

`PiiRetentionJobTest.java` — import 추가:

```java
import com.duing.domain.recruitment.entity.QuestionChoice;
import com.duing.domain.recruitment.entity.QuestionType;
import com.duing.domain.recruitment.entity.RecruitmentForm;
import com.duing.domain.recruitment.entity.RecruitmentQuestion;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
```

필드 추가(`@Autowired JdbcTemplate jdbcTemplate;` 아래):

```java
    @Autowired ObjectMapper objectMapper;

    /** 자유서술 칸에 실제로 적히는 형태 — 이름·학번·번호. 파기 여부를 이 값으로 판정한다. */
    private static final String TEXT_ANSWER = "홍길동 20231234 010-1234-5678";
```

헬퍼(기존 `softDeleteDaysAgo` 아래에 추가):

```java
    /** TEXT·단일선택·복수선택 질문을 가진 모집 — 파기 대상(TEXT)과 유지 대상(선택형)을 한 지원서에서 함께 검증한다. */
    private RecruitmentFixture saveRecruitmentWithForm(LocalDate endDate) throws Exception {
        Club club = saveActiveClub("보관동아리");
        Recruitment recruitment = Recruitment.create(club, "보관모집", null, LocalDate.now().minusDays(30), endDate, 10);
        RecruitmentQuestion textQuestion = RecruitmentQuestion.createText("자기소개");
        RecruitmentQuestion singleQuestion = RecruitmentQuestion.create("학년", QuestionType.SINGLE_CHOICE, true,
                List.of(QuestionChoice.create("1학년"), QuestionChoice.create("2학년")));
        RecruitmentQuestion multiQuestion = RecruitmentQuestion.create("관심 분야", QuestionType.MULTIPLE_CHOICE, false,
                List.of(QuestionChoice.create("프론트"), QuestionChoice.create("백엔드")));
        recruitment.attachForm(RecruitmentForm.create(recruitment, List.of(textQuestion, singleQuestion, multiQuestion)));
        return new RecruitmentFixture(recruitmentRepository.save(recruitment), textQuestion, singleQuestion, multiQuestion);
    }

    private record RecruitmentFixture(Recruitment recruitment, RecruitmentQuestion text,
                                      RecruitmentQuestion single, RecruitmentQuestion multi) {
        Long id() {
            return recruitment.getId();
        }

        String singleChoiceId() {
            return single.choices().get(0).id();
        }

        List<String> multiChoiceIds() {
            return List.of(multi.choices().get(0).id(), multi.choices().get(1).id());
        }
    }

    /** TEXT 에 개인정보, 선택형 두 개에 choiceId 를 채운 지원서. */
    private Application saveApplication(RecruitmentFixture fixture, User applicant) {
        return applicationRepository.save(Application.submit(fixture.recruitment(), applicant, List.of(
                new ApplicationAnswer(fixture.text().id(), List.of(TEXT_ANSWER)),
                new ApplicationAnswer(fixture.single().id(), List.of(fixture.singleChoiceId())),
                new ApplicationAnswer(fixture.multi().id(), fixture.multiChoiceIds()))));
    }

    /** 수동 마감: status=CLOSED + closed_at = N일 전 (seoul 벽시계 컬럼이지만 마진이 커서 DB NOW() 로 충분). */
    private void closeDaysAgo(Long recruitmentId, int days) {
        jdbcTemplate.update(
                "UPDATE recruitment SET status = 'CLOSED', closed_at = NOW() - (? * INTERVAL '1 day') WHERE id = ?",
                days, recruitmentId);
    }

    /** 접수 마감일만 과거로 — status 는 건드리지 않는다(만료-OPEN 재현용). */
    private void setEndDateDaysAgo(Long recruitmentId, int days) {
        jdbcTemplate.update("UPDATE recruitment SET end_date = CURRENT_DATE - ? WHERE id = ?", days, recruitmentId);
    }

    private JsonNode answerValues(Long applicationId, String questionId) throws Exception {
        String answers = jdbcTemplate.queryForObject(
                "SELECT answers::text FROM application WHERE id = ?", String.class, applicationId);
        for (JsonNode answer : objectMapper.readTree(answers)) {
            JsonNode storedQuestionId = answer.get("questionId");
            boolean matches = questionId == null ? storedQuestionId.isNull()
                    : !storedQuestionId.isNull() && questionId.equals(storedQuestionId.asText());
            if (matches) {
                return answer.get("values");
            }
        }
        throw new AssertionError("questionId 에 해당하는 답변이 없습니다: " + questionId);
    }

    private String answersText(Long applicationId) {
        return jdbcTemplate.queryForObject("SELECT answers::text FROM application WHERE id = ?", String.class, applicationId);
    }

    private java.sql.Timestamp answersPurgedAt(Long applicationId) {
        return jdbcTemplate.queryForObject(
                "SELECT answers_purged_at FROM application WHERE id = ?", java.sql.Timestamp.class, applicationId);
    }

    private Long applicationVersion(Long applicationId) {
        return jdbcTemplate.queryForObject("SELECT version FROM application WHERE id = ?", Long.class, applicationId);
    }

    private String recruitmentStatus(Long recruitmentId) {
        return jdbcTemplate.queryForObject("SELECT status FROM recruitment WHERE id = ?", String.class, recruitmentId);
    }

    private void assertPurged(Application application, RecruitmentFixture fixture) throws Exception {
        assertThat(answerValues(application.getId(), fixture.text().id()).get(0).asText())
                .isEqualTo(PiiRetentionJob.ANSWER_PURGED_PLACEHOLDER);
        assertThat(answerValues(application.getId(), fixture.single().id()).get(0).asText())
                .isEqualTo(fixture.singleChoiceId());
        assertThat(answerValues(application.getId(), fixture.multi().id())).hasSize(2);
        assertThat(answersPurgedAt(application.getId())).isNotNull();
    }

    private void assertUntouched(Application application, RecruitmentFixture fixture) throws Exception {
        assertThat(answerValues(application.getId(), fixture.text().id()).get(0).asText()).isEqualTo(TEXT_ANSWER);
        assertThat(answersPurgedAt(application.getId())).isNull();
    }
```

테스트 메서드(기존 `scrubsExpiredApplicationAnswers` 뒤에 추가). 클래스 프로퍼티가 `window=P1Y` 이므로 탈퇴 케이스는 400일/10일, 마감 케이스는 `application-answer-window=P6M` 에 대해 210일/30일을 쓴다:

```java
    @Test
    @DisplayName("탈퇴 후 보관기간(window) 미만인 회원의 지원서 자유서술 답변은 유지된다")
    void keepsAnswersOfRecentlyWithdrawnUser() throws Exception {
        RecruitmentFixture fixture = saveRecruitmentWithForm(LocalDate.now().plusDays(30));
        User applicant = saveUser();
        Application application = saveApplication(fixture, applicant);
        softDeleteDaysAgo("users", applicant.getId(), 10);

        job.run();

        assertUntouched(application, fixture);
    }

    @Test
    @DisplayName("탈퇴 후 보관기간(window)이 지난 회원의 지원서는 TEXT 답변만 파기 문구로 치환되고 선택형 답변은 유지된다")
    void purgesTextAnswersOfWithdrawnUser() throws Exception {
        RecruitmentFixture fixture = saveRecruitmentWithForm(LocalDate.now().plusDays(30));
        User applicant = saveUser();
        Application application = saveApplication(fixture, applicant);
        Long versionBefore = applicationVersion(application.getId());
        softDeleteDaysAgo("users", applicant.getId(), 400);

        job.run();

        assertPurged(application, fixture);
        // 동시 flush 가 파기 전 answers 를 되살리지 못하도록 version 이 올라간다(스펙 §3.2).
        assertThat(applicationVersion(application.getId())).isEqualTo(versionBefore + 1);
    }

    @Test
    @DisplayName("마감(closed_at) 후 6개월 미만인 모집의 지원서 답변은 유지된다")
    void keepsAnswersOfRecentlyClosedRecruitment() throws Exception {
        RecruitmentFixture fixture = saveRecruitmentWithForm(LocalDate.now().plusDays(30));
        Application application = saveApplication(fixture, saveUser());
        closeDaysAgo(fixture.id(), 30);

        job.run();

        assertUntouched(application, fixture);
    }

    @Test
    @DisplayName("마감(closed_at) 후 6개월이 지난 모집의 지원서는 TEXT 답변이 파기된다")
    void purgesTextAnswersAfterClosedAtWindow() throws Exception {
        RecruitmentFixture fixture = saveRecruitmentWithForm(LocalDate.now().plusDays(30));
        Application application = saveApplication(fixture, saveUser());
        closeDaysAgo(fixture.id(), 210);

        job.run();

        assertPurged(application, fixture);
    }

    @Test
    @DisplayName("end_date 가 지난 뒤 6개월이 넘은 OPEN 모집(만료-OPEN)의 지원서도 파기되며 모집 상태는 OPEN 그대로다")
    void purgesExpiredOpenRecruitmentWithoutClosingIt() throws Exception {
        RecruitmentFixture fixture = saveRecruitmentWithForm(LocalDate.now().plusDays(30));
        Application application = saveApplication(fixture, saveUser());
        setEndDateDaysAgo(fixture.id(), 210);

        job.run();

        assertPurged(application, fixture);
        assertThat(recruitmentStatus(fixture.id())).isEqualTo("OPEN");
    }

    @Test
    @DisplayName("closed_at 이 없는(V101 이전) CLOSED 모집은 end_date 기준으로 파기된다")
    void purgesLegacyClosedRecruitmentByEndDate() throws Exception {
        RecruitmentFixture fixture = saveRecruitmentWithForm(LocalDate.now().plusDays(30));
        Application application = saveApplication(fixture, saveUser());
        jdbcTemplate.update("UPDATE recruitment SET status = 'CLOSED', closed_at = NULL, end_date = CURRENT_DATE - 240 WHERE id = ?",
                fixture.id());

        job.run();

        assertPurged(application, fixture);
    }

    @Test
    @DisplayName("상시모집이면서 closed_at 이 없는 CLOSED 모집은 마감 앵커가 없어 건너뛴다")
    void skipsRecruitmentWithoutAnyAnchor() throws Exception {
        RecruitmentFixture fixture = saveRecruitmentWithForm(null);
        Application application = saveApplication(fixture, saveUser());
        jdbcTemplate.update("UPDATE recruitment SET status = 'CLOSED' WHERE id = ?", fixture.id());

        job.run();

        assertUntouched(application, fixture);
    }

    @Test
    @DisplayName("아직 마감되지 않은(end_date 미래) OPEN 모집의 지원서는 파기하지 않는다")
    void keepsAnswersOfOpenRecruitment() throws Exception {
        RecruitmentFixture fixture = saveRecruitmentWithForm(LocalDate.now().plusDays(30));
        Application application = saveApplication(fixture, saveUser());

        job.run();

        assertUntouched(application, fixture);
    }

    @Test
    @DisplayName("폼에 없는 questionId 와 questionId 가 null 인 답변은 TEXT 로 간주해 파기한다")
    void treatsUnresolvedAnswersAsText() throws Exception {
        RecruitmentFixture fixture = saveRecruitmentWithForm(LocalDate.now().plusDays(30));
        Application application = applicationRepository.save(Application.submit(fixture.recruitment(), saveUser(), List.of(
                new ApplicationAnswer("question-no-longer-in-form", List.of("삭제된 질문의 답 010-2222-3333")),
                new ApplicationAnswer(null, List.of("V78 잉여 답변")))));
        closeDaysAgo(fixture.id(), 210);

        job.run();

        assertThat(answerValues(application.getId(), "question-no-longer-in-form").get(0).asText())
                .isEqualTo(PiiRetentionJob.ANSWER_PURGED_PLACEHOLDER);
        assertThat(answerValues(application.getId(), null).get(0).asText())
                .isEqualTo(PiiRetentionJob.ANSWER_PURGED_PLACEHOLDER);
    }

    @Test
    @DisplayName("무응답([\"\"])·빈([]) TEXT 답변과 답변이 없는 지원서는 내용이 바뀌지 않고 파기 마커만 기록된다")
    void leavesEmptyAnswersUntouchedButMarksPurged() throws Exception {
        RecruitmentFixture fixture = saveRecruitmentWithForm(LocalDate.now().plusDays(30));
        Application blankAnswer = applicationRepository.save(Application.submit(fixture.recruitment(), saveUser(), List.of(
                new ApplicationAnswer(fixture.text().id(), List.of("")),
                new ApplicationAnswer(fixture.single().id(), List.of(fixture.singleChoiceId())))));
        Application noValues = applicationRepository.save(Application.submit(fixture.recruitment(), saveUser(), List.of(
                new ApplicationAnswer(fixture.text().id(), List.of()))));
        Application noAnswers = applicationRepository.save(Application.submit(fixture.recruitment(), saveUser(), List.of()));
        closeDaysAgo(fixture.id(), 210);

        job.run();

        assertThat(answerValues(blankAnswer.getId(), fixture.text().id()).get(0).asText()).isEqualTo("");
        assertThat(answerValues(noValues.getId(), fixture.text().id())).isEmpty();
        assertThat(answersText(noAnswers.getId())).isEqualTo("[]");
        assertThat(answersPurgedAt(blankAnswer.getId())).isNotNull();
        assertThat(answersPurgedAt(noValues.getId())).isNotNull();
        assertThat(answersPurgedAt(noAnswers.getId())).isNotNull();
    }

    @Test
    @DisplayName("한 번 파기된 지원서는 재실행해도 다시 갱신되지 않는다 (멱등)")
    void isIdempotentForPurgedAnswers() throws Exception {
        RecruitmentFixture fixture = saveRecruitmentWithForm(LocalDate.now().plusDays(30));
        Application application = saveApplication(fixture, saveUser());
        closeDaysAgo(fixture.id(), 210);

        job.run();
        java.sql.Timestamp firstPurgedAt = answersPurgedAt(application.getId());
        Long firstVersion = applicationVersion(application.getId());
        job.run();

        assertThat(answersPurgedAt(application.getId())).isEqualTo(firstPurgedAt);
        assertThat(applicationVersion(application.getId())).isEqualTo(firstVersion);
        assertPurged(application, fixture);
    }

    @Test
    @DisplayName("여러 모집·여러 지원서가 섞여 있어도 각 행이 자기 조건으로만 판정된다")
    void judgesEachApplicationIndependently() throws Exception {
        RecruitmentFixture closedLongAgo = saveRecruitmentWithForm(LocalDate.now().plusDays(30));
        RecruitmentFixture closedRecently = saveRecruitmentWithForm(LocalDate.now().plusDays(30));
        RecruitmentFixture stillOpen = saveRecruitmentWithForm(LocalDate.now().plusDays(30));
        Application purgedByClose = saveApplication(closedLongAgo, saveUser());
        Application keptRecentClose = saveApplication(closedRecently, saveUser());
        User withdrawnApplicant = saveUser();
        Application purgedByWithdrawal = saveApplication(closedRecently, withdrawnApplicant);
        Application keptOpen = saveApplication(stillOpen, saveUser());
        closeDaysAgo(closedLongAgo.id(), 210);
        closeDaysAgo(closedRecently.id(), 30);
        softDeleteDaysAgo("users", withdrawnApplicant.getId(), 400);

        job.run();

        assertPurged(purgedByClose, closedLongAgo);
        assertUntouched(keptRecentClose, closedRecently);
        assertPurged(purgedByWithdrawal, closedRecently);
        assertUntouched(keptOpen, stillOpen);
    }
```

`PiiRetentionJobCutoffTest.java` 에 케이스 추가(import `static org.mockito.ArgumentMatchers.any;`, `static org.mockito.ArgumentMatchers.eq;`, `java.time.LocalDate`):

```java
    @Test
    @DisplayName("마감 6개월 cutoff 날짜는 JVM 기본 존이 UTC 여도 KST 오늘 기준으로 계산된다")
    void closedCutoffDateUsesSeoulToday() {
        TimeZone.setDefault(TimeZone.getTimeZone("UTC"));

        job(Period.ofDays(45), Period.ofMonths(6)).run();

        // NOW 는 UTC 9/7 20:00 = KST 9/8 05:00 → KST 오늘(9/8) - 6개월 = 3/8. UTC 날짜(9/7)로 계산했다면 3/7.
        verify(applicationRepository).purgeExpiredTextAnswers(
                eq(LocalDate.of(2026, 3, 8)), any(LocalDateTime.class), eq(PiiRetentionJob.ANSWER_PURGED_PLACEHOLDER));
    }
```

- [ ] **Step 2: 실패 확인**

Run: `cd /Users/ksy/orca/workspaces/Duing/hagfish/backend && ./gradlew compileTestJava`
Expected: FAIL — `purgeExpiredTextAnswers`·`ANSWER_PURGED_PLACEHOLDER` 없음.

- [ ] **Step 3: ApplicationRepository — native UPDATE**

`ApplicationRepository.java` — import 에 `java.time.LocalDate` 추가. `scrubExpiredApplicationAnswers` 바로 뒤에:

```java
    /**
     * 마감 6개월(closedCutoffDate) 또는 탈퇴 45일(withdrawnCutoff)이 지난 지원서의 자유서술(TEXT) 답변을 placeholder 로
     * 치환한다(스펙 §3.2). 답변 원소에는 유형이 없어 recruitment_form.questions 와 questionId 로 조인한다 — 매칭되지
     * 않거나 questionId 가 null 인 답변은 자유서술 가능성이 있어 TEXT 로 간주한다. 선택형(choiceId)·무응답([] / [""])은
     * 유지한다. 이미 파기된 행(answers_purged_at IS NOT NULL)과 soft-delete 행(기존 45일 규칙이 전체를 비움)은 제외한다.
     * 마감 앵커 LEAST(closed_at::date, end_date) 는 NULL 을 무시하고 둘 다 NULL 이면 NULL 이라 비교가 false(스킵)다.
     * version+1 은 @DynamicUpdate 가 없는 Application 의 전 컬럼 UPDATE(동시 최종 확정·지원 취소)가 파기 전 answers 를
     * 되살리지 못하게 한다 — 상대는 OptimisticLock(409)으로 실패한다.
     */
    @Modifying(clearAutomatically = true)
    @Query(value = """
            UPDATE application a
               SET answers = (
                     SELECT COALESCE(jsonb_agg(
                                CASE WHEN COALESCE(question.qtype, 'TEXT') = 'TEXT'
                                      AND jsonb_array_length(answer.elem -> 'values') > 0
                                      AND (answer.elem -> 'values' ->> 0) <> ''
                                     THEN jsonb_set(answer.elem, ARRAY['values'], jsonb_build_array(CAST(:placeholder AS text)))
                                     ELSE answer.elem END
                                ORDER BY answer.ord), '[]'::jsonb)
                       FROM jsonb_array_elements(a.answers) WITH ORDINALITY AS answer(elem, ord)
                       LEFT JOIN LATERAL (
                            SELECT question_element ->> 'type' AS qtype
                              FROM recruitment_form form, jsonb_array_elements(form.questions) question_element
                             WHERE form.recruitment_id = a.recruitment_id
                               AND question_element ->> 'id' = answer.elem ->> 'questionId'
                             LIMIT 1) question ON TRUE),
                   answers_purged_at = NOW(),
                   version = version + 1
              FROM recruitment r, users u
             WHERE r.id = a.recruitment_id AND u.id = a.user_id
               AND a.answers_purged_at IS NULL
               AND a.deleted_at IS NULL
               AND (LEAST(r.closed_at::date, r.end_date) < :closedCutoffDate
                    OR u.deleted_at < :withdrawnCutoff)
            """, nativeQuery = true)
    int purgeExpiredTextAnswers(@Param("closedCutoffDate") LocalDate closedCutoffDate,
                                @Param("withdrawnCutoff") LocalDateTime withdrawnCutoff,
                                @Param("placeholder") String placeholder);
```

- [ ] **Step 4: PiiRetentionJob — 상수·호출·로그**

`PiiRetentionJob.java` 에서

(a) 필드 블록 위 상수 추가(`PHONE_VERIFICATION_RETENTION` 아래):

```java
    /** 파기된 자유서술 답변 자리에 남기는 문구 — 총동연 문의 파기(FederationInquiryPurgeJob)와 같은 표현(스펙 §3.2). */
    static final String ANSWER_PURGED_PLACEHOLDER = "(보관기간 경과로 파기되었습니다)";
```

(b) `run()` 의 실행부를 아래로 교체:

```java
        int anonymizedUsers = userRepository.anonymizeExpiredUsers(withdrawnCutoff);
        int scrubbedApplications = applicationRepository.scrubExpiredApplicationAnswers(withdrawnCutoff);
        int purgedApplicationAnswers = applicationRepository.purgeExpiredTextAnswers(
                closedCutoffDate, withdrawnCutoff, ANSWER_PURGED_PLACEHOLDER);
        int deletedPhoneVerifications = phoneVerificationRepository.deleteExpiredVerifications(phoneVerificationCutoff);
        int deletedPhoneVerificationEvents = phoneVerificationEventRepository.deleteExpiredEvents(withdrawnCutoff);
        // 건수와 cutoff 만 남긴다 — 답변 내용·사용자 식별자는 로그에 쓰지 않는다(스펙 §3.4).
        log.info("[PII 보관기간 파기] usersAnonymized={}, applicationsScrubbed={}, applicationAnswersPurged={}, "
                        + "phoneVerificationsDeleted={}, phoneVerificationEventsDeleted={}, "
                        + "withdrawnCutoff={}, closedCutoffDate={}",
                anonymizedUsers, scrubbedApplications, purgedApplicationAnswers,
                deletedPhoneVerifications, deletedPhoneVerificationEvents, withdrawnCutoff, closedCutoffDate);
```

(c) 클래스 javadoc 의 첫 문단 뒤에 한 문단 추가:

```java
 * <p>지원서 자유서술 답변(스펙 docs/superpowers/specs/2026-09-07-application-answer-retention-design.md): 모집 마감
 * (LEAST(closed_at, end_date)) 후 {@code applicationAnswerWindow}, 또는 회원 탈퇴 후 {@code window} 가 지나면 TEXT 답변만
 * placeholder 로 치환하고 application.answers_purged_at 에 기록한다. 지원서 행·선택형 답변·모집 상태는 바꾸지 않는다.
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd /Users/ksy/orca/workspaces/Duing/hagfish/backend && ./gradlew test --tests 'com.duing.global.privacy.*'`
Expected: BUILD SUCCESSFUL — `PiiRetentionJobTest` 22건(기존 11 + 신규 11), `PiiRetentionJobCutoffTest` 4건 PASS.

Run: `cd /Users/ksy/orca/workspaces/Duing/hagfish/backend && ./gradlew test --tests 'com.duing.domain.application.*' --tests 'com.duing.domain.recruitment.*'`
Expected: BUILD SUCCESSFUL — 기존 지원·모집 테스트 무회귀.

- [ ] **Step 6: 커밋**

```bash
cd /Users/ksy/orca/workspaces/Duing/hagfish
git add backend/src/main/java/com/duing/domain/application/repository/ApplicationRepository.java \
        backend/src/main/java/com/duing/global/privacy/PiiRetentionJob.java \
        backend/src/test/java/com/duing/global/privacy/PiiRetentionJobTest.java \
        backend/src/test/java/com/duing/global/privacy/PiiRetentionJobCutoffTest.java
git commit -m "feat(backend): PII 파기 잡 — 마감 6개월·탈퇴 45일 지난 지원서 TEXT 답변을 파기 문구로 치환(선택형 유지, answers_purged_at 멱등)"
```

---

### Task 3: 미제출 초안 삭제 — `ApplicationDraftRepository.deleteExpired` (스펙 §3.3·§8.1)

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/draft/repository/ApplicationDraftRepository.java`
- Modify: `backend/src/main/java/com/duing/global/privacy/PiiRetentionJob.java` (필드·호출·로그)
- Modify: `backend/src/test/java/com/duing/global/privacy/PiiRetentionJobCutoffTest.java` (생성자·검증 추가)
- Test: `backend/src/test/java/com/duing/global/privacy/PiiRetentionJobTest.java` (초안 케이스 4개, 수동 생성자 2곳)

**Interfaces:**
- Consumes: Task 1·2 의 `closedCutoffDate`·`withdrawnCutoff`.
- Produces: `int ApplicationDraftRepository.deleteExpired(LocalDate closedCutoffDate, LocalDateTime withdrawnCutoff)`; `PiiRetentionJob` 생성자 마지막 인자 `ApplicationDraftRepository applicationDraftRepository` (최종 7인자).

- [ ] **Step 1: 통합 테스트 4개 + 생성자 갱신 작성**

`PiiRetentionJobTest.java` — import 추가:

```java
import com.duing.domain.draft.entity.ApplicationDraft;
import com.duing.domain.draft.repository.ApplicationDraftRepository;
```

필드 추가(`@Autowired PhoneVerificationEventRepository phoneVerificationEventRepository;` 아래):

```java
    @Autowired ApplicationDraftRepository applicationDraftRepository;
```

`noopWhenDisabled`·`noopWhenWindowNonPositive` 의 `new PiiRetentionJob(...)` 두 곳에서 마지막 인자 추가:

```java
                phoneVerificationRepository, phoneVerificationEventRepository, applicationDraftRepository);
```

헬퍼 추가:

```java
    private ApplicationDraft saveDraft(RecruitmentFixture fixture, User user) {
        return applicationDraftRepository.save(ApplicationDraft.create(user.getId(), fixture.id(), List.of(
                new ApplicationDraft.DraftAnswer(fixture.text().id(), List.of("초안 " + TEXT_ANSWER)))));
    }

    private int draftCount(Long draftId) {
        return jdbcTemplate.queryForObject("SELECT count(*) FROM application_draft WHERE id = ?", Integer.class, draftId);
    }

    private int applicationCount(Long applicationId) {
        return jdbcTemplate.queryForObject("SELECT count(*) FROM application WHERE id = ?", Integer.class, applicationId);
    }
```

테스트 메서드 추가:

```java
    @Test
    @DisplayName("마감 6개월이 지난 모집의 미제출 초안은 삭제된다")
    void deletesDraftsOfRecruitmentClosedLongAgo() throws Exception {
        RecruitmentFixture fixture = saveRecruitmentWithForm(LocalDate.now().plusDays(30));
        ApplicationDraft draft = saveDraft(fixture, saveUser());
        closeDaysAgo(fixture.id(), 210);

        job.run();

        assertThat(draftCount(draft.getId())).isZero();
    }

    @Test
    @DisplayName("탈퇴 후 보관기간(window)이 지난 회원의 미제출 초안은 삭제된다")
    void deletesDraftsOfWithdrawnUser() throws Exception {
        RecruitmentFixture fixture = saveRecruitmentWithForm(LocalDate.now().plusDays(30));
        User withdrawnUser = saveUser();
        ApplicationDraft draft = saveDraft(fixture, withdrawnUser);
        softDeleteDaysAgo("users", withdrawnUser.getId(), 400);

        job.run();

        assertThat(draftCount(draft.getId())).isZero();
    }

    @Test
    @DisplayName("최근 마감한 모집·활성 회원의 미제출 초안은 유지된다")
    void keepsRecentDrafts() throws Exception {
        RecruitmentFixture recentlyClosed = saveRecruitmentWithForm(LocalDate.now().plusDays(30));
        RecruitmentFixture stillOpen = saveRecruitmentWithForm(LocalDate.now().plusDays(30));
        ApplicationDraft recentDraft = saveDraft(recentlyClosed, saveUser());
        ApplicationDraft openDraft = saveDraft(stillOpen, saveUser());
        closeDaysAgo(recentlyClosed.id(), 30);

        job.run();

        assertThat(draftCount(recentDraft.getId())).isEqualTo(1);
        assertThat(draftCount(openDraft.getId())).isEqualTo(1);
    }

    @Test
    @DisplayName("초안 삭제는 같은 회원·모집의 제출된 지원서 행을 건드리지 않는다")
    void draftDeletionLeavesSubmittedApplicationRow() throws Exception {
        RecruitmentFixture fixture = saveRecruitmentWithForm(LocalDate.now().plusDays(30));
        User applicant = saveUser();
        Application application = saveApplication(fixture, applicant);
        ApplicationDraft draft = saveDraft(fixture, applicant);
        closeDaysAgo(fixture.id(), 210);

        job.run();

        assertThat(draftCount(draft.getId())).isZero();
        assertThat(applicationCount(application.getId())).isEqualTo(1);
        assertPurged(application, fixture);
    }
```

`PiiRetentionJobCutoffTest.java` — import `com.duing.domain.draft.repository.ApplicationDraftRepository;`, mock 추가 `@Mock ApplicationDraftRepository applicationDraftRepository;`, `job(...)` 헬퍼의 생성자 마지막 인자에 `applicationDraftRepository` 추가, `verifyNoInteractions(...)` 인자에 `applicationDraftRepository` 추가, `closedCutoffDateUsesSeoulToday` 에 검증 한 줄 추가:

```java
        verify(applicationDraftRepository).deleteExpired(eq(LocalDate.of(2026, 3, 8)), any(LocalDateTime.class));
```

- [ ] **Step 2: 실패 확인**

Run: `cd /Users/ksy/orca/workspaces/Duing/hagfish/backend && ./gradlew compileTestJava`
Expected: FAIL — `deleteExpired` 없음, 생성자 7인자 없음.

- [ ] **Step 3: ApplicationDraftRepository — native DELETE**

`ApplicationDraftRepository.java` — import `java.time.LocalDate`, `java.time.LocalDateTime` 추가. `deleteAllByRecruitmentId` 뒤에:

```java
    /**
     * 마감 6개월(closedCutoffDate) 또는 탈퇴 45일(withdrawnCutoff)이 지난 미제출 초안을 물리 삭제한다(스펙 §3.3).
     * 초안은 감사 가치가 없고 soft-delete 컬럼도 없다. 제출된 지원서(application)는 다른 테이블이라 건드리지 않는다.
     * 마감 앵커 LEAST(closed_at::date, end_date) 의 NULL 처리는 ApplicationRepository.purgeExpiredTextAnswers 와 같다.
     */
    @Modifying(clearAutomatically = true)
    @Query(value = """
            DELETE FROM application_draft draft
             USING recruitment r, users u
             WHERE r.id = draft.recruitment_id AND u.id = draft.user_id
               AND (LEAST(r.closed_at::date, r.end_date) < :closedCutoffDate
                    OR u.deleted_at < :withdrawnCutoff)
            """, nativeQuery = true)
    int deleteExpired(@Param("closedCutoffDate") LocalDate closedCutoffDate,
                      @Param("withdrawnCutoff") LocalDateTime withdrawnCutoff);
```

- [ ] **Step 4: PiiRetentionJob — 필드·호출·로그**

`PiiRetentionJob.java`:

(a) import `com.duing.domain.draft.repository.ApplicationDraftRepository;` 추가.

(b) 필드 마지막에 추가:

```java
    private final ApplicationDraftRepository applicationDraftRepository;
```

(c) `run()` 실행부에서 `purgeExpiredTextAnswers` 호출 다음 줄에:

```java
        int deletedApplicationDrafts = applicationDraftRepository.deleteExpired(closedCutoffDate, withdrawnCutoff);
```

(d) 로그 문장을 아래로 교체:

```java
        log.info("[PII 보관기간 파기] usersAnonymized={}, applicationsScrubbed={}, applicationAnswersPurged={}, "
                        + "applicationDraftsDeleted={}, phoneVerificationsDeleted={}, phoneVerificationEventsDeleted={}, "
                        + "withdrawnCutoff={}, closedCutoffDate={}",
                anonymizedUsers, scrubbedApplications, purgedApplicationAnswers, deletedApplicationDrafts,
                deletedPhoneVerifications, deletedPhoneVerificationEvents, withdrawnCutoff, closedCutoffDate);
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd /Users/ksy/orca/workspaces/Duing/hagfish/backend && ./gradlew test --tests 'com.duing.global.privacy.*' --tests 'com.duing.domain.draft.*'`
Expected: BUILD SUCCESSFUL — `PiiRetentionJobTest` 26건, `PiiRetentionJobCutoffTest` 4건, draft 도메인 기존 테스트(`SubmitDiscardsDraftTest` 등) 무회귀.

- [ ] **Step 6: 백엔드 전체 테스트**

Run: `cd /Users/ksy/orca/workspaces/Duing/hagfish/backend && ./gradlew test`
Expected: BUILD SUCCESSFUL. (`joinCodes` 계열 간헐 플래키가 알려져 있다 — 실패 시 해당 클래스만 재실행해 통과를 확인하고 결과에 기록한다.)

- [ ] **Step 7: 커밋**

```bash
cd /Users/ksy/orca/workspaces/Duing/hagfish
git add backend/src/main/java/com/duing/domain/draft/repository/ApplicationDraftRepository.java \
        backend/src/main/java/com/duing/global/privacy/PiiRetentionJob.java \
        backend/src/test/java/com/duing/global/privacy/PiiRetentionJobTest.java \
        backend/src/test/java/com/duing/global/privacy/PiiRetentionJobCutoffTest.java
git commit -m "feat(backend): PII 파기 잡 — 마감 6개월·탈퇴 45일 지난 미제출 지원서 초안(application_draft) 삭제"
```

---

### Task 4: 안내 문구 2곳 — 질문 빌더·지원 폼 (스펙 §5)

**Files:**
- Modify: `frontend/apps/web/app/manage/clubs/[clubId]/recruitments/_components/RecruitmentForm.tsx:586-590`
- Modify: `frontend/apps/web/app/apply/[recruitmentId]/_components/ApplyAnswersStep.tsx:86-88`
- Test: `frontend/apps/web/test/manage/recruitment-form.test.tsx`
- Test: `frontend/apps/web/test/apply/apply-page.test.tsx`

**Interfaces:** 없음(문구 추가). `RecruitmentQuestionItem.type: QuestionType`(`'TEXT' | 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE'`, `packages/types/src/recruitment.ts`)를 소비한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`test/manage/recruitment-form.test.tsx` — `describe('RecruitmentForm — 4섹션 구조', …)` 블록 안 마지막에 추가:

```tsx
  it('지원서 질문 섹션에 개인정보 수집 최소화 안내를 보여준다', () => {
    render(<RecruitmentForm mode="create" submitLabel="모집 시작" onSubmit={vi.fn()} isPending={false} />);
    expect(
      screen.getByText(
        '학번·전화번호 등 개인정보는 지원자 프로필에서 확인할 수 있으니 질문으로 요청하지 않는 것을 권장합니다.',
      ),
    ).toBeInTheDocument();
  });
```

`test/apply/apply-page.test.tsx` — `describe('ApplyForm — 모집 안내문(content)', …)` 블록 뒤에 새 블록:

```tsx
describe('ApplyForm — 개인정보 수집 최소화 안내', () => {
  const PII_HINT = '학번·전화번호 등 개인정보는 꼭 필요한 경우에만 입력해주세요.';

  it('주관식 질문이 있으면 지원서 상단에 안내를 보여준다', () => {
    renderForm({ questionItems: MIXED_QUESTION_ITEMS });
    expect(screen.getByText(PII_HINT)).toBeInTheDocument();
  });

  it('선택형 질문만 있으면 안내를 보여주지 않는다', () => {
    renderForm({ questionItems: REQUIRED_MULTI_QUESTION_ITEMS });
    expect(screen.queryByText(PII_HINT)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd /Users/ksy/orca/workspaces/Duing/hagfish/frontend/apps/web && pnpm exec vitest run test/manage/recruitment-form.test.tsx test/apply/apply-page.test.tsx`
Expected: FAIL — 새 3건이 `Unable to find an element with the text` 로 실패, 나머지 PASS.

- [ ] **Step 3: RecruitmentForm.tsx — 섹션 힌트**

기존(586~590행):

```tsx
              <div>
                <p className={cn(fieldLabelClass, 'mb-3')}>
                  지원 질문 <span className="text-coral">*</span>
                  <span className="ml-1 font-normal text-charcoal-3">(최소 1개)</span>
                </p>
                <QuestionBuilder questions={questionItems} onChange={setQuestionItems} nextKey={nextKey} />
              </div>
```

을

```tsx
              <div>
                <p className={cn(fieldLabelClass, 'mb-1')}>
                  지원 질문 <span className="text-coral">*</span>
                  <span className="ml-1 font-normal text-charcoal-3">(최소 1개)</span>
                </p>
                {/* 수집 최소화 안내 — 학번·연락처는 지원자 프로필로 운영진에게 이미 보인다. 입력을 막는 장치가 아니라 보관기간 파기와 짝을 이루는 예방책이다. */}
                <p className="mb-3 text-xs text-charcoal-3">
                  학번·전화번호 등 개인정보는 지원자 프로필에서 확인할 수 있으니 질문으로 요청하지 않는 것을
                  권장합니다.
                </p>
                <QuestionBuilder questions={questionItems} onChange={setQuestionItems} nextKey={nextKey} />
              </div>
```

으로. (라벨의 `mb-3`→`mb-1` 로 라벨→힌트→빌더 간격 유지. JSX 텍스트의 줄바꿈은 공백 하나로 합쳐져 `getByText` 정확 매칭에 영향 없다 — prettier 가 다시 감싸도 무방.)

- [ ] **Step 4: ApplyAnswersStep.tsx — 주관식 있을 때만 상단 힌트**

기존(86~88행):

```tsx
  return (
    <div className="space-y-7">
      {questions.map((question, index) => {
```

을

```tsx
  // 수집 최소화 안내는 주관식이 있을 때만 — 선택형만 있는 지원서엔 의미가 없다. 차단 장치가 아니라 보관기간 파기와 짝인 예방책.
  const hasTextQuestion = questions.some((question) => question.type === 'TEXT');

  return (
    <div className="space-y-7">
      {hasTextQuestion && (
        <p className="text-sm text-charcoal-3">
          학번·전화번호 등 개인정보는 꼭 필요한 경우에만 입력해주세요.
        </p>
      )}
      {questions.map((question, index) => {
```

으로.

- [ ] **Step 5: 테스트·타입·린트 통과 확인**

Run: `cd /Users/ksy/orca/workspaces/Duing/hagfish/frontend/apps/web && pnpm exec vitest run test/manage/recruitment-form.test.tsx test/apply/apply-page.test.tsx`
Expected: 전부 PASS (기존 `모집 안내 섹션이 form 첫 텍스트 노드보다 앞선다` 단언은 힌트가 form 첫 노드가 돼도 참).

Run: `cd /Users/ksy/orca/workspaces/Duing/hagfish/frontend && pnpm typecheck && pnpm lint`
Expected: 둘 다 오류 0.

- [ ] **Step 6: 커밋**

```bash
cd /Users/ksy/orca/workspaces/Duing/hagfish
git add "frontend/apps/web/app/manage/clubs/[clubId]/recruitments/_components/RecruitmentForm.tsx" \
        "frontend/apps/web/app/apply/[recruitmentId]/_components/ApplyAnswersStep.tsx" \
        frontend/apps/web/test/manage/recruitment-form.test.tsx frontend/apps/web/test/apply/apply-page.test.tsx
git commit -m "feat(frontend): 모집 질문 빌더·지원 폼 — 학번·전화번호 등 개인정보 수집 최소화 안내 문구"
```

---

### Task 5: 개인정보 처리방침 — 6개월 조항 + 시행일 (스펙 §6)

**Files:**
- Modify: `frontend/apps/web/app/terms/page.tsx` (상수 11~17행, 3조 `List` 177~184행)

**Interfaces:** 없음.

- [ ] **Step 1: 상수·시행일**

기존:

```tsx
const EFFECTIVE_DATE = '2026-06-19';
```
→
```tsx
const EFFECTIVE_DATE = '2026-09-21';
```

기존:

```tsx
// 회원 탈퇴 시 개인정보 파기 잡(PII Retention)의 실제 보관기간과 일치시킨다.
const RETENTION_PERIOD = '탈퇴 후 45일';
```
→
```tsx
// 회원 탈퇴 시 개인정보 파기 잡(PII Retention)의 실제 보관기간과 일치시킨다.
const RETENTION_PERIOD = '탈퇴 후 45일';
// 모집 마감 후 지원서 자유서술 답변 파기 잡(PiiRetentionJob, duing.privacy.retention.application-answer-window)의 실제 보관기간과 일치시킨다.
const APPLICATION_ANSWER_RETENTION_PERIOD = '모집 종료 후 6개월';
```

- [ ] **Step 2: 3조 항목 추가**

기존:

```tsx
          <Article title="3. 개인정보의 보유 및 이용 기간">
            <List
              items={[
                `운영팀은 원칙적으로 회원 탈퇴 시 개인정보를 파기하되, 운영·분쟁 대응을 위해 ${RETENTION_PERIOD} 이내 보관한 뒤 파기합니다.`,
                '관련 법령에서 일정 기간 보관을 요구하는 경우(예: 통신비밀보호법에 따른 접속기록 등) 해당 기간 동안 보관 후 파기합니다.',
              ]}
            />
          </Article>
```
→
```tsx
          <Article title="3. 개인정보의 보유 및 이용 기간">
            <List
              items={[
                `운영팀은 원칙적으로 회원 탈퇴 시 개인정보를 파기하되, 운영·분쟁 대응을 위해 ${RETENTION_PERIOD} 이내 보관한 뒤 파기합니다.`,
                '관련 법령에서 일정 기간 보관을 요구하는 경우(예: 통신비밀보호법에 따른 접속기록 등) 해당 기간 동안 보관 후 파기합니다.',
                `모집 지원서의 자유서술형 답변은 해당 ${APPLICATION_ANSWER_RETENTION_PERIOD}간 보관한 뒤 파기합니다. 지원 상태·지원일 등 운영에 필요한 최소 정보는 지원 내역으로 계속 보관합니다.`,
              ]}
            />
          </Article>
```

- [ ] **Step 3: 확인**

Run: `cd /Users/ksy/orca/workspaces/Duing/hagfish/frontend && pnpm typecheck && pnpm lint`
Expected: 오류 0. (terms 페이지는 테스트가 없다 — 렌더 확인은 컨트롤러가 Task 6 에서 `pnpm build` 로 한다.)

- [ ] **Step 4: 커밋**

```bash
cd /Users/ksy/orca/workspaces/Duing/hagfish
git add frontend/apps/web/app/terms/page.tsx
git commit -m "docs(frontend): 개인정보 처리방침 — 모집 종료 후 6개월 지원서 자유서술 답변 보관·파기 조항, 시행일 2026-09-21"
```

---

### Task 6 (컨트롤러 전용): 전체 브랜치 리뷰 → self-check → PR

구현 subagent 는 이 태스크를 실행하지 않는다.

- [ ] Task 1~5 각각 spec 리뷰 + quality 리뷰(fork, 별도 dispatch) 통과 확인.
- [ ] 전체 브랜치 리뷰(fork): 권한·상태전이·동시성(version+1)·데이터 무결성(V126, native UPDATE/DELETE)·타임존 regime 관점 명시.
- [ ] `cd backend && ./gradlew test` / `cd frontend && pnpm test && pnpm typecheck && pnpm lint && pnpm --filter web build` 전부 GREEN.
- [ ] Self-check 7항목(빌드·범위 일치·타 영역 영향·리뷰 완료·Plan 체크박스 재검증·메모리 규칙·EOF 개행).
- [ ] 스펙 §9 런북(prod 건수 확인 SQL·첫 실행 로그 확인·시행일 확정·13조 공지는 운영 결정)을 PR 본문 💬 에 옮긴다.
- [ ] push → `gh pr create` (제목 `feat: 지원서 자유서술 답변 보관·파기 — 탈퇴 45일·마감 6개월 PiiRetentionJob 확장, 안내 문구, 처리방침`, 본문 🚀/🤔/💬). **머지는 하지 않는다.**

---

## Self-Review (작성 후 점검)

- [x] **Spec coverage**: §2 V126 → Task 1; §3.1 cutoff 정정·가드 → Task 1; §3.2 UPDATE·placeholder·version+1·멱등 → Task 2; §3.3 DELETE → Task 3; §3.4 순서·로그 → Task 2·3; §4 설정 3파일·생성자 갱신 → Task 1(·3); §5.1/§5.2 → Task 4; §6 → Task 5; §7 API 불변 → 어떤 태스크도 DTO 를 건드리지 않음; §8.1 18행 → Task 2(12)·Task 3(4)·기존(2); §8.2 4행 → Task 1(3)·Task 2(1, Task 3 에서 draft 검증 추가); §8.4 → Task 4; §9 런북 → Task 6; §0 원칙 7(상태 자동 전이 금지) → Task 2 테스트 `purgesExpiredOpenRecruitmentWithoutClosingIt` 가 고정.
- [x] **Placeholder scan**: TBD/TODO/"similar to" 없음. 모든 코드 스텝에 실제 코드.
- [x] **Type consistency**: `purgeExpiredTextAnswers(LocalDate, LocalDateTime, String)` — Task 2 정의·호출·mock 검증 일치. `deleteExpired(LocalDate, LocalDateTime)` — Task 3 정의·호출·mock 검증 일치. `RetentionProperties(boolean, Period, Period)` — Task 1 정의, Task 1·3 테스트 생성 일치. `PiiRetentionJob` 생성자 6인자(Task 1) → 7인자(Task 3) 전환 시 갱신 지점(통합 테스트 2곳·단위 테스트 헬퍼 1곳) 명시. `ANSWER_PURGED_PLACEHOLDER` package-private — 두 테스트 모두 같은 패키지.
