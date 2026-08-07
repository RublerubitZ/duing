package com.duing.domain.fee.service.dto.query;

import com.duing.domain.club.entity.ClubStatus;
import java.time.LocalDateTime;

/**
 * 감사 콘솔 동아리 목록 한 행(스펙 §7.1). 집계는 CANCELLED 청구·VOIDED 납부를 제외한다.
 *
 * <p>{@code lastPaidAt}·{@code lastTransactionAt} 은 KST 벽시계로 저장된 값이라
 * 응답 경계에서 {@code TimeMapper.seoulWallClockToInstant} 로 환산한다.
 */
public record AdminFeeClubRow(
        Long clubId, String clubName, ClubStatus clubStatus, boolean feeUsing,
        long activePolicyCount, long memberCount,
        long billCount, long totalBilled, long totalPaid, long outstanding,
        long unpaidMemberCount, LocalDateTime lastPaidAt, LocalDateTime lastTransactionAt
) {
}
