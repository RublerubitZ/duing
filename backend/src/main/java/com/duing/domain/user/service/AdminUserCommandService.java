package com.duing.domain.user.service;

import com.duing.domain.user.service.dto.command.ChangeUserStatusCommand;

public interface AdminUserCommandService {

    /** 계정 상태를 변경한다. 현재 상태와 같으면 아무것도 하지 않고, 감사 로그도 남기지 않는다. */
    void changeStatus(ChangeUserStatusCommand changeStatusCommand);
}
