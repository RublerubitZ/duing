package com.duing.global.email;

import jakarta.mail.MessagingException;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import java.io.UnsupportedEncodingException;
import java.nio.charset.StandardCharsets;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.mail.MailAuthenticationException;
import org.springframework.mail.MailException;
import org.springframework.mail.MailParseException;
import org.springframework.mail.MailPreparationException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Component;

/**
 * Brevo SMTP(smtp-relay.brevo.com:587, STARTTLS) 로 발송하는 폴백 MailProvider.
 *
 * <p>Resend 가 429(무료 플랜 일일 한도)·5xx·타임아웃 등 일시 장애일 때
 * {@link FallbackEmailSender} 가 두 번째 순번으로 호출한다. SMTP 호스트·크레덴셜
 * (BREVO_SMTP_LOGIN/KEY)·타임아웃은 {@code spring.mail.*} 자동설정(JavaMailSender)으로 주입된다.
 *
 * <p>실패 분류 — 인증 실패(크레덴셜 오류·미주입)와 메시지 구성 오류(잘못된 수신자 형식 포함)는
 * 재시도 불가, 그 외 SMTP 전송 실패(릴레이 접속 불가·타임아웃)는 일시 장애로 보고 재시도 가능.
 * 한글 제목·발신자명·본문은 UTF-8 로 인코딩한다(SMTP 는 JSON API 와 달리 명시하지 않으면 깨진다).
 *
 * <p>알려진 한계 — {@code MailSendException} 은 수신자 거부(jakarta {@code SendFailedException},
 * 영구 550 과 일시 451 이 혼재)까지 감싸므로 "재시도 가능" 분류가 다소 넓다. 현 체인에서 Brevo 가
 * 마지막 순번이라 이 분류는 동작에 영향을 주지 않는다. Brevo 뒤에 Provider 를 추가하게 되면
 * SMTP 응답 코드 기반 세분화를 함께 검토할 것.
 *
 * <p>{@code email.provider=resend}(실발송 체인) 일 때만 활성.
 */
@Component
@RequiredArgsConstructor
@ConditionalOnProperty(name = "email.provider", havingValue = "resend")
public class BrevoMailProvider implements MailProvider {

    private final JavaMailSender brevoMailSender;
    private final BrevoProperties brevoProperties;

    @Override
    public String name() {
        return "Brevo";
    }

    @Override
    public void send(EmailMessage emailMessage) {
        MimeMessage mimeMessage = brevoMailSender.createMimeMessage();
        try {
            MimeMessageHelper messageHelper = new MimeMessageHelper(mimeMessage, StandardCharsets.UTF_8.name());
            messageHelper.setFrom(encodedFromAddress());
            messageHelper.setTo(emailMessage.to());
            messageHelper.setSubject(emailMessage.subject());
            messageHelper.setText(emailMessage.html(), true);
        } catch (MessagingException | UnsupportedEncodingException messageBuildFailure) {
            throw new MailProviderException("MESSAGE", false, messageBuildFailure);
        }
        try {
            brevoMailSender.send(mimeMessage);
        } catch (MailAuthenticationException authenticationFailure) {
            throw new MailProviderException("AUTH", false, authenticationFailure);
        } catch (MailParseException | MailPreparationException messageFailure) {
            throw new MailProviderException("MESSAGE", false, messageFailure);
        } catch (MailException smtpFailure) {
            throw new MailProviderException("SMTP", true, smtpFailure);
        }
    }

    /**
     * {@code "두잉 <noreply@duings.com>"} 형태의 설정값을 파싱한 뒤 표시 이름을 UTF-8 로
     * 재인코딩한다 — 한글 표시 이름을 RFC 2047 인코딩 없이 헤더에 그대로 쓰는 것을 방지.
     */
    private InternetAddress encodedFromAddress() throws MessagingException, UnsupportedEncodingException {
        InternetAddress parsedFrom = new InternetAddress(brevoProperties.from());
        return new InternetAddress(parsedFrom.getAddress(), parsedFrom.getPersonal(), StandardCharsets.UTF_8.name());
    }
}
