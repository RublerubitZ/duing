package com.duing.domain.recruitment.repository;

import static com.duing.domain.application.entity.QApplication.application;
import static com.duing.domain.club.entity.QClub.club;
import static com.duing.domain.recruitment.entity.QRecruitment.recruitment;

import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import com.duing.domain.recruitment.service.dto.query.AdminRecruitmentRow;
import com.duing.domain.recruitment.service.dto.query.AdminRecruitmentSearchCondition;
import com.duing.domain.recruitment.service.dto.query.AdminRecruitmentSort;
import com.duing.domain.recruitment.service.dto.query.RecruitmentSummaryRow;
import com.duing.domain.recruitment.service.dto.query.RepresentativeRecruitmentRow;
import com.querydsl.core.Tuple;
import com.querydsl.core.types.ConstructorExpression;
import com.querydsl.core.types.OrderSpecifier;
import com.querydsl.core.types.Projections;
import com.querydsl.core.types.dsl.BooleanExpression;
import com.querydsl.core.types.dsl.CaseBuilder;
import com.querydsl.core.types.dsl.NumberExpression;
import com.querydsl.jpa.impl.JPAQueryFactory;
import java.time.Clock;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import lombok.RequiredArgsConstructor;

@RequiredArgsConstructor
public class RecruitmentRepositoryImpl implements RecruitmentRepositoryCustom {

    /**
     * 대표 모집 정렬에서 상시모집(endDate NULL)을 놓을 자리 — 가장 이른 날짜로 취급한다.
     *
     * <p>가장 늦은 날짜(9999-12-31)로 두면 마감된 상시모집이 "endDate 가 가장 최근인 마감 모집"을
     * 영구히 이기고 대표 자리를 점유한다. 그 뒤로 기간제 모집을 몇 번을 더 돌려도 목록 카드와 상세가
     * 옛날 상시모집을 가리킨다. 진행 중 그룹은 uk_recruitment_club_active 로 최대 1행이라 이 값의
     * 영향을 받지 않으므로, 뒤집어도 마감 그룹의 정렬만 바로잡힌다.
     */
    private static final LocalDate REPRESENTATIVE_NULL_END_DATE = LocalDate.of(1, 1, 1);

    private final JPAQueryFactory queryFactory;
    // "오늘" 판정은 KST(seoulClock) 기준 — prod JVM 은 UTC 라 무클럭 now() 는 하루 어긋난다.
    private final Clock clock;

    /**
     * 공개 목록 projection — {@link RecruitmentSummaryRow} 생성자 순서와 1:1. 컬럼을 빼먹으면
     * 생성자 매칭이 깨져 즉시 실패한다(조용한 null 없음). club 은 호출부에서 join 되어 있어야 한다.
     */
    private static ConstructorExpression<RecruitmentSummaryRow> summaryRowProjection() {
        return Projections.constructor(RecruitmentSummaryRow.class,
                recruitment.id,
                club.id,
                club.name,
                recruitment.title,
                recruitment.startDate,
                recruitment.endDate,
                recruitment.capacity,
                recruitment.status,
                recruitment.applicationMode,
                recruitment.externalFormUrl,
                recruitment.useInterview,
                recruitment.targetRole,
                recruitment.closedAt);
    }

    @Override
    public List<RecruitmentSummaryRow> findSummariesOverlappingPeriod(LocalDate periodStart, LocalDate periodEnd) {
        // 공개 달력 전용 — 운영 중(ACTIVE) 동아리의 모집만 노출한다.
        // 벌크 마감(운영 중단 시 OPEN 일괄 CLOSED)과 별개의 2차 방어선으로, 정합이 깨진 과거 행도 걸러낸다.
        // 상시모집(endDate NULL)은 goe 비교가 false 라 달력에서 제외된다 — 엔티티 시절과 동일한 동작.
        return queryFactory
                .select(summaryRowProjection())
                .from(recruitment)
                .join(recruitment.club, club)
                .where(
                        recruitment.startDate.loe(periodEnd),
                        recruitment.endDate.goe(periodStart),
                        club.status.eq(ClubStatus.ACTIVE)
                )
                .orderBy(recruitment.startDate.asc(), recruitment.id.asc())
                .fetch();
    }

    @Override
    public List<RecruitmentSummaryRow> findSummariesByClubIdOrderByStatusOpenFirstAndStartDateDesc(Long clubId) {
        // 공개 게이트(ClubVisibilityPolicy)가 선행하므로 club join 은 clubName 스칼라 추출용이다.
        return queryFactory
                .select(summaryRowProjection())
                .from(recruitment)
                .join(recruitment.club, club)
                .where(recruitment.club.id.eq(clubId))
                .orderBy(openFirstThenStartDateDesc())
                .fetch();
    }

    @Override
    public List<Recruitment> findByClubIdOrderByStatusOpenFirstAndStartDateDesc(Long clubId) {
        return queryFactory
                .selectFrom(recruitment)
                .where(recruitment.club.id.eq(clubId))
                .orderBy(openFirstThenStartDateDesc())
                .fetch();
    }

    /** 클럽별 모집 목록 정렬 — projection(공개 읽기)과 엔티티(쓰기 경로) 조회가 같은 배열을 공유한다. */
    private static OrderSpecifier<?>[] openFirstThenStartDateDesc() {
        return new OrderSpecifier<?>[]{
                new CaseBuilder()
                        .when(recruitment.status.eq(RecruitmentStatus.OPEN))
                        .then(0)
                        .otherwise(1).asc(),
                recruitment.startDate.desc()
        };
    }

    @Override
    public Optional<Recruitment> findActiveByClubId(Long clubId) {
        LocalDate today = LocalDate.now(clock);
        Recruitment found = queryFactory
                .selectFrom(recruitment)
                .where(
                        recruitment.club.id.eq(clubId),
                        RecruitmentPredicates.effectivelyOpen(today)
                )
                .orderBy(recruitment.startDate.asc(), recruitment.id.asc())
                .fetchFirst();
        return Optional.ofNullable(found);
    }

    @Override
    public Optional<Recruitment> findOpenByClubId(Long clubId) {
        // uk_recruitment_club_active (V38) 로 최대 1건 보장. 비정상 다중 행이면 startDate ASC, id ASC tie-break.
        Recruitment found = queryFactory
                .selectFrom(recruitment)
                .where(
                        recruitment.club.id.eq(clubId),
                        recruitment.status.eq(RecruitmentStatus.OPEN)
                )
                .orderBy(recruitment.startDate.asc(), recruitment.id.asc())
                .fetchFirst();
        return Optional.ofNullable(found);
    }

    @Override
    public Map<Long, ClubActiveRecruitmentRow> findRepresentativeByClubIds(List<Long> clubIds, LocalDate today) {
        if (clubIds == null || clubIds.isEmpty()) {
            return Map.of();
        }

        List<Tuple> rows = queryFactory
                .select(
                        recruitment.club.id,
                        recruitment.id,
                        recruitment.status,
                        recruitment.startDate,
                        recruitment.endDate
                )
                .from(recruitment)
                .where(recruitment.club.id.in(clubIds))
                .orderBy(prepend(recruitment.club.id.asc(), representativeOrder(today)))
                .fetch();

        Map<Long, ClubActiveRecruitmentRow> picked = new HashMap<>();
        for (Tuple row : rows) {
            Long clubId = row.get(recruitment.club.id);
            if (clubId == null || picked.containsKey(clubId)) {
                continue;
            }
            picked.put(clubId, new ClubActiveRecruitmentRow(
                    clubId,
                    row.get(recruitment.id),
                    row.get(recruitment.status),
                    row.get(recruitment.startDate),
                    row.get(recruitment.endDate)
            ));
        }
        return picked;
    }

    @Override
    public Optional<RepresentativeRecruitmentRow> findRepresentativeByClubId(Long clubId, LocalDate today) {
        // 스칼라 projection — 엔티티 로드의 form eager +1 쿼리·content TEXT 전송을 피한다.
        // clubName 은 상세 응답이 Club 에서 이미 가지므로 club join 자체가 없다.
        // 정렬은 배치(findRepresentativeByClubIds)와 같은 representativeOrder 를 공유한다(#895).
        return Optional.ofNullable(queryFactory
                .select(Projections.constructor(RepresentativeRecruitmentRow.class,
                        recruitment.id,
                        recruitment.title,
                        recruitment.startDate,
                        recruitment.endDate,
                        recruitment.capacity,
                        recruitment.status,
                        recruitment.applicationMode,
                        recruitment.externalFormUrl,
                        recruitment.useInterview,
                        recruitment.targetRole,
                        recruitment.interviewStartDate,
                        recruitment.interviewEndDate,
                        recruitment.showApplicantCount))
                .from(recruitment)
                .where(recruitment.club.id.eq(clubId))
                .orderBy(representativeOrder(today))
                .fetchFirst());
    }

    /**
     * 대표 모집 선정 규칙 — 목록(배치)과 상세(단건)가 <b>같은 배열을 공유해야</b> 한다.
     * 한쪽 정렬만 손대면 목록엔 "모집마감", 상세엔 "현재 모집 없음"이 동시에 뜨던 사고가 재발한다(#895).
     *
     * <ol>
     *   <li>진행 중(status=OPEN ∧ (endDate IS NULL ∨ endDate ≥ today))이 먼저</li>
     *   <li>그 안에서는 endDate 가 최근인 것부터 (상시모집은 {@link #REPRESENTATIVE_NULL_END_DATE} 자리)</li>
     *   <li>동률이면 createdAt 최신, 그래도 동률이면 id 최신 — 두 조회의 실행계획이 달라도 같은 행이 나온다</li>
     * </ol>
     */
    private static OrderSpecifier<?>[] representativeOrder(LocalDate today) {
        return new OrderSpecifier<?>[]{
                representativePriority(today).asc(),
                recruitment.endDate.coalesce(REPRESENTATIVE_NULL_END_DATE).desc(),
                recruitment.createdAt.desc(),
                recruitment.id.desc()
        };
    }

    private static NumberExpression<Integer> representativePriority(LocalDate today) {
        return new CaseBuilder()
                .when(RecruitmentPredicates.effectivelyOpen(today))
                .then(0)
                .otherwise(1);
    }

    /** 배치 조회만 clubId 그룹핑이 앞에 하나 더 붙는다 — 나머지 순서는 그대로 공유한다. */
    private static OrderSpecifier<?>[] prepend(OrderSpecifier<?> first, OrderSpecifier<?>[] rest) {
        OrderSpecifier<?>[] combined = new OrderSpecifier<?>[rest.length + 1];
        combined[0] = first;
        System.arraycopy(rest, 0, combined, 1, rest.length);
        return combined;
    }

    /**
     * 동아리는 join 만 하고 이름을 스칼라로 뽑는다 — 지원자 집계(groupBy)와 fetch join 은 함께 쓸 수 없다.
     * 지원서는 leftJoin 이라 지원자가 없는 모집도 0 으로 남는다.
     */
    @Override
    public List<AdminRecruitmentRow> searchForAdmin(AdminRecruitmentSearchCondition searchCondition) {
        List<Tuple> rows = queryFactory
                .select(recruitment, club.name, application.count())
                .from(recruitment)
                .join(recruitment.club, club)
                .leftJoin(application)
                    .on(application.recruitment.eq(recruitment)
                            .and(application.deletedAt.isNull()))
                .where(
                        keywordMatches(searchCondition.q()),
                        statusEq(searchCondition.status()),
                        modeEq(searchCondition.mode())
                )
                .groupBy(recruitment.id, club.name)
                .orderBy(orderSpecifiers(searchCondition.sort()))
                .fetch();

        // 표시 상태는 "오늘"에 의존하므로 KST(seoulClock) 기준으로 서버가 한 번만 판정한다 —
        // 화면이 각자 계산하면 클라이언트 시계가 어긋난 순간 같은 모집을 다르게 부른다(#896).
        LocalDate today = LocalDate.now(clock);
        return rows.stream()
                .map(row -> new AdminRecruitmentRow(
                        row.get(recruitment),
                        row.get(club.name),
                        row.get(application.count()),
                        today))
                .toList();
    }

    private OrderSpecifier<?>[] orderSpecifiers(AdminRecruitmentSort sort) {
        // 동점·동일 마감일은 최신순으로 갈라 목록 순서가 요청마다 흔들리지 않게 한다.
        return switch (sort) {
            case LATEST -> new OrderSpecifier<?>[]{recruitment.createdAt.desc()};
            case APPLICANTS -> new OrderSpecifier<?>[]{
                    application.count().desc(), recruitment.createdAt.desc()};
            case DEADLINE -> new OrderSpecifier<?>[]{
                    recruitment.endDate.asc().nullsLast(), recruitment.createdAt.desc()};
        };
    }

    private BooleanExpression keywordMatches(String keyword) {
        if (keyword == null || keyword.isBlank()) {
            return null;
        }
        String normalized = keyword.strip();
        return club.name.containsIgnoreCase(normalized).or(recruitment.title.containsIgnoreCase(normalized));
    }

    private BooleanExpression statusEq(RecruitmentStatus status) {
        return status == null ? null : recruitment.status.eq(status);
    }

    private BooleanExpression modeEq(ApplicationMode mode) {
        return mode == null ? null : recruitment.applicationMode.eq(mode);
    }
}
