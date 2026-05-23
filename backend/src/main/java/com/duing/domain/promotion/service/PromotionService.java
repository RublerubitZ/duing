package com.duing.domain.promotion.service;

import com.duing.domain.promotion.entity.Promotion;
import com.duing.domain.promotion.service.dto.command.CreatePromotionCommand;
import com.duing.domain.promotion.service.dto.command.UpdatePromotionCommand;
import com.duing.domain.promotion.service.dto.query.PromotionAdminListQuery;
import com.duing.domain.promotion.service.dto.query.PromotionAdminSearchCondition;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface PromotionService {
    Long create(CreatePromotionCommand command);
    void update(UpdatePromotionCommand command);
    void delete(Long promotionId);
    Promotion getById(Long promotionId);
    Page<Promotion> findPublic(Pageable pageable);
    Page<PromotionAdminListQuery> listForAdmin(PromotionAdminSearchCondition condition, Pageable pageable);
    PromotionAdminListQuery getAdminItemById(Long promotionId);
}
