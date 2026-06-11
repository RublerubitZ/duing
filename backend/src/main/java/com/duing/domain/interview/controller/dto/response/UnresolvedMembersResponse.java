package com.duing.domain.interview.controller.dto.response;

import com.duing.domain.interview.entity.RoundMemberStatus;
import com.duing.domain.interview.service.dto.query.UnresolvedMembersPayload;
import java.util.List;

public record UnresolvedMembersResponse(
        String code,
        List<UnrespondedMember> unresponded,
        List<RespondedUnassignedMember> respondedUnassigned
) {
    private static final String CODE = "INTERVIEW_ROUND_HAS_UNRESOLVED_MEMBERS";

    public UnresolvedMembersResponse {
        code = CODE;
    }

    public record UnrespondedMember(Long applicationId, String applicantName, RoundMemberStatus memberStatus) {}

    public record RespondedUnassignedMember(Long applicationId, String applicantName, List<Long> selectedSlotIds) {}

    public static UnresolvedMembersResponse from(UnresolvedMembersPayload payload) {
        return new UnresolvedMembersResponse(
                CODE,
                payload.unresponded().stream()
                        .map(member -> new UnrespondedMember(
                                member.applicationId(), member.applicantName(), member.memberStatus()))
                        .toList(),
                payload.respondedUnassigned().stream()
                        .map(member -> new RespondedUnassignedMember(
                                member.applicationId(), member.applicantName(), member.selectedSlotIds()))
                        .toList());
    }
}
