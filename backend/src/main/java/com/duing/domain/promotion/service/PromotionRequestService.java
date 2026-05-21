package com.duing.domain.promotion.service;

import com.duing.domain.promotion.entity.PromotionRequest;
import com.duing.domain.promotion.service.dto.command.CreatePromotionRequestCommand;
import com.duing.domain.promotion.service.dto.command.ProcessPromotionRequestCommand;
import com.duing.domain.promotion.service.dto.query.PromotionRequestAdminSearchCondition;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface PromotionRequestService {
    Long create(CreatePromotionRequestCommand command);
    void process(ProcessPromotionRequestCommand command);
    PromotionRequest getById(Long requestId);
    Page<PromotionRequest> searchForAdmin(PromotionRequestAdminSearchCondition condition, Pageable pageable);
}
