package com.duing.domain.user.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.PasswordFixture;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.exception.UserException;
import com.duing.domain.user.repository.UserRepository;
import com.duing.domain.user.service.dto.command.ChangePasswordCommand;
import com.duing.domain.user.service.dto.command.UpdateProfileCommand;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@Transactional
class GeneralUserServiceAccountTest {

    @Autowired UserService userService;
    @Autowired UserRepository userRepository;
    @Autowired PasswordEncoder passwordEncoder;

    @PersistenceContext
    EntityManager entityManager;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private User saveUserWithPassword(String rawPassword) {
        long unique = sequence.getAndIncrement();
        // 회원마다 유니크한 실제 전화번호를 부여한다(placeholder 010-0000-0000 회피).
        String phone = String.format("010-%04d-%04d", (unique / 10_000) % 10_000, unique % 10_000);
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                "기존이름",
                passwordEncoder.encode(rawPassword),
                UserRole.STUDENT,
                Grade.FRESHMAN,
                College.IT_ENGINEERING,
                "전공",
                phone,
                LocalDateTime.now()));
    }

    private void flushAndClear() {
        entityManager.flush();
        entityManager.clear();
    }

    @Test
    @DisplayName("프로필 수정 시 이름·학년이 변경된다")
    void updateProfileChangesNameAndGrade() {
        User user = saveUserWithPassword("Old1234!");

        userService.updateProfile(new UpdateProfileCommand(user.getId(), "새이름", Grade.SENIOR, null, null));
        flushAndClear();

        User reloaded = userRepository.findById(user.getId()).orElseThrow();
        assertThat(reloaded.getName()).isEqualTo("새이름");
        assertThat(reloaded.getGrade()).isEqualTo(Grade.SENIOR);
    }

    @Test
    @DisplayName("존재하지 않는 사용자의 프로필 수정은 UserNotFoundException")
    void updateProfileForMissingUserThrows() {
        assertThatThrownBy(() -> userService.updateProfile(
                new UpdateProfileCommand(999_999L, "새이름", Grade.JUNIOR, null, null)))
                .isInstanceOf(UserException.UserNotFoundException.class);
    }

    @Test
    @DisplayName("현재 비밀번호가 맞으면 새 비밀번호로 바뀌고 token_version 이 올라간다")
    void changePasswordSuccessBumpsTokenVersion() {
        User user = saveUserWithPassword("Old1234!");
        int beforeVersion = user.getTokenVersion();

        userService.changePassword(new ChangePasswordCommand(user.getId(), "Old1234!", "New5678!"));
        flushAndClear();

        User reloaded = userRepository.findById(user.getId()).orElseThrow();
        assertThat(passwordEncoder.matches("New5678!", reloaded.getPasswordHash())).isTrue();
        assertThat(reloaded.getTokenVersion()).isEqualTo(beforeVersion + 1);
    }

    @Test
    @DisplayName("현재 비밀번호가 틀리면 InvalidCurrentPasswordException")
    void changePasswordWithWrongCurrentThrows() {
        User user = saveUserWithPassword("Old1234!");

        assertThatThrownBy(() -> userService.changePassword(
                new ChangePasswordCommand(user.getId(), "Wrong000!", "New5678!")))
                .isInstanceOf(UserException.InvalidCurrentPasswordException.class);
    }

    @Test
    @DisplayName("새 비밀번호가 기존과 같으면 SamePasswordException")
    void changePasswordSameAsCurrentThrows() {
        User user = saveUserWithPassword("Old1234!");

        assertThatThrownBy(() -> userService.changePassword(
                new ChangePasswordCommand(user.getId(), "Old1234!", "Old1234!")))
                .isInstanceOf(UserException.SamePasswordException.class);
    }

    @ParameterizedTest
    @MethodSource("com.duing.common.fixture.PasswordFixture#overLimit")
    @DisplayName("새 비밀번호가 UTF-8 72바이트를 넘으면 PasswordTooLongException")
    void changePasswordOverBcryptLimitThrows(String tooLongPassword) {
        assertThat(tooLongPassword.getBytes(StandardCharsets.UTF_8).length).isGreaterThan(72);
        User user = saveUserWithPassword("Old1234!");

        assertThatThrownBy(() -> userService.changePassword(
                new ChangePasswordCommand(user.getId(), "Old1234!", tooLongPassword)))
                .isInstanceOf(UserException.PasswordTooLongException.class)
                .hasMessage("비밀번호가 너무 깁니다. 이모지 등 일부 문자는 더 많은 공간을 차지합니다.");
    }

    @Test
    @DisplayName("새 비밀번호가 UTF-8 로 정확히 72바이트면 바뀐다")
    void changePasswordAtBcryptLimitSucceeds() {
        String boundaryPassword = PasswordFixture.PASSWORD_72_BYTES;
        assertThat(boundaryPassword.getBytes(StandardCharsets.UTF_8)).hasSize(72);
        User user = saveUserWithPassword("Old1234!");

        userService.changePassword(new ChangePasswordCommand(user.getId(), "Old1234!", boundaryPassword));
        flushAndClear();

        User reloaded = userRepository.findById(user.getId()).orElseThrow();
        assertThat(passwordEncoder.matches(boundaryPassword, reloaded.getPasswordHash())).isTrue();
    }
}
