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
    // 모집중 카운트 판정은 KST(seoulClock) 기준 — Recruitment.isEffectivelyOpen 과 동치여야 한다.
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
                        clubMember.role.in(ClubMemberRole.MANAGER_ROLES),
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

    /**
     * Recruitment.isEffectivelyOpen(OPEN && (endDate 없음(상시모집) || 종료일 미경과)) 의 SQL 동치식.
     * endDate 는 NULL 허용 컬럼이라 goe 단독 비교는 상시모집을 UNKNOWN(false) 으로 떨어뜨린다 —
     * 반드시 isNull() 대안을 함께 건다 (ClubFavoriteRepositoryImpl 의 모집중 카운트와 동일 규칙).
     */
    private NumberExpression<Integer> activeRecruitmentFlag(LocalDate today) {
        return new CaseBuilder()
                .when(recruitment.status.eq(RecruitmentStatus.OPEN)
                        .and(recruitment.endDate.isNull().or(recruitment.endDate.goe(today)))
                        .and(recruitment.deletedAt.isNull()))
                .then(1)
                .otherwise(0);
    }
}
