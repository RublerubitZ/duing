package com.duing.domain.cashbook.service.dto.command;

import com.duing.domain.cashbook.entity.CashbookCategory;
import com.duing.domain.cashbook.entity.CashbookEntryType;
import java.time.LocalDate;

public record CreateCashbookEntryCommand(Long clubId, Long actorId, CashbookEntryType entryType,
                                         CashbookCategory categoryCode, String customCategory, Long amount,
                                         String description, LocalDate transactionDate, String memo) {
}
