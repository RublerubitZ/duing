package com.duing.domain.application.service.dto.query;

/**
 * 총동연 지원자 목록 정렬 기준.
 *
 * <ul>
 *   <li>{@code LATEST} — 최근 제출 순(기본). 운영진 목록과 같은 기준이다</li>
 *   <li>{@code OLDEST} — 먼저 제출한 순</li>
 * </ul>
 */
public enum AdminApplicantSort {
    LATEST,
    OLDEST
}
