package com.duing.domain.clubmember.service.dto.query;

import com.duing.domain.clubmember.entity.LeaderSuccessionRequest;
import com.duing.domain.clubmember.entity.SuccessionStatus;
import java.time.LocalDateTime;

/**
 * 어드민 승계 요청 단건 상세 조회 서비스 레이어 Query DTO.
 * Controller 의 SuccessionRequestDetailResponse 가 from(query) 로 1:1 매핑한다.
 */
public record SuccessionRequestAdminDetailQuery(
        Long id,
        ClubRef club,
        UserRef requester,
        UserRef currentLeader,
        String reason,
        SuccessionStatus status,
        String actionNote,
        UserRef handledBy,
        LocalDateTime handledAt,
        LocalDateTime createdAt
) {
    public record ClubRef(Long id, String name) {}

    public record UserRef(Long id, String name) {}

    public static SuccessionRequestAdminDetailQuery of(
            LeaderSuccessionRequest request,
            ClubRef club,
            UserRef requester,
            UserRef currentLeader,
            UserRef handledBy
    ) {
        return new SuccessionRequestAdminDetailQuery(
                request.getId(), club, requester, currentLeader,
                request.getReason(), request.getStatus(), request.getActionNote(),
                handledBy, request.getHandledAt(), request.getCreatedAt()
        );
    }
}
