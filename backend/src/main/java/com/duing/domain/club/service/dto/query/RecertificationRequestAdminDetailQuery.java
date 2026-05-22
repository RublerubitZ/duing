package com.duing.domain.club.service.dto.query;

import com.duing.domain.club.entity.RecertificationRequest;
import com.duing.domain.clubmember.service.dto.query.ClubMemberHistoryAdminQuery;
import java.util.List;

/**
 * 어드민 재인증 요청 상세 뷰를 표현하는 쿼리 결과 DTO.
 * 서비스 계층에서 멤버·이력 조회 및 null-safe 참조 해석을 마친 뒤 Controller 로 전달한다.
 */
public record RecertificationRequestAdminDetailQuery(
        RecertificationRequest request,
        RoundRef round,
        ClubRef club,
        UserRef currentLeader,
        List<UserRef> officers,
        UserRef submittedLeader,
        UserRef handledBy,
        List<ClubMemberHistoryAdminQuery> recentMemberHistory
) {
    public record RoundRef(Long id, Integer year, String label) {}
    public record ClubRef(Long id, String name, Integer lastVerifiedYear) {}
    public record UserRef(Long id, String name) {}
}
