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
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
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
    @PersistenceContext EntityManager entityManager;

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
    @DisplayName("탈퇴한 회원의 잔존 멤버십은 회장으로 지정되지 않는다")
    void withdrawnMemberCannotBeAssignedAsLeader() {
        User admin = saveUser(UserRole.ADMIN);
        User leader = saveUser(UserRole.STUDENT);
        User withdrawnUser = saveUser(UserRole.STUDENT);
        Club club = saveClub();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        clubMemberRepository.save(ClubMember.of(club, withdrawnUser, ClubMemberRole.OFFICER));

        // 탈퇴는 계정만 지우고 비-LEADER 멤버십 행은 남긴다. 잠금 조회는 그 잔존 행도 잡으므로,
        // 막지 않으면 로그인 불가한 유령 회장이 생기고 현직 회장이 강등된다.
        entityManager.flush();
        entityManager.createNativeQuery("UPDATE users SET deleted_at = NOW() WHERE id = :userId")
                .setParameter("userId", withdrawnUser.getId())
                .executeUpdate();
        entityManager.clear();

        assertThatThrownBy(() -> service.assign(new AssignLeaderByAdminCommand(
                club.getId(), withdrawnUser.getId(), admin.getId(), "회장 잠적")))
                .isInstanceOf(ClubMemberException.AdminAssignTargetNotMember.class);

        assertThat(clubMemberRepository.findByClubIdAndUserId(club.getId(), leader.getId())
                .orElseThrow().getRole()).isEqualTo(ClubMemberRole.LEADER);
    }

    @Test
    @DisplayName("LEADER 가 이미 있어도 강제 교체되어 기존 회장은 MEMBER 로 강등되고 history 2행이 기록된다")
    void replacesExistingLeader() {
        User admin = saveUser(UserRole.ADMIN);
        User leader = saveUser(UserRole.STUDENT);
        User candidate = saveUser(UserRole.STUDENT);
        Club club = saveClub();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        clubMemberRepository.save(ClubMember.of(club, candidate, ClubMemberRole.MEMBER));

        service.assign(new AssignLeaderByAdminCommand(
                club.getId(), candidate.getId(), admin.getId(), "회장 잠적"));

        assertThat(clubMemberRepository.findByClubIdAndUserId(club.getId(), candidate.getId())
                .orElseThrow().getRole()).isEqualTo(ClubMemberRole.LEADER);
        assertThat(clubMemberRepository.findByClubIdAndUserId(club.getId(), leader.getId())
                .orElseThrow().getRole()).isEqualTo(ClubMemberRole.MEMBER);

        var rows = historyRepository.findByClubIdOrderByCreatedAtDesc(
                club.getId(), PageRequest.of(0, 10)).getContent();
        assertThat(rows).hasSize(2);
        assertThat(rows).allSatisfy(row -> {
            assertThat(row.getEventType()).isEqualTo(ClubMemberEventType.ADMIN_LEADER_ASSIGNED);
            assertThat(row.getActorUserId()).isEqualTo(admin.getId());
        });
        assertThat(rows).anySatisfy(row -> {
            assertThat(row.getTargetUserId()).isEqualTo(leader.getId());
            assertThat(row.getFromRole()).isEqualTo(ClubMemberRole.LEADER);
            assertThat(row.getToRole()).isEqualTo(ClubMemberRole.MEMBER);
        });
        assertThat(rows).anySatisfy(row -> {
            assertThat(row.getTargetUserId()).isEqualTo(candidate.getId());
            assertThat(row.getFromRole()).isEqualTo(ClubMemberRole.MEMBER);
            assertThat(row.getToRole()).isEqualTo(ClubMemberRole.LEADER);
        });
    }

    @Test
    @DisplayName("이미 회장인 회원을 다시 강제 지정하면 400")
    void rejectsWhenCandidateIsAlreadyLeader() {
        User admin = saveUser(UserRole.ADMIN);
        User leader = saveUser(UserRole.STUDENT);
        Club club = saveClub();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));

        assertThatThrownBy(() -> service.assign(new AssignLeaderByAdminCommand(
                club.getId(), leader.getId(), admin.getId(), "테스트")))
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
