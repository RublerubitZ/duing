package com.duing.domain.report.repository;

import com.duing.domain.report.entity.QReport;
import com.duing.domain.report.entity.Report;
import com.duing.domain.report.service.dto.query.ReportAdminSearchCondition;
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
public class ReportRepositoryImpl implements ReportRepositoryCustom {

    private final JPAQueryFactory queryFactory;

    @Override
    public Page<Report> searchForAdmin(ReportAdminSearchCondition condition, Pageable pageable) {
        QReport report = QReport.report;
        BooleanExpression statusEq = condition.status() == null ? null : report.status.eq(condition.status());
        BooleanExpression targetEq = condition.targetType() == null ? null : report.targetType.eq(condition.targetType());

        List<Report> content = queryFactory.selectFrom(report)
                .where(statusEq, targetEq)
                .orderBy(report.createdAt.desc())
                .offset(pageable.getOffset())
                .limit(pageable.getPageSize())
                .fetch();

        var countQuery = queryFactory.select(report.count()).from(report).where(statusEq, targetEq);
        return PageableExecutionUtils.getPage(content, pageable, countQuery::fetchOne);
    }
}
