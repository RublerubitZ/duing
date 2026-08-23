package com.duing.global.monitoring.event;

import java.time.LocalDateTime;

/**
 * 회원가입 성공(커밋 후 Slack 운영 알림용). 이름·학번·UserId 만 싣는다 — 전화번호·비밀번호·토큰은
 * 필드 자체를 두지 않아 포매터가 실수로 내보낼 수 없다. 이메일은 서비스가 수집하지 않는다.
 * {@code registeredAt} 은 가입 트랜잭션의 단일 now(seoulClock 기준, KST).
 */
public record UserRegisteredEvent(Long userId, String studentId, String name, LocalDateTime registeredAt) {
}
