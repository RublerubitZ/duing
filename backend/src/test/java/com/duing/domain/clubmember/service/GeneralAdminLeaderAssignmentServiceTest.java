package com.duing.domain.clubmember.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.exception.ClubException;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberEventType;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.exception.ClubMemberException;
import com.duing.domain.clubmember.repository.ClubMemberHistoryRepository;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.clubmember.service.dto.command.AssignLeaderByAdminCommand;
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
import org.springframework.data.domain.PageRequest;
import org.springframework.transaction.annotation.Transactional;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@Transactional
class GeneralAdminLeaderAssignmentServiceTest {

    @Autowired AdminLeaderAssignmentService service;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired ClubMemberHistoryRepository historyRepository;
    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private User saveUser(UserRole role) {
        long seq = sequence.incrementAndGet();
        return userRepository.save(User.create("20" + seq, "U" + seq, "h", role,
                Grade.FRESHMAN, College.IT_ENGINEERING, "미설정", "010-0000-0000", LocalDateTime.now()));
    }

    private Club saveClub() {
        return clubRepository.save(Club.create("C" + sequence.incrementAndGet(),
                ClubCategory.ACADEMIC, null, "설명", null));
    }

    @Test
    @DisplayName("LEADER 부재 동아리의 MEMBER 를 LEADER 로 강제 지정하면 역할이 바뀌고 history 1행이 기록된다")
    void assignSucceeds() {
        User admin = saveUser(UserRole.ADMIN);
        User candidate = saveUser(UserRole.STUDENT);
        Club club = saveClub();
        clubMemberRepository.save(ClubMember.of(club, candidate, ClubMemberRole.MEMBER));

        service.assign(new AssignLeaderByAdminCommand(
                club.getId(), candidate.getId(), admin.getId(), "전 회장 졸업"));

        ClubMember updated = clubMemberRepository
                .findByClubIdAndUserId(club.getId(), candidate.getId()).orElseThrow();
        assertThat(updated.getRole()).isEqualTo(ClubMemberRole.LEADER);

        var rows = historyRepository.findByClubIdOrderByCreatedAtDesc(
                club.getId(), PageRequest.of(0, 10));
        assertThat(rows.getContent()).hasSize(1);
        var row = rows.getContent().get(0);
        assertThat(row.getEventType()).isEqualTo(ClubMemberEventType.ADMIN_LEADER_ASSIGNED);
        assertThat(row.getFromRole()).isEqualTo(ClubMemberRole.MEMBER);
        assertThat(row.getToRole()).isEqualTo(ClubMemberRole.LEADER);
        assertThat(row.getActorUserId()).isEqualTo(admin.getId());
    }

    @Test
    @DisplayName("LEADER 가 이미 있는 동아리에 강제 지정하면 400")
    void rejectsWhenLeaderExists() {
        User admin = saveUser(UserRole.ADMIN);
        User leader = saveUser(UserRole.STUDENT);
        User candidate = saveUser(UserRole.STUDENT);
        Club club = saveClub();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        clubMemberRepository.save(ClubMember.of(club, candidate, ClubMemberRole.MEMBER));

        assertThatThrownBy(() -> service.assign(new AssignLeaderByAdminCommand(
                club.getId(), candidate.getId(), admin.getId(), "테스트")))
                .isInstanceOf(ClubMemberException.AdminAssignLeaderAlreadyExists.class);
    }

    @Test
    @DisplayName("후보가 ClubMember 가 아니면 404")
    void rejectsWhenCandidateNotMember() {
        User admin = saveUser(UserRole.ADMIN);
        User candidate = saveUser(UserRole.STUDENT);
        Club club = saveClub();

        assertThatThrownBy(() -> service.assign(new AssignLeaderByAdminCommand(
                club.getId(), candidate.getId(), admin.getId(), "테스트")))
                .isInstanceOf(ClubMemberException.AdminAssignTargetNotMember.class);
    }

    @Test
    @DisplayName("존재하지 않는 동아리에 강제 지정하면 ClubNotFoundException 이 발생한다")
    void rejectsWhenClubMissing() {
        User admin = saveUser(UserRole.ADMIN);
        User candidate = saveUser(UserRole.STUDENT);
        long missingClubId = 9_999_999L;

        assertThatThrownBy(() -> service.assign(new AssignLeaderByAdminCommand(
                missingClubId, candidate.getId(), admin.getId(), "테스트")))
                .isInstanceOf(ClubException.ClubNotFoundException.class);
    }
}
