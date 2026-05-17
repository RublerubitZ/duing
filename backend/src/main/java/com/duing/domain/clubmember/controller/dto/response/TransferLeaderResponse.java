package com.duing.domain.clubmember.controller.dto.response;

import com.duing.domain.clubmember.service.dto.query.TransferLeaderQuery;

public record TransferLeaderResponse(
        ClubMemberResponse formerLeader,
        ClubMemberResponse newLeader
) {
    public static TransferLeaderResponse from(TransferLeaderQuery query) {
        return new TransferLeaderResponse(
                ClubMemberResponse.from(query.formerLeader()),
                ClubMemberResponse.from(query.newLeader())
        );
    }
}
