package com.duing.domain.promotion.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.promotion.entity.PromotionRequest;
import com.duing.domain.promotion.entity.PromotionRequestStatus;
import com.duing.domain.promotion.exception.PromotionException;
import com.duing.domain.promotion.repository.PromotionRequestRepository;
import com.duing.domain.promotion.service.dto.command.CreatePromotionRequestCommand;
import com.duing.domain.promotion.service.dto.command.ProcessPromotionRequestCommand;
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
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.transaction.annotation.Transactional;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@Transactional
@DirtiesContext
class GeneralPromotionRequestServiceTest {

    @Autowired PromotionRequestService requestService;
    @Autowired PromotionRequestRepository requestRepository;
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

    private Club saveClub() {
        return clubRepository.save(Club.create("C" + sequence.incrementAndGet(),
                ClubCategory.ACADEMIC, null, "설명", null));
    }

    @Test
    @DisplayName("LEADER 가 홍보 요청을 제출하면 PENDING 으로 저장된다")
    void createSucceeds() {
        User leader = saveUser(UserRole.STUDENT);
        Club club = saveClub();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));

        Long id = requestService.create(new CreatePromotionRequestCommand(
                club.getId(), leader.getId(),
                "타이틀", "설명", "/files/banner.png", "https://example.com"));

        PromotionRequest saved = requestRepository.findById(id).orElseThrow();
        assertThat(saved.getStatus()).isEqualTo(PromotionRequestStatus.PENDING);
        assertThat(saved.getRequesterUserId()).isEqualTo(leader.getId());
    }

    @Test
    @DisplayName("OFFICER 도 홍보 요청을 제출할 수 있다")
    void officerCanCreate() {
        User leader = saveUser(UserRole.STUDENT);
        User officer = saveUser(UserRole.STUDENT);
        Club club = saveClub();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        clubMemberRepository.save(ClubMember.of(club, officer, ClubMemberRole.OFFICER));

        Long id = requestService.create(new CreatePromotionRequestCommand(
                club.getId(), officer.getId(),
                "타이틀", "설명", null, null));
        assertThat(id).isPositive();
    }

    @Test
    @DisplayName("MEMBER 는 홍보 요청 제출이 거절된다")
    void memberCannotCreate() {
        User leader = saveUser(UserRole.STUDENT);
        User member = saveUser(UserRole.STUDENT);
        Club club = saveClub();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        clubMemberRepository.save(ClubMember.of(club, member, ClubMemberRole.MEMBER));

        assertThatThrownBy(() -> requestService.create(new CreatePromotionRequestCommand(
                club.getId(), member.getId(),
                "타이틀", "설명", null, null)))
                .isInstanceOf(org.springframework.security.access.AccessDeniedException.class);
    }

    @Test
    @DisplayName("동일 club PENDING 중복은 409")
    void duplicatePendingFails() {
        User leader = saveUser(UserRole.STUDENT);
        Club club = saveClub();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        CreatePromotionRequestCommand command = new CreatePromotionRequestCommand(
                club.getId(), leader.getId(), "T", "D", null, null);
        requestService.create(command);

        assertThatThrownBy(() -> requestService.create(command))
                .isInstanceOf(PromotionException.DuplicatePendingPromotionRequestException.class);
    }

    @Test
    @DisplayName("ACCEPTED 처리 시 status 변경 + handledBy/At 세팅")
    void processAccepted() {
        User leader = saveUser(UserRole.STUDENT);
        User admin = saveUser(UserRole.ADMIN);
        Club club = saveClub();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Long requestId = requestService.create(new CreatePromotionRequestCommand(
                club.getId(), leader.getId(), "T", "D", null, null));

        requestService.process(new ProcessPromotionRequestCommand(
                requestId, admin.getId(), PromotionRequestStatus.ACCEPTED, "확인"));

        PromotionRequest processed = requestRepository.findById(requestId).orElseThrow();
        assertThat(processed.getStatus()).isEqualTo(PromotionRequestStatus.ACCEPTED);
        assertThat(processed.getHandledBy()).isEqualTo(admin.getId());
        assertThat(processed.getHandledAt()).isNotNull();
    }

    @Test
    @DisplayName("종결된 요청 재PATCH 는 400")
    void processTerminalFails() {
        User leader = saveUser(UserRole.STUDENT);
        User admin = saveUser(UserRole.ADMIN);
        Club club = saveClub();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Long requestId = requestService.create(new CreatePromotionRequestCommand(
                club.getId(), leader.getId(), "T", "D", null, null));
        requestService.process(new ProcessPromotionRequestCommand(
                requestId, admin.getId(), PromotionRequestStatus.REJECTED, null));

        assertThatThrownBy(() -> requestService.process(new ProcessPromotionRequestCommand(
                requestId, admin.getId(), PromotionRequestStatus.ACCEPTED, null)))
                .isInstanceOf(PromotionException.InvalidPromotionRequestTransitionException.class);
    }
}
