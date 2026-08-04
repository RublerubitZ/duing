package com.duing.domain.application.repository;

import static com.duing.domain.application.entity.QApplication.application;
import static com.duing.domain.applicationEvaluation.entity.QApplicationEvaluation.applicationEvaluation;
import static com.duing.domain.interview.entity.QInterviewSchedule.interviewSchedule;
import static com.duing.domain.interview.entity.QInterviewSlot.interviewSlot;
import static com.duing.domain.user.entity.QUser.user;

import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.service.dto.query.ApplicantNeighborsQuery;
import com.duing.domain.application.service.dto.query.ApplicantSearchCondition;
import com.duing.domain.interview.entity.InterviewScheduleStatus;
import com.duing.domain.user.entity.College;
import com.querydsl.core.Tuple;
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
     * fetchJoin 과 select-projection 은 QueryDSL/Hibernate 에서 함께 쓸 수 없으므로
     * select(application, applicationEvaluation.score, interviewSlot.startTime) Tuple 방식으로 구현한다.
     * user 는 join 만 하되 application 엔티티 로딩 시 user 연관 필드를 함께 초기화하기 위해
     * fetchJoin() 을 유지한다 — selectFrom 대신 select(application) 을 사용하면 fetchJoin 이 허용된다.
     * <p>InterviewSchedule(ASSIGNED) → InterviewSlot.startTime 을 leftJoin 으로 끌어와
     * 운영진 목록 행의 interviewStartAt 값을 채운다. ASSIGNED schedule 이 없거나 CANCELLED 면 null.
     */
    @Override
    public List<ApplicantWithScore> searchApplicants(Long recruitmentId, Long currentUserId,
                                                     ApplicantSearchCondition condition) {
        List<Tuple> tuples = queryFactory
                .select(application, applicationEvaluation.score, interviewSlot.startTime)
                .from(application)
                .join(application.user, user).fetchJoin()
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

        return tuples.stream()
                .map(tuple -> new ApplicantWithScore(
                        tuple.get(application),
                        tuple.get(interviewSlot.startTime),
                        tuple.get(applicationEvaluation.score)))
                .toList();
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
    public List<Application> searchApplicantsForAdmin(Long recruitmentId, ApplicantSearchCondition condition,
                                                      boolean oldestFirst) {
        return queryFactory
                .select(application)
                .from(application)
                .join(application.user, user).fetchJoin()
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
