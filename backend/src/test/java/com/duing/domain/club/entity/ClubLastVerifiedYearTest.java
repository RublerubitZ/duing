package com.duing.domain.club.entity;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ClubLastVerifiedYearTest {

    private Club newClub() {
        return Club.create("동아리", ClubCategory.ACADEMIC, null, "설명", null);
    }

    @Test
    @DisplayName("초기 lastVerifiedYear 가 null 이면 첫 갱신 시 그대로 저장된다")
    void firstUpdateSetsValue() {
        Club club = newClub();
        club.updateLastVerifiedYear(2025);
        assertThat(club.getLastVerifiedYear()).isEqualTo(2025);
    }

    @Test
    @DisplayName("더 큰 연도로 갱신하면 lastVerifiedYear 가 증가한다")
    void advancesToLaterYear() {
        Club club = newClub();
        club.updateLastVerifiedYear(2025);
        club.updateLastVerifiedYear(2026);
        assertThat(club.getLastVerifiedYear()).isEqualTo(2026);
    }

    @Test
    @DisplayName("이전 연도로 갱신해도 lastVerifiedYear 는 역행하지 않는다")
    void doesNotRegress() {
        Club club = newClub();
        club.updateLastVerifiedYear(2026);
        club.updateLastVerifiedYear(2024);
        assertThat(club.getLastVerifiedYear()).isEqualTo(2026);
    }

    @Test
    @DisplayName("같은 연도로 갱신해도 변하지 않는다")
    void sameYearIsNoop() {
        Club club = newClub();
        club.updateLastVerifiedYear(2026);
        club.updateLastVerifiedYear(2026);
        assertThat(club.getLastVerifiedYear()).isEqualTo(2026);
    }
}
