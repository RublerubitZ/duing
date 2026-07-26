package com.duing.domain.user.service.dto.command;

/** 관리자 메모 저장. 빈 문자열은 "메모 비우기"로 그대로 저장한다 — null 은 허용하지 않는다. */
public record UpdateAdminNoteCommand(
        Long targetUserId,
        Long actorUserId,
        String note
) {
}
