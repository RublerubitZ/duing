package com.duing.domain.interview.service;

import com.duing.domain.interview.controller.dto.response.MyInterviewScheduleResponse;

public interface InterviewScheduleService {

    /**
     * 지원자 본인의 면접 일정을 조회한다.
     * 배정 유무와 무관하게 200 응답을 반환하며,
     * CANCELLED 상태도 포함해 노출한다.
     */
    MyInterviewScheduleResponse findMySchedule(Long applicationId, Long actorUserId);
}
