package com.duing.domain.promotion.repository;

import com.duing.domain.promotion.entity.Promotion;
import com.duing.domain.promotion.entity.QPromotion;
import com.duing.domain.promotion.service.dto.query.PromotionAdminSearchCondition;
import com.querydsl.core.types.dsl.BooleanExpression;
import com.querydsl.jpa.impl.JPAQueryFactory;
import java.time.Clock;
import java.time.LocalDateTime;
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
    private final Clock clock;

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
        // 같은 호출 안에서 동일한 now 로 시작·종료를 비교한다.
        // startAt/endAt 은 KST 벽시계(Schedule)이므로 판정 기준도 seoulClock(KST)이어야 한다. (/TIMEZONE.md)
        LocalDateTime now = LocalDateTime.now(clock);
        BooleanExpression activeTrue = promotion.active.isTrue();
        BooleanExpression startedOrAlways = promotion.startAt.isNull().or(promotion.startAt.loe(now));
        BooleanExpression notEndedOrAlways = promotion.endAt.isNull().or(promotion.endAt.gt(now));

        List<Promotion> content = queryFactory.selectFrom(promotion)
                .where(activeTrue, startedOrAlways, notEndedOrAlways)
                .orderBy(promotion.displayOrder.asc(), promotion.createdAt.desc())
                .offset(pageable.getOffset())
                .limit(pageable.getPageSize())
                .fetch();

        var countQuery = queryFactory.select(promotion.count()).from(promotion)
                .where(activeTrue, startedOrAlways, notEndedOrAlways);
        return PageableExecutionUtils.getPage(content, pageable, countQuery::fetchOne);
    }
}
