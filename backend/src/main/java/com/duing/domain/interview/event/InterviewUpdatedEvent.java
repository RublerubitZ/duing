package com.duing.domain.interview.event;

/** {@code scheduleId} — 이번 이동으로 새로 만든 일정 행 id. 알림 중복 방지 키에 쓰여 같은 슬롯으로 왕복해도 새 키가 된다. */
public record InterviewUpdatedEvent(Long applicationId, Long slotId, Long recruitmentId, Long scheduleId) {}
