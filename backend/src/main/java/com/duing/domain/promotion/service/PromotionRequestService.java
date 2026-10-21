package com.duing.domain.promotion.service;

import com.duing.domain.promotion.entity.PromotionRequest;
import com.duing.domain.promotion.service.dto.command.CreatePromotionRequestCommand;
import com.duing.domain.promotion.service.dto.command.ProcessPromotionRequestCommand;
import com.duing.domain.promotion.service.dto.query.PromotionRequestAdminDetailQuery;
import com.duing.domain.promotion.service.dto.query.PromotionRequestAdminSearchCondition;
import com.duing.domain.promotion.service.dto.query.PromotionRequestAdminSummaryQuery;
import com.duing.domain.promotion.service.dto.query.PromotionRequestLatestQuery;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface PromotionRequestService {
    Long create(CreatePromotionRequestCommand command);
    void process(ProcessPromotionRequestCommand command);
    PromotionRequest getById(Long requestId);
    Optional<PromotionRequestLatestQuery> findLatest(Long clubId, Long currentUserId);
    Page<PromotionRequestAdminSummaryQuery> listForAdmin(PromotionRequestAdminSearchCondition condition, Pageable pageable);
    PromotionRequestAdminDetailQuery getDetailForAdmin(Long requestId);

    void rejectPendingOnClubClosure(Long clubId, Long actorAdminId, String reason);
}
