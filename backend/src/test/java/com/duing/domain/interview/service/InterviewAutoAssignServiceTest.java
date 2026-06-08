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
import com.duing.domain.interview.controller.dto.response.AutoAssignResultResponse;
import com.duing.domain.interview.controller.dto.response.MatchingCandidatesResponse;
import com.duing.domain.interview.entity.InterviewAvailability;
import com.duing.domain.interview.entity.InterviewConfig;
import com.duing.domain.interview.entity.InterviewSchedule;
import com.duing.domain.interview.entity.InterviewScheduleStatus;
import com.duing.domain.interview.entity.InterviewSlot;
import com.duing.domain.interview.exception.InterviewException;
import com.duing.domain.interview.repository.InterviewAvailabilityRepository;
import com.duing.domain.interview.repository.InterviewConfigRepository;
import com.duing.domain.interview.repository.InterviewScheduleRepository;
import com.duing.domain.interview.repository.InterviewSlotRepository;
import com.duing.domain.interview.service.dto.query.ScheduleListView;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
class InterviewAutoAssignServiceTest extends IntegrationTestBase {

    @Autowired private InterviewScheduleService interviewScheduleService;
    @Autowired private ApplicationRepository applicationRepository;
    @Autowired private InterviewConfigRepository configRepository;
    @Autowired private InterviewSlotRepository slotRepository;
    @Autowired private InterviewAvailabilityRepository availabilityRepository;
    @Autowired private InterviewScheduleRepository scheduleRepository;
    @Autowired private RecruitmentRepository recruitmentRepository;
    @Autowired private ClubRepository clubRepository;
    @Autowired private ClubMemberRepository clubMemberRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private JdbcTemplate jdbcTemplate;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    // ── 헬퍼 ────────────────────────────────────────────────────────────────────

    private User saveUser(String nameSuffix) {
        long unique = sequence.incrementAndGet();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                nameSuffix + unique,
                "assign" + unique + "@daegu.ac.kr",
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

    private InterviewConfig saveConfigWithPastDeadline(Long recruitmentId) {
        return configRepository.save(
                InterviewConfig.create(recruitmentId, LocalDateTime.now().minusHours(1)));
    }

    private InterviewConfig saveConfigWithFutureDeadline(Long recruitmentId) {
        return configRepository.save(
                InterviewConfig.create(recruitmentId, LocalDateTime.now().plusDays(3)));
    }

    private InterviewSlot saveSlot(Long recruitmentId) {
        return slotRepository.save(InterviewSlot.create(
                recruitmentId,
                LocalDateTime.now().plusDays(7),
                LocalDateTime.now().plusDays(7).plusHours(1),
                5));
    }

    private Application saveInterviewPendingApplication(Recruitment recruitment, User user) {
        Application application = Application.submit(recruitment, user, List.of());
        // INTERVIEW_PENDING 으로 상태 변경
        ReflectionTestUtils.setField(application, "status", ApplicationStatus.INTERVIEW_PENDING);
        return applicationRepository.save(application);
    }

    private void saveAvailability(Long applicationId, Long slotId, Long recruitmentId) {
        availabilityRepository.save(InterviewAvailability.create(applicationId, slotId, recruitmentId));
    }

    // ── 테스트 ────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("availabilityDeadline 이전에 자동배정을 호출하면 409 AvailabilityPeriodOpen 이 반환된다")
    void 가용시간_마감_전_자동배정_호출시_409() {
        Club club = saveActiveClub("동아리");
        User leader = saveUser("리더");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = saveOpenRecruitment(club);
        saveConfigWithFutureDeadline(recruitment.getId());

        assertThatThrownBy(() -> interviewScheduleService.autoAssign(recruitment.getId(), leader.getId()))
                .isInstanceOf(InterviewException.AvailabilityPeriodOpen.class);
    }

    @Test
    @DisplayName("assignmentCompletedAt 이 채워진 모집에 재호출하면 409 AssignmentAlreadyCompleted 가 반환된다")
    void 배정_완료된_모집_재호출시_409() {
        Club club = saveActiveClub("동아리");
        User leader = saveUser("리더");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = saveOpenRecruitment(club);

        InterviewConfig config = saveConfigWithPastDeadline(recruitment.getId());
        config.markAssignmentCompleted(LocalDateTime.now());
        configRepository.save(config);

        assertThatThrownBy(() -> interviewScheduleService.autoAssign(recruitment.getId(), leader.getId()))
                .isInstanceOf(InterviewException.AssignmentAlreadyCompleted.class);
    }

    @Test
    @DisplayName("면접 슬롯이 없는 상태에서 자동배정을 호출하면 409 NoSlotsAvailable 이 반환된다")
    void 슬롯_없음_자동배정_호출시_409() {
        Club club = saveActiveClub("동아리");
        User leader = saveUser("리더");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = saveOpenRecruitment(club);
        saveConfigWithPastDeadline(recruitment.getId());

        assertThatThrownBy(() -> interviewScheduleService.autoAssign(recruitment.getId(), leader.getId()))
                .isInstanceOf(InterviewException.NoSlotsAvailable.class);
    }

    @Test
    @DisplayName("INTERVIEW_PENDING 지원자가 0명이면 409 NoCandidates 가 반환된다")
    void 후보_없음_자동배정_호출시_409() {
        Club club = saveActiveClub("동아리");
        User leader = saveUser("리더");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = saveOpenRecruitment(club);
        saveConfigWithPastDeadline(recruitment.getId());
        saveSlot(recruitment.getId());

        assertThatThrownBy(() -> interviewScheduleService.autoAssign(recruitment.getId(), leader.getId()))
                .isInstanceOf(InterviewException.NoCandidates.class);
    }

    @Test
    @DisplayName("자동배정 성공 시 INTERVIEW_PENDING + availability 지원자가 슬롯에 배정된다")
    void 자동배정_성공_후_배정_확인() {
        Club club = saveActiveClub("동아리");
        User leader = saveUser("리더");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = saveOpenRecruitment(club);
        saveConfigWithPastDeadline(recruitment.getId());
        InterviewSlot slot = saveSlot(recruitment.getId());

        User applicant1 = saveUser("지원자1");
        User applicant2 = saveUser("지원자2");
        Application application1 = saveInterviewPendingApplication(recruitment, applicant1);
        Application application2 = saveInterviewPendingApplication(recruitment, applicant2);

        saveAvailability(application1.getId(), slot.getId(), recruitment.getId());
        saveAvailability(application2.getId(), slot.getId(), recruitment.getId());

        AutoAssignResultResponse result = interviewScheduleService.autoAssign(recruitment.getId(), leader.getId());

        assertThat(result.totalCandidates()).isEqualTo(2);
        assertThat(result.assignedCount()).isEqualTo(2);
        assertThat(result.unassignedCount()).isEqualTo(0);
        assertThat(result.noAvailabilityCount()).isEqualTo(0);
        assertThat(result.assignmentCompletedAt()).isNotNull();

        List<InterviewSchedule> schedules = scheduleRepository.findByRecruitmentId(recruitment.getId());
        assertThat(schedules).hasSize(2);
        assertThat(schedules).allMatch(s -> s.getStatus() == InterviewScheduleStatus.ASSIGNED);
    }

    @Test
    @DisplayName("가용 시간을 제출하지 않은 지원자는 noAvailabilityCount 에 집계되고 배정에서 제외된다")
    void 가용시간_없는_지원자는_배정_제외() {
        Club club = saveActiveClub("동아리");
        User leader = saveUser("리더");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = saveOpenRecruitment(club);
        saveConfigWithPastDeadline(recruitment.getId());
        InterviewSlot slot = saveSlot(recruitment.getId());

        User applicantWithAvailability = saveUser("가용시간있음");
        User applicantWithoutAvailability = saveUser("가용시간없음");

        Application applicationWithAvailability =
                saveInterviewPendingApplication(recruitment, applicantWithAvailability);
        saveInterviewPendingApplication(recruitment, applicantWithoutAvailability);

        saveAvailability(applicationWithAvailability.getId(), slot.getId(), recruitment.getId());

        AutoAssignResultResponse result = interviewScheduleService.autoAssign(recruitment.getId(), leader.getId());

        assertThat(result.totalCandidates()).isEqualTo(2);
        assertThat(result.assignedCount()).isEqualTo(1);
        assertThat(result.noAvailabilityCount()).isEqualTo(1);
    }

    @Test
    @DisplayName("자동배정 성공 후 config.assignmentCompletedAt 이 기록된다")
    void 자동배정_성공_후_completedAt_기록() {
        Club club = saveActiveClub("동아리");
        User leader = saveUser("리더");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = saveOpenRecruitment(club);
        saveConfigWithPastDeadline(recruitment.getId());
        InterviewSlot slot = saveSlot(recruitment.getId());

        User applicant = saveUser("지원자");
        Application application = saveInterviewPendingApplication(recruitment, applicant);
        saveAvailability(application.getId(), slot.getId(), recruitment.getId());

        interviewScheduleService.autoAssign(recruitment.getId(), leader.getId());

        InterviewConfig config = configRepository.findByRecruitmentId(recruitment.getId()).orElseThrow();
        assertThat(config.getAssignmentCompletedAt()).isNotNull();
    }

    @Test
    @DisplayName("기존에 CANCELLED 인 schedule 이 있는 지원자는 재배정 시 ASSIGNED 로 전환된다")
    void 기존_CANCELLED_schedule_재배정시_ASSIGNED로_전환() {
        Club club = saveActiveClub("동아리");
        User leader = saveUser("리더");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = saveOpenRecruitment(club);
        saveConfigWithPastDeadline(recruitment.getId());
        InterviewSlot slot = saveSlot(recruitment.getId());

        User applicant = saveUser("지원자");
        Application application = saveInterviewPendingApplication(recruitment, applicant);
        saveAvailability(application.getId(), slot.getId(), recruitment.getId());

        // 기존 CANCELLED 스케줄 삽입
        InterviewSchedule cancelledSchedule = InterviewSchedule.create(
                application.getId(), slot.getId(), recruitment.getId(), LocalDateTime.now().minusDays(1));
        cancelledSchedule.cancel();
        scheduleRepository.save(cancelledSchedule);

        interviewScheduleService.autoAssign(recruitment.getId(), leader.getId());

        InterviewSchedule result = scheduleRepository.findByApplicationId(application.getId()).orElseThrow();
        assertThat(result.getStatus()).isEqualTo(InterviewScheduleStatus.ASSIGNED);
    }

    @Test
    @DisplayName("이미 ASSIGNED 인 슬롯의 잔여 capacity 만큼만 자동배정되어 overbooking 이 발생하지 않는다")
    void 기존_ASSIGNED_slot_capacity_차감() {
        Club club = saveActiveClub("동아리");
        User leader = saveUser("리더");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = saveOpenRecruitment(club);
        saveConfigWithPastDeadline(recruitment.getId());

        // capacity = 1 인 슬롯에 운영진이 사전 수동 배정 (availability 없는 applicant)
        InterviewSlot slot = slotRepository.save(InterviewSlot.create(
                recruitment.getId(),
                LocalDateTime.now().plusDays(7),
                LocalDateTime.now().plusDays(7).plusHours(1),
                1));
        User preassigned = saveUser("수동배정자");
        Application preassignedApp = saveInterviewPendingApplication(recruitment, preassigned);
        scheduleRepository.saveAndFlush(InterviewSchedule.create(
                preassignedApp.getId(), slot.getId(), recruitment.getId(), LocalDateTime.now().minusHours(1)));

        // 같은 슬롯에 availability 제출한 새 지원자
        User candidate = saveUser("자동대상자");
        Application candidateApp = saveInterviewPendingApplication(recruitment, candidate);
        saveAvailability(candidateApp.getId(), slot.getId(), recruitment.getId());

        AutoAssignResultResponse result = interviewScheduleService.autoAssign(recruitment.getId(), leader.getId());

        // 기존 수동 배정 1건 + 새 후보가 capacity 0 인 슬롯밖에 못 골라 미배정
        assertThat(result.assignedCount()).isEqualTo(0);
        assertThat(result.unassignedCount()).isEqualTo(1);
        long totalAssignedOnSlot = scheduleRepository.countBySlotIdAndStatus(
                slot.getId(), InterviewScheduleStatus.ASSIGNED);
        assertThat(totalAssignedOnSlot).isEqualTo(1); // overbooking 없음
        // 사전 수동 배정자가 매칭 대상에서 제외되어 reassign 되지 않았는지
        InterviewSchedule preassignedSchedule = scheduleRepository.findByApplicationId(preassignedApp.getId()).orElseThrow();
        assertThat(preassignedSchedule.getSlotId()).isEqualTo(slot.getId());
    }

    @Test
    @DisplayName("M8 GET schedules 는 슬롯별로 그룹핑된 일정을 반환한다")
    void M8_슬롯별_그룹핑_일정_조회() {
        Club club = saveActiveClub("동아리");
        User leader = saveUser("리더");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = saveOpenRecruitment(club);
        saveConfigWithPastDeadline(recruitment.getId());

        InterviewSlot slot1 = saveSlot(recruitment.getId());
        InterviewSlot slot2 = saveSlot(recruitment.getId());

        User applicant1 = saveUser("지원자1");
        User applicant2 = saveUser("지원자2");
        Application application1 = saveInterviewPendingApplication(recruitment, applicant1);
        Application application2 = saveInterviewPendingApplication(recruitment, applicant2);

        scheduleRepository.save(InterviewSchedule.create(
                application1.getId(), slot1.getId(), recruitment.getId(), LocalDateTime.now()));
        scheduleRepository.save(InterviewSchedule.create(
                application2.getId(), slot2.getId(), recruitment.getId(), LocalDateTime.now()));

        List<ScheduleListView> schedules =
                interviewScheduleService.listSchedules(recruitment.getId(), leader.getId());

        assertThat(schedules).hasSize(2);
        ScheduleListView slotView1 = schedules.stream()
                .filter(v -> v.slotId().equals(slot1.getId()))
                .findFirst().orElseThrow();
        assertThat(slotView1.assigned()).hasSize(1);
        assertThat(slotView1.assigned().get(0).applicationId()).isEqualTo(application1.getId());
    }

    @Test
    @DisplayName("M11 GET candidates 는 totalCandidates / candidatesWithAvailability / candidatesWithoutAvailability 를 반환한다")
    void M11_후보_통계_조회() {
        Club club = saveActiveClub("동아리");
        User leader = saveUser("리더");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = saveOpenRecruitment(club);
        saveConfigWithPastDeadline(recruitment.getId());
        InterviewSlot slot = saveSlot(recruitment.getId());

        User applicantA = saveUser("A");
        User applicantB = saveUser("B");
        User applicantC = saveUser("C");

        Application applicationA = saveInterviewPendingApplication(recruitment, applicantA);
        Application applicationB = saveInterviewPendingApplication(recruitment, applicantB);
        saveInterviewPendingApplication(recruitment, applicantC); // 가용시간 없음

        saveAvailability(applicationA.getId(), slot.getId(), recruitment.getId());
        saveAvailability(applicationB.getId(), slot.getId(), recruitment.getId());

        MatchingCandidatesResponse candidates =
                interviewScheduleService.listCandidates(recruitment.getId(), leader.getId());

        assertThat(candidates.totalCandidates()).isEqualTo(3);
        assertThat(candidates.candidatesWithAvailability()).isEqualTo(2);
        assertThat(candidates.candidatesWithoutAvailability()).isEqualTo(1);
        assertThat(candidates.slots()).hasSize(1);
        assertThat(candidates.slots().get(0).availabilityCount()).isEqualTo(2);
    }

    @Test
    @DisplayName("동시에 자동배정을 두 번 호출하면 한 건만 성공하고 나머지는 409 를 반환한다")
    void 동시_자동배정_호출시_한_건만_성공() throws Exception {
        Club club = saveActiveClub("동아리");
        User leader = saveUser("리더");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = saveOpenRecruitment(club);
        saveConfigWithPastDeadline(recruitment.getId());
        InterviewSlot slot = saveSlot(recruitment.getId());

        User applicant = saveUser("지원자");
        Application application = saveInterviewPendingApplication(recruitment, applicant);
        saveAvailability(application.getId(), slot.getId(), recruitment.getId());

        java.util.concurrent.atomic.AtomicInteger successCount = new java.util.concurrent.atomic.AtomicInteger(0);
        java.util.concurrent.atomic.AtomicInteger conflictCount = new java.util.concurrent.atomic.AtomicInteger(0);

        java.util.concurrent.ExecutorService executor =
                java.util.concurrent.Executors.newFixedThreadPool(2);
        java.util.List<java.util.concurrent.Future<?>> futures = new java.util.ArrayList<>();

        for (int i = 0; i < 2; i++) {
            futures.add(executor.submit(() -> {
                try {
                    interviewScheduleService.autoAssign(recruitment.getId(), leader.getId());
                    successCount.incrementAndGet();
                } catch (InterviewException.AssignmentAlreadyCompleted e) {
                    conflictCount.incrementAndGet();
                } catch (Exception concurrencyFailure) {
                    // 비관적 락 대기 중 타임아웃 등 예외도 conflict 로 집계
                    conflictCount.incrementAndGet();
                }
            }));
        }

        for (java.util.concurrent.Future<?> future : futures) {
            future.get();
        }
        executor.shutdown();

        assertThat(successCount.get()).isEqualTo(1);
        assertThat(conflictCount.get()).isEqualTo(1);
    }
}
