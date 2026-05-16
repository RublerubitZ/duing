package com.duing.domain.clubmember.repository;

import static com.duing.domain.club.entity.QClub.club;
import static com.duing.domain.clubmember.entity.QClubMember.clubMember;
import static com.duing.domain.recruitment.entity.QRecruitment.recruitment;

import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.service.dto.query.ManagedClubQuery;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import com.querydsl.core.types.Projections;
import com.querydsl.core.types.dsl.CaseBuilder;
import com.querydsl.core.types.dsl.NumberExpression;
import com.querydsl.jpa.impl.JPAQueryFactory;
import java.time.LocalDate;
import java.util.List;
import lombok.RequiredArgsConstructor;

@RequiredArgsConstructor
public class ClubMemberRepositoryImpl implements ClubMemberRepositoryCustom {

    private final JPAQueryFactory queryFactory;

    @Override
    public List<ManagedClubQuery> findActiveManagedClubsByUser(Long userId) {
        LocalDate today = LocalDate.now();

        NumberExpression<Integer> activeRecruitmentFlag = new CaseBuilder()
                .when(recruitment.status.eq(RecruitmentStatus.OPEN)
                        .and(recruitment.endDate.goe(today))
                        .and(recruitment.deletedAt.isNull()))
                .then(1)
                .otherwise(0);

        return queryFactory
                .select(Projections.constructor(
                        ManagedClubQuery.class,
                        club.id,
                        club.name,
                        club.logoUrl,
                        clubMember.role,
                        activeRecruitmentFlag.sum().longValue().coalesce(0L)
                ))
                .from(clubMember)
                .join(clubMember.club, club)
                .leftJoin(recruitment).on(recruitment.club.id.eq(club.id))
                .where(
                        clubMember.user.id.eq(userId),
                        clubMember.role.in(ClubMemberRole.LEADER, ClubMemberRole.OFFICER),
                        club.status.eq(ClubStatus.ACTIVE)
                )
                .groupBy(club.id, club.name, club.logoUrl, clubMember.role)
                .orderBy(club.name.asc())
                .fetch();
    }
}
