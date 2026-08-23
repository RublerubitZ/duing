package com.duing.global.monitoring.event;

import com.duing.domain.club.entity.ClubStatus;

/** 총동연 동아리 상태 전이(승인·거절·운영중단·재개). 거절 사유(자유 텍스트)는 싣지 않는다. */
public record ClubStatusChangedEvent(
        Long clubId, String clubName, ClubStatus previousStatus, ClubStatus nextStatus, Long actorUserId) {
}
