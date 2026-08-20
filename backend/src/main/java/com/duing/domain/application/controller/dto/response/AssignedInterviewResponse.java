package com.duing.domain.application.controller.dto.response;

import com.duing.domain.application.service.dto.query.AssignedInterviewQuery;
import java.time.LocalDateTime;

/**
 * 지원 응답들(운영진 상세 카드·내 지원 목록 카드·내 지원 상세)이 공통으로 노출하는 현재 배정 면접 일정/장소.
 * ASSIGNED schedule 이 있으면 채워지고, 미배정/CANCELLED 만 있으면 응답에서 {@code null}.
 * <p>
 * {@code location} 은 nullable — {@link com.duing.domain.interview.entity.InterviewRound} 의 location
 * 이 비어 있는 라운드는 interview 객체는 노출하되 location 만 {@code null} 로 채운다 (Codex review BE-3).
 * <p>
 * {@code startAt}/{@code endAt} 은 슬롯이 들고 있는 KST 벽시계 시각을 그대로 내보낸다 — 같은 응답의
 * {@code submittedAt}/{@code changedAt} 과 달리 {@link com.duing.global.time.TimeMapper} 변환을
 * 의도적으로 거치지 않는다. 따라서 JSON 도 오프셋 없는 {@code LocalDateTime} 표기로 나가며,
 * 타입을 {@code Instant} 로 바꾸는 순간 기존 응답 계약이 깨진다.
 */
public record AssignedInterviewResponse(
        LocalDateTime startAt,
        LocalDateTime endAt,
        String location
) {

    /**
     * ASSIGNED schedule 이 없어 {@code null} 로 전달된 query 는 그대로 {@code null} 응답으로 통과시킨다.
     */
    public static AssignedInterviewResponse from(AssignedInterviewQuery interviewQuery) {
        return interviewQuery == null ? null
                : new AssignedInterviewResponse(
                        interviewQuery.startAt(),
                        interviewQuery.endAt(),
                        interviewQuery.location());
    }
}
