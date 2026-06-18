package com.duing.domain.cashbook.controller.dto.request;

import com.duing.domain.cashbook.entity.CashbookCategory;
import com.duing.domain.cashbook.service.dto.command.UpdateCashbookEntryCommand;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;

public record UpdateCashbookEntryRequest(
        @NotNull(message = "카테고리는 필수입니다.") CashbookCategory categoryCode,
        @Size(max = 40, message = "직접입력 카테고리는 40자 이하여야 합니다.") String customCategory,
        @Positive(message = "금액은 1원 이상이어야 합니다.") Long amount,
        @Size(max = 100, message = "설명은 100자 이하여야 합니다.") String description,
        LocalDate transactionDate,
        @Size(max = 200, message = "메모는 200자 이하여야 합니다.") String memo) {

    public UpdateCashbookEntryCommand toCommand(Long clubId, Long actorId, Long entryId) {
        return new UpdateCashbookEntryCommand(clubId, actorId, entryId, categoryCode, customCategory,
                amount, description, transactionDate, memo);
    }
}
