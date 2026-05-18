package com.duing.domain.clubmember.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.exception.ClubMemberException;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.clubmember.service.dto.command.LeaveClubCommand;
import com.duing.domain.clubmember.service.dto.command.RemoveMemberCommand;
import com.duing.domain.clubmember.service.dto.command.TransferLeaderCommand;
import com.duing.domain.clubmember.service.dto.command.UpdateMemberRoleCommand;
import com.duing.domain.clubmember.service.dto.query.TransferLeaderQuery;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import java.lang.reflect.Field;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@Transactional
@DirtiesContext
class ClubMemberCommandServiceTest {

    @Autowired ClubMemberCommandService clubMemberCommandService;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired UserRepository userRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    // ── 3.4 PATCH role ────────────────────────────────────────────────────

    @Test
    @DisplayName("LEADER 가 MEMBER 를 OFFICER 로 승급하면 역할이 변경된다")
    void promoteMemberToOfficer() throws Exception {
        User leader = saveUser("리더1");
        User memberUser = saveUser("일반1");
        Club club = saveActiveClub("두잉변경1");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        ClubMember membership = clubMemberRepository.save(ClubMember.asMember(club, memberUser));

        clubMemberCommandService.updateRole(new UpdateMemberRoleCommand(
                club.getId(), membership.getId(), leader.getId(), ClubMemberRole.OFFICER));

        assertThat(clubMemberRepository.findById(membership.getId()).orElseThrow().getRole())
                .isEqualTo(ClubMemberRole.OFFICER);
    }

    @Test
    @DisplayName("LEADER 가 OFFICER 를 MEMBER 로 강등할 수 있다")
    void demoteOfficerToMember() throws Exception {
        User leader = saveUser("리더2");
        User officerUser = saveUser("운영2");
        Club club = saveActiveClub("두잉변경2");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        ClubMember membership = clubMemberRepository.save(
                ClubMember.of(club, officerUser, ClubMemberRole.OFFICER));

        clubMemberCommandService.updateRole(new UpdateMemberRoleCommand(
                club.getId(), membership.getId(), leader.getId(), ClubMemberRole.MEMBER));

        assertThat(clubMemberRepository.findById(membership.getId()).orElseThrow().getRole())
                .isEqualTo(ClubMemberRole.MEMBER);
    }

    @Test
    @DisplayName("같은 역할로 PATCH 하면 멱등하게 성공한다")
    void sameRoleIsIdempotent() throws Exception {
        User leader = saveUser("리더3");
        User memberUser = saveUser("일반3");
        Club club = saveActiveClub("두잉변경3");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        ClubMember membership = clubMemberRepository.save(ClubMember.asMember(club, memberUser));

        clubMemberCommandService.updateRole(new UpdateMemberRoleCommand(
                club.getId(), membership.getId(), leader.getId(), ClubMemberRole.MEMBER));

        assertThat(clubMemberRepository.findById(membership.getId()).orElseThrow().getRole())
                .isEqualTo(ClubMemberRole.MEMBER);
    }

    @Test
    @DisplayName("본인의 역할은 변경할 수 없다 (CannotChangeOwnRole)")
    void cannotChangeOwnRole() throws Exception {
        User leader = saveUser("리더4");
        Club club = saveActiveClub("두잉변경4");
        ClubMember leaderMembership = clubMemberRepository.save(ClubMember.asLeader(club, leader));

        assertThatThrownBy(() -> clubMemberCommandService.updateRole(new UpdateMemberRoleCommand(
                club.getId(), leaderMembership.getId(), leader.getId(), ClubMemberRole.OFFICER)))
                .isInstanceOf(ClubMemberException.CannotChangeOwnRole.class);
    }

    @Test
    @DisplayName("대상이 LEADER 면 강등할 수 없다 (CannotModifyLeader)")
    void cannotModifyLeader() throws Exception {
        User leaderA = saveUser("리더5A");
        User leaderB = saveUser("리더5B");
        Club clubA = saveActiveClub("두잉변경5A");
        Club clubB = saveActiveClub("두잉변경5B");
        clubMemberRepository.save(ClubMember.asLeader(clubA, leaderA));
        ClubMember bsLeaderMembership = clubMemberRepository.save(ClubMember.asLeader(clubB, leaderB));
        // A 의 LEADER 인 leaderA 가 다른 clubB 의 LEADER 행을 변경 시도 — 권한도 없지만
        // 본 테스트는 권한 통과 후의 LEADER 보호 로직 검증을 위해 leaderB 가 자기 clubB 의
        // 다른 행을 변경하는 시나리오로 다시 구성한다. (수정)
        // → 더 명확한 케이스: clubA 의 LEADER 가 자기 동아리에서 또 다른 LEADER 행을 만들 일은
        // 없지만, 본 테스트는 "LEADER 인 행은 일반 PATCH 로 변경 불가" 만 확인하면 되므로
        // 비정상 상태(LEADER 2명)를 생성해 검증한다.
        ClubMember secondLeader = clubMemberRepository.save(
                ClubMember.of(clubA, saveUser("리더5C"), ClubMemberRole.LEADER));

        assertThatThrownBy(() -> clubMemberCommandService.updateRole(new UpdateMemberRoleCommand(
                clubA.getId(), secondLeader.getId(), leaderA.getId(), ClubMemberRole.OFFICER)))
                .isInstanceOf(ClubMemberException.CannotModifyLeader.class);
    }

    @Test
    @DisplayName("OFFICER 가 PATCH 를 시도하면 AccessDenied 가 발생한다")
    void officerCannotChangeRole() throws Exception {
        User leader = saveUser("리더6");
        User officer = saveUser("운영6");
        User memberUser = saveUser("일반6");
        Club club = saveActiveClub("두잉변경6");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        clubMemberRepository.save(ClubMember.of(club, officer, ClubMemberRole.OFFICER));
        ClubMember membership = clubMemberRepository.save(ClubMember.asMember(club, memberUser));

        assertThatThrownBy(() -> clubMemberCommandService.updateRole(new UpdateMemberRoleCommand(
                club.getId(), membership.getId(), officer.getId(), ClubMemberRole.OFFICER)))
                .isInstanceOf(AccessDeniedException.class);
    }

    // ── 3.5 DELETE member ─────────────────────────────────────────────────

    @Test
    @DisplayName("LEADER 가 MEMBER 를 강퇴하면 soft-delete 된다")
    void removeMember() throws Exception {
        User leader = saveUser("리더7");
        User memberUser = saveUser("일반7");
        Club club = saveActiveClub("두잉변경7");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        ClubMember membership = clubMemberRepository.save(ClubMember.asMember(club, memberUser));

        clubMemberCommandService.removeMember(new RemoveMemberCommand(
                club.getId(), membership.getId(), leader.getId()));

        assertThat(clubMemberRepository.findById(membership.getId())).isEmpty();
    }

    @Test
    @DisplayName("LEADER 본인을 강퇴할 수 없다 (CannotRemoveSelf)")
    void cannotRemoveSelf() throws Exception {
        User leader = saveUser("리더8");
        Club club = saveActiveClub("두잉변경8");
        ClubMember leaderMembership = clubMemberRepository.save(ClubMember.asLeader(club, leader));

        assertThatThrownBy(() -> clubMemberCommandService.removeMember(new RemoveMemberCommand(
                club.getId(), leaderMembership.getId(), leader.getId())))
                .isInstanceOf(ClubMemberException.CannotRemoveSelf.class);
    }

    @Test
    @DisplayName("LEADER 를 강퇴할 수 없다 (CannotModifyLeader)")
    void cannotRemoveLeader() throws Exception {
        User leaderA = saveUser("리더9");
        Club club = saveActiveClub("두잉변경9");
        clubMemberRepository.save(ClubMember.asLeader(club, leaderA));
        ClubMember secondLeader = clubMemberRepository.save(
                ClubMember.of(club, saveUser("리더9B"), ClubMemberRole.LEADER));

        assertThatThrownBy(() -> clubMemberCommandService.removeMember(new RemoveMemberCommand(
                club.getId(), secondLeader.getId(), leaderA.getId())))
                .isInstanceOf(ClubMemberException.CannotModifyLeader.class);
    }

    @Test
    @DisplayName("강퇴된 사용자는 같은 동아리에 다시 가입할 수 있다")
    void canRejoinAfterRemove() throws Exception {
        User leader = saveUser("리더10");
        User memberUser = saveUser("일반10");
        Club club = saveActiveClub("두잉변경10");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        ClubMember first = clubMemberRepository.save(ClubMember.asMember(club, memberUser));
        clubMemberCommandService.removeMember(new RemoveMemberCommand(
                club.getId(), first.getId(), leader.getId()));
        // @SQLDelete UPDATE 는 Hibernate ActionQueue 상 INSERT 보다 늦게 실행되므로
        // 같은 트랜잭션에서 재가입할 때 partial unique index 충돌을 피하려면 명시 flush 가 필요.
        clubMemberRepository.flush();

        ClubMember second = clubMemberRepository.save(ClubMember.asMember(club, memberUser));

        assertThat(second.getId()).isNotEqualTo(first.getId());
    }

    // ── 3.6 DELETE me ─────────────────────────────────────────────────────

    @Test
    @DisplayName("MEMBER 가 본인 탈퇴하면 멤버십이 soft-delete 된다")
    void memberLeaves() throws Exception {
        User memberUser = saveUser("일반11");
        Club club = saveActiveClub("두잉변경11");
        ClubMember membership = clubMemberRepository.save(ClubMember.asMember(club, memberUser));

        clubMemberCommandService.leave(new LeaveClubCommand(club.getId(), memberUser.getId()));

        assertThat(clubMemberRepository.findById(membership.getId())).isEmpty();
    }

    @Test
    @DisplayName("LEADER 본인 탈퇴는 LeaderCannotLeave 로 거부된다")
    void leaderCannotLeave() throws Exception {
        User leader = saveUser("리더12");
        Club club = saveActiveClub("두잉변경12");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));

        assertThatThrownBy(() -> clubMemberCommandService.leave(
                new LeaveClubCommand(club.getId(), leader.getId())))
                .isInstanceOf(ClubMemberException.LeaderCannotLeave.class);
    }

    @Test
    @DisplayName("비멤버가 leave 호출하면 NotFound 가 발생한다")
    void nonMemberLeaveReturnsNotFound() throws Exception {
        User stranger = saveUser("외부12");
        Club club = saveActiveClub("두잉변경12b");

        assertThatThrownBy(() -> clubMemberCommandService.leave(
                new LeaveClubCommand(club.getId(), stranger.getId())))
                .isInstanceOf(ClubMemberException.NotFound.class);
    }

    // ── 3.7 POST transfer-leader ──────────────────────────────────────────

    @Test
    @DisplayName("LEADER 가 OFFICER 에게 인계하면 두 행의 역할이 한 트랜잭션에서 교환된다")
    void transferLeaderToOfficer() throws Exception {
        User leader = saveUser("리더13");
        User officer = saveUser("운영13");
        Club club = saveActiveClub("두잉변경13");
        ClubMember leaderMembership = clubMemberRepository.save(ClubMember.asLeader(club, leader));
        ClubMember officerMembership = clubMemberRepository.save(
                ClubMember.of(club, officer, ClubMemberRole.OFFICER));

        TransferLeaderQuery result = clubMemberCommandService.transferLeader(
                new TransferLeaderCommand(club.getId(), officerMembership.getId(), leader.getId()));

        assertThat(clubMemberRepository.findById(leaderMembership.getId()).orElseThrow().getRole())
                .isEqualTo(ClubMemberRole.OFFICER);
        assertThat(clubMemberRepository.findById(officerMembership.getId()).orElseThrow().getRole())
                .isEqualTo(ClubMemberRole.LEADER);
        assertThat(result.formerLeader().role()).isEqualTo(ClubMemberRole.OFFICER);
        assertThat(result.newLeader().role()).isEqualTo(ClubMemberRole.LEADER);
    }

    @Test
    @DisplayName("LEADER 가 MEMBER 에게도 인계할 수 있다")
    void transferLeaderToMember() throws Exception {
        User leader = saveUser("리더14");
        User memberUser = saveUser("일반14");
        Club club = saveActiveClub("두잉변경14");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        ClubMember membership = clubMemberRepository.save(ClubMember.asMember(club, memberUser));

        clubMemberCommandService.transferLeader(new TransferLeaderCommand(
                club.getId(), membership.getId(), leader.getId()));

        assertThat(clubMemberRepository.findById(membership.getId()).orElseThrow().getRole())
                .isEqualTo(ClubMemberRole.LEADER);
    }

    @Test
    @DisplayName("다른 동아리의 멤버를 대상으로 인계하면 TransferTargetInvalid")
    void transferToForeignClubMember() throws Exception {
        User leader = saveUser("리더15");
        Club clubA = saveActiveClub("두잉변경15A");
        Club clubB = saveActiveClub("두잉변경15B");
        clubMemberRepository.save(ClubMember.asLeader(clubA, leader));
        ClubMember inB = clubMemberRepository.save(
                ClubMember.of(clubB, saveUser("외부15"), ClubMemberRole.MEMBER));

        assertThatThrownBy(() -> clubMemberCommandService.transferLeader(
                new TransferLeaderCommand(clubA.getId(), inB.getId(), leader.getId())))
                .isInstanceOf(ClubMemberException.TransferTargetInvalid.class);
    }

    // ── fixtures ──────────────────────────────────────────────────────────

    private User saveUser(String name) {
        long unique = sequence.getAndIncrement();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                name,
                "u" + unique + "@daegu.ac.kr",
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
        String uniqueName = name + "-" + sequence.getAndIncrement();
        Club created = Club.create(uniqueName, ClubCategory.ACADEMIC, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(created, ClubStatus.ACTIVE);
        return clubRepository.save(created);
    }
}