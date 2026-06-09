package com.duing.domain.interview.repository;

import com.duing.domain.interview.service.dto.query.InterviewSlotTimeWindow;
import java.util.List;

public interface InterviewAvailabilityRepositoryCustom {

    /**
     * 지원자가 제출한 면접 가능시간 목록을 슬롯 메타(시작/종료)와 join 하여 반환한다.
     * 정렬: 슬롯 startTime ASC.
     * @SQLRestriction 으로 interview_availability 의 soft-deleted row 는 자동 제외되고,
     * interview_slot 의 soft-deleted row 는 QueryDSL join 절에 명시적으로 deleted_at IS NULL 을 추가해 제외한다.
     * (QueryDSL Q타입 join 에는 @SQLRestriction 이 자동 적용되지 않으므로 명시 필요.)
     */
    List<InterviewSlotTimeWindow> findAvailabilityItemsByApplicationId(Long applicationId);
}
