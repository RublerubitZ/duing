package com.duing.domain.interview.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.application.service.ApplicationService;
import com.duing.domain.application.service.dto.command.SubmitApplicationCommand;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.interview.entity.InterviewAvailability;
import com.duing.domain.interview.entity.InterviewConfig;
import com.duing.domain.interview.entity.InterviewSlot;
import com.duing.domain.interview.exception.InterviewException;
import com.duing.domain.interview.repository.InterviewAvailabilityRepository;
import com.duing.domain.interview.repository.InterviewConfigRepository;
import com.duing.domain.interview.repository.InterviewSlotRepository;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import java.lang.reflect.Field;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
class InterviewAvailabilitySubmissionTest extends IntegrationTestBase {

    @Autowired private ApplicationService applicationService;
    @Autowired private ApplicationRepository applicationRepository;
    @Autowired private InterviewAvailabilityRepository availabilityRepository;
    @Autowired private InterviewConfigRepository configRepository;
    @Autowired private InterviewSlotRepository slotRepository;
    @Autowired private RecruitmentRepository recruitmentRepository;
    @Autowired private ClubRepository clubRepository;
    @Autowired private ClubMemberRepository clubMemberRepository;
    @Autowired private UserRepository userRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    // ── 헬퍼 ─────────────────────────────────────────────────────────────────────

    private User saveStudent(String nameSuffix) {
        long unique = sequence.incrementAndGet();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                nameSuffix + unique,
                "avail" + unique + "@daegu.ac.kr",
                "hashed",
                UserRole.STUDENT,
                Grade.FRESHMAN,
                College.IT_ENGINEERING,
                "미설정",
                "010-0000-0000",
                LocalDateTime.now()));
    }

    private Club saveActiveClub(String name) {
        Club club = Club.create(name + "-" + sequence.incrementAndGet(),
                ClubCategory.OTHER, "분과", "설명", null);
        try {
            Field statusField = Club.class.getDeclaredField("status");
            statusField.setAccessible(true);
            statusField.set(club, ClubStatus.ACTIVE);
        } catch (ReflectiveOperationException reflectionFailure) {
            throw new IllegalStateException(reflectionFailure);
        }
        return clubRepository.save(club);
    }

    private Recruitment saveOpenRecruitment(Club club, String title) {
        LocalDate today = LocalDate.now();
        return recruitmentRepository.save(
                Recruitment.create(club, title + "-" + sequence.incrementAndGet(),
                        null, today.minusDays(1), today.plusDays(7), 10));
    }

    private InterviewConfig saveOpenConfig(Long recruitmentId) {
        return configRepository.save(
                InterviewConfig.create(recruitmentId, LocalDateTime.now().plusDays(7)));
    }

    private InterviewConfig saveClosedConfig(Long recruitmentId) {
        return configRepository.save(
                InterviewConfig.create(recruitmentId, LocalDateTime.now().minusSeconds(1)));
    }

    private InterviewSlot saveSlot(Long recruitmentId) {
        return slotRepository.save(
                InterviewSlot.create(recruitmentId,
                        LocalDateTime.now().plusDays(10),
                        LocalDateTime.now().plusDays(10).plusHours(1),
                        5));
    }

    private Long clubLeaderId;

    private Recruitment setupInterviewRecruitment(String label) {
        User leader = saveStudent("리더-" + label);
        clubLeaderId = leader.getId();
        Club club = saveActiveClub("면접동아리-" + label);
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        return saveOpenRecruitment(club, "면접모집-" + label);
    }

    // ── 테스트 ────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("면접 모집에 가능시간을 0개 선택하면 지원서 제출이 실패한다")
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void interviewRecruitmentRejectsEmptySlotSelection() {
        Recruitment recruitment = setupInterviewRecruitment("빈슬롯");
        saveOpenConfig(recruitment.getId());
        saveSlot(recruitment.getId());

        User applicant = saveStudent("지원자");
        SubmitApplicationCommand command = new SubmitApplicationCommand(
                recruitment.getId(), applicant.getId(), List.of(), List.of());

        assertThatThrownBy(() -> applicationService.submit(command))
                .isInstanceOf(InterviewException.InvalidSlotSelection.class);

        assertThat(applicationRepository.existsByRecruitmentIdAndUserId(
                recruitment.getId(), applicant.getId())).isFalse();
    }

    @Test
    @DisplayName("일반 모집(InterviewConfig 없음)에 interviewSlotIds 가 비어있으면 정상 제출된다")
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void normalRecruitmentSucceedsWithEmptySlotIds() {
        User leader = saveStudent("리더-일반");
        Club club = saveActiveClub("일반동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = saveOpenRecruitment(club, "일반모집");

        User applicant = saveStudent("지원자");
        SubmitApplicationCommand command = new SubmitApplicationCommand(
                recruitment.getId(), applicant.getId(), List.of(), List.of());

        Long applicationId = applicationService.submit(command);

        assertThat(applicationId).isNotNull();
        assertThat(applicationRepository.existsByRecruitmentIdAndUserId(
                recruitment.getId(), applicant.getId())).isTrue();
        assertThat(availabilityRepository.findByApplicationId(applicationId)).isEmpty();
    }

    @Test
    @DisplayName("일반 모집에 interviewSlotIds 가 있으면 400 INVALID_SLOT_SELECTION 이 반환된다")
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void normalRecruitmentRejectsNonEmptySlotIds() {
        User leader = saveStudent("리더-일반슬롯");
        Club club = saveActiveClub("일반슬롯동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = saveOpenRecruitment(club, "일반슬롯모집");

        // InterviewConfig 없이 임의 slotId 를 전달
        User applicant = saveStudent("지원자");
        SubmitApplicationCommand command = new SubmitApplicationCommand(
                recruitment.getId(), applicant.getId(), List.of(), List.of(999L));

        assertThatThrownBy(() -> applicationService.submit(command))
                .isInstanceOf(InterviewException.InvalidSlotSelection.class);

        assertThat(applicationRepository.existsByRecruitmentIdAndUserId(
                recruitment.getId(), applicant.getId())).isFalse();
    }

    @Test
    @DisplayName("availabilityDeadline 이후 제출은 409 AVAILABILITY_PERIOD_CLOSED 가 반환된다")
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void submissionAfterDeadlineIsRejected() {
        Recruitment recruitment = setupInterviewRecruitment("마감후");
        saveClosedConfig(recruitment.getId());
        InterviewSlot slot = saveSlot(recruitment.getId());

        User applicant = saveStudent("지원자");
        SubmitApplicationCommand command = new SubmitApplicationCommand(
                recruitment.getId(), applicant.getId(), List.of(), List.of(slot.getId()));

        assertThatThrownBy(() -> applicationService.submit(command))
                .isInstanceOf(InterviewException.AvailabilityPeriodClosed.class);

        assertThat(applicationRepository.existsByRecruitmentIdAndUserId(
                recruitment.getId(), applicant.getId())).isFalse();
    }

    @Test
    @DisplayName("interviewSlotIds 에 중복이 있으면 400 DUPLICATE_SLOT_IN_REQUEST 가 반환된다")
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void duplicateSlotIdsAreRejected() {
        Recruitment recruitment = setupInterviewRecruitment("중복슬롯");
        saveOpenConfig(recruitment.getId());
        InterviewSlot slot = saveSlot(recruitment.getId());

        User applicant = saveStudent("지원자");
        SubmitApplicationCommand command = new SubmitApplicationCommand(
                recruitment.getId(), applicant.getId(), List.of(),
                List.of(slot.getId(), slot.getId()));

        assertThatThrownBy(() -> applicationService.submit(command))
                .isInstanceOf(InterviewException.DuplicateSlotInRequest.class);

        assertThat(applicationRepository.existsByRecruitmentIdAndUserId(
                recruitment.getId(), applicant.getId())).isFalse();
    }

    @Test
    @DisplayName("다른 모집의 slotId 가 섞여있으면 400 INVALID_SLOT_SELECTION 이 반환된다")
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void slotFromOtherRecruitmentIsRejected() {
        // 모집 A — 지원 대상
        Recruitment recruitmentA = setupInterviewRecruitment("슬롯불일치A");
        saveOpenConfig(recruitmentA.getId());
        InterviewSlot slotInA = saveSlot(recruitmentA.getId());

        // 모집 B — 다른 동아리/모집에 속한 슬롯
        User otherLeader = saveStudent("리더-B");
        Club otherClub = saveActiveClub("타동아리-B");
        clubMemberRepository.save(ClubMember.asLeader(otherClub, otherLeader));
        Recruitment recruitmentB = saveOpenRecruitment(otherClub, "타모집-B");
        saveOpenConfig(recruitmentB.getId());
        InterviewSlot slotInB = saveSlot(recruitmentB.getId());

        User applicant = saveStudent("지원자");
        // recruitmentA 에 지원하면서 slotInB 를 포함
        SubmitApplicationCommand command = new SubmitApplicationCommand(
                recruitmentA.getId(), applicant.getId(), List.of(),
                List.of(slotInA.getId(), slotInB.getId()));

        assertThatThrownBy(() -> applicationService.submit(command))
                .isInstanceOf(InterviewException.InvalidSlotSelection.class);

        assertThat(applicationRepository.existsByRecruitmentIdAndUserId(
                recruitmentA.getId(), applicant.getId())).isFalse();
    }

    @Test
    @DisplayName("같은 모집에 두 번 제출(UNIQUE 위반)하면 application 도 롤백된다")
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void duplicateApplicationRollsBackAvailability() throws Exception {
        Recruitment recruitment = setupInterviewRecruitment("중복제출");
        saveOpenConfig(recruitment.getId());
        InterviewSlot slot = saveSlot(recruitment.getId());

        User applicant = saveStudent("지원자");

        // 첫 번째 제출 — 성공
        SubmitApplicationCommand firstCommand = new SubmitApplicationCommand(
                recruitment.getId(), applicant.getId(), List.of(), List.of(slot.getId()));
        applicationService.submit(firstCommand);

        long availabilityCountAfterFirst = availabilityRepository
                .findByRecruitmentId(recruitment.getId()).size();
        assertThat(availabilityCountAfterFirst).isEqualTo(1);

        // 두 번째 제출 — DuplicateApplicationException 으로 실패해야 함
        SubmitApplicationCommand secondCommand = new SubmitApplicationCommand(
                recruitment.getId(), applicant.getId(), List.of(), List.of(slot.getId()));
        assertThatThrownBy(() -> applicationService.submit(secondCommand))
                .isInstanceOf(RuntimeException.class);

        // 두 번째 application 도 저장되지 않아야 함
        List<Application> applications = applicationRepository
                .findByUserIdAndStatusInOrderByCreatedAtDesc(
                        applicant.getId(),
                        java.util.Set.of(ApplicationStatus.SUBMITTED));
        assertThat(applications).hasSize(1);

        // availability 도 첫 번째 것만 남아야 함
        assertThat(availabilityRepository.findByRecruitmentId(recruitment.getId())).hasSize(1);
    }

    @Test
    @DisplayName("면접 모집에 유효한 slotId 를 선택하면 application 과 availability 가 함께 저장된다")
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void interviewRecruitmentSucceedsWithValidSlots() {
        Recruitment recruitment = setupInterviewRecruitment("정상제출");
        saveOpenConfig(recruitment.getId());
        InterviewSlot slotA = saveSlot(recruitment.getId());
        InterviewSlot slotB = saveSlot(recruitment.getId());

        User applicant = saveStudent("지원자");
        SubmitApplicationCommand command = new SubmitApplicationCommand(
                recruitment.getId(), applicant.getId(), List.of(),
                List.of(slotA.getId(), slotB.getId()));

        Long applicationId = applicationService.submit(command);

        assertThat(applicationId).isNotNull();
        List<InterviewAvailability> savedAvailabilities =
                availabilityRepository.findByApplicationId(applicationId);
        assertThat(savedAvailabilities).hasSize(2);
        assertThat(savedAvailabilities)
                .extracting(InterviewAvailability::getSlotId)
                .containsExactlyInAnyOrder(slotA.getId(), slotB.getId());
    }
}
