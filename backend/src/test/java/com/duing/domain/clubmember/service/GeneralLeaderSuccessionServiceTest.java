package com.duing.domain.clubmember.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberEventType;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.entity.LeaderSuccessionRequest;
import com.duing.domain.clubmember.entity.SuccessionStatus;
import com.duing.domain.clubmember.exception.ClubMemberException;
import com.duing.domain.clubmember.repository.ClubMemberHistoryRepository;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.clubmember.repository.LeaderSuccessionRequestRepository;
import com.duing.domain.clubmember.service.dto.command.CreateSuccessionCommand;
import com.duing.domain.clubmember.service.dto.command.ProcessSuccessionCommand;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.lang.reflect.Field;
import java.time.LocalDateTime;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.transaction.annotation.Transactional;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@Transactional
class GeneralLeaderSuccessionServiceTest {

    @Autowired LeaderSuccessionService successionService;
    @Autowired LeaderSuccessionRequestRepository requestRepository;
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
        Club club = Club.create("C" + sequence.incrementAndGet(),
                ClubCategory.ACADEMIC, null, "설명", null);
        // Club.create 기본 상태는 PENDING_APPROVAL — 승계 요청 제출은 운영 행위 게이트(Part C)로
        // ACTIVE 동아리만 허용되므로, 상태 차단 자체를 검증하는 테스트가 아닌 한 ACTIVE 로 둔다.
        try {
            Field statusField = Club.class.getDeclaredField("status");
            statusField.setAccessible(true);
            statusField.set(club, ClubStatus.ACTIVE);
        } catch (ReflectiveOperationException reflectionFailure) {
            throw new IllegalStateException("Club status 픽스처 설정 실패", reflectionFailure);
        }
        return clubRepository.save(club);
    }

    @Test
    @DisplayName("OFFICER 가 정상 승계 요청을 제출하면 PENDING 으로 저장된다")
    void createSucceeds() {
        User leader = saveUser(UserRole.STUDENT);
        User officer = saveUser(UserRole.STUDENT);
        Club club = saveClub();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        clubMemberRepository.save(ClubMember.of(club, officer, ClubMemberRole.OFFICER));

        Long id = successionService.create(new CreateSuccessionCommand(
                club.getId(), officer.getId(), "잠수 3개월"));
        LeaderSuccessionRequest saved = requestRepository.findById(id).orElseThrow();
        assertThat(saved.getStatus()).isEqualTo(SuccessionStatus.PENDING);
        assertThat(saved.getRequesterUserId()).isEqualTo(officer.getId());
    }

    @Test
    @DisplayName("LEADER 본인의 승계 요청은 403")
    void leaderCannotRequest() {
        // 운영 행위 게이트(ClubAuthService.requireOfficer) 도입으로 비-OFFICER 는
        // 도메인 400 이 아닌 인가 403(AccessDenied) 으로 차단된다.
        User leader = saveUser(UserRole.STUDENT);
        Club club = saveClub();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));

        assertThatThrownBy(() -> successionService.create(new CreateSuccessionCommand(
                club.getId(), leader.getId(), "테스트")))
                .isInstanceOf(AccessDeniedException.class);
    }

    @Test
    @DisplayName("MEMBER 의 승계 요청은 403")
    void memberCannotRequest() {
        User leader = saveUser(UserRole.STUDENT);
        User member = saveUser(UserRole.STUDENT);
        Club club = saveClub();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        clubMemberRepository.save(ClubMember.of(club, member, ClubMemberRole.MEMBER));

        assertThatThrownBy(() -> successionService.create(new CreateSuccessionCommand(
                club.getId(), member.getId(), "테스트")))
                .isInstanceOf(AccessDeniedException.class);
    }

    @Test
    @DisplayName("동일 동아리 PENDING 승계가 있으면 중복은 409")
    void duplicatePendingFails() {
        User leader = saveUser(UserRole.STUDENT);
        User officerA = saveUser(UserRole.STUDENT);
        User officerB = saveUser(UserRole.STUDENT);
        Club club = saveClub();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        clubMemberRepository.save(ClubMember.of(club, officerA, ClubMemberRole.OFFICER));
        clubMemberRepository.save(ClubMember.of(club, officerB, ClubMemberRole.OFFICER));

        successionService.create(new CreateSuccessionCommand(club.getId(), officerA.getId(), "A"));
        assertThatThrownBy(() -> successionService.create(new CreateSuccessionCommand(
                club.getId(), officerB.getId(), "B")))
                .isInstanceOf(ClubMemberException.DuplicatePendingSuccession.class);
    }

    @Test
    @DisplayName("APPROVED 처리 시 기존 LEADER 는 MEMBER 로, 요청자는 LEADER 로 바뀌고 history 2행이 기록된다")
    void approveSwapsRolesAndRecords() {
        User leader = saveUser(UserRole.STUDENT);
        User officer = saveUser(UserRole.STUDENT);
        User admin = saveUser(UserRole.ADMIN);
        Club club = saveClub();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        clubMemberRepository.save(ClubMember.of(club, officer, ClubMemberRole.OFFICER));
        Long requestId = successionService.create(new CreateSuccessionCommand(
                club.getId(), officer.getId(), "잠수"));

        successionService.process(new ProcessSuccessionCommand(
                requestId, admin.getId(), SuccessionStatus.APPROVED, "확인"));

        LeaderSuccessionRequest processed = requestRepository.findById(requestId).orElseThrow();
        assertThat(processed.getStatus()).isEqualTo(SuccessionStatus.APPROVED);

        ClubMember leaderMember = clubMemberRepository.findByClubIdAndUserId(club.getId(), leader.getId()).orElseThrow();
        ClubMember officerMember = clubMemberRepository.findByClubIdAndUserId(club.getId(), officer.getId()).orElseThrow();
        assertThat(leaderMember.getRole()).isEqualTo(ClubMemberRole.MEMBER);
        assertThat(officerMember.getRole()).isEqualTo(ClubMemberRole.LEADER);

        var rows = historyRepository.findByClubIdOrderByCreatedAtDesc(
                club.getId(), PageRequest.of(0, 10));
        assertThat(rows.getContent())
                .hasSize(2)
                .allMatch(r -> r.getEventType() == ClubMemberEventType.SUCCESSION_APPROVED);
    }

    @Test
    @DisplayName("REJECTED 처리 시 멤버 변경·history 모두 없다")
    void rejectChangesNothing() {
        User leader = saveUser(UserRole.STUDENT);
        User officer = saveUser(UserRole.STUDENT);
        User admin = saveUser(UserRole.ADMIN);
        Club club = saveClub();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        clubMemberRepository.save(ClubMember.of(club, officer, ClubMemberRole.OFFICER));
        Long requestId = successionService.create(new CreateSuccessionCommand(
                club.getId(), officer.getId(), "잠수"));

        successionService.process(new ProcessSuccessionCommand(
                requestId, admin.getId(), SuccessionStatus.REJECTED, "거절"));

        ClubMember leaderMember = clubMemberRepository.findByClubIdAndUserId(club.getId(), leader.getId()).orElseThrow();
        assertThat(leaderMember.getRole()).isEqualTo(ClubMemberRole.LEADER);
        var rows = historyRepository.findByClubIdOrderByCreatedAtDesc(
                club.getId(), PageRequest.of(0, 10));
        assertThat(rows.getContent()).isEmpty();
    }

    @Test
    @DisplayName("이미 종결된 요청을 다시 PATCH 하면 예외")
    void processTerminalFails() {
        User leader = saveUser(UserRole.STUDENT);
        User officer = saveUser(UserRole.STUDENT);
        User admin = saveUser(UserRole.ADMIN);
        Club club = saveClub();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        clubMemberRepository.save(ClubMember.of(club, officer, ClubMemberRole.OFFICER));
        Long requestId = successionService.create(new CreateSuccessionCommand(
                club.getId(), officer.getId(), "잠수"));
        successionService.process(new ProcessSuccessionCommand(
                requestId, admin.getId(), SuccessionStatus.REJECTED, null));
        entityManager.flush();

        assertThatThrownBy(() -> successionService.process(new ProcessSuccessionCommand(
                requestId, admin.getId(), SuccessionStatus.APPROVED, null)))
                .isInstanceOf(ClubMemberException.InvalidSuccessionTransition.class);
    }

    @Test
    @DisplayName("APPROVED 시점에 요청자가 OFFICER 아니게 됐으면 400")
    void approveRequiresStillOfficer() {
        User leader = saveUser(UserRole.STUDENT);
        User officer = saveUser(UserRole.STUDENT);
        User admin = saveUser(UserRole.ADMIN);
        Club club = saveClub();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        ClubMember officerMember = clubMemberRepository.save(
                ClubMember.of(club, officer, ClubMemberRole.OFFICER));
        Long requestId = successionService.create(new CreateSuccessionCommand(
                club.getId(), officer.getId(), "잠수"));
        officerMember.changeRole(ClubMemberRole.MEMBER);
        clubMemberRepository.save(officerMember);
        entityManager.flush();

        assertThatThrownBy(() -> successionService.process(new ProcessSuccessionCommand(
                requestId, admin.getId(), SuccessionStatus.APPROVED, null)))
                .isInstanceOf(ClubMemberException.SuccessionRequesterNoLongerOfficer.class);
    }

    @Test
    @DisplayName("요청과 승인 사이에 요청자가 탈퇴하면 승격되지 않고 현직 회장도 유지된다")
    void approveRejectsWithdrawnRequester() {
        User leader = saveUser(UserRole.STUDENT);
        User officer = saveUser(UserRole.STUDENT);
        User admin = saveUser(UserRole.ADMIN);
        Club club = saveClub();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        clubMemberRepository.save(ClubMember.of(club, officer, ClubMemberRole.OFFICER));
        Long requestId = successionService.create(new CreateSuccessionCommand(
                club.getId(), officer.getId(), "잠수"));

        // 탈퇴는 계정만 지우고 비-LEADER 멤버십 행은 남긴다 — 막지 않으면 로그인 불가한 유령 회장이
        // 생기면서 현직 회장이 강등되고, 동아리 운영이 총동연 강제 지정 없이는 복구되지 않는다.
        entityManager.flush();
        entityManager.createNativeQuery("UPDATE users SET deleted_at = NOW() WHERE id = :userId")
                .setParameter("userId", officer.getId())
                .executeUpdate();
        entityManager.clear();

        assertThatThrownBy(() -> successionService.process(new ProcessSuccessionCommand(
                requestId, admin.getId(), SuccessionStatus.APPROVED, null)))
                .isInstanceOf(ClubMemberException.SuccessionRequesterNoLongerOfficer.class);

        assertThat(clubMemberRepository.findByClubIdAndUserId(club.getId(), leader.getId())
                .orElseThrow().getRole()).isEqualTo(ClubMemberRole.LEADER);
    }

    @Test
    @DisplayName("LEADER 가 부재한 동아리는 APPROVED 처리 불가 (강제 지정 경로 사용)")
    void approveRequiresLeaderPresent() {
        User officer = saveUser(UserRole.STUDENT);
        User admin = saveUser(UserRole.ADMIN);
        Club club = saveClub();
        clubMemberRepository.save(ClubMember.of(club, officer, ClubMemberRole.OFFICER));
        Long requestId = successionService.create(new CreateSuccessionCommand(
                club.getId(), officer.getId(), "잠수 (LEADER 부재)"));

        assertThatThrownBy(() -> successionService.process(new ProcessSuccessionCommand(
                requestId, admin.getId(), SuccessionStatus.APPROVED, null)))
                .isInstanceOf(ClubMemberException.SuccessionLeaderAbsent.class);
    }
}
