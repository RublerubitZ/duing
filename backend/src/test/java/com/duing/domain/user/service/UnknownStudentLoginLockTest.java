package com.duing.domain.user.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import java.time.Duration;
import java.time.LocalDateTime;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class UnknownStudentLoginLockTest {

    private static final int MAX_ATTEMPTS = 5;
    private static final Duration LOCK = Duration.ofMinutes(15);
    private static final LocalDateTime NOW = LocalDateTime.of(2026, 6, 1, 12, 0);
    private static final String STUDENT_ID = "20991234";

    private final UnknownStudentLoginLock unknownStudentLoginLock = new UnknownStudentLoginLock();

    @Test
    @DisplayName("실패 횟수가 임계치 미만이면 잠기지 않는다")
    void belowThresholdNotLocked() {
        failTimes(STUDENT_ID, MAX_ATTEMPTS - 1, NOW);
        assertThat(unknownStudentLoginLock.isLocked(STUDENT_ID, NOW)).isFalse();
    }

    @Test
    @DisplayName("연속 실패가 임계치에 도달하면 잠기고 잠금 시간이 지나면 풀린다")
    void locksAtThresholdAndUnlocksAfterDuration() {
        failTimes(STUDENT_ID, MAX_ATTEMPTS, NOW);
        assertThat(unknownStudentLoginLock.isLocked(STUDENT_ID, NOW)).isTrue();
        assertThat(unknownStudentLoginLock.isLocked(STUDENT_ID, NOW.plus(LOCK).minusSeconds(1))).isTrue();
        assertThat(unknownStudentLoginLock.isLocked(STUDENT_ID, NOW.plus(LOCK))).isFalse();
    }

    @Test
    @DisplayName("다른 학번의 실패는 서로 섞이지 않는다")
    void studentIdsAreIndependent() {
        failTimes(STUDENT_ID, MAX_ATTEMPTS, NOW);
        assertThat(unknownStudentLoginLock.isLocked("20991235", NOW)).isFalse();
    }

    @Test
    @DisplayName("가상 잠금은 실계정 잠금 규칙과 같은 순간에 잠기고 풀린다")
    void matchesRealAccountLockoutRule() {
        User realAccount = User.create(
                "20250001", "홍길동", "hash",
                UserRole.STUDENT, Grade.FRESHMAN, College.IT_ENGINEERING,
                "컴퓨터공학", "010-1234-5678", LocalDateTime.of(2026, 1, 1, 0, 0));
        LocalDateTime[] failureTimes = {
                NOW, NOW, NOW, NOW, NOW,                         // 5회 → 잠금
                NOW.plus(LOCK), NOW.plus(LOCK), NOW.plus(LOCK),   // 풀린 뒤 다시 센다
                NOW.plus(LOCK), NOW.plus(LOCK)};
        LocalDateTime[] probeTimes = {
                NOW, NOW.plus(LOCK).minusSeconds(1), NOW.plus(LOCK),
                NOW.plus(LOCK).plus(LOCK).minusSeconds(1), NOW.plus(LOCK).plus(LOCK)};

        for (LocalDateTime failureTime : failureTimes) {
            // 실계정 로그인과 같은 순서 — 잠겨 있으면 실패를 세지 않는다.
            if (!realAccount.isLocked(failureTime)) {
                realAccount.recordFailedLogin(MAX_ATTEMPTS, LOCK, failureTime);
            }
            if (!unknownStudentLoginLock.isLocked(STUDENT_ID, failureTime)) {
                unknownStudentLoginLock.recordFailure(STUDENT_ID, MAX_ATTEMPTS, LOCK, failureTime);
            }
            for (LocalDateTime probeTime : probeTimes) {
                assertThat(unknownStudentLoginLock.isLocked(STUDENT_ID, probeTime))
                        .as("실패 시각 %s 뒤 %s 시점", failureTime, probeTime)
                        .isEqualTo(realAccount.isLocked(probeTime));
            }
        }
    }

    private void failTimes(String studentId, int times, LocalDateTime failureTime) {
        for (int attempt = 0; attempt < times; attempt++) {
            unknownStudentLoginLock.recordFailure(studentId, MAX_ATTEMPTS, LOCK, failureTime);
        }
    }
}
