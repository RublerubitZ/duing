package com.duing.domain.promotion.repository;

import com.duing.domain.promotion.entity.PromotionRequest;
import com.duing.domain.promotion.entity.QPromotionRequest;
import com.duing.domain.promotion.service.dto.query.PromotionRequestAdminSearchCondition;
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
public class PromotionRequestRepositoryImpl implements PromotionRequestRepositoryCustom {

    private final JPAQueryFactory queryFactory;

    @Override
    public Page<PromotionRequest> searchForAdmin(
            PromotionRequestAdminSearchCondition condition, Pageable pageable
    ) {
        QPromotionRequest request = QPromotionRequest.promotionRequest;
        BooleanExpression statusEq = condition.status() == null ? null : request.status.eq(condition.status());
        BooleanExpression clubEq = condition.clubId() == null ? null : request.clubId.eq(condition.clubId());

        List<PromotionRequest> content = queryFactory.selectFrom(request)
                .where(statusEq, clubEq)
                .orderBy(request.createdAt.desc())
                .offset(pageable.getOffset())
                .limit(pageable.getPageSize())
                .fetch();

        var countQuery = queryFactory.select(request.count()).from(request).where(statusEq, clubEq);
        return PageableExecutionUtils.getPage(content, pageable, countQuery::fetchOne);
    }
}
