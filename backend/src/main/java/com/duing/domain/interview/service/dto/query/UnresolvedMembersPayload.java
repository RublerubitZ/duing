package com.duing.domain.interview.service.dto.query;

import com.duing.domain.interview.entity.RoundMemberStatus;
import java.util.List;

/** 확정 거부(§6.3) 경고 2종 — (a) 미응답·가능없음 / (b) 응답했는데 만석 미배정 (강조 대상). */
public record UnresolvedMembersPayload(
        List<UnrespondedMember> unresponded,
        List<RespondedUnassignedMember> respondedUnassigned
) {
    public record UnrespondedMember(Long applicationId, String applicantName,
                                    RoundMemberStatus memberStatus) {}

    public record RespondedUnassignedMember(Long applicationId, String applicantName,
                                            List<Long> selectedSlotIds) {}
}
