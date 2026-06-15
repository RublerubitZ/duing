package com.duing.domain.globalevent.repository;

import static com.duing.domain.globalevent.entity.QGlobalEvent.globalEvent;

import com.duing.domain.globalevent.entity.GlobalEvent;
import com.duing.domain.globalevent.entity.GlobalEventCategory;
import com.duing.domain.globalevent.service.dto.query.GlobalEventAdminSearchCondition;
import com.querydsl.core.Tuple;
import com.querydsl.core.types.dsl.BooleanExpression;
import com.querydsl.jpa.impl.JPAQueryFactory;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.util.StringUtils;

@RequiredArgsConstructor
public class GlobalEventRepositoryImpl implements GlobalEventRepositoryCustom {

    private final JPAQueryFactory queryFactory;

    @Override
    public Page<GlobalEvent> findAdminList(GlobalEventAdminSearchCondition condition, Pageable pageable) {
        BooleanExpression[] predicates = {
                categoryEq(condition.category()),
                keywordContains(condition.keyword())
        };

        List<GlobalEvent> content = queryFactory
                .selectFrom(globalEvent)
                .where(predicates)
                .orderBy(globalEvent.startAt.desc(), globalEvent.id.desc())
                .offset(pageable.getOffset())
                .limit(pageable.getPageSize())
                .fetch();

        Long total = queryFactory
                .select(globalEvent.count())
                .from(globalEvent)
                .where(predicates)
                .fetchOne();

        return new PageImpl<>(content, pageable, total == null ? 0L : total);
    }

    @Override
    public Map<GlobalEventCategory, Long> countByCategory() {
        List<Tuple> rows = queryFactory
                .select(globalEvent.category, globalEvent.count())
                .from(globalEvent)
                .groupBy(globalEvent.category)
                .fetch();

        Map<GlobalEventCategory, Long> distribution = new EnumMap<>(GlobalEventCategory.class);
        for (GlobalEventCategory categoryValue : GlobalEventCategory.values()) {
            distribution.put(categoryValue, 0L);
        }
        for (Tuple row : rows) {
            GlobalEventCategory key = row.get(globalEvent.category);
            Long count = row.get(globalEvent.count());
            if (key != null && count != null) {
                distribution.put(key, count);
            }
        }
        return distribution;
    }

    private BooleanExpression categoryEq(GlobalEventCategory category) {
        return category == null ? null : globalEvent.category.eq(category);
    }

    private BooleanExpression keywordContains(String keyword) {
        if (!StringUtils.hasText(keyword)) return null;
        return globalEvent.title.containsIgnoreCase(keyword)
                .or(globalEvent.description.containsIgnoreCase(keyword));
    }
}
