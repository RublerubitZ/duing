package com.duing.domain.user.service.dto.command;

public record ChangePhoneCommand(Long userId, String currentPassword, String verificationToken) {
}
