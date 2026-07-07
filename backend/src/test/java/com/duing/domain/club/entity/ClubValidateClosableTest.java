package com.duing.domain.club.entity;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.domain.club.exception.ClubException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ClubValidateClosableTest {

    @Test
    @DisplayName("운영 중단(INACTIVE) 동아리는 폐쇄 검증을 통과한다")
    void inactiveClubIsClosable() {
        Club club = Club.create("테스트", ClubCategory.ACADEMIC, "분과", "설명", null);
        club.changeStatus(ClubStatus.ACTIVE, null, 1L);
        club.changeStatus(ClubStatus.INACTIVE, null, 1L);

        assertThatCode(club::validateClosable).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("거절(REJECTED) 동아리는 폐쇄 검증을 통과한다")
    void rejectedClubIsClosable() {
        Club club = Club.create("테스트", ClubCategory.ACADEMIC, "분과", "설명", null);
        club.changeStatus(ClubStatus.REJECTED, "요건 미충족", 1L);

        assertThatCode(club::validateClosable).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("운영 중(ACTIVE) 동아리는 폐쇄할 수 없다")
    void activeClubIsNotClosable() {
        Club club = Club.create("테스트", ClubCategory.ACADEMIC, "분과", "설명", null);
        club.changeStatus(ClubStatus.ACTIVE, null, 1L);

        assertThatThrownBy(club::validateClosable)
                .isInstanceOf(ClubException.ClubNotClosableException.class);
    }

    @Test
    @DisplayName("승인 대기(PENDING_APPROVAL) 동아리는 폐쇄할 수 없다")
    void pendingClubIsNotClosable() {
        Club club = Club.create("테스트", ClubCategory.ACADEMIC, "분과", "설명", null);

        assertThatThrownBy(club::validateClosable)
                .isInstanceOf(ClubException.ClubNotClosableException.class);
    }
}
