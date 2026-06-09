package com.duing.domain.interview.repository;

import com.duing.domain.application.service.dto.query.ApplicantDetailQuery.AvailabilityItem;
import java.util.Optional;

public interface InterviewScheduleRepositoryCustom {

    /**
     * 지원자에게 현재 배정된 면접 슬롯을 슬롯 메타(시작/종료)와 join 하여 반환한다.
     * CANCELLED 상태의 스케줄은 의도적으로 제외한다 (cancel() 은 status 만 바꿔 soft delete 가 아니므로
     * @SQLRestriction 으로 자동 필터되지 않는다 — Task 1 의 교훈).
     */
    Optional<AvailabilityItem> findAssignedSlotByApplicationId(Long applicationId);
}
