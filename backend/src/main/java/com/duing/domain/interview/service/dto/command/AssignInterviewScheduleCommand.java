package com.duing.domain.interview.service.dto.command;

public record AssignInterviewScheduleCommand(Long applicationId, Long slotId, Long actorUserId) {}
