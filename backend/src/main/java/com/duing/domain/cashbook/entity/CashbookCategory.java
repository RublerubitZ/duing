package com.duing.domain.cashbook.entity;

import java.util.EnumSet;
import java.util.Set;

public enum CashbookCategory {
    FEE, SPONSOR, SUBSIDY,                 // 수입
    MT, DINING, SNACK, SUPPLY, MARKETING,  // 지출
    OTHER;                                 // 수입·지출 공용

    private static final Set<CashbookCategory> INCOME_CODES = EnumSet.of(FEE, SPONSOR, SUBSIDY, OTHER);
    private static final Set<CashbookCategory> EXPENSE_CODES = EnumSet.of(MT, DINING, SNACK, SUPPLY, MARKETING, OTHER);

    /** 카테고리 코드가 해당 유형(수입/지출)에 유효한지(OTHER는 공용). */
    public boolean isValidFor(CashbookEntryType entryType) {
        return entryType == CashbookEntryType.INCOME ? INCOME_CODES.contains(this) : EXPENSE_CODES.contains(this);
    }
}
