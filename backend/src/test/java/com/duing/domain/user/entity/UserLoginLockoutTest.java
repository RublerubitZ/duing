package com.duing.domain.user.entity;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.LocalDateTime;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * 로그인 무차별 대입 방어를 위한 계정 잠금 상태 전이를 검증한다.
 */
class UserLoginLockoutTest {

    private static final int MAX_ATTEMPTS = 5;
    private static final Duration LOCK = Duration.ofMinutes(15);
    private static final LocalDateTime NOW = LocalDateTime.of(2026, 6, 1, 12, 0);

    private static User newUser() {
        return User.create(
                "20250001", "홍길동", "hash",
                UserRole.STUDENT, Grade.FRESHMAN, College.IT_ENGINEERING,
                "컴퓨터공학", "010-1234-5678", LocalDateTime.of(2026, 1, 1, 0, 0));
    }

    @Test
    @DisplayName("실패 횟수가 임계치 미만이면 잠기지 않는다")
    void belowThresholdNotLocked() {
        User user = newUser();
        for (int attempt = 0; attempt < MAX_ATTEMPTS - 1; attempt++) {
            user.recordFailedLogin(MAX_ATTEMPTS, LOCK, NOW);
        }
        assertThat(user.isLocked(NOW)).isFalse();
    }

    @Test
    @DisplayName("연속 실패가 임계치에 도달하면 lockDuration 만큼 잠기고 실패 카운터는 0으로 리셋된다")
    void reachingThresholdLocks() {
        User user = newUser();
        for (int attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
            user.recordFailedLogin(MAX_ATTEMPTS, LOCK, NOW);
        }
        assertThat(user.isLocked(NOW)).isTrue();
        assertThat(user.isLocked(NOW.plus(LOCK).minusSeconds(1))).isTrue();
        assertThat(user.isLocked(NOW.plus(LOCK).plusSeconds(1))).isFalse();
        assertThat(user.getFailedLoginAttempts()).isZero();
    }

    @Test
    @DisplayName("로그인 성공 시 실패 카운터와 잠금이 모두 초기화된다")
    void successResetsState() {
        User user = newUser();
        for (int attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
            user.recordFailedLogin(MAX_ATTEMPTS, LOCK, NOW);
        }
        assertThat(user.isLocked(NOW)).isTrue();

        user.recordSuccessfulLogin(NOW);

        assertThat(user.isLocked(NOW)).isFalse();
        assertThat(user.getFailedLoginAttempts()).isZero();
    }

    @Test
    @DisplayName("lockedUntil 이 없으면 잠금 상태가 아니다")
    void nullLockNotLocked() {
        assertThat(newUser().isLocked(NOW)).isFalse();
    }
}
