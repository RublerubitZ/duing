package com.duing.global.monitoring.event;

import com.duing.domain.user.entity.AdminUserAction;

/** 관리자 회원 조치(정지·해제·강제 로그아웃). 조치 사유(자유 텍스트)는 싣지 않는다. */
public record AdminUserActionEvent(AdminUserAction action, Long targetUserId, Long actorUserId) {
}
