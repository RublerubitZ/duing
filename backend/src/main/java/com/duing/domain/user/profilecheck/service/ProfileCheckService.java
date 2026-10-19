package com.duing.domain.user.profilecheck.service;

import com.duing.domain.user.profilecheck.service.dto.command.ConfirmProfileCheckCommand;
import com.duing.domain.user.profilecheck.service.dto.query.ProfileCheckStatusQuery;

public interface ProfileCheckService {

    ProfileCheckStatusQuery getStatus(Long userId);

    void confirm(ConfirmProfileCheckCommand command);
}
