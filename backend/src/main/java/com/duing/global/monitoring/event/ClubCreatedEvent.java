package com.duing.global.monitoring.event;

/** 동아리 생성(커밋 후 Slack 운영 알림용). 회장은 UserId 만 — 이름은 싣지 않는다. */
public record ClubCreatedEvent(Long clubId, String clubName, Long leaderUserId) {
}
