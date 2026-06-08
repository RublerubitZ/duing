package com.duing.domain.interview.service;

import com.duing.domain.interview.service.dto.command.CreateInterviewConfigCommand;
import com.duing.domain.interview.service.dto.command.UpdateInterviewConfigCommand;

public interface InterviewConfigService {

    Long create(CreateInterviewConfigCommand command);

    void update(UpdateInterviewConfigCommand command);
}
