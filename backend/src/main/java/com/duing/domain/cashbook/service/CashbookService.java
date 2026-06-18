package com.duing.domain.cashbook.service;

import com.duing.domain.cashbook.controller.dto.response.CashbookEntryResponse;
import com.duing.domain.cashbook.controller.dto.response.CashbookSummaryResponse;
import com.duing.domain.cashbook.service.dto.command.CreateCashbookEntryCommand;
import com.duing.domain.cashbook.service.dto.command.UpdateCashbookEntryCommand;
import com.duing.domain.cashbook.service.dto.query.CashbookSearchQuery;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface CashbookService {
    Long create(CreateCashbookEntryCommand command);

    void update(UpdateCashbookEntryCommand command);

    void delete(Long clubId, Long actorId, Long entryId);

    Page<CashbookEntryResponse> getEntries(Long clubId, Long actorId, CashbookSearchQuery query, Pageable pageable);

    CashbookSummaryResponse getSummary(Long clubId, Long actorId, CashbookSearchQuery query);
}
