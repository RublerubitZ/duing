package com.duing.domain.user.service;

import com.duing.domain.user.entity.PhoneVerification;
import com.duing.domain.user.entity.PhoneVerificationStatus;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.VerificationPurpose;
import com.duing.domain.user.exception.PhoneVerificationException;
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

    /**
     * V19 가 기존 계정에 백필한 번호 placeholder — 실번호가 아니다(V19:13, users_phone_format_chk 예외값).
     * V19:8 이 예고한 운영 백필 마이그레이션이 아직 저장소에 없어 활성 레거시 계정에 남아 있을 수 있다.
     */
    private static final String PLACEHOLDER_PHONE = "010-0000-0000";

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
            // 계정 등록 번호(또는 미가입 학번의 decoy 번호)로만 발급되므로 중복검사가 성립하지 않는다 (spec §10.2).
            case PASSWORD_RESET -> { }
        }

        // 쿨다운(60초)과 별개의 번호+IP당 발급 총량 상한(시간당 5회) — 검사는 여기서, 기록은 upsert 성공
        // 후에만 한다. 쿨다운·중복 409 로 끝난 재시도가 한도를 소진해 정상 사용자가 잠기는 것을 막고,
        // 키에 IP 를 섞어 타 IP 공격자의 반복 발급이 정당 소유자의 가입·재설정을 잠그지 못하게 한다.
        rateLimiter.assertIssuePhoneWithinLimit(issueCommand.phone(), clientIp, now);

        String token = UUID.randomUUID().toString();
        PhoneVerification phoneVerification = sessionManager.upsert(
                issueCommand.phone(), token, issueCommand.purpose(), issueCommand.targetUserId(), now);
        rateLimiter.recordIssuePhoneRequest(issueCommand.phone(), clientIp, now);
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
        // 학번 리밋은 세션 발급(외부 QR 콜 포함)보다 먼저 — 계정 존재 여부와 무관하게 소모한다
        // (spec §11 "학번 — 재설정 시작"). IP 발급 창은 아래 issue() 가 단독으로 계수한다: 여기서 한 번 더
        // 기록하면 미존재 학번은 1회, 존재 학번은 2회를 소모해 "429 가 몇 번째 요청에서 뜨는지"로 실계정을
        // 셀 수 있는 계수 오라클이 남는다(상태코드를 균일하게 만들어도 카운터가 샌다).
        // IP 창 '선검사' — 기록은 하지 않는다. 아래 학번 창은 새 학번마다 항상 통과하므로, 이 검사가 없으면
        // 비인증 요청 하나당 학번 엔트리 하나가 무조건 설치돼(8자리 공간 1e8, 만료 정리 없음) 단일 IP 로
        // 힙을 고갈시킬 수 있다. 기록은 아래 issue() 가 단독으로 해 "요청당 IP 예산 1" 을 유지한다
        // (여기서도 기록하면 열거 오라클이 생기지는 않지만 재설정 실효 예산이 시 600→300 으로 반감된다).
        rateLimiter.assertIssueIpWithinLimit(clientIp, now);
        rateLimiter.assertAndRecordPasswordResetStart(studentId, now);

        // 미가입·탈퇴(@SQLRestriction) 학번도 400 이 아니라 학번에서 파생한 decoy 번호로 실제 세션을 발급해
        // 균일한 202 를 돌려준다 (spec §7.6). 가짜 토큰만 만들어 응답을 흉내 내면 후속 폴링이 404, 재시도가
        // 쿨다운 없이 202 라 열거가 그대로 복원된다 — 같은 issue() 를 그대로 타야 쿨다운·폴링·리밋·QR
        // 왕복 시간까지 존재 계정과 구분되지 않는다.
        User targetUser = userRepository.findByStudentId(studentId).orElse(null);
        // 실계정이어도 번호가 V19 placeholder 면 decoy 로 보낸다. 두 가지를 동시에 막는다:
        // (1) mask('010-0000-0000') = '010-****-0000' 는 고정값이라, 그 값이 나오는 것만으로 해당 학번이
        //     레거시 실계정임이 익명 1회 요청에 확정된다(decoy 가 우연히 0000 으로 끝날 확률은 1/10,000).
        // (2) ux_users_phone 은 placeholder 를 제외하지만(V19:28-30) uk_phone_verifications_phone(V79:17)은
        //     제외가 없어, placeholder 계정 전원이 세션 행 하나를 공유하며 서로의 재설정을 쿨다운 429 로 막는다.
        // 기능 손실은 없다 — placeholder 번호는 소유자가 없어 어차피 MO 인증을 완료할 수 없다.
        boolean hasReachablePhone = targetUser != null
                && !PLACEHOLDER_PHONE.equals(targetUser.getPhone());
        // targetUserId=null 이 decoy 의 안전판이다 — 만에 하나 VERIFIED 에 도달해도 완료 API 가 400 으로 막는다.
        Long targetUserId = hasReachablePhone ? targetUser.getId() : null;
        String sessionPhone = hasReachablePhone
                ? targetUser.getPhone() : codeDeriver.deriveDecoyPhone(studentId);

        PhoneVerificationIssueResult issueResult = issue(
                new IssuePhoneVerificationCommand(
                        sessionPhone, VerificationPurpose.PASSWORD_RESET, includeQr, targetUserId),
                clientIp);
        return new PasswordResetStartResult(issueResult, PhoneMasker.mask(sessionPhone));
    }

    @Override
    public PhoneVerificationStatusResult getStatus(String verificationToken, String clientIp, String userAgent) {
        LocalDateTime now = LocalDateTime.now(clock);
        // IP 백스톱은 조회보다 먼저 — 실재하지 않는 토큰의 스팸을 세는 창이 이것뿐이다.
        rateLimiter.assertAndRecordStatusIpRequest(clientIp, now);
        PhoneVerification phoneVerification = phoneVerificationRepository.findByToken(verificationToken)
                .orElseThrow(PhoneVerificationException.PhoneVerificationNotFoundException::new);
        // 폴링의 실제 상한은 토큰 창이다 — 실재를 확인한 뒤 걸어 랜덤 토큰이 창을 설치하지 못하게 한다.
        rateLimiter.assertAndRecordStatusTokenRequest(verificationToken, now);

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
