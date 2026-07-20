package com.duing.domain.recruitment.repository;

import static com.duing.domain.club.entity.QClub.club;
import static com.duing.domain.recruitment.entity.QRecruitment.recruitment;

import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import com.querydsl.core.Tuple;
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

    private final JPAQueryFactory queryFactory;
    // "오늘" 판정은 KST(seoulClock) 기준 — prod JVM 은 UTC 라 무클럭 now() 는 하루 어긋난다.
    private final Clock clock;

    @Override
    public List<Recruitment> findOverlappingPeriod(LocalDate periodStart, LocalDate periodEnd) {
        // 공개 달력 전용 — 운영 중(ACTIVE) 동아리의 모집만 노출한다.
        // 벌크 마감(운영 중단 시 OPEN 일괄 CLOSED)과 별개의 2차 방어선으로, 정합이 깨진 과거 행도 걸러낸다.
        return queryFactory
                .selectFrom(recruitment)
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
    public List<Recruitment> findByClubIdOrderByStatusOpenFirstAndStartDateDesc(Long clubId) {
        return queryFactory
                .selectFrom(recruitment)
                .where(recruitment.club.id.eq(clubId))
                .orderBy(
                        new CaseBuilder()
                                .when(recruitment.status.eq(RecruitmentStatus.OPEN))
                                .then(0)
                                .otherwise(1).asc(),
                        recruitment.startDate.desc()
                )
                .fetch();
    }

    @Override
    public boolean existsActiveByClubId(Long clubId) {
        LocalDate today = LocalDate.now(clock);
        Integer one = queryFactory
                .selectOne()
                .from(recruitment)
                .where(
                        recruitment.club.id.eq(clubId),
                        recruitment.status.eq(RecruitmentStatus.OPEN),
                        recruitment.endDate.isNull().or(recruitment.endDate.goe(today))
                )
                .fetchFirst();
        return one != null;
    }

    @Override
    public Optional<Recruitment> findActiveByClubId(Long clubId) {
        LocalDate today = LocalDate.now(clock);
        Recruitment found = queryFactory
                .selectFrom(recruitment)
                .where(
                        recruitment.club.id.eq(clubId),
                        recruitment.status.eq(RecruitmentStatus.OPEN),
                        recruitment.endDate.isNull().or(recruitment.endDate.goe(today))
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

        // 우선순위 식:
        //   0 = isEffectivelyOpen (status=OPEN ∧ (endDate IS NULL ∨ endDate ≥ today))
        //   1 = 그 외 (CLOSED 또는 status=OPEN 인데 endDate 가 과거)
        NumberExpression<Integer> priority = new CaseBuilder()
                .when(recruitment.status.eq(RecruitmentStatus.OPEN)
                        .and(recruitment.endDate.isNull().or(recruitment.endDate.goe(today))))
                .then(0)
                .otherwise(1);

        List<Tuple> rows = queryFactory
                .select(
                        recruitment.club.id,
                        recruitment.id,
                        recruitment.status,
                        recruitment.startDate,
                        recruitment.endDate,
                        priority,
                        recruitment.endDate.coalesce(LocalDate.of(9999, 12, 31)),
                        recruitment.createdAt
                )
                .from(recruitment)
                .where(recruitment.club.id.in(clubIds))
                .orderBy(
                        recruitment.club.id.asc(),
                        priority.asc(),
                        // 활성 그룹: createdAt 최신 우선
                        // 마감 그룹: endDate DESC (NULL coalesce 로 처리)
                        recruitment.endDate.coalesce(LocalDate.of(9999, 12, 31)).desc(),
                        recruitment.createdAt.desc()
                )
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
}
