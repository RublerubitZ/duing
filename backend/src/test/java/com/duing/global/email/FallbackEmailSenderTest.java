package com.duing.global.email;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.duing.global.email.exception.EmailException;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.slf4j.LoggerFactory;

@ExtendWith(MockitoExtension.class)
class FallbackEmailSenderTest {

    private static final EmailMessage MESSAGE =
            new EmailMessage("hong@daegu.ac.kr", "[DUING] 두잉 동아리 서비스 인증 코드", "<p>123456</p>");

    @Mock MailProvider resendProvider;
    @Mock MailProvider brevoProvider;

    FallbackEmailSender fallbackEmailSender;

    @BeforeEach
    void setUp() {
        fallbackEmailSender = new FallbackEmailSender(List.of(resendProvider, brevoProvider));
    }

    @Test
    @DisplayName("Provider 가 하나도 없는 체인은 생성 시점에 거부된다")
    void rejectsEmptyProviderChain() {
        assertThatThrownBy(() -> new FallbackEmailSender(List.of()))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("첫 번째 Provider 발송이 성공하면 다음 Provider 를 호출하지 않는다")
    void doesNotFallBackWhenPrimarySucceeds() {
        assertThatCode(() -> fallbackEmailSender.send(MESSAGE)).doesNotThrowAnyException();

        verify(resendProvider).send(MESSAGE);
        verify(brevoProvider, never()).send(any());
    }

    @Test
    @DisplayName("첫 번째 Provider 가 재시도 가능한 오류로 실패하면 다음 Provider 로 폴백해 발송한다")
    void fallsBackToNextProviderOnRetryableFailure() {
        doThrow(retryableFailure("429")).when(resendProvider).send(MESSAGE);

        assertThatCode(() -> fallbackEmailSender.send(MESSAGE)).doesNotThrowAnyException();

        verify(brevoProvider).send(MESSAGE);
    }

    @Test
    @DisplayName("재시도 불가 오류(잘못된 요청 등)면 다음 Provider 를 호출하지 않고 발송 실패 예외를 던진다")
    void doesNotFallBackOnNonRetryableFailure() {
        doThrow(nonRetryableFailure("400")).when(resendProvider).send(MESSAGE);

        assertThatThrownBy(() -> fallbackEmailSender.send(MESSAGE))
                .isInstanceOf(EmailException.SendFailedException.class);

        verify(brevoProvider, never()).send(any());
    }

    @Test
    @DisplayName("모든 Provider 가 실패하면 발송 실패 예외를 던진다")
    void throwsSendFailedWhenAllProvidersFail() {
        doThrow(retryableFailure("503")).when(resendProvider).send(MESSAGE);
        doThrow(retryableFailure("TIMEOUT")).when(brevoProvider).send(MESSAGE);

        assertThatThrownBy(() -> fallbackEmailSender.send(MESSAGE))
                .isInstanceOf(EmailException.SendFailedException.class);

        verify(resendProvider).send(MESSAGE);
        verify(brevoProvider).send(MESSAGE);
    }

    @Test
    @DisplayName("마지막 Provider 의 재시도 불가 실패도 발송 실패 예외로 변환된다")
    void wrapsNonRetryableFailureOfLastProvider() {
        doThrow(retryableFailure("500")).when(resendProvider).send(MESSAGE);
        doThrow(nonRetryableFailure("AUTH")).when(brevoProvider).send(MESSAGE);

        assertThatThrownBy(() -> fallbackEmailSender.send(MESSAGE))
                .isInstanceOf(EmailException.SendFailedException.class);
    }

    @Test
    @DisplayName("폴백 경로에서 Provider 실패·재시도·성공을 스펙 포맷 로그로 남긴다")
    void logsProviderOutcomesOnFallbackPath() {
        Logger fallbackLogger = (Logger) LoggerFactory.getLogger(FallbackEmailSender.class);
        ListAppender<ILoggingEvent> logAppender = new ListAppender<>();
        logAppender.start();
        fallbackLogger.addAppender(logAppender);
        try {
            when(resendProvider.name()).thenReturn("Resend");
            when(brevoProvider.name()).thenReturn("Brevo");
            doThrow(retryableFailure("429")).when(resendProvider).send(MESSAGE);

            fallbackEmailSender.send(MESSAGE);

            List<String> logLines = logAppender.list.stream()
                    .map(ILoggingEvent::getFormattedMessage)
                    .toList();
            assertThat(logLines).containsSequence(
                    "[Mail] Provider=Resend FAILED (429)",
                    "[Mail] Retry using Brevo",
                    "[Mail] Provider=Brevo SUCCESS");
        } finally {
            fallbackLogger.detachAppender(logAppender);
        }
    }

    @Test
    @DisplayName("최종 실패 ERROR 로그에는 예외 스택을 붙이지 않는다 — 벤더 응답 본문의 PII 가 Sentry 로 새지 않도록")
    void terminalErrorLogCarriesNoThrowable() {
        Logger fallbackLogger = (Logger) LoggerFactory.getLogger(FallbackEmailSender.class);
        ListAppender<ILoggingEvent> logAppender = new ListAppender<>();
        logAppender.start();
        fallbackLogger.addAppender(logAppender);
        try {
            doThrow(retryableFailure("503")).when(resendProvider).send(MESSAGE);
            doThrow(retryableFailure("SMTP")).when(brevoProvider).send(MESSAGE);

            assertThatThrownBy(() -> fallbackEmailSender.send(MESSAGE))
                    .isInstanceOf(EmailException.SendFailedException.class);

            List<ILoggingEvent> errorEvents = logAppender.list.stream()
                    .filter(logEvent -> logEvent.getLevel() == Level.ERROR)
                    .toList();
            List<ILoggingEvent> warnEvents = logAppender.list.stream()
                    .filter(logEvent -> logEvent.getLevel() == Level.WARN)
                    .toList();

            // Sentry 로 전송되는 ERROR 에는 스택(벤더 응답 본문 포함 가능)이 없어야 한다.
            assertThat(errorEvents).isNotEmpty();
            assertThat(errorEvents)
                    .allSatisfy(logEvent -> assertThat(logEvent.getThrowableProxy()).isNull());
            // 진단용 상세 스택은 Sentry 로 가지 않는 WARN 에 남는다.
            assertThat(warnEvents).isNotEmpty();
            assertThat(warnEvents)
                    .allSatisfy(logEvent -> assertThat(logEvent.getThrowableProxy()).isNotNull());
        } finally {
            fallbackLogger.detachAppender(logAppender);
        }
    }

    private MailProviderException retryableFailure(String reason) {
        return new MailProviderException(reason, true, null);
    }

    private MailProviderException nonRetryableFailure(String reason) {
        return new MailProviderException(reason, false, null);
    }
}
