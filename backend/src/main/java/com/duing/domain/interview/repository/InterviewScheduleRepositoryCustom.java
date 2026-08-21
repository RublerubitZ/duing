package com.duing.domain.interview.repository;

import com.duing.domain.interview.service.dto.query.AssignedInterviewSlot;
import java.util.Optional;

public interface InterviewScheduleRepositoryCustom {

    /**
     * 지원자에게 현재 배정된 면접 슬롯을 슬롯 메타(시작/종료)·라운드 장소와 join 하여 반환한다.
     * CANCELLED 상태의 스케줄은 의도적으로 제외한다 (cancel() 은 status 만 바꿔 soft delete 가 아니므로
     * @SQLRestriction 으로 자동 필터되지 않는다 — Task 1 의 교훈).
     * interview_slot 의 soft-deleted row 는 QueryDSL join 절에 명시적으로 deleted_at IS NULL 을 추가해 제외한다.
     * <p>
     * interview_round 는 left join 이다 — 라운드가 없거나 삭제된 배정도 면접 자체는 노출하고 location 만
     * null 로 채워야 하기 때문이다. inner join 으로 바꾸면 배정된 면접이 통째로 사라진다.
     */
    Optional<AssignedInterviewSlot> findAssignedSlotByApplicationId(Long applicationId);
}
