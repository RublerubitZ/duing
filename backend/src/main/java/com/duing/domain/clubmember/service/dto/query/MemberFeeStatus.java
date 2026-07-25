package com.duing.domain.clubmember.service.dto.query;

import com.duing.domain.fee.entity.FeeStatus;

/**
 * 멤버 목록·EXPORT 응답에 싣는 회비 납부 상태 요약.
 * 해당 회원의 가장 최근 비-CANCELLED 청구 기준으로 판정하며, 청구가 하나도 없으면 {@link #NONE}.
 */
public enum MemberFeeStatus {
    PAID, UNPAID, NONE;

    /**
     * 최신 비-CANCELLED 청구의 {@link FeeStatus} 를 요약 상태로 매핑한다.
     * PAID → PAID, 그 외(PENDING/PARTIAL_PAID/OVERDUE) → UNPAID, 청구 없음(null) → NONE.
     * CANCELLED 는 판정 대상에서 이미 제외되므로 들어오지 않는다.
     */
    public static MemberFeeStatus fromLatestBill(FeeStatus latestStatus) {
        if (latestStatus == null) {
            return NONE;
        }
        return latestStatus == FeeStatus.PAID ? PAID : UNPAID;
    }
}
