package com.duing.domain.cashbook.service.dto.query;

import com.duing.domain.cashbook.entity.CashbookCategory;
import com.duing.domain.cashbook.entity.CashbookEntryType;
import java.time.LocalDate;

public record CashbookSearchQuery(CashbookEntryType entryType, CashbookCategory categoryCode,
                                  LocalDate from, LocalDate to, String keyword) {
}
