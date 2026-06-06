package com.duing.domain.club.repository;

import static com.duing.domain.club.entity.QClub.club;
import static com.duing.domain.clubmember.entity.QClubMember.clubMember;
import static com.duing.domain.recruitment.entity.QRecruitment.recruitment;
import static com.duing.domain.user.entity.QUser.user;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.QUser;
import com.duing.domain.club.service.dto.query.AdminClubSearchCondition;
import com.duing.domain.club.service.dto.query.AdminClubSummaryQuery;
import com.duing.domain.club.service.dto.query.ClubSearchCondition;
import com.duing.domain.club.service.dto.query.ClubSortOption;
import com.duing.domain.club.service.dto.query.RecruitmentStatusFilter;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import com.querydsl.core.Tuple;
import com.querydsl.core.types.Order;
import com.querydsl.core.types.OrderSpecifier;
import com.querydsl.core.types.dsl.BooleanExpression;
import com.querydsl.core.types.dsl.CaseBuilder;
import com.querydsl.core.types.dsl.Expressions;
import com.querydsl.core.types.dsl.NumberExpression;
import com.querydsl.jpa.JPAExpressions;
import com.querydsl.jpa.impl.JPAQueryFactory;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
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
        RecruitmentStatusFilter effectiveStatus = condition.effectiveRecruitmentStatus();

        BooleanExpression[] predicates = {
                club.status.eq(ClubStatus.ACTIVE),
                categoryEq(condition.category()),
                divisionEq(condition.division()),
                keywordContains(condition.keyword()),
                tagsOverlap(condition.tags()),
                recruitmentStatusFilter(effectiveStatus),
                centralClubEq(condition.centralClub()),
                collegeEq(condition.college()),
                activeDaysOverlap(condition.effectiveActiveDays()),
        };

        List<Club> content = queryFactory
                .selectFrom(club)
                .where(predicates)
                .orderBy(applySort(condition.sortOptionOrDefault()))
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

    @Override
    public Page<AdminClubSummaryQuery> findByAdminCondition(AdminClubSearchCondition condition, Pageable pageable) {
        BooleanExpression[] predicates = {
                adminStatusEq(condition.status()),
                categoryEq(condition.category()),
                divisionEq(condition.division()),
                keywordContains(condition.keyword()),
        };

        // leader 는 한 동아리당 0~1명. ClubMember(role=LEADER) 로 left join 해 leader 부재 시에도 행이 보존되게 한다.
        // actor 는 상태 변경자(statusChangedBy) 에 대한 별도 user left join.
        QUser actor = new QUser("actor");

        List<Tuple> rows = queryFactory
                .select(club, user.id, user.name, user.studentId, actor.name)
                .from(club)
                .leftJoin(clubMember)
                .on(clubMember.club.eq(club).and(clubMember.role.eq(ClubMemberRole.LEADER)))
                .leftJoin(user).on(user.eq(clubMember.user))
                .leftJoin(actor).on(actor.id.eq(club.statusChangedBy))
                .where(predicates)
                .orderBy(club.name.asc())
                .offset(pageable.getOffset())
                .limit(pageable.getPageSize())
                .fetch();

        List<AdminClubSummaryQuery> content = rows.stream()
                .map(row -> toAdminSummary(row, actor))
                .toList();

        Long total = queryFactory
                .select(club.count())
                .from(club)
                .where(predicates)
                .fetchOne();

        return new PageImpl<>(content, pageable, total == null ? 0L : total);
    }

    private AdminClubSummaryQuery toAdminSummary(Tuple row, QUser actor) {
        Club source = row.get(club);
        if (source == null) {
            throw new IllegalStateException("Admin 동아리 목록 조회 결과 row 에 club 이 비어있을 수 없습니다.");
        }
        return new AdminClubSummaryQuery(
                source.getId(),
                source.getName(),
                source.getCategory(),
                source.getDivision(),
                source.getCollege(),
                source.getLogoUrl(),
                source.getStatus(),
                source.getTags(),
                row.get(user.id),
                row.get(user.name),
                row.get(user.studentId),
                source.isCentralClub(),
                source.getRejectionReason(),
                source.getStatusChangedAt(),
                row.get(actor.name)
        );
    }

    private BooleanExpression categoryEq(ClubCategory category) {
        return category != null ? club.category.eq(category) : null;
    }

    private BooleanExpression divisionEq(String division) {
        return StringUtils.hasText(division) ? club.division.eq(division) : null;
    }

    private BooleanExpression adminStatusEq(ClubStatus status) {
        return status != null ? club.status.eq(status) : null;
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

    private BooleanExpression activeDaysOverlap(Set<DayOfWeek> days) {
        if (days == null) return null;
        String csv = days.stream()
                .map(DayOfWeek::name)
                .collect(Collectors.joining(","));
        // active_days 는 CSV TEXT. array_overlap_csv 가 양쪽을 string_to_array 로 펼쳐
        // PostgreSQL && 로 한 원소라도 겹치는지 검사한다. 빈 문자열은 nullif 로 NULL 처리.
        return Expressions.booleanTemplate(
                "function('array_overlap_csv', {0}, {1}) = true",
                club.activeDays,
                csv
        );
    }

    private BooleanExpression recruitmentStatusFilter(RecruitmentStatusFilter filter) {
        if (filter == null) return null;
        LocalDate today = LocalDate.now();
        return switch (filter) {
            case AVAILABLE -> JPAExpressions
                    .selectOne()
                    .from(recruitment)
                    .where(
                            recruitment.club.id.eq(club.id),
                            recruitment.status.eq(RecruitmentStatus.OPEN),
                            recruitment.endDate.isNull().or(recruitment.endDate.goe(today)),
                            recruitment.startDate.loe(today)
                    )
                    .exists();
            case UPCOMING -> JPAExpressions
                    .selectOne()
                    .from(recruitment)
                    .where(
                            recruitment.club.id.eq(club.id),
                            recruitment.status.eq(RecruitmentStatus.OPEN),
                            recruitment.startDate.gt(today)
                    )
                    .exists();
            case CLOSED -> JPAExpressions
                    .selectOne()
                    .from(recruitment)
                    .where(
                            recruitment.club.id.eq(club.id),
                            recruitment.status.eq(RecruitmentStatus.CLOSED)
                                    .or(recruitment.endDate.isNotNull().and(recruitment.endDate.lt(today)))
                    )
                    .exists()
                    .and(JPAExpressions  // 활성 모집이 있으면 CLOSED 필터에서 제외
                            .selectOne()
                            .from(recruitment)
                            .where(
                                    recruitment.club.id.eq(club.id),
                                    recruitment.status.eq(RecruitmentStatus.OPEN),
                                    recruitment.endDate.isNull().or(recruitment.endDate.goe(today))
                            )
                            .notExists());
        };
    }

    private BooleanExpression centralClubEq(Boolean value) {
        return value == null ? null : club.centralClub.eq(value);
    }

    private BooleanExpression collegeEq(College value) {
        return value == null ? null : club.college.eq(value);
    }

    private OrderSpecifier<?>[] applySort(ClubSortOption sortOption) {
        return switch (sortOption) {
            case DEADLINE_SOON -> new OrderSpecifier<?>[]{
                    new OrderSpecifier<>(
                            Order.ASC,
                            JPAExpressions.select(recruitment.endDate.min())
                                    .from(recruitment)
                                    .where(recruitment.club.eq(club)
                                            .and(recruitment.status.eq(RecruitmentStatus.OPEN))),
                            OrderSpecifier.NullHandling.NullsLast
                    ),
                    club.createdAt.desc()
            };
            case ALPHABETICAL -> new OrderSpecifier<?>[]{ club.name.asc() };
            case RECENT -> {
                // 동아리당 대표 모집을 sub-select 로 한 번 lookup 해서 그룹 번호와 보조 정렬 키를 만든다.
                // 운영 가정상 동아리당 활성 모집은 1건. 다중일 때는 createdAt 최신을 대표로 본다.
                LocalDate today = LocalDate.now();

                // 주의: CASE 절은 위에서부터 평가된다. RecruitmentDisplayStatus.resolve() 의 우선순위와 맞추기 위해
                // (1) CLOSED → 그룹 4
                // (2) status=OPEN ∧ today < startDate → UPCOMING → 그룹 3
                // (3) status=OPEN ∧ endDate IS NULL → ALWAYS_OPEN → 그룹 2  (startDate ≤ today 는 이미 (2) 가 걸러냄)
                // (4) status=OPEN ∧ today > endDate → CLOSED → 그룹 4
                // (5) 이외(OPEN ∧ startDate ≤ today ≤ endDate) → OPEN → 그룹 1
                NumberExpression<Integer> recruitmentPriority = Expressions.asNumber(
                        JPAExpressions
                                .select(new CaseBuilder()
                                        .when(recruitment.status.eq(RecruitmentStatus.CLOSED))
                                        .then(4)
                                        .when(recruitment.startDate.gt(today))
                                        .then(3)
                                        .when(recruitment.endDate.isNull())
                                        .then(2)
                                        .when(recruitment.endDate.lt(today))
                                        .then(4)
                                        .otherwise(1)
                                        .min())
                                .from(recruitment)
                                .where(recruitment.club.eq(club)));

                // 그룹 내 보조 정렬용 정렬키들 (모두 sub-select). 그룹에 안 맞으면 null → NULLS LAST 로 영향 없음.
                var openEndDateAsc = JPAExpressions.select(recruitment.endDate.min())
                        .from(recruitment)
                        .where(recruitment.club.eq(club),
                                recruitment.status.eq(RecruitmentStatus.OPEN),
                                recruitment.startDate.loe(today),
                                recruitment.endDate.goe(today));
                var upcomingStartDateAsc = JPAExpressions.select(recruitment.startDate.min())
                        .from(recruitment)
                        .where(recruitment.club.eq(club),
                                recruitment.status.eq(RecruitmentStatus.OPEN),
                                recruitment.startDate.gt(today));
                var closedEndDateDesc = JPAExpressions.select(recruitment.endDate.max())
                        .from(recruitment)
                        .where(recruitment.club.eq(club),
                                recruitment.status.eq(RecruitmentStatus.CLOSED)
                                        .or(recruitment.endDate.isNotNull().and(recruitment.endDate.lt(today))));

                yield new OrderSpecifier<?>[]{
                        new OrderSpecifier<>(Order.ASC, recruitmentPriority.coalesce(5),
                                OrderSpecifier.NullHandling.NullsLast),
                        new OrderSpecifier<>(Order.ASC, openEndDateAsc, OrderSpecifier.NullHandling.NullsLast),
                        new OrderSpecifier<>(Order.ASC, upcomingStartDateAsc, OrderSpecifier.NullHandling.NullsLast),
                        new OrderSpecifier<>(Order.DESC, closedEndDateDesc, OrderSpecifier.NullHandling.NullsLast),
                        club.createdAt.desc()
                };
            }
        };
    }
}
