package com.duing.domain.federation.repository;

import static com.duing.domain.federation.entity.QFederationInquiry.federationInquiry;

import com.duing.domain.federation.entity.FederationInquiry;
import com.duing.domain.federation.entity.FederationInquiryStatus;
import com.duing.domain.federation.service.dto.query.FederationInquiryAdminSearchCondition;
import com.querydsl.core.types.dsl.BooleanExpression;
import com.querydsl.jpa.impl.JPAQueryFactory;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.util.StringUtils;

@RequiredArgsConstructor
public class FederationInquiryRepositoryImpl implements FederationInquiryRepositoryCustom {

    private final JPAQueryFactory queryFactory;

    @Override
    public Page<FederationInquiry> searchMine(Long authorId, FederationInquiryStatus status, Pageable pageable) {
        BooleanExpression[] predicates = {
                federationInquiry.authorId.eq(authorId),
                federationInquiry.deletedAt.isNull(),
                statusEq(status)
        };
        return fetchPage(predicates, pageable);
    }

    @Override
    public Page<FederationInquiry> searchForAdmin(FederationInquiryAdminSearchCondition condition, Pageable pageable) {
        BooleanExpression[] predicates = {
                federationInquiry.deletedAt.isNull(),
                statusEq(condition.status()),
                keywordContains(condition.keyword())
        };
        return fetchPage(predicates, pageable);
    }

    private Page<FederationInquiry> fetchPage(BooleanExpression[] predicates, Pageable pageable) {
        List<FederationInquiry> content = queryFactory
                .selectFrom(federationInquiry)
                .where(predicates)
                .orderBy(federationInquiry.createdAt.desc(), federationInquiry.id.desc())
                .offset(pageable.getOffset())
                .limit(pageable.getPageSize())
                .fetch();

        Long total = queryFactory
                .select(federationInquiry.count())
                .from(federationInquiry)
                .where(predicates)
                .fetchOne();

        return new PageImpl<>(content, pageable, total == null ? 0L : total);
    }

    private BooleanExpression statusEq(FederationInquiryStatus status) {
        return status != null ? federationInquiry.status.eq(status) : null;
    }

    private BooleanExpression keywordContains(String keyword) {
        return StringUtils.hasText(keyword)
                ? federationInquiry.title.containsIgnoreCase(keyword)
                        .or(federationInquiry.content.containsIgnoreCase(keyword))
                : null;
    }
}
