package com.duing.domain.interview.service.dto.query;

import java.time.LocalDateTime;

/**
 * 지원자 시점의 면접 진행 상황 묶음 — 지원 상세 stepper 의 Step 3 sub-state 분기 재료.
 * <p>
 * {@code availabilityCount} 는 본인이 제출한 면접 가능 시간 개수,
 * {@code availabilityDeadline} 은 지원자에게 보이는 라운드(isVisibleToApplicant §5.4)의 마감 시각으로
 * 보이는 라운드가 없으면 null, {@code assigned} 는 ASSIGNED schedule 이 없으면 null 이다.
 * <p>
 * interview 도메인이 자체 표현으로 돌려주고, 호출자는 결과를 자신의 표현으로 매핑한다
 * ({@link InterviewSlotTimeWindow} 와 동일한 관례).
 */
public record ApplicantInterviewProgress(
        int availabilityCount,
        LocalDateTime availabilityDeadline,
        AssignedInterviewSlot assigned
) {}
