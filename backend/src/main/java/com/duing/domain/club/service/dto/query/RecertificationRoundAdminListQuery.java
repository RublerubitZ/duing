package com.duing.domain.club.service.dto.query;

import com.duing.domain.club.entity.RecertificationRound;

/**
 * 어드민 재인증 라운드 목록 한 행을 표현하는 쿼리 결과 DTO.
 * 서비스 계층에서 개설자·마감자 User 조회 및 null-safe 참조 해석을 마친 뒤 Controller 로 전달한다.
 */
public record RecertificationRoundAdminListQuery(
        RecertificationRound round,
        UserRef openedBy,
        UserRef closedBy
) {
    public record UserRef(Long id, String name) {}
}
