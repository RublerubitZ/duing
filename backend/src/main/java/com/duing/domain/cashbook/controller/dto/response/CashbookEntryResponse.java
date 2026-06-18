package com.duing.domain.cashbook.controller.dto.response;

import com.duing.domain.cashbook.entity.CashbookCategory;
import com.duing.domain.cashbook.entity.CashbookEntry;
import com.duing.domain.cashbook.entity.CashbookEntryType;
import com.duing.domain.cashbook.entity.CashbookSource;
import java.time.LocalDate;
import java.time.LocalDateTime;

public record CashbookEntryResponse(
        Long id, CashbookEntryType entryType, CashbookSource source,
        CashbookCategory categoryCode, String customCategory, Long amount, String description,
        LocalDate transactionDate, String memo, String attachmentUrl, Long bankTransactionId,
        LocalDateTime createdAt) {

    public static CashbookEntryResponse from(CashbookEntry entry) {
        return new CashbookEntryResponse(entry.getId(), entry.getEntryType(), entry.getSource(),
                entry.getCategoryCode(), entry.getCustomCategory(), entry.getAmount(), entry.getDescription(),
                entry.getTransactionDate(), entry.getMemo(), entry.getAttachmentUrl(),
                entry.getBankTransactionId(), entry.getCreatedAt());
    }
}
