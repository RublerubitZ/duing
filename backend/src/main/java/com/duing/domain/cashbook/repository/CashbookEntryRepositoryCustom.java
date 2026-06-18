package com.duing.domain.cashbook.repository;

import com.duing.domain.cashbook.entity.CashbookEntry;
import com.duing.domain.cashbook.service.dto.query.CashbookSearchQuery;
import com.duing.domain.cashbook.service.dto.query.CashbookSummaryProjection;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface CashbookEntryRepositoryCustom {
    Page<CashbookEntry> search(Long clubId, CashbookSearchQuery query, Pageable pageable);

    CashbookSummaryProjection summarize(Long clubId, CashbookSearchQuery query);
}
