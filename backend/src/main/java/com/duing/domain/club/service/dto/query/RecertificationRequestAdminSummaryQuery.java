package com.duing.domain.club.service.dto.query;

import com.duing.domain.club.entity.RecertificationRequest;
import com.duing.domain.club.entity.RoundStatus;

/**
 * 어드민 재인증 요청 목록 한 행을 표현하는 쿼리 결과 DTO.
 * 서비스 계층에서 엔티티 조인·null-safe 참조 해석을 마친 뒤 Controller 로 전달한다.
 */
public record RecertificationRequestAdminSummaryQuery(
        RecertificationRequest request,
        RoundRef round,
        ClubRef club,
        UserRef leader
) {
    public record RoundRef(Long id, Integer year, String label, RoundStatus status) {}
    public record ClubRef(Long id, String name) {}
    public record UserRef(Long id, String name) {}
}
