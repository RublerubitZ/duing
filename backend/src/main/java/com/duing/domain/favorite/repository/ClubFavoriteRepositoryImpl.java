package com.duing.domain.favorite.repository;

import static com.duing.domain.club.entity.QClub.club;
import static com.duing.domain.favorite.entity.QClubFavorite.clubFavorite;
import static com.duing.domain.recruitment.entity.QRecruitment.recruitment;

import com.duing.domain.favorite.service.dto.query.FavoriteClubQuery;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import com.querydsl.core.types.Projections;
import com.querydsl.jpa.JPAExpressions;
import com.querydsl.jpa.impl.JPAQueryFactory;
import java.time.LocalDate;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;

@RequiredArgsConstructor
public class ClubFavoriteRepositoryImpl implements ClubFavoriteRepositoryCustom {

    private final JPAQueryFactory queryFactory;

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
                                        recruitment.endDate.goe(LocalDate.now()),
                                        recruitment.deletedAt.isNull()
                                )
                ))
                .from(clubFavorite)
                .join(clubFavorite.club, club)
                .where(clubFavorite.user.id.eq(userId))
                .orderBy(clubFavorite.createdAt.desc())
                .offset(pageable.getOffset())
                .limit(pageable.getPageSize())
                .fetch();

        Long total = queryFactory
                .select(clubFavorite.count())
                .from(clubFavorite)
                .where(clubFavorite.user.id.eq(userId))
                .fetchOne();

        return new PageImpl<>(content, pageable, total == null ? 0L : total);
    }
}