package com.duing.domain.club.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.controller.dto.response.CentralClubRecertificationStatusResponse;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.RecertificationRequest;
import com.duing.domain.club.entity.RecertificationStatus;
import com.duing.domain.club.exception.ClubException;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.club.repository.RecertificationRequestRepository;
import com.duing.domain.club.service.dto.command.CreateRecertificationCommand;
import com.duing.domain.club.service.dto.command.OpenRoundCommand;
import com.duing.domain.club.service.dto.command.ProcessRecertificationCommand;
import com.duing.domain.club.service.dto.query.CentralClubRecertificationStatusQuery;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
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
class GeneralRecertificationRequestServiceTest {

    @Autowired RecertificationRequestService requestService;
    @Autowired RecertificationRoundService roundService;
    @Autowired RecertificationRequestRepository requestRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired UserRepository userRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private User saveUser(UserRole role) {
        long seq = sequence.incrementAndGet();
        return userRepository.save(User.create("20" + seq, "U" + seq,
                "u" + seq + "@duing.ac.kr", "h", role,
                Grade.FRESHMAN, College.IT_ENGINEERING, "미설정", "010-0000-0000", LocalDateTime.now()));
    }

    private Club saveCentralClub(boolean central) {
        Club club = clubRepository.save(Club.create("C" + sequence.incrementAndGet(),
                ClubCategory.ACADEMIC, null, "설명", null));
        if (central) {
            club.changeCentralClub(true);
            clubRepository.save(club);
        }
        return club;
    }

    private Long openRound(int year, User admin) {
        return roundService.open(new OpenRoundCommand(year, year + " 라운드", admin.getId()));
    }

    @Test
    @DisplayName("LEADER 가 중앙동아리 재인증을 제출하면 PENDING 으로 저장된다")
    void createSucceeds() {
        User admin = saveUser(UserRole.ADMIN);
        User leader = saveUser(UserRole.STUDENT);
        Club club = saveCentralClub(true);
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        openRound(2026, admin);

        Long id = requestService.create(new CreateRecertificationCommand(
                club.getId(), leader.getId(),
                "leader@example.com", "010-1234-5678", 2026, "메모"));

        RecertificationRequest saved = requestRepository.findById(id).orElseThrow();
        assertThat(saved.getStatus()).isEqualTo(RecertificationStatus.PENDING);
        assertThat(saved.getLeaderUserId()).isEqualTo(leader.getId());
    }

    @Test
    @DisplayName("비-중앙동아리 제출은 400")
    void notCentralFails() {
        User admin = saveUser(UserRole.ADMIN);
        User leader = saveUser(UserRole.STUDENT);
        Club club = saveCentralClub(false);
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        openRound(2026, admin);

        assertThatThrownBy(() -> requestService.create(new CreateRecertificationCommand(
                club.getId(), leader.getId(),
                "leader@example.com", "010-1234-5678", 2026, null)))
                .isInstanceOf(ClubException.NotCentralClubException.class);
    }

    @Test
    @DisplayName("OPEN 라운드가 없으면 400")
    void noOpenRoundFails() {
        User leader = saveUser(UserRole.STUDENT);
        Club club = saveCentralClub(true);
        clubMemberRepository.save(ClubMember.asLeader(club, leader));

        assertThatThrownBy(() -> requestService.create(new CreateRecertificationCommand(
                club.getId(), leader.getId(),
                "leader@example.com", "010-1234-5678", 2026, null)))
                .isInstanceOf(ClubException.NoOpenRoundException.class);
    }

    @Test
    @DisplayName("동일 round×club PENDING 중복은 409")
    void duplicatePendingFails() {
        User admin = saveUser(UserRole.ADMIN);
        User leader = saveUser(UserRole.STUDENT);
        Club club = saveCentralClub(true);
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        openRound(2026, admin);
        CreateRecertificationCommand command = new CreateRecertificationCommand(
                club.getId(), leader.getId(),
                "leader@example.com", "010-1234-5678", 2026, null);
        requestService.create(command);

        assertThatThrownBy(() -> requestService.create(command))
                .isInstanceOf(ClubException.DuplicatePendingRecertificationException.class);
    }

    @Test
    @DisplayName("APPROVED 처리 시 club.lastVerifiedYear 가 round.year 로 갱신된다")
    void approvedUpdatesLastVerifiedYear() {
        User admin = saveUser(UserRole.ADMIN);
        User leader = saveUser(UserRole.STUDENT);
        Club club = saveCentralClub(true);
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        openRound(2026, admin);
        Long requestId = requestService.create(new CreateRecertificationCommand(
                club.getId(), leader.getId(),
                "leader@example.com", "010-1234-5678", 2026, null));

        requestService.process(new ProcessRecertificationCommand(
                requestId, admin.getId(), RecertificationStatus.APPROVED, "확인"));

        Club updated = clubRepository.findById(club.getId()).orElseThrow();
        assertThat(updated.getLastVerifiedYear()).isEqualTo(2026);
        RecertificationRequest processed = requestRepository.findById(requestId).orElseThrow();
        assertThat(processed.getStatus()).isEqualTo(RecertificationStatus.APPROVED);
    }

    @Test
    @DisplayName("REJECTED 처리 시 club.lastVerifiedYear 는 변경되지 않는다")
    void rejectedKeepsLastVerifiedYear() {
        User admin = saveUser(UserRole.ADMIN);
        User leader = saveUser(UserRole.STUDENT);
        Club club = saveCentralClub(true);
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        openRound(2026, admin);
        Long requestId = requestService.create(new CreateRecertificationCommand(
                club.getId(), leader.getId(),
                "leader@example.com", "010-1234-5678", 2026, null));

        requestService.process(new ProcessRecertificationCommand(
                requestId, admin.getId(), RecertificationStatus.REJECTED, "거절"));

        Club updated = clubRepository.findById(club.getId()).orElseThrow();
        assertThat(updated.getLastVerifiedYear()).isNull();
    }

    @Test
    @DisplayName("RC-5 EXPIRED 조회 — lastVerifiedYear < operatingYear 인 중앙동아리만 expired=true")
    void rc5ExpiredFilter() {
        Club expired = saveCentralClub(true);
        Club verified = saveCentralClub(true);
        verified.updateLastVerifiedYear(2026);
        clubRepository.save(verified);
        Club nonCentral = saveCentralClub(false);

        var page = requestService.findCentralClubStatuses(
                new CentralClubRecertificationStatusQuery(2026), PageRequest.of(0, 50));

        var ids = page.getContent().stream()
                .map(CentralClubRecertificationStatusResponse::clubId)
                .toList();
        assertThat(ids).contains(expired.getId(), verified.getId())
                .doesNotContain(nonCentral.getId());
        assertThat(page.getContent().stream()
                .filter(r -> r.clubId().equals(expired.getId()))
                .findFirst().orElseThrow().expired()).isTrue();
        assertThat(page.getContent().stream()
                .filter(r -> r.clubId().equals(verified.getId()))
                .findFirst().orElseThrow().expired()).isFalse();
    }
}
