package com.duing.domain.user.service;

import com.duing.domain.user.entity.PhoneVerification;
import com.duing.domain.user.entity.PhoneVerificationStatus;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.VerificationPurpose;
import com.duing.domain.user.exception.PhoneVerificationException;
import com.duing.domain.user.exception.UserException;
import com.duing.domain.user.repository.PhoneVerificationRepository;
import com.duing.domain.user.repository.UserRepository;
import com.duing.domain.user.service.dto.command.IssuePhoneVerificationCommand;
import com.duing.domain.user.service.dto.query.PasswordResetStartResult;
import com.duing.domain.user.service.dto.query.PhoneVerificationIssueResult;
import com.duing.domain.user.service.dto.query.PhoneVerificationStatusResult;
import com.duing.domain.user.support.PhoneMasker;
import com.duing.global.mo.MoProviderException;
import com.duing.global.mo.MoVerificationClient;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.Optional;
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
 *
 * <p>시각은 seoulClock 기준 — 일일 쿼터의 KST 자정 롤오버와 PII 파기 잡의 cutoff 정합을 위해
 * (prod JVM 은 UTC).
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
    private final Clock clock;
    private final String moInboundNumber;

    public GeneralPhoneVerificationService(PhoneVerificationRepository phoneVerificationRepository,
                                           PhoneVerificationSessionManager sessionManager,
                                           UserRepository userRepository,
                                           PhoneVerificationCodeDeriver codeDeriver,
                                           PhoneVerificationRateLimiter rateLimiter,
                                           MoPollThrottle moPollThrottle,
                                           MoVerificationClient moVerificationClient,
                                           Clock clock,
                                           @Value("${mo.inbound-number}") String moInboundNumber) {
        this.phoneVerificationRepository = phoneVerificationRepository;
        this.sessionManager = sessionManager;
        this.userRepository = userRepository;
        this.codeDeriver = codeDeriver;
        this.rateLimiter = rateLimiter;
        this.moPollThrottle = moPollThrottle;
        this.moVerificationClient = moVerificationClient;
        this.clock = clock;
        this.moInboundNumber = moInboundNumber;
    }

    @Override
    public PhoneVerificationIssueResult issue(IssuePhoneVerificationCommand issueCommand, String clientIp) {
        LocalDateTime now = LocalDateTime.now(clock);
        rateLimiter.assertAndRecordIssueIpRequest(clientIp, now);

        // purpose 별 발급 전 중복검사 (spec §7.1·§7.5) — 어느 경우든 권위 있는 차단은 완료 API 의
        // 재검증 + DB 유니크가 담당하고, 여기는 UX 선안내다.
        switch (issueCommand.purpose()) {
            // 이미 가입된 번호면 즉시 409 — 이메일 인증의 발송 전 409 와 동일한 UX 우선 트레이드오프.
            case SIGNUP -> {
                if (userRepository.existsByPhone(issueCommand.phone())) {
                    throw new PhoneVerificationException.PhoneAlreadyRegisteredException();
                }
            }
            // 타인 소유 번호만 409 — 자기 번호 재인증(소급 인증 경로)은 허용한다 (spec §7.5).
            case PHONE_CHANGE -> {
                if (userRepository.existsByPhoneAndIdNot(issueCommand.phone(), issueCommand.targetUserId())) {
                    throw new PhoneVerificationException.PhoneAlreadyRegisteredException();
                }
            }
            // 계정에 등록된 번호로만 발급되므로 중복검사가 성립하지 않는다 (spec §10.2).
            case PASSWORD_RESET -> { }
        }

        String token = UUID.randomUUID().toString();
        PhoneVerification phoneVerification = sessionManager.upsert(
                issueCommand.phone(), token, issueCommand.purpose(), issueCommand.targetUserId(), now);
        String code = codeDeriver.deriveCode(token);
        // QR 발급(외부 콜)은 upsert 트랜잭션 커밋 이후 — 행잠금을 쥔 채 외부 지연을 기다리지 않는다.
        String qrCode = issueCommand.includeQr() ? createQrCodeWithinQuota(code, now) : null;
        return new PhoneVerificationIssueResult(
                phoneVerification.getToken(), code, moInboundNumber, qrCode,
                phoneVerification.getExpiresAt(), phoneVerification.remainingSeconds(now));
    }

    @Override
    public PasswordResetStartResult startPasswordReset(String studentId, boolean includeQr, String clientIp) {
        LocalDateTime now = LocalDateTime.now(clock);
        // 계정 존재 여부와 무관하게 IP 발급 리밋을 먼저 건다 — 미존재 학번 400 경로도 카운트해야
        // 한 IP 의 학번 열거와 resetStart 맵 무한 성장을 막는다 (spec §11 "IP — 인증 시작"). happy path 는
        // 내부 issue() 가 한 번 더 기록하지만, 재설정 시작은 드문 동작이라 이 보수적 이중 계수는 무해하다.
        rateLimiter.assertAndRecordIssueIpRequest(clientIp, now);
        rateLimiter.assertAndRecordPasswordResetStart(studentId, now);

        // @SQLRestriction 으로 탈퇴 계정은 조회되지 않는다 — 미존재와 동일한 400 으로 수렴(사유 미특정).
        User targetUser = userRepository.findByStudentId(studentId)
                .orElseThrow(UserException.PasswordResetNotAllowedException::new);

        PhoneVerificationIssueResult issueResult = issue(
                new IssuePhoneVerificationCommand(
                        targetUser.getPhone(), VerificationPurpose.PASSWORD_RESET, includeQr, targetUser.getId()),
                clientIp);
        return new PasswordResetStartResult(issueResult, PhoneMasker.mask(targetUser.getPhone()));
    }

    @Override
    public PhoneVerificationStatusResult getStatus(String verificationToken, String clientIp, String userAgent) {
        LocalDateTime now = LocalDateTime.now(clock);
        rateLimiter.assertAndRecordStatusIpRequest(clientIp, now);
        PhoneVerification phoneVerification = phoneVerificationRepository.findByToken(verificationToken)
                .orElseThrow(PhoneVerificationException.PhoneVerificationNotFoundException::new);

        if (phoneVerification.status(now) == PhoneVerificationStatus.PENDING
                && moPollThrottle.tryAcquire(verificationToken, now)) {
            moPollThrottle.reserveDailyQuota(now);
            // 외부 콜은 트랜잭션·커넥션 미점유 상태에서 수행한다.
            if (inboundMessageArrived(phoneVerification, now)) {
                // 확정은 신선한 영속성 컨텍스트의 행잠금 트랜잭션에서 — 멱등 가드가 stale 없이 동작한다.
                return sessionManager.confirmIfPending(verificationToken, clientIp, userAgent);
            }
        }
        return new PhoneVerificationStatusResult(
                phoneVerification.status(now),
                phoneVerification.remainingSeconds(now),
                PhoneMasker.mask(phoneVerification.getPhone()));
    }

    /**
     * QR 발급도 실제 Octomo 콜이므로 일일 쿼터를 소비한다 (spec §6 예산의 "PC QR 1콜") — 발급이
     * permitAll 이라 계상 없이는 qr=true 반복으로 내부 카운터가 0 인 채 벤더 쿼터만 소진된다.
     * 쿼터 소진·벤더 실패 어느 쪽도 발급 자체는 막지 않는다 — QR 은 부가 기능이라 텍스트 안내로 폴백한다.
     */
    private String createQrCodeWithinQuota(String code, LocalDateTime now) {
        try {
            moPollThrottle.reserveDailyQuota(now);
        } catch (PhoneVerificationException.SmsPollQuotaExceededException quotaExhausted) {
            // 소진 경보는 reserveDailyQuota 가 하루 1회 ERROR 로 남긴다 — 여기서는 조용히 강등만.
            return null;
        }
        Optional<String> qrCode = moVerificationClient.createSmsQrCode(code);
        if (qrCode.isEmpty()) {
            // 벤더 호출 실패 — 실패 콜의 쿼터는 반환한다 (exists 경로와 동일 정책).
            moPollThrottle.releaseDailyQuota(now);
        }
        return qrCode.orElse(null);
    }

    private boolean inboundMessageArrived(PhoneVerification phoneVerification, LocalDateTime now) {
        // Octomo 는 하이픈 없는 숫자 형식(공식 샘플 예시 기준) — 저장 형식(010-XXXX-XXXX)에서 정규화한다.
        String mobileNum = phoneVerification.getPhone().replace("-", "");
        String code = codeDeriver.deriveCode(phoneVerification.getToken());
        try {
            return moVerificationClient.messageExists(mobileNum, code, EXISTS_WITHIN_MINUTES);
        } catch (MoProviderException providerFailure) {
            // 조회는 부작용이 없어 다음 폴링이 자연 재시도한다 — PENDING 유지. 실패 콜의 쿼터는 반환해
            // 벤더 장애가 하루 예산을 소진(복구 후에도 종일 503)하지 않게 한다. ERROR 는 Sentry 이벤트가
            // 되므로 벤더 응답 바디가 섞일 수 있는 예외 체인은 싣지 않는다(어댑터 로깅 정책과 동일).
            moPollThrottle.releaseDailyQuota(now);
            log.error("Octomo 수신 조회 실패 — PENDING 을 유지한다. reason={}", providerFailure.getMessage());
            return false;
        }
    }
}
