package com.duing.domain.fee.service.dto.query;

import com.duing.domain.fee.entity.FeeStatus;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 감사 콘솔 청구 목록 한 행(스펙 §7.5).
 *
 * <p>{@code userName}·{@code studentId}·{@code generation} 은 탈퇴 회원이면 null 이고,
 * {@code policyName} 은 삭제된 정책이면 null 이다 — 청구 행 자체는 감사 대상이라 항상 남긴다.
 *
 * <p>{@code overdue} 는 저장된 status 가 아니라 마감일 파생 값이다. 목록 필터(OVERDUE)와 똑같은 식을
 * 쿼리에서 재사용하므로 필터 결과와 배지가 어긋날 수 없다 — 기준일(KST 오늘)은 서비스가 넘긴다.
 *
 * <p>{@code createdAt} 은 JVM 존 벽시계고, {@code lastPaidAt} 은 정합 절대시각이다(/TIMEZONE.md 대응표).
 */
public record AdminFeeBillRow(
        Long billId,
        Long userId,
        String userName,
        String studentId,
        Integer generation,
        String policyName,
        String billingPeriod,
        long amount,
        long paidAmount,
        FeeStatus status,
        boolean overdue,
        LocalDateTime createdAt,
        LocalDate dueDate,
        Instant lastPaidAt
) {
}
