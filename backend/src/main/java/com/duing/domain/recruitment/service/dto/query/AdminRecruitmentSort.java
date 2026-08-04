package com.duing.domain.recruitment.service.dto.query;

/**
 * 관리자 모집 목록 정렬 기준.
 *
 * <ul>
 *   <li>{@code LATEST} — 등록 최신순(기본)</li>
 *   <li>{@code APPLICANTS} — 지원자 많은 순, 동수는 최신순</li>
 *   <li>{@code DEADLINE} — 마감 임박순. 마감일 없는 상시모집은 맨 뒤</li>
 * </ul>
 */
public enum AdminRecruitmentSort {
    LATEST,
    APPLICANTS,
    DEADLINE
}
