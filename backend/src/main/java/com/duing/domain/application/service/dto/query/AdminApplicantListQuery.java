package com.duing.domain.application.service.dto.query;

import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import java.util.List;
import java.util.Map;

/**
 * 총동연 지원자 목록. {@code applicants} 는 검색·필터가 걸린 결과지만 {@code statusCounts} 는
 * 모집 전체 기준이다 — 필터를 좁혀도 상태별 분포(KPI)는 그대로 보여야 하기 때문이다.
 *
 * <p>상태별 건수를 고정 필드 record 가 아니라 맵으로 들고 있는 이유: 지원 상태 집합은 앞으로 바뀌는데,
 * 고정 필드는 바뀔 때마다 응답 스키마를 함께 갈아엎어야 한다.
 */
public record AdminApplicantListQuery(
        Map<ApplicationStatus, Long> statusCounts,
        List<Application> applicants
) {
    /** 모집 전체 지원자 수 — 취소(soft delete)된 지원서는 상태별 집계에서 이미 빠져 있다. */
    public long total() {
        return statusCounts.values().stream().mapToLong(Long::longValue).sum();
    }
}
