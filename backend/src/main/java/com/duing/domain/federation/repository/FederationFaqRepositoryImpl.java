package com.duing.domain.federation.repository;

import static com.duing.domain.federation.entity.QFederationFaq.federationFaq;

import com.duing.domain.federation.entity.FederationFaq;
import com.duing.domain.federation.service.dto.query.FederationFaqSearchCondition;
import com.querydsl.core.types.dsl.BooleanExpression;
import com.querydsl.jpa.impl.JPAQueryFactory;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.util.StringUtils;

@RequiredArgsConstructor
public class FederationFaqRepositoryImpl implements FederationFaqRepositoryCustom {

    private final JPAQueryFactory queryFactory;

    @Override
    public Page<FederationFaq> searchPublished(FederationFaqSearchCondition condition, Pageable pageable) {
        BooleanExpression[] predicates = {
                federationFaq.published.isTrue(),
                federationFaq.deletedAt.isNull(),
                categoryIdEq(condition.categoryId()),
                keywordContains(condition.keyword())
        };

        List<FederationFaq> content = queryFactory
                .selectFrom(federationFaq)
                .where(predicates)
                .orderBy(
                        federationFaq.pinned.desc(),
                        federationFaq.sortOrder.asc(),
                        federationFaq.id.desc()
                )
                .offset(pageable.getOffset())
                .limit(pageable.getPageSize())
                .fetch();

        Long total = queryFactory
                .select(federationFaq.count())
                .from(federationFaq)
                .where(predicates)
                .fetchOne();

        return new PageImpl<>(content, pageable, total == null ? 0L : total);
    }

    private BooleanExpression categoryIdEq(Long categoryId) {
        return categoryId != null ? federationFaq.categoryId.eq(categoryId) : null;
    }

    private BooleanExpression keywordContains(String keyword) {
        return StringUtils.hasText(keyword)
                ? federationFaq.question.containsIgnoreCase(keyword)
                        .or(federationFaq.answer.containsIgnoreCase(keyword))
                : null;
    }
}
