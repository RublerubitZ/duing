package com.duing.global.privacy;

import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.draft.repository.ApplicationDraftRepository;
import com.duing.domain.user.repository.PhoneVerificationEventRepository;
import com.duing.domain.user.repository.PhoneVerificationRepository;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.time.TimeMapper;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.Period;
import java.util.ArrayList;
import java.util.List;
import java.util.function.IntSupplier;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * PIPA 제21조(보관기간 종료 시 지체없는 파기) 대응 — 보관기간(window)을 넘긴 개인정보를 비식별화/삭제하는 스케줄 잡.
 *
 * <p>지원서 자유서술 답변(스펙 docs/superpowers/specs/2026-09-07-application-answer-retention-design.md): 모집 마감
 * (LEAST(closed_at, end_date)) 후 {@code applicationAnswerWindow}, 또는 회원 탈퇴 후 {@code window} 가 지나면 TEXT 답변만
 * placeholder 로 치환하고 application.answers_purged_at 에 기록한다. 지원서 행·선택형 답변·모집 상태는 바꾸지 않는다.
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
 *
 * <p>단계별 독립 트랜잭션 — 6개 벌크 문을 한 트랜잭션에 묶지 않고 {@link TransactionTemplate} 으로 단계마다 따로
 * 커밋한다(FederationInquiryPurgeJob 전례). 한 단계가 실패해도 앞 단계의 파기는 롤백되지 않으며, 실패한 단계는
 * 다음날 실행이 자연 재시도한다 — 6개 문 모두 cutoff + 멱등 술어(anonymized_at IS NULL · answers &lt;&gt; '[]' ·
 * answers_purged_at IS NULL · cutoff DELETE)라 재실행이 안전하기 때문이다. 실패 단계가 하나라도 있으면 최종 요약
 * 로그를 INFO 대신 WARN 으로 남긴다(런북 grep 태그 {@code [PII 보관기간 파기]} 는 그대로).
 */
@Slf4j
@Component
public class PiiRetentionJob {

    /** MO 인증 세션은 단명 데이터 — 만료 후 1일이면 파기한다 (보관기간 window 와 별도, spec §9.4). */
    private static final Period PHONE_VERIFICATION_RETENTION = Period.ofDays(1);

    /** 파기된 자유서술 답변 자리에 남기는 문구 — 총동연 문의 파기(FederationInquiryPurgeJob)와 같은 표현(스펙 §3.2). */
    static final String ANSWER_PURGED_PLACEHOLDER = "(보관기간 경과로 파기되었습니다)";

    /** 성공·실패 두 레벨이 같은 줄을 남기도록 포맷을 한 곳에 둔다 — 런북 grep 이 레벨에 따라 갈리지 않게. */
    private static final String SUMMARY_LOG_FORMAT =
            "[PII 보관기간 파기] usersAnonymized={}, applicationsScrubbed={}, applicationAnswersPurged={}, "
                    + "applicationDraftsDeleted={}, phoneVerificationsDeleted={}, phoneVerificationEventsDeleted={}, "
                    + "withdrawnCutoff={}, closedCutoffDate={}, failedSteps={}";

    private final RetentionProperties properties;
    private final Clock clock;
    private final UserRepository userRepository;
    private final ApplicationRepository applicationRepository;
    private final PhoneVerificationRepository phoneVerificationRepository;
    private final PhoneVerificationEventRepository phoneVerificationEventRepository;
    private final ApplicationDraftRepository applicationDraftRepository;
    /** 단계마다 독립 트랜잭션을 여는 템플릿 — 벌크 @Modifying 문은 반드시 이 안에서만 호출한다. */
    private final TransactionTemplate transactionTemplate;

    public PiiRetentionJob(
            RetentionProperties properties,
            Clock clock,
            UserRepository userRepository,
            ApplicationRepository applicationRepository,
            PhoneVerificationRepository phoneVerificationRepository,
            PhoneVerificationEventRepository phoneVerificationEventRepository,
            ApplicationDraftRepository applicationDraftRepository,
            PlatformTransactionManager platformTransactionManager) {
        this.properties = properties;
        this.clock = clock;
        this.userRepository = userRepository;
        this.applicationRepository = applicationRepository;
        this.phoneVerificationRepository = phoneVerificationRepository;
        this.phoneVerificationEventRepository = phoneVerificationEventRepository;
        this.applicationDraftRepository = applicationDraftRepository;
        this.transactionTemplate = new TransactionTemplate(platformTransactionManager);
    }

    @Scheduled(cron = "0 30 4 * * *", zone = "Asia/Seoul")
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

        List<String> failedSteps = new ArrayList<>();
        int anonymizedUsers = runStep("users", failedSteps,
                () -> userRepository.anonymizeExpiredUsers(withdrawnCutoff));
        int scrubbedApplications = runStep("applicationsScrub", failedSteps,
                () -> applicationRepository.scrubExpiredApplicationAnswers(withdrawnCutoff));
        int purgedApplicationAnswers = runStep("applicationAnswers", failedSteps,
                () -> applicationRepository.purgeExpiredTextAnswers(
                        closedCutoffDate, withdrawnCutoff, ANSWER_PURGED_PLACEHOLDER));
        int deletedApplicationDrafts = runStep("applicationDrafts", failedSteps,
                () -> applicationDraftRepository.deleteExpired(closedCutoffDate, withdrawnCutoff));
        int deletedPhoneVerifications = runStep("phoneVerifications", failedSteps,
                () -> phoneVerificationRepository.deleteExpiredVerifications(phoneVerificationCutoff));
        int deletedPhoneVerificationEvents = runStep("phoneVerificationEvents", failedSteps,
                () -> phoneVerificationEventRepository.deleteExpiredEvents(withdrawnCutoff));
        // 건수와 cutoff 만 남긴다 — 답변 내용·사용자 식별자는 로그에 쓰지 않는다(스펙 §3.4).
        // 실패 단계(건수 -1)가 있으면 같은 줄을 WARN 으로 올려 운영이 놓치지 않게 한다.
        if (failedSteps.isEmpty()) {
            log.info(SUMMARY_LOG_FORMAT,
                    anonymizedUsers, scrubbedApplications, purgedApplicationAnswers, deletedApplicationDrafts,
                    deletedPhoneVerifications, deletedPhoneVerificationEvents, withdrawnCutoff, closedCutoffDate,
                    failedSteps);
        } else {
            log.warn(SUMMARY_LOG_FORMAT,
                    anonymizedUsers, scrubbedApplications, purgedApplicationAnswers, deletedApplicationDrafts,
                    deletedPhoneVerifications, deletedPhoneVerificationEvents, withdrawnCutoff, closedCutoffDate,
                    failedSteps);
        }
    }

    /**
     * 한 단계를 독립 트랜잭션으로 실행한다. 실패는 삼키고 단계명만 모아 다음 단계로 넘어간다 — 처리 건수는
     * "미처리"를 뜻하는 -1 로 남겨 0건 성공과 구분한다.
     */
    private int runStep(String stepName, List<String> failedSteps, IntSupplier work) {
        try {
            Integer affectedRows = transactionTemplate.execute(status -> work.getAsInt());
            return affectedRows == null ? 0 : affectedRows;
        } catch (RuntimeException stepFailure) {
            log.error("[PII 보관기간 파기] step={} 실패 — 다음 단계는 계속 진행합니다", stepName, stepFailure);
            failedSteps.add(stepName);
            return -1;
        }
    }

    private static boolean isNonPositive(Period period) {
        return period.isZero() || period.isNegative();
    }
}
