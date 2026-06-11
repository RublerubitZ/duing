package com.duing.domain.interview.repository;

import com.duing.domain.application.entity.Application;
import com.duing.domain.interview.service.dto.query.RoundMemberLine;
import com.duing.domain.interview.service.dto.query.RoundMemberStatusCount;
import java.util.Collection;
import java.util.List;

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
}
