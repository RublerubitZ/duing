package com.duing.domain.club.metric.service;

import com.duing.domain.club.service.dto.command.RecordClubViewCommand;

public interface ClubViewService {

    /** 동아리 상세 진입 1건을 관심도 집계 원천에 적재한다. 같은 방문자의 같은 날 재진입은 무시된다. */
    void recordView(RecordClubViewCommand recordCommand);
}
