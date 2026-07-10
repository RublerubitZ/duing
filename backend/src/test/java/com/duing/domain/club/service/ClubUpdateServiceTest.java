package com.duing.domain.club.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.exception.ClubException;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.club.service.dto.command.UpdateClubCommand;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.exception.ClubMemberException;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import com.duing.common.TestcontainersConfiguration;
import java.lang.reflect.Field;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.context.annotation.Import;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@Transactional
class ClubUpdateServiceTest {

    @Autowired ClubService clubService;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired UserRepository userRepository;

    @Test
    @DisplayName("LEADER 가 호출하면 name 과 tags 만 부분 갱신된다")
    void leaderUpdatesPartialFields() throws Exception {
        User leader = saveUser("리더원");
        Club club = saveActiveClub("두잉업데이트1");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));

        clubService.update(new UpdateClubCommand(
                club.getId(), leader.getId(),
                "두잉업데이트1-NEW", null, null, null, null, null,
                List.of("코딩"), null, null,
                null, null, null, null, null, null, null,
                null, null, null,
                null, null, null, null
        ));

        Club reloaded = clubRepository.findById(club.getId()).orElseThrow();
        assertThat(reloaded.getName()).isEqualTo("두잉업데이트1-NEW");
        assertThat(reloaded.getTags()).containsExactly("코딩");
        assertThat(reloaded.getDivision()).isEqualTo("분과");
    }

    @Test
    @DisplayName("MEMBER 역할 사용자가 호출하면 AccessDenied 가 발생한다")
    void memberIsRejected() throws Exception {
        User memberUser = saveUser("일반멤버");
        Club club = saveActiveClub("두잉업데이트2");
        clubMemberRepository.save(ClubMember.asMember(club, memberUser));

        assertThatThrownBy(() -> clubService.update(new UpdateClubCommand(
                club.getId(), memberUser.getId(),
                "변경시도", null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null,
                null, null, null,
                null, null, null, null
        ))).isInstanceOf(AccessDeniedException.class);
    }

    @Test
    @DisplayName("비멤버가 호출하면 NotAMember 가 발생한다")
    void nonMemberIsRejected() throws Exception {
        User stranger = saveUser("외부인");
        Club club = saveActiveClub("두잉업데이트2-2");

        assertThatThrownBy(() -> clubService.update(new UpdateClubCommand(
                club.getId(), stranger.getId(),
                "변경시도", null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null,
                null, null, null,
                null, null, null, null
        ))).isInstanceOf(ClubMemberException.NotAMember.class);
    }

    @Test
    @DisplayName("거절(REJECTED)된 동아리의 리더도 재심사 보완을 위해 정보를 수정할 수 있다")
    void rejectedClubLeaderCanUpdate() throws Exception {
        User leader = saveUser("거절리더");
        Club club = saveClubWithStatus("두잉업데이트거절", ClubStatus.REJECTED);
        clubMemberRepository.save(ClubMember.asLeader(club, leader));

        clubService.update(new UpdateClubCommand(
                club.getId(), leader.getId(),
                null, null, null, "보완된 설명", null, null,
                null, null, null,
                null, null, null, null, null, null, null,
                null, null, null,
                null, null, null, null
        ));

        assertThat(clubRepository.findById(club.getId()).orElseThrow().getDescription())
                .isEqualTo("보완된 설명");
    }

    @Test
    @DisplayName("운영 종료(INACTIVE)된 동아리의 리더는 정보를 수정할 수 없다")
    void inactiveClubLeaderCannotUpdate() throws Exception {
        User leader = saveUser("종료리더");
        Club club = saveClubWithStatus("두잉업데이트종료", ClubStatus.INACTIVE);
        clubMemberRepository.save(ClubMember.asLeader(club, leader));

        assertThatThrownBy(() -> clubService.update(new UpdateClubCommand(
                club.getId(), leader.getId(),
                null, null, null, "변경시도", null, null,
                null, null, null,
                null, null, null, null, null, null, null,
                null, null, null,
                null, null, null, null
        )))
                .isInstanceOf(ClubMemberException.NotActiveClub.class)
                .hasMessage("운영 종료된 동아리입니다.");
    }

    @Test
    @DisplayName("이미 존재하는 이름으로 변경하면 DuplicateClubNameException 이 발생한다")
    void duplicateNameThrows() throws Exception {
        User leader = saveUser("리더둘");
        Club club = saveActiveClub("두잉업데이트3");
        Club other = saveActiveClub("점유된이름");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));

        assertThatThrownBy(() -> clubService.update(new UpdateClubCommand(
                club.getId(), leader.getId(),
                other.getName(), null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null,
                null, null, null,
                null, null, null, null
        ))).isInstanceOf(ClubException.DuplicateClubNameException.class);
    }

    @Test
    @DisplayName("자신의 현재 이름으로 갱신하는 것은 중복으로 보지 않는다")
    void sameNameUpdateIsAllowed() throws Exception {
        User leader = saveUser("리더셋");
        Club club = saveActiveClub("두잉업데이트4");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));

        clubService.update(new UpdateClubCommand(
                club.getId(), leader.getId(),
                club.getName(), null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null,
                null, null, null,
                null, null, null, null
        ));

        assertThat(clubRepository.findById(club.getId()).orElseThrow().getName())
                .isEqualTo(club.getName());
    }

    private User saveUser(String name) {
        long unique = System.nanoTime();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                name,
                "hashed",
                UserRole.STUDENT,
                Grade.FRESHMAN,
                College.IT_ENGINEERING,
                "미설정",
                "010-0000-0000",
                java.time.LocalDateTime.now()
        ));
    }

    private Club saveActiveClub(String name) throws Exception {
        return saveClubWithStatus(name, ClubStatus.ACTIVE);
    }

    private Club saveClubWithStatus(String name, ClubStatus status) throws Exception {
        String uniqueName = name + "-" + System.nanoTime();
        Club club = Club.create(uniqueName, ClubCategory.ACADEMIC, "분과", "설명", "https://logo");
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(club, status);
        return clubRepository.save(club);
    }
}
