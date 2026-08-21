package com.duing.domain.promotion.service;

import com.duing.domain.promotion.entity.Promotion;
import com.duing.domain.promotion.service.dto.command.CreatePromotionCommand;
import com.duing.domain.promotion.service.dto.command.UpdatePromotionCommand;
import com.duing.domain.promotion.service.dto.query.PromotionAdminListQuery;
import com.duing.domain.promotion.service.dto.query.PromotionAdminSearchCondition;
import com.duing.domain.promotion.service.dto.query.PromotionCardQuery;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface PromotionService {
    Long create(CreatePromotionCommand command);
    void update(UpdatePromotionCommand command);
    void delete(Long promotionId);
    Promotion getById(Long promotionId);
    /** 공개 배너 카드 — 동아리·공지 참조까지 조립해서 내려준다(벌크 조회로 N+1 회피). */
    Page<PromotionCardQuery> findPublicCards(Pageable pageable);
    Page<PromotionAdminListQuery> listForAdmin(PromotionAdminSearchCondition condition, Pageable pageable);
    PromotionAdminListQuery getAdminItemById(Long promotionId);

    void removeAllOnClubClosure(Long clubId);
}
