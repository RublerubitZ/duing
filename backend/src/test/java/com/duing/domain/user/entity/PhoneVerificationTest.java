package com.duing.domain.user.entity;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.LocalDateTime;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class PhoneVerificationTest {

    private static final String PHONE = "010-1234-5678";
    private static final String TOKEN = "550e8400-e29b-41d4-a716-446655440000";
    private static final LocalDateTime NOW = LocalDateTime.of(2026, 1, 10, 12, 0);

    private PhoneVerification issueAtNow() {
        return PhoneVerification.issue(PHONE, TOKEN, VerificationPurpose.SIGNUP, null, NOW);
    }

    @Test
    @DisplayName("발급 직후에는 PENDING 이며 남은 시간은 세션 유효시간(5분)이다")
    void issuedSessionIsPending() {
        PhoneVerification phoneVerification = issueAtNow();
        assertThat(phoneVerification.status(NOW)).isEqualTo(PhoneVerificationStatus.PENDING);
        assertThat(phoneVerification.remainingSeconds(NOW))
                .isEqualTo(PhoneVerification.VALIDITY.getSeconds());
    }

    @Test
    @DisplayName("만료 시각 정각부터 EXPIRED 로 판정한다 (경계 exclusive — 이메일 인증 규칙 계승)")
    void expiresExactlyAtDeadline() {
        PhoneVerification phoneVerification = issueAtNow();
        LocalDateTime deadline = NOW.plus(PhoneVerification.VALIDITY);
        assertThat(phoneVerification.status(deadline.minusSeconds(1))).isEqualTo(PhoneVerificationStatus.PENDING);
        assertThat(phoneVerification.status(deadline)).isEqualTo(PhoneVerificationStatus.EXPIRED);
        assertThat(phoneVerification.remainingSeconds(deadline)).isZero();
    }

    @Test
    @DisplayName("인증 완료 후에는 VERIFIED 이며 남은 시간은 용도별 완료 창 기준으로 계산된다")
    void verifiedSessionUsesCompletionWindow() {
        PhoneVerification phoneVerification = issueAtNow();
        phoneVerification.markVerified(NOW.plusMinutes(1));
        assertThat(phoneVerification.status(NOW.plusMinutes(1))).isEqualTo(PhoneVerificationStatus.VERIFIED);
        assertThat(phoneVerification.remainingSeconds(NOW.plusMinutes(1)))
                .isEqualTo(VerificationPurpose.SIGNUP.completionValidity().getSeconds());
    }

    @Test
    @DisplayName("SIGNUP 은 인증 후 30분이 지나면 EXPIRED 로 판정한다 (완료 창 초과 — 재인증 유도)")
    void signupCompletionWindowExpires() {
        PhoneVerification phoneVerification = issueAtNow();
        phoneVerification.markVerified(NOW);
        LocalDateTime completionDeadline = NOW.plus(VerificationPurpose.SIGNUP.completionValidity());
        assertThat(phoneVerification.status(completionDeadline.minusSeconds(1)))
                .isEqualTo(PhoneVerificationStatus.VERIFIED);
        assertThat(phoneVerification.status(completionDeadline)).isEqualTo(PhoneVerificationStatus.EXPIRED);
    }

    @Test
    @DisplayName("PHONE_CHANGE·PASSWORD_RESET 의 완료 창은 10분이다")
    void nonSignupPurposesHaveTenMinuteCompletionWindow() {
        assertThat(VerificationPurpose.PHONE_CHANGE.completionValidity())
                .isEqualTo(Duration.ofMinutes(10));
        assertThat(VerificationPurpose.PASSWORD_RESET.completionValidity())
                .isEqualTo(Duration.ofMinutes(10));
    }

    @Test
    @DisplayName("PHONE_CHANGE 세션은 대상 회원을 보존하고 인증 후 10분이 지나면 EXPIRED 로 판정한다")
    void phoneChangeSessionUsesTenMinuteWindowAndKeepsTargetUser() {
        PhoneVerification phoneVerification =
                PhoneVerification.issue(PHONE, TOKEN, VerificationPurpose.PHONE_CHANGE, 42L, NOW);
        phoneVerification.markVerified(NOW);

        assertThat(phoneVerification.getTargetUserId()).isEqualTo(42L);
        LocalDateTime completionDeadline = NOW.plus(VerificationPurpose.PHONE_CHANGE.completionValidity());
        assertThat(phoneVerification.status(completionDeadline.minusSeconds(1)))
                .isEqualTo(PhoneVerificationStatus.VERIFIED);
        assertThat(phoneVerification.status(completionDeadline)).isEqualTo(PhoneVerificationStatus.EXPIRED);
    }

    @Test
    @DisplayName("재발급은 토큰을 교체하고 인증 상태·만료·쿨다운 기준을 모두 리셋한다")
    void reissueResetsSession() {
        PhoneVerification phoneVerification = issueAtNow();
        phoneVerification.markVerified(NOW);

        LocalDateTime reissuedAt = NOW.plusMinutes(2);
        phoneVerification.reissue("new-token", VerificationPurpose.PHONE_CHANGE, 7L, reissuedAt);

        assertThat(phoneVerification.getToken()).isEqualTo("new-token");
        assertThat(phoneVerification.isVerified()).isFalse();
        assertThat(phoneVerification.status(reissuedAt)).isEqualTo(PhoneVerificationStatus.PENDING);
        assertThat(phoneVerification.getExpiresAt()).isEqualTo(reissuedAt.plus(PhoneVerification.VALIDITY));
        assertThat(phoneVerification.getLastIssuedAt()).isEqualTo(reissuedAt);
        assertThat(phoneVerification.getPurpose()).isEqualTo(VerificationPurpose.PHONE_CHANGE);
        assertThat(phoneVerification.getTargetUserId()).isEqualTo(7L);
    }

    @Test
    @DisplayName("재발급 쿨다운(60초)은 마지막 발급 시각 기준이며 60초 정각부터 재발급할 수 있다")
    void cooldownBoundary() {
        PhoneVerification phoneVerification = issueAtNow();
        assertThat(phoneVerification.isInCooldown(NOW.plusSeconds(59))).isTrue();
        assertThat(phoneVerification.isInCooldown(NOW.plusSeconds(60))).isFalse();
    }
}
