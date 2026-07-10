package com.duing.global.privacy;

import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.user.repository.EmailVerificationRepository;
import com.duing.domain.user.repository.PhoneVerificationEventRepository;
import com.duing.domain.user.repository.PhoneVerificationRepository;
import com.duing.domain.user.repository.UserRepository;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.Period;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * PIPA 제21조(보관기간 종료 시 지체없는 파기) 대응 — soft-delete 된 지 보관기간(window)을 넘긴
 * 개인정보를 비식별화/삭제하는 스케줄 잡.
 *
 * <p>기본 비활성(enabled=false)이며 보관기간은 환경변수로 주입한다. 실제 보관기간은 법무/내부 방침
 * 확정 후 운영에서 활성화한다(코드에 하드코딩하지 않음).
 *
 * <p>네이티브 벌크 쿼리를 쓰는 이유: 대상이 soft-delete 된 행(@SQLRestriction 으로 JPA 가 못 보는 행)이라
 * JPQL 로는 접근할 수 없다. 사용자/지원서의 PII 컬럼은 비식별화하여(append-only 감사 로그·FK 무결성 보존)
 * PIPA 파기 의무를 만족시키고, email_verifications 의 일회용 코드(raw 이메일)는 물리 삭제한다.
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
    private final EmailVerificationRepository emailVerificationRepository;
    private final PhoneVerificationRepository phoneVerificationRepository;
    private final PhoneVerificationEventRepository phoneVerificationEventRepository;

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
        int deletedVerifications = emailVerificationRepository.deleteExpiredVerifications(cutoff);
        int deletedPhoneVerifications = phoneVerificationRepository
                .deleteExpiredVerifications(LocalDateTime.now(clock).minus(PHONE_VERIFICATION_RETENTION));
        int deletedPhoneVerificationEvents = phoneVerificationEventRepository.deleteExpiredEvents(cutoff);
        log.info("[PII 보관기간 파기] usersAnonymized={}, applicationsScrubbed={}, verificationsDeleted={}, "
                        + "phoneVerificationsDeleted={}, phoneVerificationEventsDeleted={}, cutoff={}",
                anonymizedUsers, scrubbedApplications, deletedVerifications,
                deletedPhoneVerifications, deletedPhoneVerificationEvents, cutoff);
    }
}
