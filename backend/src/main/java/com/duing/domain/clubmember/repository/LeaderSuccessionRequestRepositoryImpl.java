package com.duing.domain.clubmember.repository;

import com.duing.domain.clubmember.entity.LeaderSuccessionRequest;
import com.duing.domain.clubmember.entity.QLeaderSuccessionRequest;
import com.duing.domain.clubmember.service.dto.query.SuccessionAdminSearchCondition;
import com.querydsl.core.types.dsl.BooleanExpression;
import com.querydsl.jpa.impl.JPAQueryFactory;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.support.PageableExecutionUtils;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class LeaderSuccessionRequestRepositoryImpl implements LeaderSuccessionRequestRepositoryCustom {

    private final JPAQueryFactory queryFactory;

    @Override
    public Page<LeaderSuccessionRequest> searchForAdmin(
            SuccessionAdminSearchCondition condition, Pageable pageable
    ) {
        QLeaderSuccessionRequest request = QLeaderSuccessionRequest.leaderSuccessionRequest;
        BooleanExpression statusEq = condition.status() == null ? null : request.status.eq(condition.status());
        BooleanExpression clubEq = condition.clubId() == null ? null : request.clubId.eq(condition.clubId());

        List<LeaderSuccessionRequest> content = queryFactory.selectFrom(request)
                .where(statusEq, clubEq)
                .orderBy(request.createdAt.desc())
                .offset(pageable.getOffset())
                .limit(pageable.getPageSize())
                .fetch();

        var countQuery = queryFactory.select(request.count()).from(request).where(statusEq, clubEq);
        return PageableExecutionUtils.getPage(content, pageable, countQuery::fetchOne);
    }
}
