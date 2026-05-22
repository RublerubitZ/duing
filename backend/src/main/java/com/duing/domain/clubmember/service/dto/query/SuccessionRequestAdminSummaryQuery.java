package com.duing.domain.clubmember.service.dto.query;

import com.duing.domain.clubmember.entity.LeaderSuccessionRequest;
import com.duing.domain.clubmember.entity.SuccessionStatus;
import java.time.LocalDateTime;

/**
 * 어드민 승계 요청 목록 조회 서비스 레이어 Query DTO.
 * Controller 의 SuccessionRequestSummaryResponse 가 from(query) 로 1:1 매핑한다.
 */
public record SuccessionRequestAdminSummaryQuery(
        Long id,
        Long clubId,
        String clubName,
        UserRef requester,
        SuccessionStatus status,
        LocalDateTime createdAt
) {
    public record UserRef(Long id, String name) {}

    public static SuccessionRequestAdminSummaryQuery of(
            LeaderSuccessionRequest request,
            String clubName,
            UserRef requester
    ) {
        return new SuccessionRequestAdminSummaryQuery(
                request.getId(), request.getClubId(), clubName,
                requester, request.getStatus(), request.getCreatedAt()
        );
    }
}
