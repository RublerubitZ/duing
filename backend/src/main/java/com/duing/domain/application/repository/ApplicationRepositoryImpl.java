package com.duing.domain.application.repository;

import static com.duing.domain.application.entity.QApplication.application;
import static com.duing.domain.applicationEvaluation.entity.QApplicationEvaluation.applicationEvaluation;
import static com.duing.domain.interview.entity.QInterviewSchedule.interviewSchedule;
import static com.duing.domain.interview.entity.QInterviewSlot.interviewSlot;
import static com.duing.domain.user.entity.QUser.user;

import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.service.dto.query.AdminApplicantQuery;
import com.duing.domain.application.service.dto.query.ApplicantNeighborsQuery;
import com.duing.domain.application.service.dto.query.ApplicantRowQuery;
import com.duing.domain.application.service.dto.query.ApplicantSearchCondition;
import com.duing.domain.interview.entity.InterviewScheduleStatus;
import com.duing.domain.user.entity.College;
import com.querydsl.core.types.Projections;
import com.querydsl.core.types.dsl.BooleanExpression;
import com.querydsl.jpa.impl.JPAQueryFactory;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import lombok.RequiredArgsConstructor;

@RequiredArgsConstructor
public class ApplicationRepositoryImpl implements ApplicationRepositoryCustom {

    private final JPAQueryFactory queryFactory;

    /**
     * 목록 행이 실제로 쓰는 컬럼만 projection 으로 읽는다 — Application·User 엔티티를 통째로 읽으면
     * 화면에 쓰지 않는 비밀번호 해시·전화번호·관리자 메모까지 매 요청 전송된다.
     * answers(jsonb)는 답변 미리보기에 쓰이므로 유일하게 남는 큰 컬럼이다.
     * <p>InterviewSchedule(ASSIGNED) → InterviewSlot.startTime 을 leftJoin 으로 끌어와
     * 운영진 목록 행의 interviewStartAt 값을 채운다. ASSIGNED schedule 이 없거나 CANCELLED 면 null.
     */
    @Override
    public List<ApplicantRowQuery> searchApplicants(Long recruitmentId, Long currentUserId,
                                                    ApplicantSearchCondition condition) {
        return queryFactory
                .select(Projections.constructor(ApplicantRowQuery.class,
                        application.id,
                        application.status,
                        application.createdAt,
                        application.answers,
                        user.id,
                        user.name,
                        user.studentId,
                        user.college,
                        user.major,
                        user.grade,
                        interviewSlot.startTime,
                        applicationEvaluation.score))
                .from(application)
                .join(application.user, user)
                .leftJoin(applicationEvaluation)
                    .on(applicationEvaluation.application.eq(application)
                            .and(applicationEvaluation.evaluator.id.eq(currentUserId))
                            .and(applicationEvaluation.deletedAt.isNull()))
                .leftJoin(interviewSchedule)
                    .on(interviewSchedule.applicationId.eq(application.id)
                            .and(interviewSchedule.status.eq(InterviewScheduleStatus.ASSIGNED)))
                .leftJoin(interviewSlot)
                    .on(interviewSlot.id.eq(interviewSchedule.slotId))
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

    @Override
    public ApplicantNeighborsQuery findNeighbors(Long recruitmentId, Long applicationId,
                                                  ApplicantSearchCondition condition) {
        LocalDateTime pivot = queryFactory
                .select(application.createdAt)
                .from(application)
                .where(application.id.eq(applicationId),
                       application.recruitment.id.eq(recruitmentId))
                .fetchOne();
        if (pivot == null) {
            return new ApplicantNeighborsQuery(null, null);
        }

        // prev = createdAt > pivot (더 최신, UI 상 위) 중 가장 가까운 것 → asc 후 limit 1
        Long prevId = queryFactory
                .select(application.id)
                .from(application)
                .join(application.user, user)
                .where(
                        application.recruitment.id.eq(recruitmentId),
                        application.createdAt.gt(pivot),
                        statusEq(condition.status()),
                        collegeEq(condition.college()),
                        searchKeyword(condition.q()),
                        submittedAfter(condition.submittedFrom()),
                        submittedBefore(condition.submittedTo())
                )
                .orderBy(application.createdAt.asc())
                .limit(1)
                .fetchOne();

        // next = createdAt < pivot (더 오래된, UI 상 아래) 중 가장 가까운 것 → desc 후 limit 1
        Long nextId = queryFactory
                .select(application.id)
                .from(application)
                .join(application.user, user)
                .where(
                        application.recruitment.id.eq(recruitmentId),
                        application.createdAt.lt(pivot),
                        statusEq(condition.status()),
                        collegeEq(condition.college()),
                        searchKeyword(condition.q()),
                        submittedAfter(condition.submittedFrom()),
                        submittedBefore(condition.submittedTo())
                )
                .orderBy(application.createdAt.desc())
                .limit(1)
                .fetchOne();

        return new ApplicantNeighborsQuery(prevId, nextId);
    }

    @Override
    public List<AdminApplicantQuery> searchApplicantsForAdmin(Long recruitmentId, ApplicantSearchCondition condition,
                                                              boolean oldestFirst) {
        return queryFactory
                .select(Projections.constructor(AdminApplicantQuery.class,
                        application.id,
                        application.status,
                        application.createdAt,
                        user.name,
                        user.studentId,
                        user.college,
                        user.major))
                .from(application)
                .join(application.user, user)
                .where(
                        application.recruitment.id.eq(recruitmentId),
                        statusEq(condition.status()),
                        collegeEq(condition.college()),
                        searchKeyword(condition.q()),
                        submittedAfter(condition.submittedFrom()),
                        submittedBefore(condition.submittedTo())
                )
                .orderBy(oldestFirst ? application.createdAt.asc() : application.createdAt.desc())
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
