package com.duing.domain.facilitybooking.service.dto.query;

/**
 * 관리자 대관 신청 큐 정렬 기준.
 *
 * <ul>
 *   <li>{@code DEFAULT} — 상태별 기존 기본 순서(PENDING=오래된 순, 그 외=최신순). 파라미터 생략 시</li>
 *   <li>{@code USAGE_ASC} — 이용일시 빠른 순(이용일 → 시작 시각). 동일 이용일시는 DEFAULT 순서를 따른다</li>
 * </ul>
 */
public enum AdminBookingQueueSort {
    DEFAULT,
    USAGE_ASC
}
