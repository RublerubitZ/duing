package com.duing.domain.user.entity;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDateTime;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class UserStatusTest {

    private User newUser() {
        return User.create("2021118033", "김도윤", "hashed", UserRole.STUDENT,
                Grade.JUNIOR, College.IT_ENGINEERING, "컴퓨터공학", "010-1234-5678",
                LocalDateTime.of(2024, 3, 4, 10, 0));
    }

    @Test
    @DisplayName("새로 만든 회원은 정상(ACTIVE) 상태이며 마지막 로그인 기록과 관리자 메모가 비어 있다")
    void newUserStartsActive() {
        User user = newUser();

        assertThat(user.getStatus()).isEqualTo(UserStatus.ACTIVE);
        assertThat(user.isActive()).isTrue();
        assertThat(user.getLastLoginAt()).isNull();
        assertThat(user.getAdminNote()).isNull();
    }

    @Test
    @DisplayName("계정을 정지하면 비활성 상태가 되고, 해제하면 다시 정상으로 돌아온다")
    void suspendAndUnsuspend() {
        User user = newUser();

        user.suspend();
        assertThat(user.getStatus()).isEqualTo(UserStatus.SUSPENDED);
        assertThat(user.isActive()).isFalse();

        user.unsuspend();
        assertThat(user.getStatus()).isEqualTo(UserStatus.ACTIVE);
        assertThat(user.isActive()).isTrue();
    }

    @Test
    @DisplayName("로그인 성공을 기록하면 실패 카운터가 초기화되고 마지막 로그인 시각이 갱신된다")
    void recordSuccessfulLoginStampsLastLoginAt() {
        User user = newUser();
        LocalDateTime loginAt = LocalDateTime.of(2026, 7, 26, 13, 5);

        user.recordSuccessfulLogin(loginAt);

        assertThat(user.getLastLoginAt()).isEqualTo(loginAt);
        assertThat(user.getFailedLoginAttempts()).isZero();
        assertThat(user.getLockedUntil()).isNull();
    }

    @Test
    @DisplayName("관리자 메모를 빈 문자열로 저장하면 메모가 비워진다")
    void changeAdminNoteAcceptsBlank() {
        User user = newUser();

        user.changeAdminNote("테스트 계정");
        assertThat(user.getAdminNote()).isEqualTo("테스트 계정");

        user.changeAdminNote("");
        assertThat(user.getAdminNote()).isEmpty();
    }
}
