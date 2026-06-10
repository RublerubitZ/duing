package com.duing.domain.application.service.dto.query;

import java.time.LocalDateTime;

/**
 * 지원서 응답 DTO 가 공통으로 사용하는 "현재 배정된 면접" 단일 표현.
 * <p>
 * Legacy 시절 {@code Application.interviewAt}/{@code interviewLocation} 스칼라 필드 대신,
 * ASSIGNED 상태 {@link com.duing.domain.interview.entity.InterviewSchedule} → {@link com.duing.domain.interview.entity.InterviewSlot}
 * 의 시간창과 {@link com.duing.domain.interview.entity.InterviewConfig#getLocation()} 을 join 해 채운다.
 * <p>
 * ASSIGNED schedule 이 없는 경우(아직 미배정 / CANCELLED 만 존재) 호출 측은 본 record 대신 {@code null} 을 전달해
 * "면접 미배정" 상태를 표현한다.
 * <p>
 * {@code location} 은 nullable — 운영진이 {@link com.duing.domain.interview.entity.InterviewConfig} 의 location
 * 을 비워둔 채 config 를 생성할 수 있다. ASSIGNED schedule 이 존재하면 location 이 null 이어도
 * 응답의 {@code interview} 필드는 null 이 아니라 location 만 null 인 객체로 채워진다 (Codex review BE-3).
 */
public record AssignedInterviewQuery(
        LocalDateTime startAt,
        LocalDateTime endAt,
        String location
) {}
