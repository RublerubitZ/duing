package com.duing.domain.club.metric.service;

public interface ClubMetricService {

    /** 전체 동아리의 활동 지표를 재집계해 club_metric 에 upsert 한다. */
    void refreshAll();
}
