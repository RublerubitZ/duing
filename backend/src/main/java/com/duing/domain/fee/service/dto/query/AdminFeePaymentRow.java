package com.duing.domain.fee.service.dto.query;

import com.duing.domain.fee.entity.MatchStatus;
import com.duing.domain.fee.entity.PaymentMethod;
import com.duing.domain.fee.entity.PaymentStatus;
import java.time.LocalDateTime;

/**
 * 감사 콘솔 납부 목록 한 행(스펙 §7.6). VOIDED(정정) 행도 그대로 실린다 — 정정 이력이 감사의 핵심이다.
 *
 * <p>{@code bankTransactionId}·{@code matchStatus} 는 응답 경계에서 matchType(DIRECT/AUTO/MANUAL)으로
 * 환산하려고 들고 있는 원본이다. {@code counterparty}(입금자)는 BANK 거래에 연결된 납부에만 있다.
 *
 * <p>{@code paidAt}·{@code voidedAt} 은 KST 벽시계다(/TIMEZONE.md 대응표).
 */
public record AdminFeePaymentRow(
        Long paymentId,
        Long billId,
        String userName,
        long amount,
        PaymentMethod method,
        LocalDateTime paidAt,
        Long bankTransactionId,
        MatchStatus matchStatus,
        String counterparty,
        String recordedByName,
        PaymentStatus status,
        String voidedByName,
        LocalDateTime voidedAt,
        String voidReason
) {
}
