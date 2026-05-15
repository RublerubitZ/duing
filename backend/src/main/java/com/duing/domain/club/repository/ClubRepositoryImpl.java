package com.duing.domain.club.repository;

import static com.duing.domain.club.entity.QClub.club;
import static com.duing.domain.recruitment.entity.QRecruitment.recruitment;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.service.dto.query.ClubSearchCondition;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import com.querydsl.core.types.dsl.BooleanExpression;
import com.querydsl.core.types.dsl.Expressions;
import com.querydsl.jpa.JPAExpressions;
import com.querydsl.jpa.impl.JPAQueryFactory;
import java.time.LocalDate;
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
        BooleanExpression[] predicates = {
                categoryEq(condition.category()),
                divisionEq(condition.division()),
                keywordContains(condition.keyword()),
                tagsOverlap(condition.tags()),
                hasActiveRecruitment(condition.recruitingOnly()),
        };

        List<Club> content = queryFactory
                .selectFrom(club)
                .where(predicates)
                .orderBy(club.name.asc())
                .offset(pageable.getOffset())
                .limit(pageable.getPageSize())
                .fetch();

        Long total = queryFactory
                .select(club.count())
                .from(club)
                .where(predicates)
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
        if (!StringUtils.hasText(keyword)) return null;
        return club.name.containsIgnoreCase(keyword)
                .or(club.description.containsIgnoreCase(keyword));
    }

    private BooleanExpression tagsOverlap(List<String> tags) {
        if (tags == null || tags.isEmpty()) return null;
        // HQL 이 ARRAY[...] literal 을 파싱하지 못하므로 콤마 문자열로 전달하고
        // SQL 측 string_to_array 로 펼친다 (PostgresFunctionContributor 참고).
        // 태그 자체에 콤마가 들어가는 케이스는 MVP 범위에서 발생하지 않는다.
        String csv = String.join(",", tags);
        // = true 로 명시 — Hibernate HQL semantic analyzer 가 사용자 정의 function 의
        // boolean 반환을 predicate 컨텍스트에서 인식하지 못하는 케이스를 우회.
        return Expressions.booleanTemplate(
                "function('array_overlap_text', {0}, {1}) = true",
                club.tags,
                csv
        );
    }

    private BooleanExpression hasActiveRecruitment(boolean recruitingOnly) {
        if (!recruitingOnly) return null;
        LocalDate today = LocalDate.now();
        return JPAExpressions
                .selectOne()
                .from(recruitment)
                .where(
                        recruitment.club.id.eq(club.id),
                        recruitment.status.eq(RecruitmentStatus.OPEN),
                        recruitment.endDate.goe(today)
                )
                .exists();
    }
}
