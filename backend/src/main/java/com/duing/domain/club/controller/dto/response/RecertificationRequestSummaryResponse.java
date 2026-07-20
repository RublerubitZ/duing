package com.duing.domain.club.controller.dto.response;

import com.duing.domain.club.entity.RecertificationRequest;
import com.duing.domain.club.entity.RecertificationStatus;
import com.duing.domain.club.entity.RoundStatus;
import com.duing.domain.club.service.dto.query.RecertificationRequestAdminSummaryQuery;
import com.duing.global.time.TimeMapper;
import java.time.Instant;

public record RecertificationRequestSummaryResponse(
        Long id,
        RoundRef round,
        ClubRef club,
        UserRef leader,
        RecertificationStatus status,
        int operatingYear,
        Instant createdAt
) {
    public record RoundRef(Long id, Integer year, String label, RoundStatus status) {}
    public record ClubRef(Long id, String name) {}
    public record UserRef(Long id, String name) {}

    public static RecertificationRequestSummaryResponse of(
            RecertificationRequest request, RoundRef round, ClubRef club, UserRef leader
    ) {
        return new RecertificationRequestSummaryResponse(
                request.getId(), round, club, leader,
                request.getStatus(), request.getOperatingYear(),
                TimeMapper.systemWallClockToInstant(request.getCreatedAt())
        );
    }

    /** 서비스 계층 Query DTO 로부터 직접 변환한다. */
    public static RecertificationRequestSummaryResponse from(RecertificationRequestAdminSummaryQuery query) {
        RecertificationRequestAdminSummaryQuery.RoundRef queryRound = query.round();
        RecertificationRequestAdminSummaryQuery.ClubRef queryClub = query.club();
        RecertificationRequestAdminSummaryQuery.UserRef queryLeader = query.leader();
        return of(
                query.request(),
                new RoundRef(queryRound.id(), queryRound.year(), queryRound.label(), queryRound.status()),
                new ClubRef(queryClub.id(), queryClub.name()),
                new UserRef(queryLeader.id(), queryLeader.name())
        );
    }
}
