package com.duing.domain.interview.repository;

import com.duing.domain.application.service.dto.query.ApplicantDetailQuery.AvailabilityItem;
import java.util.List;

public interface InterviewAvailabilityRepositoryCustom {

    /**
     * 지원자가 제출한 면접 가능시간 목록을 슬롯 메타(시작/종료)와 join 하여 반환한다.
     * 정렬: 슬롯 startTime ASC.
     * @SQLRestriction 으로 interview_availability / interview_slot 의 soft-deleted row 는 자동 제외된다.
     */
    List<AvailabilityItem> findAvailabilityItemsByApplicationId(Long applicationId);
}
