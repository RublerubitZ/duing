package com.duing.domain.facilitysubmission.service.dto.command;

/** 감사 기록용 행위자 컨텍스트 — 컨트롤러가 UserPrincipal·HttpServletRequest 에서 조립한다. */
public record SubmissionActorContext(Long adminId, String ipAddress, String userAgent) {
}
