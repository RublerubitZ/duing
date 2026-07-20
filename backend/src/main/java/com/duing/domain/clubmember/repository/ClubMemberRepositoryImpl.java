package com.duing.domain.clubmember.repository;

import static com.duing.domain.club.entity.QClub.club;
import static com.duing.domain.clubmember.entity.QClubMember.clubMember;
import static com.duing.domain.recruitment.entity.QRecruitment.recruitment;

import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.service.dto.query.ManagedClubQuery;
import com.duing.domain.clubmember.service.dto.query.MyClubQuery;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import com.querydsl.core.types.Projections;
import com.querydsl.core.types.dsl.CaseBuilder;
import com.querydsl.core.types.dsl.NumberExpression;
import com.querydsl.jpa.impl.JPAQueryFactory;
import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import lombok.RequiredArgsConstructor;

@RequiredArgsConstructor
public class ClubMemberRepositoryImpl implements ClubMemberRepositoryCustom {

    private final JPAQueryFactory queryFactory;
    // 모집중 뱃지 판정(startDate·endDate vs 오늘)은 KST(seoulClock) 기준.
    private final Clock clock;

    @Override
    public List<ManagedClubQuery> findActiveManagedClubsByUser(Long userId) {
        LocalDate today = LocalDate.now(clock);

        NumberExpression<Integer> activeRecruitmentFlag = activeRecruitmentFlag(today);

        return queryFactory
                .select(Projections.constructor(
                        ManagedClubQuery.class,
                        club.id,
                        club.name,
                        club.logoUrl,
                        clubMember.role,
                        club.centralClub,
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
                .groupBy(club.id, club.name, club.logoUrl, clubMember.role, club.centralClub)
                .orderBy(club.name.asc())
                .fetch();
    }

    @Override
    public List<MyClubQuery> findMyClubsByUser(Long userId) {
        LocalDate today = LocalDate.now(clock);

        NumberExpression<Integer> activeRecruitmentFlag = activeRecruitmentFlag(today);

        return queryFactory
                .select(Projections.constructor(
                        MyClubQuery.class,
                        club.id,
                        club.name,
                        club.logoUrl,
                        club.status,
                        clubMember.role,
                        activeRecruitmentFlag.sum().longValue().coalesce(0L),
                        clubMember.createdAt
                ))
                .from(clubMember)
                .join(clubMember.club, club)
                .leftJoin(recruitment).on(recruitment.club.id.eq(club.id))
                .where(
                        clubMember.user.id.eq(userId),
                        club.status.eq(ClubStatus.ACTIVE)
                )
                .groupBy(club.id, club.name, club.logoUrl, club.status, clubMember.role, clubMember.createdAt)
                .orderBy(clubMember.createdAt.desc())
                .fetch();
    }

    private NumberExpression<Integer> activeRecruitmentFlag(LocalDate today) {
        return new CaseBuilder()
                .when(recruitment.status.eq(RecruitmentStatus.OPEN)
                        .and(recruitment.endDate.goe(today))
                        .and(recruitment.deletedAt.isNull()))
                .then(1)
                .otherwise(0);
    }
}
