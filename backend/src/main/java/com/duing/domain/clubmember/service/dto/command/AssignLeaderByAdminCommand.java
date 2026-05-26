package com.duing.domain.clubmember.service.dto.command;

public record AssignLeaderByAdminCommand(
        Long clubId, Long newLeaderUserId, Long actorAdminId, String reason) {}
