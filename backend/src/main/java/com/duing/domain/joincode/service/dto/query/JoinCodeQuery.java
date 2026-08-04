package com.duing.domain.joincode.service.dto.query;

import com.duing.domain.joincode.entity.ClubJoinCode;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import java.time.LocalDateTime;

public record JoinCodeQuery(
        Long joinCodeId,
        String code,
        Integer generation,
        int maxUses,
        int usedCount,
        LocalDateTime expiresAt,
        boolean recruitmentOpen
) {
    /** recruitment 는 LAZY — 트랜잭션 안에서 호출해야 status 가 초기화된다. */
    public static JoinCodeQuery from(ClubJoinCode joinCode) {
        return new JoinCodeQuery(
                joinCode.getId(),
                joinCode.getCode(),
                joinCode.getGeneration(),
                joinCode.getMaxUses(),
                joinCode.getUsedCount(),
                joinCode.getExpiresAt(),
                joinCode.getRecruitment().getStatus() == RecruitmentStatus.OPEN
        );
    }
}
