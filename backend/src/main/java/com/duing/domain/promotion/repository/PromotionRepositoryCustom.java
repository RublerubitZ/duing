package com.duing.domain.promotion.repository;

import com.duing.domain.promotion.entity.Promotion;
import com.duing.domain.promotion.service.dto.query.PromotionAdminSearchCondition;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface PromotionRepositoryCustom {
    Page<Promotion> searchForAdmin(PromotionAdminSearchCondition condition, Pageable pageable);
    Page<Promotion> findPublicActive(Pageable pageable);
}
