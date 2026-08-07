package com.duing.domain.fee.repository;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 정정(VOID)된 납부 한 건의 정정 시각과 대상 청구의 마감일 — 이상징후 FA-02·FA-04 가 함께 쓴다.
 * 마감 후 정정 판정은 컬럼 간 비교(날짜 vs 시각)라 SQL 대신 Java 에서 가른다(대상 행이 적다).
 */
public record AdminFeeVoidedPaymentDue(LocalDateTime voidedAt, LocalDate dueDate) {

    /** 마감일이 지난 뒤의 정정인가 — 마감 당일은 아직 경과가 아니다(연체 판정과 같은 기준). */
    public boolean isAfterDueDate() {
        return voidedAt != null && voidedAt.toLocalDate().isAfter(dueDate);
    }
}
