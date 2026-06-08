package com.duing.domain.interview.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.InterviewSlotFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.interview.entity.InterviewConfig;
import com.duing.domain.interview.entity.InterviewSlot;
import com.duing.domain.interview.exception.InterviewException;
import com.duing.domain.interview.repository.InterviewConfigRepository;
import com.duing.domain.interview.repository.InterviewSlotRepository;
import com.duing.domain.interview.service.dto.command.CreateInterviewSlotsCommand;
import com.duing.domain.interview.service.dto.command.CreateInterviewSlotsCommand.SlotEntry;
import com.duing.domain.interview.service.dto.query.SlotListView;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import jakarta.persistence.EntityManager;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.annotation.Transactional;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@Transactional
class InterviewSlotServiceTest {

    @Autowired private InterviewSlotService interviewSlotService;
    @Autowired private InterviewSlotRepository slotRepository;
    @Autowired private InterviewConfigRepository configRepository;
    @Autowired private RecruitmentRepository recruitmentRepository;
    @Autowired private ClubRepository clubRepository;
    @Autowired private ClubMemberRepository clubMemberRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private EntityManager entityManager;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Test
    @DisplayName("운영진이 모집 시작 전 슬롯을 bulk 로 생성하면 모두 저장된다")
    void createsBulkSlotsBeforeRecruitmentStarts() {
        Club club = saveActiveClub("동아리A");
        User leader = saveUser();
        saveLeaderMembership(club, leader);
        Recruitment recruitment = saveRecruitment(club, LocalDate.now().plusDays(1), LocalDate.now().plusDays(30));
        saveInterviewConfig(recruitment);

        LocalDateTime base = LocalDateTime.now().plusDays(5);
        List<SlotEntry> slots = List.of(
                new SlotEntry(base, base.plusHours(1), 3),
                new SlotEntry(base.plusHours(2), base.plusHours(3), 2)
        );

        List<Long> slotIds = interviewSlotService.createBulk(
                new CreateInterviewSlotsCommand(recruitment.getId(), leader.getId(), slots));

        assertThat(slotIds).hasSize(2);
        assertThat(slotRepository.findAll()).hasSize(2);
    }

    @Test
    @DisplayName("InterviewConfig 가 없는 모집에 슬롯을 생성하면 404 InterviewConfigNotFound 가 반환된다")
    void throwsInterviewConfigNotFoundWhenNoConfig() {
        Club club = saveActiveClub("동아리B");
        User leader = saveUser();
        saveLeaderMembership(club, leader);
        Recruitment recruitment = saveRecruitment(club, LocalDate.now().plusDays(1), LocalDate.now().plusDays(30));
        // 의도적으로 InterviewConfig 저장 안 함

        LocalDateTime base = LocalDateTime.now().plusDays(5);
        List<SlotEntry> slots = List.of(new SlotEntry(base, base.plusHours(1), 3));

        assertThatThrownBy(() -> interviewSlotService.createBulk(
                new CreateInterviewSlotsCommand(recruitment.getId(), leader.getId(), slots)))
                .isInstanceOf(InterviewException.InterviewConfigNotFound.class);
    }

    @Test
    @DisplayName("모집 시작 이후 슬롯 생성은 409 RecruitmentAlreadyStarted 가 반환된다")
    void throwsRecruitmentAlreadyStartedWhenPastStart() {
        Club club = saveActiveClub("동아리C");
        User leader = saveUser();
        saveLeaderMembership(club, leader);
        // startDate 가 오늘 이전 → 모집 이미 시작됨
        Recruitment recruitment = saveRecruitment(club, LocalDate.now().minusDays(1), LocalDate.now().plusDays(30));
        saveInterviewConfig(recruitment);

        LocalDateTime base = LocalDateTime.now().plusDays(5);
        List<SlotEntry> slots = List.of(new SlotEntry(base, base.plusHours(1), 3));

        assertThatThrownBy(() -> interviewSlotService.createBulk(
                new CreateInterviewSlotsCommand(recruitment.getId(), leader.getId(), slots)))
                .isInstanceOf(InterviewException.RecruitmentAlreadyStarted.class);
    }

    @Test
    @DisplayName("슬롯 목록 조회는 슬롯별 availability 수와 assigned 수를 포함한다")
    void listSlotsIncludesAvailabilityAndAssignedCounts() {
        Club club = saveActiveClub("동아리D");
        User leader = saveUser();
        saveLeaderMembership(club, leader);
        Recruitment recruitment = saveRecruitment(club, LocalDate.now().plusDays(1), LocalDate.now().plusDays(30));
        saveInterviewConfig(recruitment);

        LocalDateTime base = LocalDateTime.now().plusDays(5);
        slotRepository.save(InterviewSlotFixture.create(recruitment.getId(), base, 5));
        slotRepository.save(InterviewSlotFixture.create(recruitment.getId(), base.plusHours(2), 3));
        entityManager.flush();
        entityManager.clear();

        List<SlotListView> result = interviewSlotService.listByRecruitment(
                recruitment.getId(), leader.getId());

        // 슬롯 2개가 반환되고, availability/assigned 는 0 (아직 배정 없음)
        assertThat(result).hasSize(2);
        assertThat(result).allSatisfy(view -> {
            assertThat(view.availabilityCount()).isEqualTo(0L);
            assertThat(view.assignedCount()).isEqualTo(0L);
        });
        // startTime 오름차순 정렬 확인
        assertThat(result.get(0).startTime()).isBefore(result.get(1).startTime());
    }

    // ── 헬퍼 ────────────────────────────────────────────────────────────────────

    private Club saveActiveClub(String name) {
        return clubRepository.save(Club.create(name, ClubCategory.ACADEMIC, null, "설명", null));
    }

    private User saveUser() {
        long seq = sequence.incrementAndGet();
        return userRepository.save(User.create(
                "20" + seq, "유저" + seq, "u" + seq + "@duing.ac.kr",
                "hash", UserRole.STUDENT,
                Grade.FRESHMAN, College.IT_ENGINEERING, "미설정", "010-0000-0000",
                LocalDateTime.now()));
    }

    private void saveLeaderMembership(Club club, User user) {
        clubMemberRepository.save(ClubMember.asLeader(club, user));
    }

    private Recruitment saveRecruitment(Club club, LocalDate startDate, LocalDate endDate) {
        return recruitmentRepository.save(
                Recruitment.create(club, "테스트 모집", "내용", startDate, endDate, 10));
    }

    private InterviewConfig saveInterviewConfig(Recruitment recruitment) {
        return configRepository.save(
                InterviewConfig.create(recruitment.getId(), LocalDateTime.now().plusDays(7)));
    }
}
