package com.duing.domain.club.entity;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ClubUseGenerationTest {

    private Club newClub() {
        return Club.create("동아리", ClubCategory.ACADEMIC, null, "설명", null);
    }

    @Test
    @DisplayName("신규 동아리의 기수 표시 설정은 기본적으로 꺼져 있다")
    void newClubDisablesGenerationDisplay() {
        assertThat(newClub().isUseGeneration()).isFalse();
    }

    @Test
    @DisplayName("기수 표시 설정을 켜면 동아리에 반영된다")
    void changeUseGenerationEnables() {
        Club club = newClub();
        club.changeUseGeneration(true);
        assertThat(club.isUseGeneration()).isTrue();
    }

    @Test
    @DisplayName("기수 표시 설정을 다시 끄면 동아리에 반영된다")
    void changeUseGenerationDisables() {
        Club club = newClub();
        club.changeUseGeneration(true);
        club.changeUseGeneration(false);
        assertThat(club.isUseGeneration()).isFalse();
    }
}
