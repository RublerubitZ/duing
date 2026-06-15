package com.duing.domain.interview.repository;

import com.duing.domain.application.entity.Application;
import com.duing.domain.interview.service.dto.query.RoundMemberLine;
import com.duing.domain.interview.service.dto.query.RoundMemberStatusCount;
import com.duing.domain.interview.service.dto.query.VisibleMembership;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface InterviewRoundMemberRepositoryCustom {

    /**
     * 라운드 생성 후보 조회 — 후보 상태(기본 INTERVIEW_PENDING 큐, includeUnderReview 시
     * UNDER_REVIEW 포함) 이면서 placement-active 멤버십이 없는 지원서를 최근 제출 순으로 반환한다.
     */
    List<Application> findRoundCandidates(Long recruitmentId, boolean includeUnderReview);

    /**
     * 주어진 지원서들 중 placement-active 멤버십(스펙 §5.4)을 이미 가진 applicationId 를 반환한다.
     * "placement-active 멤버십 최대 1개" 불변식(§16)의 라운드 생성 측 강제 지점.
     */
    List<Long> findApplicationIdsWithPlacementActiveMembership(Collection<Long> applicationIds);

    /** 상세 dashboard 멤버 테이블 — member ⋈ application ⋈ user 한 방 projection. */
    List<RoundMemberLine> findMemberLinesByRoundId(Long roundId);

    /** 목록 카운트 요약 — round × status groupBy 집계. */
    List<RoundMemberStatusCount> countMembersGroupedByStatus(Collection<Long> roundIds);

    /**
     * 지원자 노출용 visible 멤버십 — isVisibleToApplicant 술어(§5.4, DRAFT 제외).
     * 불변식상 최대 1건 (placement-active ⊇ visible).
     */
    Optional<VisibleMembership> findVisibleMembershipByApplicationId(Long applicationId);

    /**
     * 운영진 상세용 placement-active 멤버십 — isActiveForPlacement 술어의 양 방향(§5.4, DRAFT 포함).
     * EXCLUDED 와 CANCELLED 라운드만 제외하므로 지원자 화면보다 넓다.
     * 불변식상 최대 1건 — fetchOne loud-fail(NonUniqueResultException) 으로 보장한다.
     */
    Optional<VisibleMembership> findPlacementActiveMembershipByApplicationId(Long applicationId);

    /**
     * 참여 이력 — CANCELLED 라운드 멤버십 또는 EXCLUDED 멤버십 존재 (§9.3 보정: DRAFT-only 는 이력 아님).
     */
    boolean existsConcludedMembershipByApplicationId(Long applicationId);
}
