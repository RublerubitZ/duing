package com.duing.domain.club.repository;

import static com.duing.domain.club.entity.QClub.club;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.service.dto.query.ClubSearchCondition;
import com.querydsl.core.types.dsl.BooleanExpression;
import com.querydsl.jpa.impl.JPAQueryFactory;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.util.StringUtils;

@RequiredArgsConstructor
public class ClubRepositoryImpl implements ClubRepositoryCustom {

    private final JPAQueryFactory queryFactory;

    @Override
    public Page<Club> findByCondition(ClubSearchCondition condition, Pageable pageable) {
        List<Club> content = queryFactory
                .selectFrom(club)
                .where(
                        categoryEq(condition.category()),
                        divisionEq(condition.division()),
                        keywordContains(condition.keyword())
                )
                .orderBy(club.name.asc())
                .offset(pageable.getOffset())
                .limit(pageable.getPageSize())
                .fetch();

        Long total = queryFactory
                .select(club.count())
                .from(club)
                .where(
                        categoryEq(condition.category()),
                        divisionEq(condition.division()),
                        keywordContains(condition.keyword())
                )
                .fetchOne();

        return new PageImpl<>(content, pageable, total == null ? 0L : total);
    }

    private BooleanExpression categoryEq(ClubCategory category) {
        return category != null ? club.category.eq(category) : null;
    }

    private BooleanExpression divisionEq(String division) {
        return StringUtils.hasText(division) ? club.division.eq(division) : null;
    }

    private BooleanExpression keywordContains(String keyword) {
        if (!StringUtils.hasText(keyword)) {
            return null;
        }
        return club.name.containsIgnoreCase(keyword)
                .or(club.description.containsIgnoreCase(keyword));
    }
}
