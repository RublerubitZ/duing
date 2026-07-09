package com.duing.global.email;

/**
 * {@link MailProvider} 발송 실패 신호 — Provider 체인 내부 전용.
 *
 * <p>API 응답으로 매핑되는 예외가 아니다. {@link FallbackEmailSender} 가 {@code retryable} 로
 * 다음 Provider 폴백 여부를 결정한 뒤, 최종 실패만 기존 사용자-대면 예외
 * {@link com.duing.global.email.exception.EmailException.SendFailedException} 으로 변환한다.
 *
 * <ul>
 *   <li>retryable=true — 일시 장애: HTTP 429/5xx, 타임아웃, 네트워크 오류, SMTP 릴레이 장애</li>
 *   <li>retryable=false — 재시도 무의미: 그 외 4xx(잘못된 요청·수신자 형식), 인증(크레덴셜)·메시지 구성 오류</li>
 * </ul>
 */
public class MailProviderException extends RuntimeException {

    /** 로그 표기용 실패 사유 (예: {@code 429}, {@code 503}, {@code TIMEOUT}, {@code AUTH}). */
    private final String reason;
    private final boolean retryable;

    public MailProviderException(String reason, boolean retryable, Throwable cause) {
        super("메일 Provider 발송 실패 (" + reason + ")", cause);
        this.reason = reason;
        this.retryable = retryable;
    }

    public String reason() {
        return reason;
    }

    public boolean isRetryable() {
        return retryable;
    }
}
