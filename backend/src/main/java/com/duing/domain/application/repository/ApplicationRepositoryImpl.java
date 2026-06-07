package com.duing.domain.application.repository;

import static com.duing.domain.application.entity.QApplication.application;
import static com.duing.domain.user.entity.QUser.user;

import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.service.dto.query.ApplicantSearchCondition;
import com.duing.domain.user.entity.College;
import com.querydsl.core.types.dsl.BooleanExpression;
import com.querydsl.jpa.impl.JPAQueryFactory;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import lombok.RequiredArgsConstructor;

@RequiredArgsConstructor
public class ApplicationRepositoryImpl implements ApplicationRepositoryCustom {

    private final JPAQueryFactory queryFactory;

    @Override
    public List<Application> searchApplicants(Long recruitmentId, ApplicantSearchCondition condition) {
        return queryFactory
                .selectFrom(application)
                .join(application.user, user).fetchJoin()
                .where(
                        application.recruitment.id.eq(recruitmentId),
                        statusEq(condition.status()),
                        collegeEq(condition.college()),
                        searchKeyword(condition.q()),
                        submittedAfter(condition.submittedFrom()),
                        submittedBefore(condition.submittedTo())
                )
                .orderBy(application.createdAt.desc())
                .fetch();
    }

    private BooleanExpression statusEq(ApplicationStatus status) {
        return status == null ? null : application.status.eq(status);
    }

    private BooleanExpression collegeEq(College college) {
        return college == null ? null : user.college.eq(college);
    }

    private BooleanExpression searchKeyword(String q) {
        if (q == null || q.isBlank()) {
            return null;
        }
        return user.name.containsIgnoreCase(q)
                .or(user.studentId.containsIgnoreCase(q))
                .or(user.major.containsIgnoreCase(q));
    }

    private BooleanExpression submittedAfter(LocalDate from) {
        return from == null ? null : application.createdAt.goe(from.atStartOfDay());
    }

    private BooleanExpression submittedBefore(LocalDate to) {
        if (to == null) return null;
        LocalDateTime exclusiveEnd = to.plusDays(1).atStartOfDay();
        return application.createdAt.lt(exclusiveEnd);
    }
}
