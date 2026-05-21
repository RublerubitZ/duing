package com.duing.domain.promotion.repository;

import com.duing.domain.promotion.entity.PromotionRequest;
import com.duing.domain.promotion.service.dto.query.PromotionRequestAdminSearchCondition;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface PromotionRequestRepositoryCustom {
    Page<PromotionRequest> searchForAdmin(PromotionRequestAdminSearchCondition condition, Pageable pageable);
}
