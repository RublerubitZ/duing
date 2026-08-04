package com.duing.domain.application.controller.dto.response;

import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.service.dto.query.AdminApplicantListQuery;
import java.util.List;
import java.util.Map;

/**
 * 총동연 지원자 목록 응답.
 *
 * <p>{@code statusCounts} 는 상태별 고정 필드가 아니라 맵이다 — 지원 상태 집합이 바뀌어도 응답 스키마를
 * 갈아엎지 않는다. 건수가 0 인 상태는 키 자체가 없으므로 화면은 없는 키를 0 으로 읽어야 한다.
 * {@code total} 은 모집 전체 지원자 수라 검색·필터를 좁혀도 변하지 않는다.
 */
public record AdminApplicantListResponse(
        long total,
        Map<ApplicationStatus, Long> statusCounts,
        List<AdminApplicantResponse> applicants
) {
    public static AdminApplicantListResponse from(AdminApplicantListQuery listQuery) {
        return new AdminApplicantListResponse(
                listQuery.total(),
                listQuery.statusCounts(),
                listQuery.applicants().stream()
                        .map(AdminApplicantResponse::from)
                        .toList()
        );
    }
}
