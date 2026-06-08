package com.duing.domain.interview.service;

import com.duing.domain.interview.service.dto.command.CreateAvailabilitiesInSubmissionCommand;

public interface InterviewAvailabilityService {

    /**
     * 지원서 제출 트랜잭션 안에서 지원자의 면접 가능 시간을 일괄 등록한다.
     * 호출 시점은 이미 application 이 저장된 이후여야 하며, 동일 트랜잭션을 공유한다.
     */
    void createAllInSubmission(CreateAvailabilitiesInSubmissionCommand command);
}
