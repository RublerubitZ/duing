package com.duing.domain.clubmember.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberEventType;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.repository.ClubMemberHistoryRepository;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.clubmember.service.dto.command.LeaveClubCommand;
import com.duing.domain.clubmember.service.dto.command.RemoveMemberCommand;
import com.duing.domain.clubmember.service.dto.command.TransferLeaderCommand;
import com.duing.domain.clubmember.service.dto.command.UpdateMemberRoleCommand;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import java.lang.reflect.Field;
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
class ClubMemberHistoryRecorderTest {

    @Autowired ClubMemberCommandService memberCommandService;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired ClubMemberHistoryRepository historyRepository;
    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private User saveUser() {
        long seq = sequence.incrementAndGet();
        String studentNumber = String.format("%010d", seq % 10_000_000_000L);
        return userRepository.save(User.create(studentNumber, "U" + seq, "h", UserRole.STUDENT,
                Grade.FRESHMAN, College.IT_ENGINEERING, "미설정", "010-0000-0000",
                LocalDateTime.now()));
    }

    private Club saveClub() {
        Club club = Club.create("C" + sequence.incrementAndGet(),
                ClubCategory.ACADEMIC, null, "설명", null);
        // Club.create 기본 상태는 PENDING_APPROVAL — 멤버 관리(역할 변경·인계·강퇴)는 운영 행위 게이트(Part C)로
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
    @DisplayName("OFFICER 를 MEMBER 로 강등하면 ROLE_CHANGED 이력 1행이 기록된다")
    void roleChangeRecordsHistory() {
        User leader = saveUser();
        User officer = saveUser();
        Club club = saveClub();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        ClubMember officerMember = clubMemberRepository.save(
                ClubMember.of(club, officer, ClubMemberRole.OFFICER));

        memberCommandService.updateRole(new UpdateMemberRoleCommand(
                club.getId(), officerMember.getId(), leader.getId(), ClubMemberRole.MEMBER));

        var rows = historyRepository.findByClubIdOrderByCreatedAtDesc(
                club.getId(), PageRequest.of(0, 10));
        assertThat(rows.getContent()).hasSize(1);
        var row = rows.getContent().get(0);
        assertThat(row.getEventType()).isEqualTo(ClubMemberEventType.ROLE_CHANGED);
        assertThat(row.getFromRole()).isEqualTo(ClubMemberRole.OFFICER);
        assertThat(row.getToRole()).isEqualTo(ClubMemberRole.MEMBER);
        assertThat(row.getActorUserId()).isEqualTo(leader.getId());
        assertThat(row.getTargetUserId()).isEqualTo(officer.getId());
    }

    @Test
    @DisplayName("동아리장 인계 시 LEADER_TRANSFERRED 이력 2행이 기록된다")
    void transferLeaderRecordsTwoRows() {
        User leader = saveUser();
        User next = saveUser();
        Club club = saveClub();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        ClubMember nextMember = clubMemberRepository.save(
                ClubMember.of(club, next, ClubMemberRole.OFFICER));

        memberCommandService.transferLeader(new TransferLeaderCommand(
                club.getId(), nextMember.getId(), leader.getId()));

        var rows = historyRepository.findByClubIdOrderByCreatedAtDesc(
                club.getId(), PageRequest.of(0, 10));
        assertThat(rows.getContent())
                .hasSize(2)
                .allMatch(r -> r.getEventType() == ClubMemberEventType.LEADER_TRANSFERRED);
    }

    @Test
    @DisplayName("일반 멤버가 자진 탈퇴하면 LEFT 이력이 본인을 actor 로 기록된다")
    void leaveRecordsLeft() {
        User member = saveUser();
        Club club = saveClub();
        clubMemberRepository.save(ClubMember.asLeader(club, saveUser()));
        clubMemberRepository.save(ClubMember.of(club, member, ClubMemberRole.MEMBER));

        memberCommandService.leave(new LeaveClubCommand(club.getId(), member.getId()));

        var rows = historyRepository.findByClubIdOrderByCreatedAtDesc(
                club.getId(), PageRequest.of(0, 10));
        assertThat(rows.getContent()).hasSize(1);
        assertThat(rows.getContent().get(0).getEventType()).isEqualTo(ClubMemberEventType.LEFT);
        assertThat(rows.getContent().get(0).getActorUserId()).isEqualTo(member.getId());
        assertThat(rows.getContent().get(0).getToRole()).isNull();
    }

    @Test
    @DisplayName("동아리장이 멤버를 강퇴하면 REMOVED 이력이 LEADER 를 actor 로 기록된다")
    void removeRecordsRemoved() {
        User leader = saveUser();
        User victim = saveUser();
        Club club = saveClub();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        ClubMember victimMember = clubMemberRepository.save(
                ClubMember.of(club, victim, ClubMemberRole.MEMBER));

        memberCommandService.removeMember(new RemoveMemberCommand(
                club.getId(), victimMember.getId(), leader.getId()));

        var rows = historyRepository.findByClubIdOrderByCreatedAtDesc(
                club.getId(), PageRequest.of(0, 10));
        assertThat(rows.getContent()).hasSize(1);
        assertThat(rows.getContent().get(0).getEventType()).isEqualTo(ClubMemberEventType.REMOVED);
        assertThat(rows.getContent().get(0).getActorUserId()).isEqualTo(leader.getId());
    }
}
