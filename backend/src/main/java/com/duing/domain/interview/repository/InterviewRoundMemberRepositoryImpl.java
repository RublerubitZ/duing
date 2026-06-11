package com.duing.domain.interview.repository;

import static com.duing.domain.application.entity.QApplication.application;
import static com.duing.domain.interview.entity.QInterviewRound.interviewRound;
import static com.duing.domain.interview.entity.QInterviewRoundMember.interviewRoundMember;

import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.interview.entity.RoundMemberStatus;
import com.duing.domain.interview.entity.RoundStatus;
import com.querydsl.core.types.dsl.BooleanExpression;
import com.querydsl.jpa.JPAExpressions;
import com.querydsl.jpa.impl.JPAQueryFactory;
import java.util.List;
import lombok.RequiredArgsConstructor;

@RequiredArgsConstructor
public class InterviewRoundMemberRepositoryImpl implements InterviewRoundMemberRepositoryCustom {

    private final JPAQueryFactory queryFactory;

    @Override
    public List<Application> findRoundCandidates(Long recruitmentId, boolean includeUnderReview) {
        return queryFactory
                .selectFrom(application)
                .join(application.user).fetchJoin()
                .where(
                        application.recruitment.id.eq(recruitmentId),
                        candidateStatuses(includeUnderReview),
                        hasNoPlacementActiveMembership()
                )
                .orderBy(application.createdAt.desc())
                .fetch();
    }

    private BooleanExpression candidateStatuses(boolean includeUnderReview) {
        if (includeUnderReview) {
            return application.status.in(
                    ApplicationStatus.INTERVIEW_PENDING, ApplicationStatus.UNDER_REVIEW);
        }
        return application.status.eq(ApplicationStatus.INTERVIEW_PENDING);
    }

    /**
     * isActiveForPlacement 술어의 부정 (스펙 §5.4) —
     * placement-active = round.status != CANCELLED(DRAFT 포함) && member.status != EXCLUDED.
     * 지원자 노출용 isVisibleToApplicant(DRAFT 제외)와 혼용하지 않는다.
     * soft-deleted round 는 @SQLRestriction 이 서브쿼리에서도 자동 제외한다.
     */
    private BooleanExpression hasNoPlacementActiveMembership() {
        return JPAExpressions
                .selectOne()
                .from(interviewRoundMember)
                .join(interviewRound).on(interviewRound.id.eq(interviewRoundMember.roundId))
                .where(
                        interviewRoundMember.applicationId.eq(application.id),
                        interviewRoundMember.status.ne(RoundMemberStatus.EXCLUDED),
                        interviewRound.status.ne(RoundStatus.CANCELLED)
                )
                .notExists();
    }
}
