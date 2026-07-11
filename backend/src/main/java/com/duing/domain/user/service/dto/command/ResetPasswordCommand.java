package com.duing.domain.user.service.dto.command;

public record ResetPasswordCommand(String verificationToken, String newPassword) {
}
