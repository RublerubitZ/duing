package com.duing.domain.clubmember.service.dto.query;

import com.duing.domain.fee.entity.FeeStatus;
import java.util.Collection;

/**
 * 멤버 목록·EXPORT 응답에 싣는 회비 납부 상태 요약 — "이 회원에게 더 받을 회비가 있나"에 답한다.
 * 해당 회원의 비-CANCELLED 청구 중 덜 낸 청구({@link FeeStatus#unpaidRemainderSet()})가 1건이라도 있으면 {@link #UNPAID},
 * 모두 완납이면 {@link #PAID}, 비-CANCELLED 청구가 하나도 없으면 {@link #NONE}. 회차의 최신 여부는 보지 않는다.
 */
public enum MemberFeeStatus {
    PAID, UNPAID, NONE;

    /**
     * 한 회원의 비-CANCELLED 청구 상태들을 요약 상태로 매핑한다.
     * 덜 낸 상태({@link FeeStatus#isUnpaidRemainder()})가 하나라도 있으면 UNPAID, 전부 PAID 면 PAID, 비어 있으면 NONE.
     * 최신 회차를 완납해도 이전 회차(탈퇴 전 청구 포함)에 잔여가 남아 있으면 UNPAID 다.
     * CANCELLED 는 판정 대상에서 이미 제외되므로 들어오지 않는다.
     */
    public static MemberFeeStatus fromBillStatuses(Collection<FeeStatus> nonCancelledStatuses) {
        if (nonCancelledStatuses.isEmpty()) {
            return NONE;
        }
        return nonCancelledStatuses.stream().anyMatch(FeeStatus::isUnpaidRemainder) ? UNPAID : PAID;
    }
}
