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
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

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
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class PiiRetentionJob {

    /** MO 인증 세션은 단명 데이터 — 만료 후 1일이면 파기한다 (보관기간 window 와 별도, spec §9.4). */
    private static final Period PHONE_VERIFICATION_RETENTION = Period.ofDays(1);

    /** 파기된 자유서술 답변 자리에 남기는 문구 — 총동연 문의 파기(FederationInquiryPurgeJob)와 같은 표현(스펙 §3.2). */
    static final String ANSWER_PURGED_PLACEHOLDER = "(보관기간 경과로 파기되었습니다)";

    private final RetentionProperties properties;
    private final Clock clock;
    private final UserRepository userRepository;
    private final ApplicationRepository applicationRepository;
    private final PhoneVerificationRepository phoneVerificationRepository;
    private final PhoneVerificationEventRepository phoneVerificationEventRepository;
    private final ApplicationDraftRepository applicationDraftRepository;

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
        int purgedApplicationAnswers = applicationRepository.purgeExpiredTextAnswers(
                closedCutoffDate, withdrawnCutoff, ANSWER_PURGED_PLACEHOLDER);
        int deletedApplicationDrafts = applicationDraftRepository.deleteExpired(closedCutoffDate, withdrawnCutoff);
        int deletedPhoneVerifications = phoneVerificationRepository.deleteExpiredVerifications(phoneVerificationCutoff);
        int deletedPhoneVerificationEvents = phoneVerificationEventRepository.deleteExpiredEvents(withdrawnCutoff);
        // 건수와 cutoff 만 남긴다 — 답변 내용·사용자 식별자는 로그에 쓰지 않는다(스펙 §3.4).
        log.info("[PII 보관기간 파기] usersAnonymized={}, applicationsScrubbed={}, applicationAnswersPurged={}, "
                        + "applicationDraftsDeleted={}, phoneVerificationsDeleted={}, phoneVerificationEventsDeleted={}, "
                        + "withdrawnCutoff={}, closedCutoffDate={}",
                anonymizedUsers, scrubbedApplications, purgedApplicationAnswers, deletedApplicationDrafts,
                deletedPhoneVerifications, deletedPhoneVerificationEvents, withdrawnCutoff, closedCutoffDate);
    }

    private static boolean isNonPositive(Period period) {
        return period.isZero() || period.isNegative();
    }
}
