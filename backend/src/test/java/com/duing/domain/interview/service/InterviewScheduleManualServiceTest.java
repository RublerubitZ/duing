package com.duing.domain.interview.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.interview.entity.InterviewSchedule;
import com.duing.domain.interview.entity.InterviewScheduleStatus;
import com.duing.domain.interview.entity.InterviewSlot;
import com.duing.domain.interview.event.InterviewCancelledEvent;
import com.duing.domain.interview.event.InterviewScheduledEvent;
import com.duing.domain.interview.event.InterviewUpdatedEvent;
import com.duing.domain.interview.exception.InterviewException;
import com.duing.domain.interview.repository.InterviewScheduleRepository;
import com.duing.domain.interview.repository.InterviewSlotRepository;
import com.duing.domain.interview.service.dto.command.AssignInterviewScheduleCommand;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.event.ApplicationEvents;
import org.springframework.test.context.event.RecordApplicationEvents;
import org.springframework.test.util.ReflectionTestUtils;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@RecordApplicationEvents
class InterviewScheduleManualServiceTest extends IntegrationTestBase {

    @Autowired private InterviewScheduleService interviewScheduleService;
    @Autowired private ApplicationRepository applicationRepository;
    @Autowired private InterviewSlotRepository slotRepository;
    @Autowired private InterviewScheduleRepository scheduleRepository;
    @Autowired private RecruitmentRepository recruitmentRepository;
    @Autowired private ClubRepository clubRepository;
    @Autowired private ClubMemberRepository clubMemberRepository;
    @Autowired private UserRepository userRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    // ── 헬퍼 ────────────────────────────────────────────────────────────────────

    private User saveUser(String nameSuffix) {
        long unique = sequence.incrementAndGet();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                nameSuffix + unique,
                "manual" + unique + "@daegu.ac.kr",
                "hashed",
                UserRole.STUDENT,
                Grade.FRESHMAN,
                College.IT_ENGINEERING,
                "미설정",
                "010-0000-0000",
                LocalDateTime.now()));
    }

    private Club saveActiveClub(String name) {
        Club club = Club.create(name + sequence.incrementAndGet(),
                ClubCategory.ACADEMIC, "공학계열", "설명", null);
        ReflectionTestUtils.setField(club, "status", ClubStatus.ACTIVE);
        return clubRepository.save(club);
    }

    private Recruitment saveOpenRecruitment(Club club) {
        LocalDate today = LocalDate.now();
        return recruitmentRepository.save(
                Recruitment.create(club, "모집" + sequence.incrementAndGet(),
                        null, today.minusDays(1), today.plusDays(7), 10));
    }

    private InterviewSlot saveSlot(Long recruitmentId, int capacity) {
        return slotRepository.save(InterviewSlot.create(
                recruitmentId,
                LocalDateTime.now().plusDays(7),
                LocalDateTime.now().plusDays(7).plusHours(1),
                capacity));
    }

    private Application saveInterviewPendingApplication(Recruitment recruitment, User user) {
        Application application = Application.submit(recruitment, user, List.of());
        ReflectionTestUtils.setField(application, "status", ApplicationStatus.INTERVIEW_PENDING);
        return applicationRepository.save(application);
    }

    // ── M9 테스트 ────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("INTERVIEW_PENDING 이 아닌 지원자에 PUT 호출 시 400 InvalidApplicationStatus 가 반환된다")
    void 비대상_상태_지원자_배정시_400() {
        Club club = saveActiveClub("동아리");
        User leader = saveUser("리더");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = saveOpenRecruitment(club);
        InterviewSlot slot = saveSlot(recruitment.getId(), 5);

        User applicant = saveUser("지원자");
        Application application = Application.submit(recruitment, applicant, List.of());
        // SUBMITTED 상태 그대로 저장 (INTERVIEW_PENDING 아님)
        applicationRepository.save(application);

        AssignInterviewScheduleCommand command = new AssignInterviewScheduleCommand(
                application.getId(), slot.getId(), leader.getId());

        assertThatThrownBy(() -> interviewScheduleService.assign(command))
                .isInstanceOf(InterviewException.InvalidApplicationStatus.class);
    }

    @Test
    @DisplayName("미배정 지원자에 PUT 호출 시 새 schedule 이 생성되고 InterviewScheduledEvent 가 발행된다")
    void 미배정_지원자_배정시_schedule_생성(@Autowired ApplicationEvents events) {
        Club club = saveActiveClub("동아리");
        User leader = saveUser("리더");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = saveOpenRecruitment(club);
        InterviewSlot slot = saveSlot(recruitment.getId(), 5);

        User applicant = saveUser("지원자");
        Application application = saveInterviewPendingApplication(recruitment, applicant);

        AssignInterviewScheduleCommand command = new AssignInterviewScheduleCommand(
                application.getId(), slot.getId(), leader.getId());

        interviewScheduleService.assign(command);

        InterviewSchedule saved = scheduleRepository.findByApplicationId(application.getId()).orElseThrow();
        assertThat(saved.getStatus()).isEqualTo(InterviewScheduleStatus.ASSIGNED);
        assertThat(saved.getSlotId()).isEqualTo(slot.getId());
        assertThat(saved.getAssignedAt()).isNotNull();
        assertThat(events.stream(InterviewScheduledEvent.class)).hasSize(1);
        assertThat(events.stream(InterviewUpdatedEvent.class)).isEmpty();
    }

    @Test
    @DisplayName("이미 ASSIGNED 인 지원자의 슬롯 이동은 InterviewUpdatedEvent 가 발행되고 assigned_at 이 갱신된다")
    void ASSIGNED_지원자_슬롯_이동시_assignedAt_갱신(@Autowired ApplicationEvents events) {
        Club club = saveActiveClub("동아리");
        User leader = saveUser("리더");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = saveOpenRecruitment(club);
        InterviewSlot slotA = saveSlot(recruitment.getId(), 5);
        InterviewSlot slotB = saveSlot(recruitment.getId(), 5);

        User applicant = saveUser("지원자");
        Application application = saveInterviewPendingApplication(recruitment, applicant);

        LocalDateTime originalAssignedAt = LocalDateTime.now().minusMinutes(10);
        InterviewSchedule existingSchedule = InterviewSchedule.create(
                application.getId(), slotA.getId(), recruitment.getId(), originalAssignedAt);
        scheduleRepository.save(existingSchedule);

        AssignInterviewScheduleCommand moveCommand = new AssignInterviewScheduleCommand(
                application.getId(), slotB.getId(), leader.getId());

        interviewScheduleService.assign(moveCommand);

        InterviewSchedule updated = scheduleRepository.findByApplicationId(application.getId()).orElseThrow();
        assertThat(updated.getSlotId()).isEqualTo(slotB.getId());
        assertThat(updated.getStatus()).isEqualTo(InterviewScheduleStatus.ASSIGNED);
        assertThat(updated.getAssignedAt()).isAfter(originalAssignedAt);
        assertThat(events.stream(InterviewUpdatedEvent.class)).hasSize(1);
        assertThat(events.stream(InterviewScheduledEvent.class)).isEmpty();
    }

    @Test
    @DisplayName("CANCELLED 인 지원자의 재배정은 InterviewScheduledEvent 가 발행되고 status 가 ASSIGNED 로 전환된다")
    void CANCELLED_schedule_재배정시_ASSIGNED로_전환(@Autowired ApplicationEvents events) {
        Club club = saveActiveClub("동아리");
        User leader = saveUser("리더");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = saveOpenRecruitment(club);
        InterviewSlot slot = saveSlot(recruitment.getId(), 5);

        User applicant = saveUser("지원자");
        Application application = saveInterviewPendingApplication(recruitment, applicant);

        InterviewSchedule cancelledSchedule = InterviewSchedule.create(
                application.getId(), slot.getId(), recruitment.getId(), LocalDateTime.now().minusDays(1));
        cancelledSchedule.cancel();
        scheduleRepository.save(cancelledSchedule);

        AssignInterviewScheduleCommand command = new AssignInterviewScheduleCommand(
                application.getId(), slot.getId(), leader.getId());

        interviewScheduleService.assign(command);

        InterviewSchedule result = scheduleRepository.findByApplicationId(application.getId()).orElseThrow();
        assertThat(result.getStatus()).isEqualTo(InterviewScheduleStatus.ASSIGNED);
        assertThat(events.stream(InterviewScheduledEvent.class)).hasSize(1);
        assertThat(events.stream(InterviewUpdatedEvent.class)).isEmpty();
    }

    @Test
    @DisplayName("같은 슬롯으로 재호출 시 이벤트가 발행되지 않는다")
    void 같은_슬롯_재호출시_이벤트_없음(@Autowired ApplicationEvents events) {
        Club club = saveActiveClub("동아리");
        User leader = saveUser("리더");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = saveOpenRecruitment(club);
        InterviewSlot slot = saveSlot(recruitment.getId(), 5);

        User applicant = saveUser("지원자");
        Application application = saveInterviewPendingApplication(recruitment, applicant);

        InterviewSchedule assignedSchedule = InterviewSchedule.create(
                application.getId(), slot.getId(), recruitment.getId(), LocalDateTime.now().minusMinutes(5));
        scheduleRepository.save(assignedSchedule);

        AssignInterviewScheduleCommand command = new AssignInterviewScheduleCommand(
                application.getId(), slot.getId(), leader.getId());

        interviewScheduleService.assign(command);

        assertThat(events.stream(InterviewScheduledEvent.class)).isEmpty();
        assertThat(events.stream(InterviewUpdatedEvent.class)).isEmpty();
    }

    @Test
    @DisplayName("target slot capacity 가 가득 차 있으면 409 CapacityExceeded 가 반환된다")
    void target_슬롯_정원_초과시_409() {
        Club club = saveActiveClub("동아리");
        User leader = saveUser("리더");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = saveOpenRecruitment(club);
        InterviewSlot slot = saveSlot(recruitment.getId(), 1);

        // 정원(1) 을 이미 채운 다른 지원자
        User occupant = saveUser("선점자");
        Application occupantApp = saveInterviewPendingApplication(recruitment, occupant);
        scheduleRepository.save(
                InterviewSchedule.create(occupantApp.getId(), slot.getId(), recruitment.getId(), LocalDateTime.now()));

        User lateApplicant = saveUser("후발자");
        Application lateApplication = saveInterviewPendingApplication(recruitment, lateApplicant);

        AssignInterviewScheduleCommand command = new AssignInterviewScheduleCommand(
                lateApplication.getId(), slot.getId(), leader.getId());

        assertThatThrownBy(() -> interviewScheduleService.assign(command))
                .isInstanceOf(InterviewException.CapacityExceeded.class);
    }

    // ── M10 테스트 ───────────────────────────────────────────────────────────────

    @Test
    @DisplayName("M10 호출 시 schedule 이 없으면 404 ScheduleNotFound 가 반환된다")
    void 일정_없는_지원자_취소시_404() {
        Club club = saveActiveClub("동아리");
        User leader = saveUser("리더");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = saveOpenRecruitment(club);

        User applicant = saveUser("지원자");
        Application application = saveInterviewPendingApplication(recruitment, applicant);

        assertThatThrownBy(() -> interviewScheduleService.cancel(application.getId(), leader.getId()))
                .isInstanceOf(InterviewException.ScheduleNotFound.class);
    }

    @Test
    @DisplayName("M10 호출 후 status 가 CANCELLED 로 변경되고 InterviewCancelledEvent 가 발행된다")
    void 취소_호출_후_status_CANCELLED_전환(@Autowired ApplicationEvents events) {
        Club club = saveActiveClub("동아리");
        User leader = saveUser("리더");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = saveOpenRecruitment(club);
        InterviewSlot slot = saveSlot(recruitment.getId(), 5);

        User applicant = saveUser("지원자");
        Application application = saveInterviewPendingApplication(recruitment, applicant);
        scheduleRepository.save(
                InterviewSchedule.create(application.getId(), slot.getId(), recruitment.getId(), LocalDateTime.now()));

        interviewScheduleService.cancel(application.getId(), leader.getId());

        InterviewSchedule cancelled = scheduleRepository.findByApplicationId(application.getId()).orElseThrow();
        assertThat(cancelled.getStatus()).isEqualTo(InterviewScheduleStatus.CANCELLED);
        assertThat(cancelled.getAssignedAt()).isNotNull(); // assigned_at 보존
        assertThat(events.stream(InterviewCancelledEvent.class)).hasSize(1);
    }

    // ── 동시성 테스트 ─────────────────────────────────────────────────────────────

    @Test
    @DisplayName("동시 수동 배정 호출 시 capacity 가 초과되지 않는다")
    void 동시_수동_배정_capacity_초과_방지() throws Exception {
        Club club = saveActiveClub("동아리");
        User leader = saveUser("리더");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = saveOpenRecruitment(club);
        InterviewSlot slot = saveSlot(recruitment.getId(), 1); // 정원 1

        User applicantA = saveUser("지원자A");
        User applicantB = saveUser("지원자B");
        Application applicationA = saveInterviewPendingApplication(recruitment, applicantA);
        Application applicationB = saveInterviewPendingApplication(recruitment, applicantB);

        AtomicInteger successCount = new AtomicInteger(0);
        AtomicInteger failCount = new AtomicInteger(0);

        ExecutorService executor = Executors.newFixedThreadPool(2);
        List<CompletableFuture<Void>> futures = new ArrayList<>();

        for (Application application : List.of(applicationA, applicationB)) {
            CompletableFuture<Void> future = CompletableFuture.runAsync(() -> {
                try {
                    AssignInterviewScheduleCommand command = new AssignInterviewScheduleCommand(
                            application.getId(), slot.getId(), leader.getId());
                    interviewScheduleService.assign(command);
                    successCount.incrementAndGet();
                } catch (InterviewException.CapacityExceeded capacityExceeded) {
                    failCount.incrementAndGet();
                } catch (Exception unexpectedException) {
                    // 비관적 락 타임아웃 등 예외도 실패로 집계
                    failCount.incrementAndGet();
                }
            }, executor);
            futures.add(future);
        }

        CompletableFuture.allOf(futures.toArray(new CompletableFuture[0])).join();
        executor.shutdown();

        long assignedCount = scheduleRepository.countBySlotIdAndStatus(
                slot.getId(), InterviewScheduleStatus.ASSIGNED);
        assertThat(assignedCount).isLessThanOrEqualTo(1);
        assertThat(successCount.get() + failCount.get()).isEqualTo(2);
        // 최소 1건은 성공해야 함
        assertThat(successCount.get()).isGreaterThanOrEqualTo(1);
    }
}
