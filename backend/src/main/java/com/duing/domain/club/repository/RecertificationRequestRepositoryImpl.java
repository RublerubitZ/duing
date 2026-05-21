package com.duing.domain.club.repository;

import com.duing.domain.club.controller.dto.response.CentralClubRecertificationStatusResponse;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.QClub;
import com.duing.domain.club.entity.QRecertificationRequest;
import com.duing.domain.club.entity.RecertificationRequest;
import com.duing.domain.club.service.dto.query.CentralClubRecertificationStatusQuery;
import com.duing.domain.club.service.dto.query.RecertificationAdminSearchCondition;
import com.querydsl.core.types.dsl.BooleanExpression;
import com.querydsl.core.types.dsl.Expressions;
import com.querydsl.jpa.impl.JPAQueryFactory;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.support.PageableExecutionUtils;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class RecertificationRequestRepositoryImpl implements RecertificationRequestRepositoryCustom {

    private final JPAQueryFactory queryFactory;

    @Override
    public Page<RecertificationRequest> searchForAdmin(
            RecertificationAdminSearchCondition condition, Pageable pageable
    ) {
        QRecertificationRequest request = QRecertificationRequest.recertificationRequest;
        BooleanExpression roundEq = condition.roundId() == null ? null : request.roundId.eq(condition.roundId());
        BooleanExpression statusEq = condition.status() == null ? null : request.status.eq(condition.status());

        List<RecertificationRequest> content = queryFactory.selectFrom(request)
                .where(roundEq, statusEq)
                .orderBy(request.createdAt.desc())
                .offset(pageable.getOffset())
                .limit(pageable.getPageSize())
                .fetch();

        var countQuery = queryFactory.select(request.count()).from(request).where(roundEq, statusEq);
        return PageableExecutionUtils.getPage(content, pageable, countQuery::fetchOne);
    }

    @Override
    public Page<CentralClubRecertificationStatusResponse> findCentralClubStatuses(
            CentralClubRecertificationStatusQuery query, Pageable pageable
    ) {
        QClub club = QClub.club;
        BooleanExpression isCentral = club.centralClub.isTrue();

        BooleanExpression expiredExpr = club.lastVerifiedYear.isNull()
                .or(club.lastVerifiedYear.lt(query.operatingYear()));

        List<Club> content = queryFactory.selectFrom(club)
                .where(isCentral)
                .orderBy(
                        Expressions.cases()
                                .when(expiredExpr).then(1)
                                .otherwise(0).desc(),
                        club.lastVerifiedYear.asc().nullsFirst()
                )
                .offset(pageable.getOffset())
                .limit(pageable.getPageSize())
                .fetch();

        List<CentralClubRecertificationStatusResponse> mapped = content.stream()
                .map(c -> new CentralClubRecertificationStatusResponse(
                        c.getId(),
                        c.getName(),
                        c.isCentralClub(),
                        c.getLastVerifiedYear(),
                        c.getLastVerifiedYear() == null
                                || c.getLastVerifiedYear() < query.operatingYear()
                ))
                .toList();

        var countQuery = queryFactory.select(club.count()).from(club).where(isCentral);
        return PageableExecutionUtils.getPage(mapped, pageable, countQuery::fetchOne);
    }
}
