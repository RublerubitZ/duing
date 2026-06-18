package com.duing.domain.cashbook.repository;

import static com.duing.domain.cashbook.entity.QCashbookEntry.cashbookEntry;

import com.duing.domain.cashbook.entity.CashbookCategory;
import com.duing.domain.cashbook.entity.CashbookEntry;
import com.duing.domain.cashbook.entity.CashbookEntryType;
import com.duing.domain.cashbook.service.dto.query.CashbookSearchQuery;
import com.duing.domain.cashbook.service.dto.query.CashbookSummaryProjection;
import com.querydsl.core.types.Projections;
import com.querydsl.core.types.dsl.BooleanExpression;
import com.querydsl.core.types.dsl.CaseBuilder;
import com.querydsl.core.types.dsl.NumberExpression;
import com.querydsl.jpa.impl.JPAQueryFactory;
import java.time.LocalDate;
import java.util.List;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.util.StringUtils;

@RequiredArgsConstructor
public class CashbookEntryRepositoryImpl implements CashbookEntryRepositoryCustom {

    private final JPAQueryFactory queryFactory;

    @Override
    public Page<CashbookEntry> search(Long clubId, CashbookSearchQuery query, Pageable pageable) {
        Objects.requireNonNull(clubId, "clubId must not be null");
        List<CashbookEntry> content = queryFactory
                .selectFrom(cashbookEntry)
                .where(clubIdEq(clubId), entryTypeEq(query.entryType()), categoryEq(query.categoryCode()),
                        dateFrom(query.from()), dateTo(query.to()), keyword(query.keyword()),
                        notExcludedIf(query.hideExcluded()))
                .orderBy(cashbookEntry.transactionDate.desc(), cashbookEntry.id.desc())
                .offset(pageable.getOffset())
                .limit(pageable.getPageSize())
                .fetch();
        Long total = queryFactory
                .select(cashbookEntry.count())
                .from(cashbookEntry)
                .where(clubIdEq(clubId), entryTypeEq(query.entryType()), categoryEq(query.categoryCode()),
                        dateFrom(query.from()), dateTo(query.to()), keyword(query.keyword()),
                        notExcludedIf(query.hideExcluded()))
                .fetchOne();
        return new PageImpl<>(content, pageable, total == null ? 0L : total);
    }

    @Override
    public CashbookSummaryProjection summarize(Long clubId, CashbookSearchQuery query) {
        Objects.requireNonNull(clubId, "clubId must not be null");
        CashbookSummaryProjection projection = queryFactory
                .select(Projections.constructor(CashbookSummaryProjection.class,
                        sumByType(CashbookEntryType.INCOME), sumByType(CashbookEntryType.EXPENSE)))
                .from(cashbookEntry)
                .where(clubIdEq(clubId), entryTypeEq(query.entryType()), categoryEq(query.categoryCode()),
                        dateFrom(query.from()), dateTo(query.to()), keyword(query.keyword()),
                        cashbookEntry.excluded.isFalse())
                .fetchOne();
        return projection != null ? projection : new CashbookSummaryProjection(0L, 0L);
    }

    private NumberExpression<Long> sumByType(CashbookEntryType entryType) {
        return new CaseBuilder()
                .when(cashbookEntry.entryType.eq(entryType)).then(cashbookEntry.amount).otherwise(0L)
                .sum().coalesce(0L);
    }

    private BooleanExpression clubIdEq(Long clubId) {
        return clubId != null ? cashbookEntry.clubId.eq(clubId) : null;
    }

    private BooleanExpression entryTypeEq(CashbookEntryType entryType) {
        return entryType != null ? cashbookEntry.entryType.eq(entryType) : null;
    }

    private BooleanExpression categoryEq(CashbookCategory categoryCode) {
        return categoryCode != null ? cashbookEntry.categoryCode.eq(categoryCode) : null;
    }

    private BooleanExpression dateFrom(LocalDate from) {
        return from != null ? cashbookEntry.transactionDate.goe(from) : null;
    }

    private BooleanExpression dateTo(LocalDate to) {
        return to != null ? cashbookEntry.transactionDate.loe(to) : null;
    }

    // 목록 전용: hideExcluded=true 면 제외 항목을 가린다. 요약은 항상 제외 항목을 빼므로 별도 처리한다.
    private BooleanExpression notExcludedIf(Boolean hideExcluded) {
        return Boolean.TRUE.equals(hideExcluded) ? cashbookEntry.excluded.isFalse() : null;
    }

    // 설명·메모·직접입력 카테고리 부분일치(대소문자 무시).
    private BooleanExpression keyword(String searchKeyword) {
        if (!StringUtils.hasText(searchKeyword)) {
            return null;
        }
        String trimmed = searchKeyword.trim();
        return cashbookEntry.description.containsIgnoreCase(trimmed)
                .or(cashbookEntry.memo.containsIgnoreCase(trimmed))
                .or(cashbookEntry.customCategory.containsIgnoreCase(trimmed));
    }
}
