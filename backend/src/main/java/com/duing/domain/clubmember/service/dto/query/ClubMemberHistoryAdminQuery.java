package com.duing.domain.clubmember.service.dto.query;

import com.duing.domain.clubmember.entity.ClubMemberEventType;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import java.time.LocalDateTime;

/**
 * 어드민 상세/회장승계 화면에서 동아리 회원 권한 변경 이력을 표시하기 위한 서비스 레이어 Query DTO.
 * Controller 의 ClubMemberHistoryResponse 가 from(query) 로 1:1 매핑한다.
 */
public record ClubMemberHistoryAdminQuery(
        Long id,
        ClubMemberEventType eventType,
        UserRef target,
        UserRef actor,
        ClubMemberRole fromRole,
        ClubMemberRole toRole,
        String reason,
        LocalDateTime createdAt
) {
    public record UserRef(Long id, String name) {}
}
