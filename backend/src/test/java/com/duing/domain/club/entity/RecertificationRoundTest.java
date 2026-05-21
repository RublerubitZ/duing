package com.duing.domain.club.entity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.domain.club.exception.ClubException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class RecertificationRoundTest {

    @Test
    @DisplayName("라운드 생성 시 OPEN 상태이며 종료 정보는 비어 있다")
    void createInitializesOpen() {
        RecertificationRound round = RecertificationRound.open(2026, "2026 정기 재인증", 99L);
        assertThat(round.getStatus()).isEqualTo(RoundStatus.OPEN);
        assertThat(round.getYear()).isEqualTo(2026);
        assertThat(round.getOpenedBy()).isEqualTo(99L);
        assertThat(round.getOpenedAt()).isNotNull();
        assertThat(round.getClosedBy()).isNull();
        assertThat(round.getClosedAt()).isNull();
    }

    @Test
    @DisplayName("라운드를 닫으면 CLOSED 상태와 종료 정보가 설정된다")
    void closeSetsTerminalState() {
        RecertificationRound round = RecertificationRound.open(2026, "라운드", 1L);
        round.close(42L);
        assertThat(round.getStatus()).isEqualTo(RoundStatus.CLOSED);
        assertThat(round.getClosedBy()).isEqualTo(42L);
        assertThat(round.getClosedAt()).isNotNull();
    }

    @Test
    @DisplayName("이미 닫힌 라운드를 다시 닫으면 예외가 발생한다")
    void closeTwiceFails() {
        RecertificationRound round = RecertificationRound.open(2026, "라운드", 1L);
        round.close(42L);
        assertThatThrownBy(() -> round.close(42L))
                .isInstanceOf(ClubException.RoundAlreadyClosedException.class);
    }
}
