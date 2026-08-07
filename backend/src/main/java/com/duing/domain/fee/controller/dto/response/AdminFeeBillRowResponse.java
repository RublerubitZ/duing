package com.duing.domain.fee.controller.dto.response;

import com.duing.domain.fee.entity.FeeStatus;
import com.duing.domain.fee.service.dto.query.AdminFeeBillRow;
import com.duing.global.time.TimeMapper;
import java.time.Instant;
import java.time.LocalDate;

/**
 * 감사 콘솔 청구 행(스펙 §7.5).
 *
 * <p>{@code status} 는 DB 원본이고 {@code overdue} 는 마감일 파생이다 — 연체 전이 배치가 늦어 status 가
 * PENDING 인 마감 경과 청구도 FE 가 연체로 표시할 수 있다. 완납·취소는 마감이 지나도 false 다.
 *
 * <p>{@code userName}·{@code studentId}·{@code generation} 은 탈퇴 회원, {@code policyName} 은
 * 삭제된 정책이면 null 이다. {@code createdAt} 은 JVM 존, {@code lastPaidAt} 은 KST 벽시계를 환산한다.
 */
public record AdminFeeBillRowResponse(
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
        Instant createdAt,
        LocalDate dueDate,
        Instant lastPaidAt
) {
    public static AdminFeeBillRowResponse from(AdminFeeBillRow billRow) {
        return new AdminFeeBillRowResponse(
                billRow.billId(),
                billRow.userId(),
                billRow.userName(),
                billRow.studentId(),
                billRow.generation(),
                billRow.policyName(),
                billRow.billingPeriod(),
                billRow.amount(),
                billRow.paidAmount(),
                billRow.status(),
                billRow.overdue(),
                TimeMapper.systemWallClockToInstant(billRow.createdAt()),
                billRow.dueDate(),
                TimeMapper.seoulWallClockToInstant(billRow.lastPaidAt()));
    }
}
