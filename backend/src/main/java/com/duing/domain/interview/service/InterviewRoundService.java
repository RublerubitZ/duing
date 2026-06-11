package com.duing.domain.interview.service;

import com.duing.domain.interview.service.dto.query.RoundCandidateQuery;
import java.util.List;

public interface InterviewRoundService {

    /**
     * 라운드 생성 wizard Step1 / 상시모집 대기열의 후보 목록을 조회한다.
     * 기본 후보군 = 큐(INTERVIEW_PENDING && placement-active 멤버십 없음),
     * includeUnderReview=true 시 서류 검토 중(UNDER_REVIEW) 지원자도 포함한다.
     */
    List<RoundCandidateQuery> getRoundCandidates(Long recruitmentId, Long currentUserId, boolean includeUnderReview);
}
