package com.duing.domain.application.repository;

import java.time.LocalDateTime;
import java.util.Collection;

/**
 * Native query 결과를 바인딩하는 Spring Data interface projection.
 * {@link ApplicationRepository#findPendingStatsByRecruitmentIds(Collection)} 에서 사용한다.
 */
public interface PendingApplicationStatsRow {

    Long getRecruitmentId();

    Long getPendingCount();

    /** 가장 오래된 미처리 지원서의 created_at — system regime 벽시계다(TIMEZONE.md). */
    LocalDateTime getOldestSubmittedAt();
}
