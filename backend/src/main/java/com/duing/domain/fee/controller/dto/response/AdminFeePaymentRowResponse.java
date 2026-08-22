package com.duing.domain.fee.controller.dto.response;

import com.duing.domain.fee.entity.MatchStatus;
import com.duing.domain.fee.entity.PaymentMethod;
import com.duing.domain.fee.entity.PaymentStatus;
import com.duing.domain.fee.service.dto.query.AdminFeePaymentRow;
import java.time.Instant;

/**
 * 감사 콘솔 납부 행(스펙 §7.6). 정정(VOIDED) 행도 실린다 — 누가·언제·왜 정정했는지가 감사의 핵심이다.
 *
 * <p>{@code paidAt}·{@code voidedAt} 은 저장된 정합 절대시각 그대로다(/TIMEZONE.md 대응표).
 */
public record AdminFeePaymentRowResponse(
        Long paymentId,
        Long billId,
        String userName,
        long amount,
        PaymentMethod method,
        Instant paidAt,
        String matchType,
        String counterparty,
        String recordedByName,
        PaymentStatus status,
        String voidedByName,
        Instant voidedAt,
        String voidReason
) {
    /** 수기 기록(BANK 거래 미연결). */
    private static final String MATCH_TYPE_DIRECT = "DIRECT";
    /** 자동매칭으로 생성된 납부. */
    private static final String MATCH_TYPE_AUTO = "AUTO";
    /** 운영자가 거래를 골라 승인한 납부 — 이때 {@code recordedByName} 이 승인자다. */
    private static final String MATCH_TYPE_MANUAL = "MANUAL";

    public static AdminFeePaymentRowResponse from(AdminFeePaymentRow paymentRow) {
        return new AdminFeePaymentRowResponse(
                paymentRow.paymentId(),
                paymentRow.billId(),
                paymentRow.userName(),
                paymentRow.amount(),
                paymentRow.method(),
                paymentRow.paidAt(),
                resolveMatchType(paymentRow),
                paymentRow.counterparty(),
                paymentRow.recordedByName(),
                paymentRow.status(),
                paymentRow.voidedByName(),
                paymentRow.voidedAt(),
                paymentRow.voidReason());
    }

    /**
     * 매칭 유형 파생(스펙 §7.6). 거래가 연결돼 있지 않으면 수기 기록이고, 연결돼 있으면 거래의 매칭 상태로 가른다.
     *
     * <p>한계: 매칭을 해제(unmatch)하면 거래가 PENDING 으로 돌아가는데, 그때 이 납부는 이미 정정(VOIDED)된
     * 상태로 남는다. 원래 자동이었는지 수동이었는지는 거래 상태에 흔적이 없어 복원할 수 없으므로 MANUAL 로 표기한다 —
     * 매칭 방식을 정확히 알아야 하면 감사 로그(§7.8)의 매칭 이벤트를 봐야 한다.
     */
    private static String resolveMatchType(AdminFeePaymentRow paymentRow) {
        if (paymentRow.bankTransactionId() == null) {
            return MATCH_TYPE_DIRECT;
        }
        return paymentRow.matchStatus() == MatchStatus.AUTO_MATCHED ? MATCH_TYPE_AUTO : MATCH_TYPE_MANUAL;
    }
}
