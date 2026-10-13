package com.duing.domain.application.repository;

import java.time.LocalDateTime;

/**
 * Native query 결과를 바인딩하는 Spring Data interface projection.
 * {@link ApplicationRepository#findPendingReminderCandidates(LocalDateTime)} 에서 사용한다.
 */
public interface PendingApplicationRow {

    Long getRecruitmentId();

    Long getClubId();

    String getTitle();

    Long getPendingCount();
}
