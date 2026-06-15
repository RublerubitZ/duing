package com.duing.domain.interview.service.dto.query;

import java.time.LocalDateTime;

/**
 * interview 도메인이 application 도메인 등 외부 호출자에게 노출하는 슬롯 시간창 표현.
 * application 도메인의 ApplicantDetailQuery.AvailabilityItem 같은 외부 DTO 에 직접 의존하지 않도록
 * interview 도메인 안에서 자체적으로 정의한다 — 호출자는 결과를 자신의 표현으로 매핑한다.
 */
public record InterviewSlotTimeWindow(
        Long slotId,
        LocalDateTime startTime,
        LocalDateTime endTime
) {}
