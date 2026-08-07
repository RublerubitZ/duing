package com.duing.domain.fee.controller.dto.response;

import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.fee.service.dto.query.AdminFeeClubRow;
import com.duing.global.time.TimeMapper;
import java.time.Instant;

/**
 * 감사 콘솔 동아리 목록 행(스펙 §7.1).
 *
 * <p>{@code lastPaidAt}·{@code lastTransactionAt} 은 KST 벽시계로 저장된 컬럼이라 seoul 존으로 환산한다
 * (payment.paid_at·bank_transaction.transaction_at — /TIMEZONE.md 대응표).
 */
public record AdminFeeClubSummaryResponse(
        Long clubId,
        String clubName,
        ClubStatus clubStatus,
        boolean feeUsing,
        long activePolicyCount,
        long memberCount,
        long billCount,
        long totalBilled,
        long totalPaid,
        long outstanding,
        long unpaidMemberCount,
        Instant lastPaidAt,
        Instant lastTransactionAt
) {
    public static AdminFeeClubSummaryResponse from(AdminFeeClubRow clubRow) {
        return new AdminFeeClubSummaryResponse(
                clubRow.clubId(),
                clubRow.clubName(),
                clubRow.clubStatus(),
                clubRow.feeUsing(),
                clubRow.activePolicyCount(),
                clubRow.memberCount(),
                clubRow.billCount(),
                clubRow.totalBilled(),
                clubRow.totalPaid(),
                clubRow.outstanding(),
                clubRow.unpaidMemberCount(),
                TimeMapper.seoulWallClockToInstant(clubRow.lastPaidAt()),
                TimeMapper.seoulWallClockToInstant(clubRow.lastTransactionAt()));
    }
}
