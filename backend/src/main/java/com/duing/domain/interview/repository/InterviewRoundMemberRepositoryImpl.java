package com.duing.domain.interview.repository;

import static com.duing.domain.application.entity.QApplication.application;
import static com.duing.domain.interview.entity.QInterviewRound.interviewRound;
import static com.duing.domain.interview.entity.QInterviewRoundMember.interviewRoundMember;
import static com.duing.domain.user.entity.QUser.user;

import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.interview.entity.RoundMemberStatus;
import com.duing.domain.interview.entity.RoundStatus;
import com.duing.domain.interview.service.dto.query.RoundCandidateQuery;
import com.duing.domain.interview.service.dto.query.RoundMemberLine;
import com.duing.domain.interview.service.dto.query.RoundMemberStatusCount;
import com.duing.domain.interview.service.dto.query.VisibleMembership;
import com.querydsl.core.types.Projections;
import com.querydsl.core.types.dsl.BooleanExpression;
import com.querydsl.jpa.JPAExpressions;
import com.querydsl.jpa.impl.JPAQueryFactory;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import lombok.RequiredArgsConstructor;

@RequiredArgsConstructor
public class InterviewRoundMemberRepositoryImpl implements InterviewRoundMemberRepositoryCustom {

    private final JPAQueryFactory queryFactory;

    @Override
    public List<RoundCandidateQuery> findRoundCandidates(Long recruitmentId, boolean includeUndecided) {
        return queryFactory
                .select(Projections.constructor(RoundCandidateQuery.class,
                        application.id,
                        user.id,
                        user.name,
                        user.studentId,
                        user.college,
                        user.major,
                        user.grade,
                        application.status,
                        application.createdAt))
                .from(application)
                .join(application.user, user)
                .where(
                        application.recruitment.id.eq(recruitmentId),
                        candidateStatuses(includeUndecided),
                        hasNoPlacementActiveMembership()
                )
                .orderBy(application.createdAt.desc())
                .fetch();
    }

    @Override
    public List<Long> findApplicationIdsWithPlacementActiveMembership(Collection<Long> applicationIds) {
        return queryFactory
                .selectDistinct(interviewRoundMember.applicationId)
                .from(interviewRoundMember)
                .join(interviewRound).on(interviewRound.id.eq(interviewRoundMember.roundId))
                .where(
                        interviewRoundMember.applicationId.in(applicationIds),
                        interviewRoundMember.status.ne(RoundMemberStatus.EXCLUDED),
                        interviewRound.status.ne(RoundStatus.CANCELLED),
                        interviewRound.deletedAt.isNull()
                )
                .fetch();
    }

    private BooleanExpression candidateStatuses(boolean includeUndecided) {
        if (includeUndecided) {
            return application.status.in(ApplicationStatus.activeSet());
        }
        return application.status.eq(ApplicationStatus.INTERVIEW_PENDING);
    }

    /**
     * isActiveForPlacement 술어의 부정 (스펙 §5.4) —
     * placement-active = round.status != CANCELLED(DRAFT 포함) && member.status != EXCLUDED.
     * 지원자 노출용 isVisibleToApplicant(DRAFT 제외)와 혼용하지 않는다.
     * soft-deleted round 는 명시적 deletedAt 필터로 제외한다 — @SQLRestriction 의 서브쿼리 join 적용에
     * 의존하지 않는 belt-and-braces (findAssignedBetween 의 slot.deletedAt 명시 필터 전례).
     * round 삭제 경로 자체가 금지(스펙 §16-4)이므로 정상 운영에선 도달하지 않는 방어선이다.
     */
    private BooleanExpression hasNoPlacementActiveMembership() {
        return JPAExpressions
                .selectOne()
                .from(interviewRoundMember)
                .join(interviewRound).on(interviewRound.id.eq(interviewRoundMember.roundId))
                .where(
                        interviewRoundMember.applicationId.eq(application.id),
                        interviewRoundMember.status.ne(RoundMemberStatus.EXCLUDED),
                        interviewRound.status.ne(RoundStatus.CANCELLED),
                        interviewRound.deletedAt.isNull()
                )
                .notExists();
    }

    @Override
    public List<RoundMemberLine> findMemberLinesByRoundId(Long roundId) {
        return queryFactory
                .select(Projections.constructor(RoundMemberLine.class,
                        interviewRoundMember.id,
                        interviewRoundMember.applicationId,
                        user.name,
                        user.studentId,
                        interviewRoundMember.status,
                        interviewRoundMember.alternativeAvailabilityText))
                .from(interviewRoundMember)
                .join(application).on(
                        application.id.eq(interviewRoundMember.applicationId)
                                .and(application.deletedAt.isNull()))
                .join(application.user, user)
                .where(interviewRoundMember.roundId.eq(roundId))
                .orderBy(interviewRoundMember.id.asc())
                .fetch();
    }

    @Override
    public List<RoundMemberStatusCount> countMembersGroupedByStatus(Collection<Long> roundIds) {
        return queryFactory
                .select(Projections.constructor(RoundMemberStatusCount.class,
                        interviewRoundMember.roundId,
                        interviewRoundMember.status,
                        interviewRoundMember.count()))
                .from(interviewRoundMember)
                .where(interviewRoundMember.roundId.in(roundIds))
                .groupBy(interviewRoundMember.roundId, interviewRoundMember.status)
                .fetch();
    }

    @Override
    public Optional<VisibleMembership> findVisibleMembershipByApplicationId(Long applicationId) {
        return Optional.ofNullable(queryFactory
                .select(Projections.constructor(VisibleMembership.class, interviewRound, interviewRoundMember))
                .from(interviewRoundMember)
                .join(interviewRound).on(interviewRound.id.eq(interviewRoundMember.roundId)
                        .and(interviewRound.deletedAt.isNull()))
                .where(
                        interviewRoundMember.applicationId.eq(applicationId),
                        interviewRoundMember.status.ne(RoundMemberStatus.EXCLUDED),
                        interviewRound.status.in(
                                RoundStatus.COLLECTING, RoundStatus.ASSIGNING, RoundStatus.SCHEDULED)
                )
                .fetchOne());
    }

    @Override
    public Optional<VisibleMembership> findPlacementActiveMembershipByApplicationId(Long applicationId) {
        return Optional.ofNullable(queryFactory
                .select(Projections.constructor(VisibleMembership.class, interviewRound, interviewRoundMember))
                .from(interviewRoundMember)
                .join(interviewRound).on(interviewRound.id.eq(interviewRoundMember.roundId)
                        .and(interviewRound.deletedAt.isNull()))
                .where(
                        interviewRoundMember.applicationId.eq(applicationId),
                        interviewRoundMember.status.ne(RoundMemberStatus.EXCLUDED),
                        interviewRound.status.ne(RoundStatus.CANCELLED)
                )
                .fetchOne());
    }

    @Override
    public boolean existsConcludedMembershipByApplicationId(Long applicationId) {
        Integer found = queryFactory
                .selectOne()
                .from(interviewRoundMember)
                .join(interviewRound).on(interviewRound.id.eq(interviewRoundMember.roundId)
                        .and(interviewRound.deletedAt.isNull()))
                .where(
                        interviewRoundMember.applicationId.eq(applicationId),
                        // 발송 전(DRAFT) 라운드는 지원자에게 존재한 적이 없다 — 그 안의 EXCLUDED 가
                        // 이력(WAITING_NEXT_ROUND)으로 새면 DRAFT 비노출 원칙 위반 (스펙 §9.3 보정).
                        interviewRoundMember.status.eq(RoundMemberStatus.EXCLUDED)
                                .and(interviewRound.status.ne(RoundStatus.DRAFT))
                                .or(interviewRound.status.eq(RoundStatus.CANCELLED))
                )
                .fetchFirst();
        return found != null;
    }
}
