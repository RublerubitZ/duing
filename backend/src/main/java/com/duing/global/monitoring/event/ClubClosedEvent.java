package com.duing.global.monitoring.event;

/** 총동연 동아리 폐쇄(soft-delete 커밋 후). 폐쇄 사유(자유 텍스트)는 싣지 않는다. */
public record ClubClosedEvent(Long clubId, String clubName, Long actorUserId) {
}
