package com.duing.domain.user.profilecheck.service;

import com.duing.domain.user.profilecheck.service.dto.command.UpdateProfileCheckSettingCommand;
import com.duing.domain.user.profilecheck.service.dto.query.AdminProfileCheckQuery;

public interface AdminProfileCheckService {

    AdminProfileCheckQuery get();

    void update(UpdateProfileCheckSettingCommand command);
}
