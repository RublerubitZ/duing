package com.duing.domain.recruitment.repository;

import java.time.LocalDate;

/**
 * Native query 결과를 바인딩하는 Spring Data interface projection.
 * {@link RecruitmentRepository#findDeadlineNotificationCandidates(LocalDate)} 에서 사용한다.
 */
public interface DeadlineRow {

    Long getRecruitmentId();

    Long getClubId();

    String getClubName();

    String getTitle();

    LocalDate getEndDate();

    /** "OPENED" 또는 "DEADLINE" */
    String getKind();

    Integer getDaysToEnd();
}