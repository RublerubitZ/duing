package com.duing.domain.recruitment.repository;

import java.time.LocalDate;

/**
 * Native query 결과를 바인딩하는 Spring Data interface projection.
 * {@link RecruitmentRepository#findExternalStillOpenCandidates(LocalDate, int)} 에서 사용한다.
 */
public interface ExternalStillOpenRow {

    Long getRecruitmentId();

    Long getClubId();

    String getTitle();

    /** 시작 후 경과일(오늘 − 시작일). */
    Integer getDaysOpen();
}
