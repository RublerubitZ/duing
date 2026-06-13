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
        if (userRepository.existsByEmail(sendCommand.email())) {
            throw new UserException.DuplicateEmailException();
        }

        String code = verificationCodeManager.generateCode();
        String codeHash = verificationCodeManager.hash(sendCommand.email(), code);
        EmailVerification emailVerification = upsertVerification(sendCommand.email(), codeHash, now);

        // 발송 직전에 전역 일일 쿼터를 원자적으로 예약 — 중복/쿨다운으로 발송에 이르지 못한
        // 요청은 쿼터를 소비하지 않는다. 한도 초과 시 503.
        rateLimiter.reserveGlobalQuota(now);
        // 발송 실패(EmailException.SendFailedException) 시 트랜잭션 롤백 — 쿨다운 페널티가 남지 않는다.
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
