package com.duing.domain.interview.service.dto.query;

import com.duing.domain.interview.entity.RoundMemberStatus;

public record RoundMemberStatusCount(Long roundId, RoundMemberStatus status, long count) {}
