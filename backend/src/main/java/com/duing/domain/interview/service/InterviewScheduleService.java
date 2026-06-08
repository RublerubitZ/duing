package com.duing.domain.interview.service;

import com.duing.domain.interview.controller.dto.response.AutoAssignResultResponse;
import com.duing.domain.interview.controller.dto.response.MatchingCandidatesResponse;
import com.duing.domain.interview.controller.dto.response.MyInterviewScheduleResponse;
import com.duing.domain.interview.service.dto.query.ScheduleListView;
import java.util.List;

public interface InterviewScheduleService {

    /**
     * 지원자 본인의 면접 일정을 조회한다.
     * 배정 유무와 무관하게 200 응답을 반환하며,
     * CANCELLED 상태도 포함해 노출한다.
     */
    MyInterviewScheduleResponse findMySchedule(Long applicationId, Long actorUserId);

    /**
     * 운영진이 자동배정을 실행한다.
     * availability_deadline 이 지난 후 1회만 실행 가능하다.
     */
    AutoAssignResultResponse autoAssign(Long recruitmentId, Long actorUserId);

    /**
     * 운영진 대시보드용 슬롯별 그룹핑 면접 일정 목록을 반환한다.
     */
    List<ScheduleListView> listSchedules(Long recruitmentId, Long actorUserId);

    /**
     * 자동배정 실행 전 후보 통계를 미리 조회한다 (dry-run).
     */
    MatchingCandidatesResponse listCandidates(Long recruitmentId, Long actorUserId);
}
