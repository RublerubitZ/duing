package com.duing.domain.club.metric.repository;

import java.time.LocalDateTime;

/** {@code ClubMetricRepository.findMetricSources()} native 집계의 인터페이스 프로젝션. */
public interface ClubMetricSourceRow {

    Long getClubId();

    int getFavoriteCount();

    int getApplicationCount();

    LocalDateTime getLastActivityAt();
}
