package com.duing.domain.interview.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.InterviewAvailabilityFixture;
import com.duing.common.fixture.InterviewScheduleFixture;
import com.duing.common.fixture.InterviewSlotFixture;
import com.duing.domain.application.entity.Application;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.interview.entity.InterviewConfig;
import com.duing.domain.interview.entity.InterviewSlot;
import com.duing.domain.interview.exception.InterviewException;
import com.duing.domain.interview.repository.InterviewAvailabilityRepository;
import com.duing.domain.interview.repository.InterviewConfigRepository;
import com.duing.domain.interview.repository.InterviewScheduleRepository;
import com.duing.domain.interview.repository.InterviewSlotRepository;
import com.duing.domain.interview.service.dto.command.CreateInterviewSlotsCommand;
import com.duing.domain.interview.service.dto.command.CreateInterviewSlotsCommand.SlotEntry;
import com.duing.domain.interview.service.dto.command.UpdateInterviewSlotCommand;
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
import java.time.temporal.ChronoUnit;
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
    @Autowired private InterviewAvailabilityRepository availabilityRepository;
    @Autowired private InterviewScheduleRepository scheduleRepository;
    @Autowired private ApplicationRepository applicationRepository;
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
        assertThat(slotRepository.findByRecruitmentIdOrderByStartTimeAsc(recruitment.getId())).hasSize(2);
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
    @DisplayName("모집이 이미 시작되었어도 phase 1(가용시간 제출 단계) 이면 슬롯 생성이 허용된다 — 새 lifecycle 정책")
    void allowsSlotCreationAfterRecruitmentStartIfPhase1() {
        Club club = saveActiveClub("동아리C");
        User leader = saveUser();
        saveLeaderMembership(club, leader);
        // startDate 가 오늘 이전 → 이전 정책에서는 차단되던 케이스
        Recruitment recruitment = saveRecruitment(club, LocalDate.now().minusDays(1), LocalDate.now().plusDays(30));
        saveInterviewConfig(recruitment); // availabilityDeadline = now+7d → phase 1

        LocalDateTime base = LocalDateTime.now().plusDays(5);
        List<SlotEntry> slots = List.of(new SlotEntry(base, base.plusHours(1), 3));

        List<Long> slotIds = interviewSlotService.createBulk(
                new CreateInterviewSlotsCommand(recruitment.getId(), leader.getId(), slots));

        assertThat(slotIds).hasSize(1);
    }

    @Test
    @DisplayName("자동배정이 완료된(phase 3) 모집에 슬롯을 생성하면 409 SlotCreationNotAllowedInCurrentPhase 가 반환된다")
    void throwsSlotCreationNotAllowedWhenPhase3() {
        Club club = saveActiveClub("동아리C2");
        User leader = saveUser();
        saveLeaderMembership(club, leader);
        Recruitment recruitment = saveRecruitment(club, LocalDate.now().plusDays(1), LocalDate.now().plusDays(30));
        InterviewConfig config = saveInterviewConfig(recruitment);
        config.markAssignmentCompleted(LocalDateTime.now());
        entityManager.flush();
        entityManager.clear();

        LocalDateTime base = LocalDateTime.now().plusDays(5);
        List<SlotEntry> slots = List.of(new SlotEntry(base, base.plusHours(1), 3));

        assertThatThrownBy(() -> interviewSlotService.createBulk(
                new CreateInterviewSlotsCommand(recruitment.getId(), leader.getId(), slots)))
                .isInstanceOf(InterviewException.SlotCreationNotAllowedInCurrentPhase.class);
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

    @Test
    @DisplayName("슬롯별 availability 수와 ASSIGNED schedule 수가 양수일 때 정확히 카운트된다")
    void listSlotsCountsAvailabilityAndAssignedCorrectly() {
        Club club = saveActiveClub("동아리E");
        User leader = saveUser();
        User applicant1 = saveUser();
        User applicant2 = saveUser();
        saveLeaderMembership(club, leader);

        Recruitment recruitment = saveRecruitment(club, LocalDate.now().plusDays(1), LocalDate.now().plusDays(30));
        saveInterviewConfig(recruitment);

        LocalDateTime base = LocalDateTime.now().truncatedTo(ChronoUnit.MICROS).plusDays(5);
        InterviewSlot slotA = slotRepository.save(InterviewSlotFixture.create(recruitment.getId(), base, 5));
        InterviewSlot slotB = slotRepository.save(InterviewSlotFixture.create(recruitment.getId(), base.plusHours(2), 3));

        // 지원자 2명
        Application app1 = applicationRepository.save(
                Application.submit(recruitment, applicant1, List.of("답변1")));
        Application app2 = applicationRepository.save(
                Application.submit(recruitment, applicant2, List.of("답변2")));

        // Slot A: availability 1건 + ASSIGNED schedule 1건
        entityManager.persist(InterviewAvailabilityFixture.link(app1.getId(), slotA.getId(), recruitment.getId()));
        entityManager.persist(InterviewScheduleFixture.assigned(app2.getId(), slotA.getId(), recruitment.getId()));

        // Slot B: 아무것도 없음
        entityManager.flush();
        entityManager.clear();

        List<SlotListView> result = interviewSlotService.listByRecruitment(recruitment.getId(), leader.getId());

        assertThat(result).hasSize(2);
        SlotListView resultSlotA = result.stream()
                .filter(view -> view.startTime().equals(slotA.getStartTime()))
                .findFirst()
                .orElseThrow();
        SlotListView resultSlotB = result.stream()
                .filter(view -> view.startTime().equals(slotB.getStartTime()))
                .findFirst()
                .orElseThrow();

        assertThat(resultSlotA.availabilityCount()).isEqualTo(1L);
        assertThat(resultSlotA.assignedCount()).isEqualTo(1L);
        assertThat(resultSlotB.availabilityCount()).isEqualTo(0L);
        assertThat(resultSlotB.assignedCount()).isEqualTo(0L);
    }

    @Test
    @DisplayName("CANCELLED 상태 InterviewSchedule 은 assignedCount 에 포함되지 않는다")
    void cancelledScheduleIsNotCountedInAssigned() {
        Club club = saveActiveClub("동아리F");
        User leader = saveUser();
        User applicant = saveUser();
        saveLeaderMembership(club, leader);

        Recruitment recruitment = saveRecruitment(club, LocalDate.now().plusDays(1), LocalDate.now().plusDays(30));
        saveInterviewConfig(recruitment);

        LocalDateTime base = LocalDateTime.now().truncatedTo(ChronoUnit.MICROS).plusDays(5);
        InterviewSlot slot = slotRepository.save(InterviewSlotFixture.create(recruitment.getId(), base, 5));

        Application application = applicationRepository.save(
                Application.submit(recruitment, applicant, List.of("답변")));

        // ASSIGNED schedule 생성
        var schedule = InterviewScheduleFixture.assigned(application.getId(), slot.getId(), recruitment.getId());
        entityManager.persist(schedule);
        entityManager.flush();

        // 상태를 CANCELLED 로 변경
        schedule.cancel();
        entityManager.merge(schedule);

        entityManager.flush();
        entityManager.clear();

        List<SlotListView> result = interviewSlotService.listByRecruitment(recruitment.getId(), leader.getId());

        assertThat(result).hasSize(1);
        assertThat(result.get(0).assignedCount()).isEqualTo(0L);
    }

    // ── M5: 슬롯 수정 ────────────────────────────────────────────────────────────

    @Test
    @DisplayName("availability 가 없는 슬롯의 시간 수정은 허용된다")
    void updatesSlotTimeWhenNoAvailability() {
        Club club = saveActiveClub("수정테스트동아리A");
        User leader = saveUser();
        saveLeaderMembership(club, leader);
        Recruitment recruitment = saveRecruitment(club, LocalDate.now().plusDays(1), LocalDate.now().plusDays(30));
        saveInterviewConfig(recruitment);

        LocalDateTime base = LocalDateTime.now().truncatedTo(ChronoUnit.MICROS).plusDays(5);
        InterviewSlot slot = slotRepository.save(InterviewSlotFixture.create(recruitment.getId(), base, 5));
        entityManager.flush();
        entityManager.clear();

        LocalDateTime newStart = base.plusDays(1);
        LocalDateTime newEnd = newStart.plusHours(2);
        interviewSlotService.update(new UpdateInterviewSlotCommand(
                slot.getId(), leader.getId(), newStart, newEnd, null));

        entityManager.flush();
        entityManager.clear();
        InterviewSlot updated = slotRepository.findById(slot.getId()).orElseThrow();
        assertThat(updated.getStartTime()).isEqualTo(newStart);
        assertThat(updated.getEndTime()).isEqualTo(newEnd);
    }

    @Test
    @DisplayName("phase 1 에서 availability 가 있는 슬롯의 시간 수정은 409 SlotTimeChangeForbiddenForSelectedSlot 가 반환된다")
    void throwsTimeChangeForbiddenWhenPhase1SelectedSlot() {
        Club club = saveActiveClub("수정테스트동아리B");
        User leader = saveUser();
        User applicant = saveUser();
        saveLeaderMembership(club, leader);
        Recruitment recruitment = saveRecruitment(club, LocalDate.now().plusDays(1), LocalDate.now().plusDays(30));
        saveInterviewConfig(recruitment); // availabilityDeadline = now+7d → phase 1

        LocalDateTime base = LocalDateTime.now().plusDays(5);
        InterviewSlot slot = slotRepository.save(InterviewSlotFixture.create(recruitment.getId(), base, 5));
        Application application = applicationRepository.save(
                Application.submit(recruitment, applicant, List.of("답변")));
        entityManager.persist(InterviewAvailabilityFixture.link(application.getId(), slot.getId(), recruitment.getId()));
        entityManager.flush();
        entityManager.clear();

        assertThatThrownBy(() -> interviewSlotService.update(new UpdateInterviewSlotCommand(
                slot.getId(), leader.getId(), base.plusDays(1), base.plusDays(1).plusHours(2), null)))
                .isInstanceOf(InterviewException.SlotTimeChangeForbiddenForSelectedSlot.class);
    }

    @Test
    @DisplayName("phase 1 에서 availability 가 있는 슬롯의 capacity 만 변경하면 정상 동작한다")
    void allowsCapacityOnlyUpdateWhenPhase1SelectedSlot() {
        Club club = saveActiveClub("수정테스트동아리B2");
        User leader = saveUser();
        User applicant = saveUser();
        saveLeaderMembership(club, leader);
        Recruitment recruitment = saveRecruitment(club, LocalDate.now().plusDays(1), LocalDate.now().plusDays(30));
        saveInterviewConfig(recruitment); // phase 1

        LocalDateTime base = LocalDateTime.now().plusDays(5);
        InterviewSlot slot = slotRepository.save(InterviewSlotFixture.create(recruitment.getId(), base, 5));
        Application application = applicationRepository.save(
                Application.submit(recruitment, applicant, List.of("답변")));
        entityManager.persist(InterviewAvailabilityFixture.link(application.getId(), slot.getId(), recruitment.getId()));
        entityManager.flush();
        entityManager.clear();

        interviewSlotService.update(new UpdateInterviewSlotCommand(
                slot.getId(), leader.getId(), null, null, 8));

        entityManager.flush();
        entityManager.clear();
        InterviewSlot updated = slotRepository.findById(slot.getId()).orElseThrow();
        assertThat(updated.getCapacity()).isEqualTo(8);
    }

    @Test
    @DisplayName("phase 2 에서 availability 가 있는 슬롯의 capacity 변경도 409 SlotModificationNotAllowedInCurrentPhase 가 반환된다")
    void throwsModificationNotAllowedWhenPhase2SelectedSlot() {
        Club club = saveActiveClub("수정테스트동아리B3");
        User leader = saveUser();
        User applicant = saveUser();
        saveLeaderMembership(club, leader);
        Recruitment recruitment = saveRecruitment(club, LocalDate.now().plusDays(1), LocalDate.now().plusDays(30));
        // phase 2: 마감일이 이미 지남, 아직 자동배정 안 됨
        InterviewConfig config = configRepository.save(
                InterviewConfig.create(recruitment.getId(), LocalDateTime.now().minusHours(1)));

        LocalDateTime base = LocalDateTime.now().plusDays(5);
        InterviewSlot slot = slotRepository.save(InterviewSlotFixture.create(recruitment.getId(), base, 5));
        Application application = applicationRepository.save(
                Application.submit(recruitment, applicant, List.of("답변")));
        entityManager.persist(InterviewAvailabilityFixture.link(application.getId(), slot.getId(), recruitment.getId()));
        entityManager.flush();
        entityManager.clear();

        assertThatThrownBy(() -> interviewSlotService.update(new UpdateInterviewSlotCommand(
                slot.getId(), leader.getId(), null, null, 10)))
                .isInstanceOf(InterviewException.SlotModificationNotAllowedInCurrentPhase.class);
    }

    @Test
    @DisplayName("phase 3(자동배정 완료) 에서는 빈 슬롯이라도 수정이 409 SlotModificationNotAllowedInCurrentPhase 로 차단된다")
    void throwsModificationNotAllowedWhenPhase3() {
        Club club = saveActiveClub("수정테스트동아리B4");
        User leader = saveUser();
        saveLeaderMembership(club, leader);
        Recruitment recruitment = saveRecruitment(club, LocalDate.now().plusDays(1), LocalDate.now().plusDays(30));
        InterviewConfig config = saveInterviewConfig(recruitment);
        config.markAssignmentCompleted(LocalDateTime.now());

        LocalDateTime base = LocalDateTime.now().plusDays(5);
        InterviewSlot slot = slotRepository.save(InterviewSlotFixture.create(recruitment.getId(), base, 5));
        entityManager.flush();
        entityManager.clear();

        assertThatThrownBy(() -> interviewSlotService.update(new UpdateInterviewSlotCommand(
                slot.getId(), leader.getId(), null, null, 10)))
                .isInstanceOf(InterviewException.SlotModificationNotAllowedInCurrentPhase.class);
    }

    @Test
    @DisplayName("capacity 증가는 항상 허용된다")
    void increasesCapacityAlways() {
        Club club = saveActiveClub("수정테스트동아리C");
        User leader = saveUser();
        saveLeaderMembership(club, leader);
        Recruitment recruitment = saveRecruitment(club, LocalDate.now().plusDays(1), LocalDate.now().plusDays(30));
        saveInterviewConfig(recruitment);

        LocalDateTime base = LocalDateTime.now().plusDays(5);
        InterviewSlot slot = slotRepository.save(InterviewSlotFixture.create(recruitment.getId(), base, 2));
        entityManager.flush();
        entityManager.clear();

        interviewSlotService.update(new UpdateInterviewSlotCommand(
                slot.getId(), leader.getId(), null, null, 10));

        entityManager.flush();
        entityManager.clear();
        InterviewSlot updated = slotRepository.findById(slot.getId()).orElseThrow();
        assertThat(updated.getCapacity()).isEqualTo(10);
    }

    @Test
    @DisplayName("capacity 감소가 현재 assigned 수보다 작으면 409 CapacityBelowAssigned 가 반환된다")
    void throwsCapacityBelowAssignedWhenReducingCapacityBelowAssignedCount() {
        Club club = saveActiveClub("수정테스트동아리D");
        User leader = saveUser();
        User applicant = saveUser();
        saveLeaderMembership(club, leader);
        Recruitment recruitment = saveRecruitment(club, LocalDate.now().plusDays(1), LocalDate.now().plusDays(30));
        saveInterviewConfig(recruitment);

        LocalDateTime base = LocalDateTime.now().plusDays(5);
        InterviewSlot slot = slotRepository.save(InterviewSlotFixture.create(recruitment.getId(), base, 5));
        Application application = applicationRepository.save(
                Application.submit(recruitment, applicant, List.of("답변")));
        entityManager.persist(InterviewScheduleFixture.assigned(application.getId(), slot.getId(), recruitment.getId()));
        entityManager.flush();
        entityManager.clear();

        // assignedCount == 1, 새 capacity == 0 → 차단
        assertThatThrownBy(() -> interviewSlotService.update(new UpdateInterviewSlotCommand(
                slot.getId(), leader.getId(), null, null, 0)))
                .isInstanceOf(InterviewException.CapacityBelowAssigned.class);
    }

    @Test
    @DisplayName("update 호출 시 존재하지 않는 slotId 면 404 SlotNotFound 가 반환된다")
    void updateThrowsSlotNotFoundForUnknownId() {
        Long leaderId = saveLeaderForRecruitment().getId();
        UpdateInterviewSlotCommand command = new UpdateInterviewSlotCommand(
                999_999L, leaderId, null, null, 3);

        assertThatThrownBy(() -> interviewSlotService.update(command))
                .isInstanceOf(InterviewException.SlotNotFound.class);
    }

    @Test
    @DisplayName("delete 호출 시 존재하지 않는 slotId 면 404 SlotNotFound 가 반환된다")
    void deleteThrowsSlotNotFoundForUnknownId() {
        Long leaderId = saveLeaderForRecruitment().getId();
        assertThatThrownBy(() -> interviewSlotService.delete(999_999L, leaderId))
                .isInstanceOf(InterviewException.SlotNotFound.class);
    }

    // ── M6: 슬롯 삭제 ────────────────────────────────────────────────────────────

    @Test
    @DisplayName("availability 가 없고 schedule 도 없는 슬롯은 삭제할 수 있다")
    void deletesSlotWhenNoAvailabilityAndNoSchedule() {
        Club club = saveActiveClub("삭제테스트동아리A");
        User leader = saveUser();
        saveLeaderMembership(club, leader);
        Recruitment recruitment = saveRecruitment(club, LocalDate.now().plusDays(1), LocalDate.now().plusDays(30));
        saveInterviewConfig(recruitment);

        LocalDateTime base = LocalDateTime.now().plusDays(5);
        InterviewSlot slot = slotRepository.save(InterviewSlotFixture.create(recruitment.getId(), base, 5));
        entityManager.flush();
        entityManager.clear();

        interviewSlotService.delete(slot.getId(), leader.getId());
        entityManager.flush();
        entityManager.clear();

        assertThat(slotRepository.findById(slot.getId())).isEmpty();
    }

    @Test
    @DisplayName("availability 가 있는 슬롯 삭제는 409 SlotDeletionNotAllowedInCurrentPhase 가 반환된다")
    void throwsSlotDeletionNotAllowedWhenSelectedSlot() {
        Club club = saveActiveClub("삭제테스트동아리B");
        User leader = saveUser();
        User applicant = saveUser();
        saveLeaderMembership(club, leader);
        Recruitment recruitment = saveRecruitment(club, LocalDate.now().plusDays(1), LocalDate.now().plusDays(30));
        saveInterviewConfig(recruitment);

        LocalDateTime base = LocalDateTime.now().plusDays(5);
        InterviewSlot slot = slotRepository.save(InterviewSlotFixture.create(recruitment.getId(), base, 5));
        Application application = applicationRepository.save(
                Application.submit(recruitment, applicant, List.of("답변")));
        entityManager.persist(InterviewAvailabilityFixture.link(application.getId(), slot.getId(), recruitment.getId()));
        entityManager.flush();
        entityManager.clear();

        assertThatThrownBy(() -> interviewSlotService.delete(slot.getId(), leader.getId()))
                .isInstanceOf(InterviewException.SlotDeletionNotAllowedInCurrentPhase.class);
    }

    @Test
    @DisplayName("phase 3(자동배정 완료) 에서는 빈 슬롯이라도 삭제가 409 SlotDeletionNotAllowedInCurrentPhase 로 차단된다")
    void throwsSlotDeletionNotAllowedWhenPhase3() {
        Club club = saveActiveClub("삭제테스트동아리D");
        User leader = saveUser();
        saveLeaderMembership(club, leader);
        Recruitment recruitment = saveRecruitment(club, LocalDate.now().plusDays(1), LocalDate.now().plusDays(30));
        InterviewConfig config = saveInterviewConfig(recruitment);
        config.markAssignmentCompleted(LocalDateTime.now());

        LocalDateTime base = LocalDateTime.now().plusDays(5);
        InterviewSlot slot = slotRepository.save(InterviewSlotFixture.create(recruitment.getId(), base, 5));
        entityManager.flush();
        entityManager.clear();

        assertThatThrownBy(() -> interviewSlotService.delete(slot.getId(), leader.getId()))
                .isInstanceOf(InterviewException.SlotDeletionNotAllowedInCurrentPhase.class);
    }

    @Test
    @DisplayName("phase 2(마감 후 자동배정 전) 의 빈 슬롯 삭제는 정상 동작한다")
    void allowsDeleteWhenPhase2EmptySlot() {
        Club club = saveActiveClub("삭제테스트동아리E");
        User leader = saveUser();
        saveLeaderMembership(club, leader);
        Recruitment recruitment = saveRecruitment(club, LocalDate.now().plusDays(1), LocalDate.now().plusDays(30));
        // phase 2: 마감일이 이미 지남, 자동배정은 아직 안 됨
        configRepository.save(InterviewConfig.create(recruitment.getId(), LocalDateTime.now().minusHours(1)));

        LocalDateTime base = LocalDateTime.now().plusDays(5);
        InterviewSlot slot = slotRepository.save(InterviewSlotFixture.create(recruitment.getId(), base, 5));
        entityManager.flush();
        entityManager.clear();

        interviewSlotService.delete(slot.getId(), leader.getId());
        entityManager.flush();
        entityManager.clear();

        assertThat(slotRepository.findById(slot.getId())).isEmpty();
    }

    @Test
    @DisplayName("schedule 이 ASSIGNED 인 슬롯 삭제는 409 SlotHasSchedule 가 반환된다")
    void throwsSlotHasScheduleWhenDeletingSlotWithAssignedSchedule() {
        Club club = saveActiveClub("삭제테스트동아리C");
        User leader = saveUser();
        User applicant = saveUser();
        saveLeaderMembership(club, leader);
        Recruitment recruitment = saveRecruitment(club, LocalDate.now().plusDays(1), LocalDate.now().plusDays(30));
        saveInterviewConfig(recruitment);

        LocalDateTime base = LocalDateTime.now().plusDays(5);
        InterviewSlot slot = slotRepository.save(InterviewSlotFixture.create(recruitment.getId(), base, 5));
        Application application = applicationRepository.save(
                Application.submit(recruitment, applicant, List.of("답변")));
        entityManager.persist(InterviewScheduleFixture.assigned(application.getId(), slot.getId(), recruitment.getId()));
        entityManager.flush();
        entityManager.clear();

        assertThatThrownBy(() -> interviewSlotService.delete(slot.getId(), leader.getId()))
                .isInstanceOf(InterviewException.SlotHasSchedule.class);
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

    private User saveLeaderForRecruitment() {
        Club club = saveActiveClub("리더테스트동아리");
        User leader = saveUser();
        saveLeaderMembership(club, leader);
        saveRecruitment(club, LocalDate.now().plusDays(1), LocalDate.now().plusDays(30));
        return leader;
    }
}
