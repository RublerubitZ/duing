package com.duing.domain.club.service;

import com.duing.domain.club.service.dto.query.ClubPendingCleanupResult;

public interface ClubPendingCleanupService {

    /** 운영 중단 동아리의 남은 미결(결과 미정 지원서·대기 가입 신청)을 불합격·거절로 정리한다(스펙 §4-1). */
    ClubPendingCleanupResult cleanup(Long clubId, Long actorUserId);
}
