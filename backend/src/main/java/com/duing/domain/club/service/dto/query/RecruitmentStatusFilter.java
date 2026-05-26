package com.duing.domain.club.service.dto.query;

/**
 * /clubs 목록 필터에서 사용자가 고르는 모집 상태 그룹.
 * RecruitmentDisplayStatus 와는 별도 (UI 옵션 묶음).
 */
public enum RecruitmentStatusFilter {
    /** OPEN ∨ ALWAYS_OPEN — 지금 지원 가능한 모집. */
    AVAILABLE,
    /** UPCOMING — 시작 전 모집. */
    UPCOMING,
    /** CLOSED — 활성 모집 없는 동아리는 제외, 과거 마감 이력만. */
    CLOSED
}