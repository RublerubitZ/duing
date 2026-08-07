package com.duing.domain.fee.service.dto.query;

import com.duing.domain.fee.entity.BillingType;
import com.duing.domain.fee.entity.FeeTargetType;
import java.time.LocalDateTime;

/**
 * 감사 콘솔 정책 한 행(스펙 §7.4). 비활성 정책도 감사 대상이라 active 무관하게 전부 싣는다.
 *
 * <p>{@code billCount}·{@code paidCount} 는 이 정책으로 <b>기간 내 발행된</b> 청구 기준이며
 * 취소 청구는 두 값 모두에서 빠진다. {@code createdAt} 은 JVM 존 벽시계다(/TIMEZONE.md 대응표).
 */
public record AdminFeePolicyRow(
        Long policyId,
        String name,
        long amount,
        BillingType billingType,
        FeeTargetType targetType,
        boolean active,
        boolean autoIssue,
        Integer issueDay,
        Integer dueDay,
        long billCount,
        long paidCount,
        LocalDateTime createdAt
) {
    /** 납부율(%) — 기간 내 발행 청구가 없으면 분모가 0 이라 0.0 으로 고정하고, 소수 첫째 자리까지 내린다. */
    public double paymentRate() {
        if (billCount <= 0) {
            return 0.0;
        }
        return Math.round(paidCount * 1000.0 / billCount) / 10.0;
    }
}
