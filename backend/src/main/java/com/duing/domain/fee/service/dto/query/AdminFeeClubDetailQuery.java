package com.duing.domain.fee.service.dto.query;

import com.duing.domain.club.entity.ClubStatus;

/** 감사 콘솔 동아리 상세 KPI(스펙 §7.3). */
public record AdminFeeClubDetailQuery(
        Long clubId, String clubName, ClubStatus clubStatus,
        long memberCount, long activePolicyCount,
        long billCount, long paidCount, long unpaidCount, long overdueCount, long cancelledCount,
        long totalBilled, long totalPaid, long outstanding, double collectionRate,
        boolean bankMatchingActive
) {
}
