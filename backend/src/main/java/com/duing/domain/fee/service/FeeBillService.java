package com.duing.domain.fee.service;

import com.duing.domain.fee.service.dto.command.GenerateBillsCommand;
import com.duing.domain.fee.service.dto.query.GenerateBillsResult;

public interface FeeBillService {
    GenerateBillsResult generate(GenerateBillsCommand command);

    void cancel(Long clubId, Long actorId, Long billId);
}
