package com.duing.domain.application.service.dto.query;

import java.time.LocalDateTime;

/**
 * 지원서 응답 DTO 가 공통으로 사용하는 "현재 배정된 면접" 단일 표현.
 * <p>
 * Legacy 시절 {@code Application.interviewAt}/{@code interviewLocation} 스칼라 필드 대신,
 * ASSIGNED 상태 {@link com.duing.domain.interview.entity.InterviewSchedule} → {@link com.duing.domain.interview.entity.InterviewSlot}
 * 의 시간창과 {@link com.duing.domain.interview.entity.InterviewRound#getLocation()} 을 join 해 채운다.
 * <p>
 * 보여 줄 배정이 없으면 호출 측은 본 record 대신 {@code null} 을 전달한다 — 미배정·CANCELLED 만 있는 경우와,
 * 지원자 응답(내 지원 목록·상세)에서 확정(SCHEDULED) 라운드가 아닌 초안 배정이 여기에 든다. 운영진 상세는 초안도 채운다.
 * <p>
 * {@code location} 은 nullable — 운영진이 {@link com.duing.domain.interview.entity.InterviewRound} 의 location
 * 을 비워둔 채 라운드를 생성할 수 있다. 보여 줄 배정이 있으면 location 이 null 이어도
 * 응답의 {@code interview} 필드는 null 이 아니라 location 만 null 인 객체로 채워진다 (Codex review BE-3).
 */
public record AssignedInterviewQuery(
        LocalDateTime startAt,
        LocalDateTime endAt,
        String location
) {}
