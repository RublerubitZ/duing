package com.duing.domain.user.service;

import com.duing.domain.user.entity.PhoneVerification;
import com.duing.domain.user.entity.PhoneVerificationStatus;
import com.duing.domain.user.exception.PhoneVerificationException;
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
import org.springframework.stereotype.Service;

/**
 * MO 인증 오케스트레이터 — <b>의도적으로 트랜잭션 경계를 갖지 않는다.</b>
 *
 * <p>Octomo 외부 콜이 커넥션을 점유하지 않도록, 행잠금 쓰기(발급 upsert·인증 확정)는
 * {@link PhoneVerificationSessionManager} 의 짧은 자체 트랜잭션으로 위임한다. 무트랜잭션 조회가
 * 반환하는 엔티티는 detached 스냅샷이며(지연 로딩 연관 없음) 판정·응답 조립에만 쓴다.
 */
@Slf4j
@Service
public class GeneralPhoneVerificationService implements PhoneVerificationService {

    /** Octomo exists 조회 창(분) — 세션 유효시간(5분)과 정렬한다 (spec §2.1). */
    private static final int EXISTS_WITHIN_MINUTES = (int) PhoneVerification.VALIDITY.toMinutes();

    private final PhoneVerificationRepository phoneVerificationRepository;
    private final PhoneVerificationSessionManager sessionManager;
    private final UserRepository userRepository;
    private final PhoneVerificationCodeDeriver codeDeriver;
    private final PhoneVerificationRateLimiter rateLimiter;
    private final MoPollThrottle moPollThrottle;
    private final MoVerificationClient moVerificationClient;
    private final String moInboundNumber;

    public GeneralPhoneVerificationService(PhoneVerificationRepository phoneVerificationRepository,
                                           PhoneVerificationSessionManager sessionManager,
                                           UserRepository userRepository,
                                           PhoneVerificationCodeDeriver codeDeriver,
                                           PhoneVerificationRateLimiter rateLimiter,
                                           MoPollThrottle moPollThrottle,
                                           MoVerificationClient moVerificationClient,
                                           @Value("${mo.inbound-number}") String moInboundNumber) {
        this.phoneVerificationRepository = phoneVerificationRepository;
        this.sessionManager = sessionManager;
        this.userRepository = userRepository;
        this.codeDeriver = codeDeriver;
        this.rateLimiter = rateLimiter;
        this.moPollThrottle = moPollThrottle;
        this.moVerificationClient = moVerificationClient;
        this.moInboundNumber = moInboundNumber;
    }

    @Override
    public PhoneVerificationIssueResult issue(IssuePhoneVerificationCommand issueCommand, String clientIp) {
        LocalDateTime now = LocalDateTime.now();
        rateLimiter.assertAndRecordIssueIpRequest(clientIp, now);

        // 이미 가입된 번호면 발급하지 않고 즉시 409 — 이메일 인증의 발송 전 409 와 동일한 UX 우선
        // 트레이드오프. 권위 있는 차단은 PR2 signup 의 existsByPhone 재검증이 담당한다 (spec §7.1).
        if (userRepository.existsByPhone(issueCommand.phone())) {
            throw new PhoneVerificationException.PhoneAlreadyRegisteredException();
        }

        String token = UUID.randomUUID().toString();
        PhoneVerification phoneVerification =
                sessionManager.upsert(issueCommand.phone(), token, issueCommand.purpose(), now);
        String code = codeDeriver.deriveCode(token);
        // QR 발급(외부 콜)은 upsert 트랜잭션 커밋 이후 — 행잠금을 쥔 채 외부 지연을 기다리지 않는다.
        String qrCode = issueCommand.includeQr()
                ? moVerificationClient.createSmsQrCode(code).orElse(null)
                : null;
        return new PhoneVerificationIssueResult(
                phoneVerification.getToken(), code, moInboundNumber, qrCode,
                phoneVerification.getExpiresAt(), phoneVerification.remainingSeconds(now));
    }

    @Override
    public PhoneVerificationStatusResult getStatus(String verificationToken, String clientIp, String userAgent) {
        LocalDateTime now = LocalDateTime.now();
        rateLimiter.assertAndRecordStatusIpRequest(clientIp, now);
        PhoneVerification phoneVerification = phoneVerificationRepository.findByToken(verificationToken)
                .orElseThrow(PhoneVerificationException.PhoneVerificationNotFoundException::new);

        if (phoneVerification.status(now) == PhoneVerificationStatus.PENDING
                && moPollThrottle.tryAcquire(verificationToken, now)) {
            moPollThrottle.reserveDailyQuota(now);
            // 외부 콜은 트랜잭션·커넥션 미점유 상태에서 수행한다.
            if (inboundMessageArrived(phoneVerification)) {
                // 확정은 신선한 영속성 컨텍스트의 행잠금 트랜잭션에서 — 멱등 가드가 stale 없이 동작한다.
                return sessionManager.confirmIfPending(verificationToken, clientIp, userAgent);
            }
        }
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
            // 조회는 부작용이 없어 다음 폴링이 자연 재시도한다 — PENDING 유지. ERROR 는 Sentry 이벤트가
            // 되므로 벤더 응답 바디가 섞일 수 있는 예외 체인은 싣지 않는다(어댑터 로깅 정책과 동일).
            log.error("Octomo 수신 조회 실패 — PENDING 을 유지한다. reason={}", providerFailure.getMessage());
            return false;
        }
    }
}
