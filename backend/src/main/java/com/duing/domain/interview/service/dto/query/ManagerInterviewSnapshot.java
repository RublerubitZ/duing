package com.duing.domain.interview.service.dto.query;

import java.util.List;

/**
 * 운영진 상세 카드에 노출할 면접 정보 묶음 —
 * 지원자가 선택한 면접 가능시간 + 현재 배정 슬롯(장소 포함) + 라운드 요약.
 * <p>
 * {@code availabilities} 는 선택이 없으면 빈 목록, {@code assigned} 는 ASSIGNED schedule 이 없으면 null,
 * {@code roundBrief} 는 placement-active 멤버십이 없으면 null (= 대기열/선정 전) 이다.
 * <p>
 * interview 도메인이 자체 표현으로 돌려주고, 호출자는 결과를 자신의 표현으로 매핑한다
 * ({@link InterviewSlotTimeWindow} 와 동일한 관례).
 */
public record ManagerInterviewSnapshot(
        List<InterviewSlotTimeWindow> availabilities,
        AssignedInterviewSlot assigned,
        InterviewRoundBrief roundBrief
) {}
