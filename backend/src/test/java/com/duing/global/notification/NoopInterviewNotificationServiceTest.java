package com.duing.global.notification;

import static org.assertj.core.api.Assertions.assertThatNoException;

import java.time.LocalDateTime;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class NoopInterviewNotificationServiceTest {

    private final InterviewNotificationService service = new NoopInterviewNotificationService();

    @Test
    @DisplayName("Noop 구현은 면접 알림 호출에 예외 없이 반환한다")
    void noopDoesNotThrow() {
        assertThatNoException().isThrownBy(() ->
                service.notifyInterviewScheduled(
                        42L, "hong@daegu.ac.kr",
                        LocalDateTime.of(2026, 6, 1, 14, 0),
                        "본관 305호"));
    }
}