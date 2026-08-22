package com.duing.domain.federation.repository;

import static com.duing.domain.federation.entity.QFederationFaq.federationFaq;

import com.duing.domain.federation.entity.FederationFaq;
import com.duing.domain.federation.service.dto.query.FederationFaqAdminSearchCondition;
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

    @Override
    public Page<FederationFaq> searchForAdmin(FederationFaqAdminSearchCondition condition, Pageable pageable) {
        BooleanExpression[] predicates = {
                federationFaq.deletedAt.isNull(),
                publishedEq(condition.published()),
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

    private BooleanExpression publishedEq(Boolean published) {
        return published != null ? federationFaq.published.eq(published) : null;
    }

    private BooleanExpression categoryIdEq(Long categoryId) {
        return categoryId != null ? federationFaq.categoryId.eq(categoryId) : null;
    }

    // strip 은 admin 검색을 위한 것이다 — 공개 검색은 FederationFaqSearchCondition 이 이미
    // strip + 공백 압축을 마친 키워드를 넘기므로(무결과 기록과 형태를 맞추기 위해) 여기서는 무해하게 지나간다.
    private BooleanExpression keywordContains(String keyword) {
        if (!StringUtils.hasText(keyword)) return null;
        String normalized = keyword.strip();
        return federationFaq.question.containsIgnoreCase(normalized)
                .or(federationFaq.answer.containsIgnoreCase(normalized));
    }
}
