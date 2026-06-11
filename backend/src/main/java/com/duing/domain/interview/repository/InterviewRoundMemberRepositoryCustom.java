package com.duing.domain.interview.repository;

import com.duing.domain.application.entity.Application;
import java.util.List;

public interface InterviewRoundMemberRepositoryCustom {

    /**
     * 라운드 생성 후보 조회 — 후보 상태(기본 INTERVIEW_PENDING 큐, includeUnderReview 시
     * UNDER_REVIEW 포함) 이면서 placement-active 멤버십이 없는 지원서를 최근 제출 순으로 반환한다.
     */
    List<Application> findRoundCandidates(Long recruitmentId, boolean includeUnderReview);
}
