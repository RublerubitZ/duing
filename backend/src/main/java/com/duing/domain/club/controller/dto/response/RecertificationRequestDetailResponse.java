package com.duing.domain.club.controller.dto.response;

import com.duing.domain.club.entity.RecertificationRequest;
import com.duing.domain.club.entity.RecertificationStatus;
import com.duing.domain.club.service.dto.query.RecertificationRequestAdminDetailQuery;
import com.duing.domain.clubmember.controller.dto.response.ClubMemberHistoryResponse;
import com.duing.domain.clubmember.service.dto.query.ClubMemberHistoryAdminQuery;
import com.duing.global.time.TimeMapper;
import java.time.Instant;
import java.util.List;

public record RecertificationRequestDetailResponse(
        Long id,
        RoundRef round,
        ClubRef club,
        UserRef currentLeader,
        List<UserRef> officers,
        UserRef submittedLeader,
        String contactEmail,
        String contactPhone,
        int operatingYear,
        String notes,
        RecertificationStatus status,
        String actionNote,
        UserRef handledBy,
        Instant handledAt,
        Instant createdAt,
        List<ClubMemberHistoryResponse> recentMemberHistory
) {
    public record RoundRef(Long id, Integer year, String label) {}
    public record ClubRef(Long id, String name, Integer lastVerifiedYear) {}
    public record UserRef(Long id, String name) {}

    public static RecertificationRequestDetailResponse of(
            RecertificationRequest request, RoundRef round, ClubRef club,
            UserRef currentLeader, List<UserRef> officers, UserRef submittedLeader,
            UserRef handler, List<ClubMemberHistoryResponse> recentMemberHistory
    ) {
        return new RecertificationRequestDetailResponse(
                request.getId(), round, club, currentLeader, officers, submittedLeader,
                request.getContactEmail(), request.getContactPhone(), request.getOperatingYear(),
                request.getNotes(), request.getStatus(), request.getActionNote(),
                handler,
                TimeMapper.systemWallClockToInstant(request.getHandledAt()),
                TimeMapper.systemWallClockToInstant(request.getCreatedAt()),
                recentMemberHistory
        );
    }

    /** 서비스 계층 Query DTO 로부터 직접 변환한다. */
    public static RecertificationRequestDetailResponse from(RecertificationRequestAdminDetailQuery query) {
        RecertificationRequestAdminDetailQuery.RoundRef queryRound = query.round();
        RecertificationRequestAdminDetailQuery.ClubRef queryClub = query.club();
        RecertificationRequestAdminDetailQuery.UserRef queryCurrentLeader = query.currentLeader();
        RecertificationRequestAdminDetailQuery.UserRef querySubmittedLeader = query.submittedLeader();
        RecertificationRequestAdminDetailQuery.UserRef queryHandledBy = query.handledBy();

        RoundRef roundRef = new RoundRef(queryRound.id(), queryRound.year(), queryRound.label());
        ClubRef clubRef = new ClubRef(queryClub.id(), queryClub.name(), queryClub.lastVerifiedYear());
        UserRef currentLeaderRef = queryCurrentLeader == null
                ? null
                : new UserRef(queryCurrentLeader.id(), queryCurrentLeader.name());
        List<UserRef> officerRefs = query.officers().stream()
                .map(officerRef -> new UserRef(officerRef.id(), officerRef.name()))
                .toList();
        UserRef submittedLeaderRef = new UserRef(querySubmittedLeader.id(), querySubmittedLeader.name());
        UserRef handledByRef = queryHandledBy == null
                ? null
                : new UserRef(queryHandledBy.id(), queryHandledBy.name());

        List<ClubMemberHistoryResponse> historyResponses = query.recentMemberHistory().stream()
                .map(ClubMemberHistoryResponse::from)
                .toList();
        return of(query.request(), roundRef, clubRef, currentLeaderRef, officerRefs,
                submittedLeaderRef, handledByRef, historyResponses);
    }
}
