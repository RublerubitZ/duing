package com.duing.domain.clubmember.service.dto.command;

public record CreateSuccessionCommand(Long clubId, Long requesterUserId, String reason) {}
