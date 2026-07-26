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

    /**
     * 원본 휴대폰 번호를 조회하고 열람 사실을 감사 로그에 남긴다.
     *
     * <p>GET 으로 노출되지만 감사 로그를 INSERT 하므로 조회가 아니라 쓰기다 — 조회 서비스의
     * readOnly 트랜잭션 안에 두면 실제 Postgres 에서 500 이 난다. 기록과 반환을 같은 트랜잭션에
     * 묶어, 기록이 실패하면 번호도 나가지 않게 한다("감사 없는 개인정보 열람" 방지).
     */
    String revealPhone(Long targetUserId, Long actorUserId);
}
