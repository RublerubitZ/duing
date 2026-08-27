package com.duing.domain.club.service.dto.command;

/** 기본 확보 시간 대상 플래그 변경(총동연) — actorUserId 는 감사 기록용 조치자다. */
public record UpdateClubFacilitySecuredTimeTargetCommand(
        Long clubId,
        boolean facilitySecuredTimeTarget,
        Long actorUserId
) {
}
