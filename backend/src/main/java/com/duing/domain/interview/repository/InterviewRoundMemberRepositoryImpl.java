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
}
