package com.duing.domain.user.service;

import com.duing.domain.user.service.dto.command.ChangeUserStatusCommand;
import com.duing.domain.user.service.dto.command.UpdateAdminNoteCommand;

public interface AdminUserCommandService {

    /** 계정 상태를 변경한다. 현재 상태와 같으면 아무것도 하지 않고, 감사 로그도 남기지 않는다. */
    void changeStatus(ChangeUserStatusCommand changeStatusCommand);

    /**
     * 관리자 메모를 저장한다. 빈 문자열로 비우는 것도 감사 대상 행위라 로그를 남긴다.
     * 현재 메모와 내용이 같으면 아무것도 하지 않고, 감사 로그도 남기지 않는다(메모 없음과 빈 문자열은 같은 값으로 본다).
     */
    void updateAdminNote(UpdateAdminNoteCommand updateAdminNoteCommand);
}
