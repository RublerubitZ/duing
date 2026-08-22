package com.duing.domain.user.service;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.duing.common.fixture.UserFixture;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.PhoneVerification;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.VerificationPurpose;
import com.duing.domain.user.exception.UserException;
import com.duing.domain.user.repository.AdminUserActionLogRepository;
import com.duing.domain.user.repository.UserRepository;
import com.duing.domain.user.service.dto.command.ChangePhoneCommand;
import com.duing.domain.user.service.dto.command.SignupCommand;
import com.duing.global.auth.JwtTokenProvider;
import java.sql.SQLException;
import java.time.Clock;
import java.time.ZoneId;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;

/**
 * TOCTOU 재검증조차 함께 통과한 진짜 동시 가입·번호 변경 경합이 전역 핸들러의 generic 409 가 아니라
 * 사전 재검증과 같은 DuplicateAccount 409 로 치환되는지 고정한다 (PR-10, 예외 치환만 — aborted tx #921).
 */
class SignupPhoneChangeRaceGuardTest {

    private final UserRepository userRepository = mock(UserRepository.class);
    private final PasswordEncoder passwordEncoder = mock(PasswordEncoder.class);
    private final PhoneVerificationSessionManager phoneVerificationSessionManager =
            mock(PhoneVerificationSessionManager.class);
    private final GeneralUserService userService = new GeneralUserService(
            userRepository,
            passwordEncoder,
            mock(JwtTokenProvider.class),
            mock(LoginAttemptRateLimiter.class),
            mock(AuthSessionService.class),
            mock(ClubMemberRepository.class),
            mock(AdminUserActionLogRepository.class),
            phoneVerificationSessionManager,
            // 실제 빈(seoulClock)과 동일한 Asia/Seoul 존 — systemDefaultZone 은 환경 의존.
            Clock.system(ZoneId.of("Asia/Seoul")),
            mock(ApplicationEventPublisher.class));

    @Test
    @DisplayName("재검증을 함께 통과한 동시 가입이 학번 unique 인덱스에 걸리면 사전 검사와 같은 중복 계정 409 로 치환된다")
    void racedSignupOnStudentIdSurfacesAsDuplicateAccount() {
        stubSignupUntilInsert();
        doThrow(uniqueViolation("uk_users_student_id_active")).when(userRepository).flush();

        assertThatThrownBy(() -> userService.signup(signupCommand(), "1.2.3.4", "test-agent"))
                .isInstanceOf(UserException.DuplicateAccountException.class);
    }

    @Test
    @DisplayName("재검증을 함께 통과한 동시 가입이 전화번호 unique 인덱스에 걸려도 같은 중복 계정 409 로 치환된다")
    void racedSignupOnPhoneSurfacesAsDuplicateAccount() {
        stubSignupUntilInsert();
        doThrow(uniqueViolation("ux_users_phone")).when(userRepository).flush();

        assertThatThrownBy(() -> userService.signup(signupCommand(), "1.2.3.4", "test-agent"))
                .isInstanceOf(UserException.DuplicateAccountException.class);
    }

    @Test
    @DisplayName("가입 경로의 다른 제약 위반은 중복 계정 409 로 둔갑하지 않고 그대로 전파된다")
    void unrelatedSignupViolationIsRethrown() {
        stubSignupUntilInsert();
        DataIntegrityViolationException foreignViolation = uniqueViolation("uk_other_constraint");
        doThrow(foreignViolation).when(userRepository).flush();

        assertThatThrownBy(() -> userService.signup(signupCommand(), "1.2.3.4", "test-agent"))
                .isSameAs(foreignViolation);
    }

    @Test
    @DisplayName("재검증을 함께 통과한 동시 번호 변경이 전화번호 unique 인덱스에 걸리면 중복 계정 409 로 치환된다")
    void racedPhoneChangeSurfacesAsDuplicateAccount() {
        PhoneVerification verifiedSession = mock(PhoneVerification.class);
        when(phoneVerificationSessionManager.getVerifiedSessionForUpdate(
                eq("verify-token"), eq(VerificationPurpose.PHONE_CHANGE), any()))
                .thenReturn(verifiedSession);
        when(verifiedSession.getTargetUserId()).thenReturn(10L);
        when(verifiedSession.getPhone()).thenReturn("010-1234-5678");
        when(userRepository.existsByPhoneAndIdNot("010-1234-5678", 10L)).thenReturn(false);
        User accountOwner = UserFixture.unique();
        when(userRepository.findByIdForUpdate(10L)).thenReturn(Optional.of(accountOwner));
        when(passwordEncoder.matches("current-pw", accountOwner.getPasswordHash())).thenReturn(true);
        doThrow(uniqueViolation("ux_users_phone")).when(userRepository).flush();

        assertThatThrownBy(() -> userService.changePhone(
                new ChangePhoneCommand(10L, "current-pw", "verify-token"), "1.2.3.4", "test-agent"))
                .isInstanceOf(UserException.DuplicateAccountException.class);
    }

    private void stubSignupUntilInsert() {
        PhoneVerification verifiedSession = mock(PhoneVerification.class);
        when(phoneVerificationSessionManager.getVerifiedSessionForUpdate(
                eq("verify-token"), eq(VerificationPurpose.SIGNUP), any()))
                .thenReturn(verifiedSession);
        when(verifiedSession.getPhone()).thenReturn("010-1234-5678");
        when(userRepository.existsByStudentId("20991234")).thenReturn(false);
        when(userRepository.existsByPhone("010-1234-5678")).thenReturn(false);
        when(passwordEncoder.encode("raw-password")).thenReturn("encoded-password");
        when(userRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
    }

    private static SignupCommand signupCommand() {
        return new SignupCommand("20991234", "홍길동", "raw-password",
                Grade.FRESHMAN, College.IT_ENGINEERING, "컴퓨터공학", "verify-token");
    }

    private static DataIntegrityViolationException uniqueViolation(String constraintName) {
        return new DataIntegrityViolationException("wrapper", new SQLException(
                "duplicate key value violates unique constraint \"" + constraintName + "\"", "23505"));
    }
}
