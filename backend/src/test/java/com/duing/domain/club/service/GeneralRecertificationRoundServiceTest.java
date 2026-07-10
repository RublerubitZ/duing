package com.duing.domain.club.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.RecertificationRound;
import com.duing.domain.club.entity.RoundStatus;
import com.duing.domain.club.exception.ClubException;
import com.duing.domain.club.repository.RecertificationRoundRepository;
import com.duing.domain.club.service.dto.command.CloseRoundCommand;
import com.duing.domain.club.service.dto.command.OpenRoundCommand;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import java.time.LocalDateTime;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.annotation.Transactional;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@Transactional
class GeneralRecertificationRoundServiceTest {

    @Autowired RecertificationRoundService roundService;
    @Autowired RecertificationRoundRepository roundRepository;
    @Autowired UserRepository userRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private User saveUser(UserRole role) {
        long seq = sequence.incrementAndGet();
        return userRepository.save(User.create("20" + seq, "U" + seq, "h", role,
                Grade.FRESHMAN, College.IT_ENGINEERING, "미설정", "010-0000-0000", LocalDateTime.now()));
    }

    @Test
    @DisplayName("ADMIN 이 라운드를 열면 OPEN 으로 저장된다")
    void openRoundSucceeds() {
        User admin = saveUser(UserRole.ADMIN);
        Long roundId = roundService.open(new OpenRoundCommand(2026, "2026 정기 재인증", admin.getId()));
        RecertificationRound saved = roundRepository.findById(roundId).orElseThrow();
        assertThat(saved.getStatus()).isEqualTo(RoundStatus.OPEN);
        assertThat(saved.getYear()).isEqualTo(2026);
    }

    @Test
    @DisplayName("동일 연도에 OPEN 라운드가 있으면 두 번째 열기는 409")
    void duplicateOpenFails() {
        User admin = saveUser(UserRole.ADMIN);
        roundService.open(new OpenRoundCommand(2026, "A", admin.getId()));
        assertThatThrownBy(() -> roundService.open(new OpenRoundCommand(2026, "B", admin.getId())))
                .isInstanceOf(ClubException.DuplicateOpenRoundException.class);
    }

    @Test
    @DisplayName("라운드 닫기 시 CLOSED 로 전이된다")
    void closeRoundSucceeds() {
        User admin = saveUser(UserRole.ADMIN);
        Long roundId = roundService.open(new OpenRoundCommand(2026, "라운드", admin.getId()));
        roundService.close(new CloseRoundCommand(roundId, admin.getId()));
        RecertificationRound saved = roundRepository.findById(roundId).orElseThrow();
        assertThat(saved.getStatus()).isEqualTo(RoundStatus.CLOSED);
        assertThat(saved.getClosedBy()).isEqualTo(admin.getId());
    }

    @Test
    @DisplayName("이미 닫힌 라운드를 다시 닫으면 400")
    void closeTwiceFails() {
        User admin = saveUser(UserRole.ADMIN);
        Long roundId = roundService.open(new OpenRoundCommand(2026, "라운드", admin.getId()));
        roundService.close(new CloseRoundCommand(roundId, admin.getId()));
        assertThatThrownBy(() -> roundService.close(new CloseRoundCommand(roundId, admin.getId())))
                .isInstanceOf(ClubException.RoundAlreadyClosedException.class);
    }
}
