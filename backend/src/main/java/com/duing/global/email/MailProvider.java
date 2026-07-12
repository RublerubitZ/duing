package com.duing.global.email;

/**
 * 개별 메일 발송 벤더(Resend·Brevo …) SPI.
 *
 * <p>{@link EmailSender} 가 호출부(도메인 서비스)를 향한 포트라면, MailProvider 는 그 아래에서
 * 벤더 하나를 감싸는 어댑터다. {@link FallbackEmailSender} 가 Provider 체인을 순서대로 시도하며,
 * 실패의 폴백 가능 여부는 구현체가 던지는 {@link MailProviderException#isRetryable()} 로 판단한다.
 */
public interface MailProvider {

    /** 로그 표기용 Provider 이름 (예: {@code Resend}, {@code Brevo}). */
    String name();

    /**
     * 이메일을 동기 발송한다.
     *
     * @throws MailProviderException 발송 실패 시 — 재시도(폴백) 가능 여부를 분류해 던진다
     */
    void send(EmailMessage emailMessage);
}
