package com.duing.domain.user.service;

import com.duing.domain.user.service.dto.command.ConfirmEmailVerificationCommand;
import com.duing.domain.user.service.dto.command.SendEmailVerificationCommand;
import com.duing.domain.user.service.dto.query.EmailVerificationSendResult;

public interface EmailVerificationService {

    EmailVerificationSendResult sendCode(SendEmailVerificationCommand sendCommand, String clientIp);

    void confirmCode(ConfirmEmailVerificationCommand confirmCommand);

    /** 가입 가능한(인증 완료 + 미만료) 상태가 아니면 EmailNotVerifiedException(403). */
    void assertVerified(String email);

    /** 가입 완료 후 인증 행 삭제 — 재사용 방지. */
    void consume(String email);
}
