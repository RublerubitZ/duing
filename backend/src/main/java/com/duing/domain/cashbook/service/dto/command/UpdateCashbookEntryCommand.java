package com.duing.domain.cashbook.service.dto.command;

import com.duing.domain.cashbook.entity.CashbookCategory;
import java.time.LocalDate;

public record UpdateCashbookEntryCommand(Long clubId, Long actorId, Long entryId,
                                         CashbookCategory categoryCode, String customCategory, Long amount,
                                         String description, LocalDate transactionDate, String memo) {
}
