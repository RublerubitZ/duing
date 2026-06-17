package com.duing.domain.fee.service;

import com.duing.domain.fee.controller.dto.response.FeeBillResponse;
import com.duing.domain.fee.service.dto.command.GenerateBillsCommand;
import com.duing.domain.fee.service.dto.query.BillSearchQuery;
import com.duing.domain.fee.service.dto.query.GenerateBillsResult;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface FeeBillService {
    GenerateBillsResult generate(GenerateBillsCommand command);

    void cancel(Long clubId, Long actorId, Long billId);

    Page<FeeBillResponse> getBills(Long clubId, Long actorId, BillSearchQuery query, Pageable pageable);
}
