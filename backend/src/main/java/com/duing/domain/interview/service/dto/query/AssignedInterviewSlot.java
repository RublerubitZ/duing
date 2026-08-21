package com.duing.domain.interview.service.dto.query;

import java.time.LocalDateTime;

/**
 * interview 도메인이 외부 호출자에게 노출하는 "현재 배정된 면접" 단일 표현 —
 * ASSIGNED schedule 의 슬롯 시간창 + 그 schedule 이 속한 라운드의 장소를 한 번에 담는다.
 * <p>
 * {@link InterviewSlotTimeWindow} 와 달리 location 을 포함하는 이유는, 호출 측이 배정 슬롯과
 * 배정 면접(장소 포함)을 각각 조회하며 같은 행을 두 번 읽던 왕복을 하나로 합치기 위해서다.
 * <p>
 * {@code location} 은 nullable — 라운드가 삭제됐거나 운영진이 장소를 비워둔 경우 모두 null 이며,
 * 이때도 배정 자체는 존재하므로 호출 측은 면접을 노출하고 장소만 비운다.
 */
public record AssignedInterviewSlot(
        Long slotId,
        LocalDateTime startTime,
        LocalDateTime endTime,
        String location
) {}
