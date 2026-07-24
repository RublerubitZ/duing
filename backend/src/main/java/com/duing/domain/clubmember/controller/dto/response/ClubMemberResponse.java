package com.duing.domain.clubmember.controller.dto.response;

import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.service.dto.query.ClubMemberQuery;
import com.duing.domain.clubmember.service.dto.query.MemberFeeStatus;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.support.PhoneMasker;
import com.duing.global.time.TimeMapper;
import java.time.Instant;

public record ClubMemberResponse(
        Long memberId,
        Long userId,
        String name,
        String studentId,
        ClubMemberRole role,
        Instant joinedAt,
        String major,
        Grade grade,
        String phoneMasked,
        Integer generation,
        MemberFeeStatus feeStatus
) {
    public static ClubMemberResponse from(ClubMemberQuery query) {
        return new ClubMemberResponse(
                query.memberId(), query.userId(), query.name(),
                query.studentId(), query.role(),
                TimeMapper.systemWallClockToInstant(query.joinedAt()),
                query.major(), query.grade(), PhoneMasker.mask(query.phone()),
                query.generation(), query.feeStatus()
        );
    }
}
