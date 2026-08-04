package com.duing.domain.joincode.service.dto.query;

import com.duing.domain.joincode.entity.ClubJoinCode;
import java.time.LocalDateTime;

public record JoinCodeQuery(
        Long joinCodeId,
        String code,
        Integer generation,
        int maxUses,
        int usedCount,
        LocalDateTime expiresAt
) {
    public static JoinCodeQuery from(ClubJoinCode joinCode) {
        return new JoinCodeQuery(
                joinCode.getId(),
                joinCode.getCode(),
                joinCode.getGeneration(),
                joinCode.getMaxUses(),
                joinCode.getUsedCount(),
                joinCode.getExpiresAt()
        );
    }
}
