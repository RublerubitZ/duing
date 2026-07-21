package com.duing.domain.favorite.repository;

import static com.duing.domain.club.entity.QClub.club;
import static com.duing.domain.favorite.entity.QClubFavorite.clubFavorite;
import static com.duing.domain.recruitment.entity.QRecruitment.recruitment;

import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.favorite.service.dto.query.FavoriteClubQuery;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import com.querydsl.core.types.Projections;
import com.querydsl.jpa.JPAExpressions;
import com.querydsl.jpa.impl.JPAQueryFactory;
import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;

@RequiredArgsConstructor
public class ClubFavoriteRepositoryImpl implements ClubFavoriteRepositoryCustom {

    private final JPAQueryFactory queryFactory;
    // 모집중 판정(endDate >= 오늘)은 KST(seoulClock) 기준 — 다른 모집 노출 경로와 동일한 시계.
    private final Clock clock;

    @Override
    public Page<FavoriteClubQuery> findFavoriteClubPage(Long userId, Pageable pageable) {
        List<FavoriteClubQuery> content = queryFactory
                .select(Projections.constructor(
                        FavoriteClubQuery.class,
                        club.id,
                        club.name,
                        club.logoUrl,
                        club.category,
                        club.division,
                        clubFavorite.createdAt,
                        JPAExpressions
                                .select(recruitment.count().intValue())
                                .from(recruitment)
                                .where(
                                        recruitment.club.id.eq(club.id),
                                        recruitment.status.eq(RecruitmentStatus.OPEN),
                                        recruitment.endDate.isNull().or(recruitment.endDate.goe(LocalDate.now(clock))),
                                        recruitment.deletedAt.isNull()
                                )
                ))
                .from(clubFavorite)
                .join(clubFavorite.club, club)
                .where(
                        clubFavorite.user.id.eq(userId),
                        // 학생에게 노출되는 ACTIVE 동아리만 포함한다 (비공개 상태 노출 차단)
                        club.status.eq(ClubStatus.ACTIVE)
                )
                .orderBy(clubFavorite.createdAt.desc())
                .offset(pageable.getOffset())
                .limit(pageable.getPageSize())
                .fetch();

        Long total = queryFactory
                .select(clubFavorite.count())
                .from(clubFavorite)
                .join(clubFavorite.club, club)
                .where(
                        clubFavorite.user.id.eq(userId),
                        club.status.eq(ClubStatus.ACTIVE)
                )
                .fetchOne();

        return new PageImpl<>(content, pageable, total == null ? 0L : total);
    }
}