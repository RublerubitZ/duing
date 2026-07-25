package com.duing.domain.clubmember.entity;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ClubMemberGenerationTest {

    private ClubMember newMember() {
        return ClubMember.asMember(null, null);
    }

    @Test
    @DisplayName("신규 회원의 기수는 기본적으로 비어 있다")
    void newMemberHasNoGeneration() {
        assertThat(newMember().getGeneration()).isNull();
    }

    @Test
    @DisplayName("기수를 지정하면 회원 기수에 반영된다")
    void changeGenerationSetsValue() {
        ClubMember member = newMember();
        member.changeGeneration(9);
        assertThat(member.getGeneration()).isEqualTo(9);
    }

    @Test
    @DisplayName("기수를 null 로 변경하면 기수가 비워진다")
    void changeGenerationToNullClears() {
        ClubMember member = newMember();
        member.changeGeneration(9);
        member.changeGeneration(null);
        assertThat(member.getGeneration()).isNull();
    }
}
