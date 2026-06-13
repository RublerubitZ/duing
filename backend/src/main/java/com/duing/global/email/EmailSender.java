package com.duing.global.email;

public interface EmailSender {

    /**
     * 이메일을 동기 발송한다.
     *
     * @throws EmailException.SendFailedException 발송 실패(타임아웃·비 2xx 응답 등) 시
     */
    void send(EmailMessage emailMessage);
}
