package com.duing.common.fixture;

import com.duing.domain.cashbook.entity.CashbookCategory;
import com.duing.domain.cashbook.entity.CashbookEntry;
import com.duing.domain.cashbook.entity.CashbookEntryType;
import java.time.LocalDate;

public final class CashbookEntryFixture {

    private CashbookEntryFixture() {
    }

    public static CashbookEntry manualIncome(Long clubId, CashbookCategory category, long amount, LocalDate date) {
        return CashbookEntry.createManual(clubId, CashbookEntryType.INCOME, category, null, amount,
                "수입 항목", date, null);
    }

    public static CashbookEntry manualExpense(Long clubId, CashbookCategory category, long amount, LocalDate date) {
        return CashbookEntry.createManual(clubId, CashbookEntryType.EXPENSE, category, null, amount,
                "지출 항목", date, null);
    }
}
