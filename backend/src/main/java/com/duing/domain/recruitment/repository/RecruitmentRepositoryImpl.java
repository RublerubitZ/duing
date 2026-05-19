package com.duing.domain.recruitment.repository;

import static com.duing.domain.recruitment.entity.QRecruitment.recruitment;

import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import com.querydsl.core.types.dsl.CaseBuilder;
import com.querydsl.jpa.impl.JPAQueryFactory;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import lombok.RequiredArgsConstructor;

@RequiredArgsConstructor
public class RecruitmentRepositoryImpl implements RecruitmentRepositoryCustom {

    private final JPAQueryFactory queryFactory;

    @Override
    public List<Recruitment> findOverlappingPeriod(LocalDate periodStart, LocalDate periodEnd) {
        return queryFactory
                .selectFrom(recruitment)
                .where(
                        recruitment.startDate.loe(periodEnd),
                        recruitment.endDate.goe(periodStart)
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
        LocalDate today = LocalDate.now();
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
        LocalDate today = LocalDate.now();
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
}
