package com.duing.global.notification;

import java.time.LocalDateTime;

/**
 * 면접 일정 알림 발송 추상화.
 * <p>MVP 구현체는 {@link NoopInterviewNotificationService} 가 사용된다 (로그만 남김).
 * Phase 2 이후 메일·카카오 알림톡 구현체가 추가될 예정.
 * <p>호출 시점은 운영진이 면접 일시를 저장한 직후 (PATCH /applications/{id}/interview).
 *
 * @param applicationId 지원 ID — 알림 추적·재발송용 식별자
 * @param recipientEmail 학생 이메일 — 메일 구현체에서 사용
 * @param scheduledAt 면접 일시
 * @param location 면접 장소
 */
public interface InterviewNotificationService {

    void notifyInterviewScheduled(Long applicationId, String recipientEmail,
                                  LocalDateTime scheduledAt, String location);
}
