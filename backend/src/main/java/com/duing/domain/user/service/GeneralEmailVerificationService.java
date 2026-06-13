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

    private static final String SUBJECT = "[DUING] 두잉 동아리 서비스 인증 코드";

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
        try {
            emailSender.send(new EmailMessage(sendCommand.email(), SUBJECT, buildHtml(code)));
        } catch (RuntimeException sendFailure) {
            // 발송 실패 시 예약한 전역 쿼터를 복구한다 — Resend 장애가 일일 한도를 소진해
            // 정상 가입을 막는 자폭을 방지. DB 변경(쿨다운 행)은 트랜잭션 롤백으로 별도 복구된다.
            rateLimiter.releaseGlobalQuota(now);
            throw sendFailure;
        }
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
        // 이메일 클라이언트(Gmail·Outlook 등) 호환을 위해 테이블 레이아웃 + 인라인 CSS 로 작성한다.
        // 코드 치환은 .formatted 가 아니라 .replace 를 쓴다 — CSS 의 width:100% 등 `%` 가
        // String.format 포맷 지정자로 오인되는 것을 피하기 위해서다.
        // 색상은 Du-ing 브랜드 토큰을 쓰되 ink-deep(#143025)은 제외한다 — 순수 6자리 숫자라
        // 인증코드 추출 정규식(\\d{6})에 오매칭될 수 있다(나머지 색은 알파벳 포함이라 안전).
        return """
                <!DOCTYPE html>
                <html lang="ko">
                <head>
                  <meta charset="utf-8">
                  <meta name="viewport" content="width=device-width, initial-scale=1">
                </head>
                <body style="margin:0;padding:0;background-color:#F6F3EC;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F6F3EC;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Noto Sans KR','Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                    <tr>
                      <td align="center">
                        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="width:480px;max-width:480px;background-color:#FFFFFF;border:1px solid #EFEBE0;border-radius:16px;">
                          <tr>
                            <td style="padding:32px 36px 0;">
                              <a href="https://duings.com" target="_blank" style="display:inline-block;text-decoration:none;">
                                <img src="https://files.duings.com/logo/duing-logo-small.png" alt="두잉" width="84" height="56" style="width:84px;height:56px;border:0;display:block;outline:none;text-decoration:none;">
                              </a>
                            </td>
                          </tr>
                          <tr>
                            <td style="padding:22px 36px 4px;">
                              <h1 style="margin:0 0 8px;font-size:21px;font-weight:700;color:#1F4A36;">이메일을 인증해주세요</h1>
                              <p style="margin:0;font-size:15px;line-height:1.6;color:#4A504F;">아래 6자리 인증코드를 회원가입 화면에 입력하면 가입이 완료돼요.</p>
                            </td>
                          </tr>
                          <tr>
                            <td style="padding:20px 36px;">
                              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                  <td align="center" style="background-color:#F6F3EC;border:2px solid #D97757;border-radius:12px;padding:18px 0;">
                                    <span style="font-size:34px;font-weight:700;letter-spacing:10px;color:#1F4A36;font-family:Consolas,'Courier New',monospace;">{{CODE}}</span>
                                  </td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                          <tr>
                            <td style="padding:0 36px 22px;">
                              <p style="margin:0;font-size:13px;color:#6F7574;">이 코드는 발송 시점부터 <strong style="color:#4A504F;">20분간</strong> 유효해요.</p>
                            </td>
                          </tr>
                          <tr>
                            <td style="padding:0 36px 24px;">
                              <div style="border-top:1px solid #EFEBE0;padding-top:16px;">
                                <p style="margin:0;font-size:12px;line-height:1.6;color:#6F7574;">본인이 요청하지 않았다면 이 메일을 무시해주세요. 누군가 이메일 주소를 잘못 입력했을 수 있어요.</p>
                              </div>
                            </td>
                          </tr>
                          <tr>
                            <td align="center" style="padding:0 36px 32px;">
                              <a href="https://duings.com" target="_blank" style="display:inline-block;background-color:#1F4A36;color:#FFFFFF;font-size:14px;font-weight:600;text-decoration:none;padding:11px 24px;border-radius:8px;">두잉 둘러보기 →</a>
                            </td>
                          </tr>
                        </table>
                        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="width:480px;max-width:480px;">
                          <tr>
                            <td align="center" style="padding:18px 0;font-family:-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Noto Sans KR',sans-serif;">
                              <p style="margin:0 0 6px;font-size:12px;color:#6F7574;">본 메일은 발신 전용이에요. 이 메일로 회신하셔도 답변을 받을 수 없어요.</p>
                              <p style="margin:0;font-size:12px;color:#6F7574;">DUING · 대구대학교 동아리 플랫폼</p>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </body>
                </html>
                """.replace("{{CODE}}", code);
    }
}
