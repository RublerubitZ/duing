package com.duing.domain.user.service.dto.query;

public record PasswordResetStartResult(PhoneVerificationIssueResult issueResult, String maskedPhone) {
}
