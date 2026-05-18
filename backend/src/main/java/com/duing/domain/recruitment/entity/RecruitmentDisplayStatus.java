package com.duing.domain.recruitment.entity;

import java.time.LocalDate;

/**
 * 모집 공고의 사용자 표시용 상태.
 * - 저장 상태({@link RecruitmentStatus})와 startDate / endDate / today 를 결합해 도출한다.
 * - endDate 가 null 이면 상시모집(ALWAYS_OPEN) 으로 취급한다.
 */
public enum RecruitmentDisplayStatus {
    UPCOMING,
    OPEN,
    ALWAYS_OPEN,
    CLOSED;

    public static RecruitmentDisplayStatus resolve(
            RecruitmentStatus status,
            LocalDate startDate,
            LocalDate endDate,
            LocalDate today
    ) {
        if (status == RecruitmentStatus.CLOSED) {
            return CLOSED;
        }
        if (today.isBefore(startDate)) {
            return UPCOMING;
        }
        if (endDate == null) {
            return ALWAYS_OPEN;
        }
        if (today.isAfter(endDate)) {
            return CLOSED;
        }
        return OPEN;
    }
}
