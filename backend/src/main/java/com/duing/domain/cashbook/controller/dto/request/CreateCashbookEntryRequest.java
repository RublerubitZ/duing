package com.duing.domain.cashbook.controller.dto.request;

import com.duing.domain.cashbook.entity.CashbookCategory;
import com.duing.domain.cashbook.entity.CashbookEntryType;
import com.duing.domain.cashbook.service.dto.command.CreateCashbookEntryCommand;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;

public record CreateCashbookEntryRequest(
        @NotNull(message = "수입/지출 유형은 필수입니다.") CashbookEntryType entryType,
        @NotNull(message = "카테고리는 필수입니다.") CashbookCategory categoryCode,
        @Size(max = 40, message = "직접입력 카테고리는 40자 이하여야 합니다.") String customCategory,
        @NotNull(message = "금액은 필수입니다.") @Positive(message = "금액은 1원 이상이어야 합니다.") Long amount,
        @NotBlank(message = "설명은 필수입니다.") @Size(max = 100, message = "설명은 100자 이하여야 합니다.") String description,
        @NotNull(message = "거래일은 필수입니다.") LocalDate transactionDate,
        @Size(max = 200, message = "메모는 200자 이하여야 합니다.") String memo) {

    public CreateCashbookEntryCommand toCommand(Long clubId, Long actorId) {
        return new CreateCashbookEntryCommand(clubId, actorId, entryType, categoryCode, customCategory,
                amount, description, transactionDate, memo);
    }
}
