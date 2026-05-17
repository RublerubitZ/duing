package com.duing.domain.clubmember.service.dto.query;

public record TransferLeaderQuery(
        ClubMemberQuery formerLeader,
        ClubMemberQuery newLeader
) {}