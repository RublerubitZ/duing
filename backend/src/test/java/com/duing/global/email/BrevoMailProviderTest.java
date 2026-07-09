package com.duing.global.email;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import jakarta.mail.Message;
import jakarta.mail.Session;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mail.MailAuthenticationException;
import org.springframework.mail.MailParseException;
import org.springframework.mail.MailSendException;
import org.springframework.mail.javamail.JavaMailSender;

@ExtendWith(MockitoExtension.class)
class BrevoMailProviderTest {

    private static final EmailMessage MESSAGE =
            new EmailMessage("hong@daegu.ac.kr", "[DUING] 두잉 동아리 서비스 인증 코드", "<p>123456</p>");

    @Mock JavaMailSender brevoMailSender;

    MimeMessage mimeMessage;
    BrevoMailProvider brevoMailProvider;

    @BeforeEach
    void setUp() {
        mimeMessage = new MimeMessage((Session) null);
        when(brevoMailSender.createMimeMessage()).thenReturn(mimeMessage);
        brevoMailProvider = new BrevoMailProvider(
                brevoMailSender, new BrevoProperties("두잉 <noreply@duings.com>"));
    }

    @Test
    @DisplayName("발송 성공 시 발신자·수신자·제목·HTML 본문이 담긴 MIME 메시지를 SMTP 로 전송한다")
    void sendBuildsMimeMessageAndSendsOverSmtp() throws Exception {
        assertThatCode(() -> brevoMailProvider.send(MESSAGE)).doesNotThrowAnyException();

        verify(brevoMailSender).send(mimeMessage);
        InternetAddress fromAddress = (InternetAddress) mimeMessage.getFrom()[0];
        assertThat(fromAddress.getAddress()).isEqualTo("noreply@duings.com");
        assertThat(fromAddress.getPersonal()).isEqualTo("두잉");
        assertThat(mimeMessage.getRecipients(Message.RecipientType.TO))
                .extracting(Object::toString)
                .containsExactly("hong@daegu.ac.kr");
        assertThat(mimeMessage.getSubject()).isEqualTo("[DUING] 두잉 동아리 서비스 인증 코드");
        assertThat(mimeMessage.getContent().toString()).contains("<p>123456</p>");
        assertThat(mimeMessage.getDataHandler().getContentType()).contains("text/html");
        assertThat(brevoMailProvider.name()).isEqualTo("Brevo");
    }

    @Test
    @DisplayName("잘못된 수신자 이메일 형식이면 SMTP 전송 없이 재시도 불가 실패로 분류한다")
    void classifiesInvalidRecipientAsNonRetryableWithoutSending() {
        EmailMessage invalidRecipientMessage =
                new EmailMessage("잘못된@@주소@@형식", "제목", "<p>본문</p>");

        assertThatThrownBy(() -> brevoMailProvider.send(invalidRecipientMessage))
                .isInstanceOfSatisfying(MailProviderException.class, sendFailure -> {
                    assertThat(sendFailure.isRetryable()).isFalse();
                    assertThat(sendFailure.reason()).isEqualTo("MESSAGE");
                });

        verify(brevoMailSender, never()).send(any(MimeMessage.class));
    }

    @Test
    @DisplayName("SMTP 인증 실패(크레덴셜 오류·미주입)는 재시도 불가 실패로 분류한다")
    void classifiesAuthenticationFailureAsNonRetryable() {
        doThrow(new MailAuthenticationException("535 authentication failed"))
                .when(brevoMailSender).send(mimeMessage);

        assertThatThrownBy(() -> brevoMailProvider.send(MESSAGE))
                .isInstanceOfSatisfying(MailProviderException.class, sendFailure -> {
                    assertThat(sendFailure.isRetryable()).isFalse();
                    assertThat(sendFailure.reason()).isEqualTo("AUTH");
                });
    }

    @Test
    @DisplayName("SMTP 릴레이 장애(전송 실패)는 재시도 가능한 실패로 분류한다")
    void classifiesSmtpSendFailureAsRetryable() {
        doThrow(new MailSendException("connection refused"))
                .when(brevoMailSender).send(mimeMessage);

        assertThatThrownBy(() -> brevoMailProvider.send(MESSAGE))
                .isInstanceOfSatisfying(MailProviderException.class, sendFailure -> {
                    assertThat(sendFailure.isRetryable()).isTrue();
                    assertThat(sendFailure.reason()).isEqualTo("SMTP");
                });
    }

    @Test
    @DisplayName("메시지 파싱 오류(템플릿·구성 결함)는 재시도 불가 실패로 분류한다")
    void classifiesMessageParseFailureAsNonRetryable() {
        doThrow(new MailParseException("malformed message"))
                .when(brevoMailSender).send(mimeMessage);

        assertThatThrownBy(() -> brevoMailProvider.send(MESSAGE))
                .isInstanceOfSatisfying(MailProviderException.class, sendFailure -> {
                    assertThat(sendFailure.isRetryable()).isFalse();
                    assertThat(sendFailure.reason()).isEqualTo("MESSAGE");
                });
    }
}
