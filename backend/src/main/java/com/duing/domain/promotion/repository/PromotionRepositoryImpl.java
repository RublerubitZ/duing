package com.duing.domain.promotion.repository;

import com.duing.domain.promotion.entity.Promotion;
import com.duing.domain.promotion.entity.QPromotion;
import com.duing.domain.promotion.service.dto.query.PromotionAdminSearchCondition;
import com.querydsl.core.types.dsl.BooleanExpression;
import com.querydsl.jpa.impl.JPAQueryFactory;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.support.PageableExecutionUtils;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class PromotionRepositoryImpl implements PromotionRepositoryCustom {

    private final JPAQueryFactory queryFactory;

    @Override
    public Page<Promotion> searchForAdmin(PromotionAdminSearchCondition condition, Pageable pageable) {
        QPromotion promotion = QPromotion.promotion;
        BooleanExpression activeEq = condition.active() == null ? null : promotion.active.eq(condition.active());
        BooleanExpression clubEq = condition.clubId() == null ? null : promotion.clubId.eq(condition.clubId());

        List<Promotion> content = queryFactory.selectFrom(promotion)
                .where(activeEq, clubEq)
                .orderBy(promotion.displayOrder.asc(), promotion.createdAt.desc())
                .offset(pageable.getOffset())
                .limit(pageable.getPageSize())
                .fetch();

        var countQuery = queryFactory.select(promotion.count()).from(promotion).where(activeEq, clubEq);
        return PageableExecutionUtils.getPage(content, pageable, countQuery::fetchOne);
    }

    @Override
    public Page<Promotion> findPublicActive(Pageable pageable) {
        QPromotion promotion = QPromotion.promotion;
        BooleanExpression activeTrue = promotion.active.isTrue();

        List<Promotion> content = queryFactory.selectFrom(promotion)
                .where(activeTrue)
                .orderBy(promotion.displayOrder.asc(), promotion.createdAt.desc())
                .offset(pageable.getOffset())
                .limit(pageable.getPageSize())
                .fetch();

        var countQuery = queryFactory.select(promotion.count()).from(promotion).where(activeTrue);
        return PageableExecutionUtils.getPage(content, pageable, countQuery::fetchOne);
    }
}
