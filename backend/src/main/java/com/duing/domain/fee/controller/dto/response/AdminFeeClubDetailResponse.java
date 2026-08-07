package com.duing.domain.fee.controller.dto.response;

import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.fee.service.dto.query.AdminFeeClubDetailQuery;

/**
 * 감사 콘솔 동아리 상세 KPI(스펙 §7.3).
 *
 * <p>{@code billCount} 는 취소 청구를 포함한 전체 건수(= 완납+미납+연체+취소)인 반면
 * {@code totalBilled}·{@code totalPaid} 는 취소 청구를 뺀 금액이다 — 건수와 금액의 모수가 다르다.
 */
public record AdminFeeClubDetailResponse(
        Long clubId,
        String clubName,
        ClubStatus clubStatus,
        long memberCount,
        long activePolicyCount,
        long billCount,
        long paidCount,
        long unpaidCount,
        long overdueCount,
        long cancelledCount,
        long totalBilled,
        long totalPaid,
        long outstanding,
        double collectionRate,
        boolean bankMatchingActive
) {
    public static AdminFeeClubDetailResponse from(AdminFeeClubDetailQuery clubDetailQuery) {
        return new AdminFeeClubDetailResponse(
                clubDetailQuery.clubId(),
                clubDetailQuery.clubName(),
                clubDetailQuery.clubStatus(),
                clubDetailQuery.memberCount(),
                clubDetailQuery.activePolicyCount(),
                clubDetailQuery.billCount(),
                clubDetailQuery.paidCount(),
                clubDetailQuery.unpaidCount(),
                clubDetailQuery.overdueCount(),
                clubDetailQuery.cancelledCount(),
                clubDetailQuery.totalBilled(),
                clubDetailQuery.totalPaid(),
                clubDetailQuery.outstanding(),
                clubDetailQuery.collectionRate(),
                clubDetailQuery.bankMatchingActive());
    }
}
