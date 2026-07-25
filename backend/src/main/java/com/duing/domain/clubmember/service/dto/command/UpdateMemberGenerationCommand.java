package com.duing.domain.clubmember.service.dto.command;

public record UpdateMemberGenerationCommand(
        Long clubId,
        Long memberId,
        Long requesterId,
        Integer generation
) {}
