package com.duing.domain.user.profilecheck.service.dto.command;

public record UpdateProfileCheckSettingCommand(
        Long actorId,
        String title,
        String message,
        boolean enabled
) {
}
