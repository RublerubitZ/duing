package com.duing.domain.fee.controller.dto.response;

import com.duing.domain.fee.entity.BillingType;
import com.duing.domain.fee.entity.FeeTargetType;
import com.duing.domain.fee.service.dto.query.AdminFeePolicyRow;
import com.duing.global.time.TimeMapper;
import java.time.Instant;

/**
 * 감사 콘솔 정책 행(스펙 §7.4). {@code billCount}·{@code paidCount} 는 기간 내 발행 청구 기준이라
 * 정책의 전체 이력이 아니며, 취소 청구는 두 값 모두에서 빠진다.
 *
 * <p>{@code createdAt} 은 JPA 감사 필드(JVM 존 벽시계)라 system 존으로 환산한다(/TIMEZONE.md 대응표).
 */
public record AdminFeePolicyResponse(
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
        double paymentRate,
        Instant createdAt
) {
    public static AdminFeePolicyResponse from(AdminFeePolicyRow policyRow) {
        return new AdminFeePolicyResponse(
                policyRow.policyId(),
                policyRow.name(),
                policyRow.amount(),
                policyRow.billingType(),
                policyRow.targetType(),
                policyRow.active(),
                policyRow.autoIssue(),
                policyRow.issueDay(),
                policyRow.dueDay(),
                policyRow.billCount(),
                policyRow.paidCount(),
                policyRow.paymentRate(),
                TimeMapper.systemWallClockToInstant(policyRow.createdAt()));
    }
}
