package com.duing.domain.user.entity;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDateTime;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class EmailVerificationTest {

    private static final LocalDateTime SENT_AT = LocalDateTime.of(2026, 6, 13, 12, 0, 0);
    private static final String EMAIL = "hong@daegu.ac.kr";
    private static final String CODE_HASH = "a".repeat(64);

    @Test
    @DisplayName("발급 직후에는 미인증·시도 0회·만료 시각은 발송 20분 뒤다")
    void issueInitializesPendingState() {
        EmailVerification emailVerification = EmailVerification.issue(EMAIL, CODE_HASH, SENT_AT);

        assertThat(emailVerification.isVerified()).isFalse();
        assertThat(emailVerification.getAttemptCount()).isZero();
        assertThat(emailVerification.getExpiresAt()).isEqualTo(SENT_AT.plusMinutes(20));
        assertThat(emailVerification.getLastSentAt()).isEqualTo(SENT_AT);
    }

    @Test
    @DisplayName("발송 60초 이내에는 쿨다운, 60초 경과 시점부터 재발송 가능하다")
    void cooldownLastsSixtySeconds() {
        EmailVerification emailVerification = EmailVerification.issue(EMAIL, CODE_HASH, SENT_AT);

        assertThat(emailVerification.isInCooldown(SENT_AT.plusSeconds(59))).isTrue();
        assertThat(emailVerification.isInCooldown(SENT_AT.plusSeconds(60))).isFalse();
    }

    @Test
    @DisplayName("만료 시각 전에는 유효하고 만료 시각부터 만료다")
    void expiresExactlyAtExpiryTime() {
        EmailVerification emailVerification = EmailVerification.issue(EMAIL, CODE_HASH, SENT_AT);

        assertThat(emailVerification.isExpired(SENT_AT.plusMinutes(20).minusSeconds(1))).isFalse();
        assertThat(emailVerification.isExpired(SENT_AT.plusMinutes(20))).isTrue();
    }

    @Test
    @DisplayName("5회 실패 시도 후에는 시도 한도를 초과한다")
    void attemptLimitIsFive() {
        EmailVerification emailVerification = EmailVerification.issue(EMAIL, CODE_HASH, SENT_AT);

        for (int attempt = 0; attempt < 5; attempt++) {
            assertThat(emailVerification.isAttemptExceeded()).isFalse();
            emailVerification.increaseAttempt();
        }
        assertThat(emailVerification.isAttemptExceeded()).isTrue();
    }

    @Test
    @DisplayName("인증 완료 후 만료 전이면 가입에 사용할 수 있다")
    void usableForSignupWhenVerifiedAndNotExpired() {
        EmailVerification emailVerification = EmailVerification.issue(EMAIL, CODE_HASH, SENT_AT);
        emailVerification.verify(SENT_AT.plusMinutes(1));

        assertThat(emailVerification.isUsableForSignup(SENT_AT.plusMinutes(19))).isTrue();
        assertThat(emailVerification.isUsableForSignup(SENT_AT.plusMinutes(20))).isFalse();
    }

    @Test
    @DisplayName("인증하지 않은 상태에서는 만료 전이라도 가입에 사용할 수 없다")
    void notUsableForSignupWhenNotVerified() {
        EmailVerification emailVerification = EmailVerification.issue(EMAIL, CODE_HASH, SENT_AT);

        assertThat(emailVerification.isUsableForSignup(SENT_AT.plusMinutes(1))).isFalse();
    }

    @Test
    @DisplayName("재발급하면 코드·만료·시도·인증 상태가 모두 리셋된다")
    void reissueResetsAllState() {
        EmailVerification emailVerification = EmailVerification.issue(EMAIL, CODE_HASH, SENT_AT);
        emailVerification.increaseAttempt();
        emailVerification.verify(SENT_AT.plusMinutes(1));

        LocalDateTime resentAt = SENT_AT.plusMinutes(5);
        String newCodeHash = "b".repeat(64);
        emailVerification.reissue(newCodeHash, resentAt);

        assertThat(emailVerification.getCodeHash()).isEqualTo(newCodeHash);
        assertThat(emailVerification.isVerified()).isFalse();
        assertThat(emailVerification.getAttemptCount()).isZero();
        assertThat(emailVerification.getExpiresAt()).isEqualTo(resentAt.plusMinutes(20));
        assertThat(emailVerification.getLastSentAt()).isEqualTo(resentAt);
    }
}
