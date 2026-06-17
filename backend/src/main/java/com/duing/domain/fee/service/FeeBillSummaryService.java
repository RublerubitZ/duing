package com.duing.domain.fee.service;

import com.duing.domain.fee.service.dto.query.FeeBillSummary;
import com.duing.domain.fee.service.dto.query.FeeBillSummaryQuery;

public interface FeeBillSummaryService {
    FeeBillSummary getSummary(Long clubId, Long actorId, FeeBillSummaryQuery query);
}
