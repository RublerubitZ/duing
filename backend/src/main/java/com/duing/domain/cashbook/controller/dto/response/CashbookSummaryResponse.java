package com.duing.domain.cashbook.controller.dto.response;

import com.duing.domain.cashbook.service.dto.query.CashbookSummaryProjection;

public record CashbookSummaryResponse(long totalIncome, long totalExpense, long bookBalance) {

    public static CashbookSummaryResponse from(CashbookSummaryProjection projection) {
        return new CashbookSummaryResponse(projection.totalIncome(), projection.totalExpense(),
                projection.totalIncome() - projection.totalExpense());
    }
}
