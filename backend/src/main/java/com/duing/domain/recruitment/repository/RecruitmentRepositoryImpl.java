package com.duing.domain.recruitment.repository;

import static com.duing.domain.recruitment.entity.QRecruitment.recruitment;

import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import com.querydsl.core.types.dsl.CaseBuilder;
import com.querydsl.jpa.impl.JPAQueryFactory;
import java.time.LocalDate;
import java.util.List;
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
}