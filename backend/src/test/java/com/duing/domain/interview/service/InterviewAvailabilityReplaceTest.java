package com.duing.domain.interview.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.application.entity.Application;
import com.duing.domain.application.exception.ApplicationDomainException;
import com.duing.domain.application.repository.ApplicationRepository;
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
import com.duing.domain.interview.service.dto.command.UpdateAvailabilityCommand;
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
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
class InterviewAvailabilityReplaceTest extends IntegrationTestBase {

    @Autowired private InterviewAvailabilityService availabilityService;
    @Autowired private ApplicationRepository applicationRepository;
    @Autowired private InterviewAvailabilityRepository availabilityRepository;
    @Autowired private InterviewConfigRepository configRepository;
    @Autowired private InterviewSlotRepository slotRepository;
    @Autowired private RecruitmentRepository recruitmentRepository;
    @Autowired private ClubRepository clubRepository;
    @Autowired private ClubMemberRepository clubMemberRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private JdbcTemplate jdbcTemplate;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    // ── 헬퍼 ────────────────────────────────────────────────────────────────────

    private User saveStudent(String nameSuffix) {
        long unique = sequence.incrementAndGet();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                nameSuffix + unique,
                "replace" + unique + "@daegu.ac.kr",
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

    private Recruitment saveOpenRecruitment(Club club) {
        LocalDate today = LocalDate.now();
        return recruitmentRepository.save(
                Recruitment.create(club, "면접모집-" + sequence.incrementAndGet(),
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

    private Application saveApplication(Recruitment recruitment, User applicant) {
        return applicationRepository.save(Application.submit(recruitment, applicant, List.of()));
    }

    private void saveAvailability(Long applicationId, InterviewSlot slot, Long recruitmentId) {
        availabilityRepository.save(
                InterviewAvailability.create(applicationId, slot.getId(), recruitmentId));
    }

    // ── 테스트 ─────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("지원자는 deadline 전 자신의 가능시간을 PUT 으로 교체할 수 있다")
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void applicantCanReplaceAvailabilitiesBeforeDeadline() {
        User leader = saveStudent("리더");
        Club club = saveActiveClub("테스트동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = saveOpenRecruitment(club);
        saveOpenConfig(recruitment.getId());
        InterviewSlot slotA = saveSlot(recruitment.getId());
        InterviewSlot slotB = saveSlot(recruitment.getId());
        User applicant = saveStudent("지원자");
        Application application = saveApplication(recruitment, applicant);

        UpdateAvailabilityCommand command = new UpdateAvailabilityCommand(
                application.getId(), applicant.getId(), List.of(slotA.getId(), slotB.getId()));

        availabilityService.replace(command);

        List<InterviewAvailability> savedAvailabilities =
                availabilityRepository.findByApplicationId(application.getId());
        assertThat(savedAvailabilities).hasSize(2);
        assertThat(savedAvailabilities)
                .extracting(InterviewAvailability::getSlotId)
                .containsExactlyInAnyOrder(slotA.getId(), slotB.getId());
    }

    @Test
    @DisplayName("PUT 두 번 호출 시 두 번째 결과로 완전히 교체된다")
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void secondPutCompletelyReplacesFirst() {
        User leader = saveStudent("리더");
        Club club = saveActiveClub("교체동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = saveOpenRecruitment(club);
        saveOpenConfig(recruitment.getId());
        InterviewSlot slotA = saveSlot(recruitment.getId());
        InterviewSlot slotB = saveSlot(recruitment.getId());
        InterviewSlot slotC = saveSlot(recruitment.getId());
        User applicant = saveStudent("지원자");
        Application application = saveApplication(recruitment, applicant);

        // 첫 번째 PUT — slotA, slotB
        availabilityService.replace(new UpdateAvailabilityCommand(
                application.getId(), applicant.getId(), List.of(slotA.getId(), slotB.getId())));

        // 두 번째 PUT — slotC 만
        availabilityService.replace(new UpdateAvailabilityCommand(
                application.getId(), applicant.getId(), List.of(slotC.getId())));

        List<InterviewAvailability> finalAvailabilities =
                availabilityRepository.findByApplicationId(application.getId());
        assertThat(finalAvailabilities).hasSize(1);
        assertThat(finalAvailabilities.get(0).getSlotId()).isEqualTo(slotC.getId());
    }

    @Test
    @DisplayName("다른 사용자의 application 에 PUT 호출 시 403 NotApplicationOwner 가 반환된다")
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void putByNonOwnerThrows403() {
        User leader = saveStudent("리더");
        Club club = saveActiveClub("비소유자동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = saveOpenRecruitment(club);
        saveOpenConfig(recruitment.getId());
        InterviewSlot slot = saveSlot(recruitment.getId());
        User owner = saveStudent("소유자");
        User otherUser = saveStudent("타인");
        Application application = saveApplication(recruitment, owner);

        UpdateAvailabilityCommand command = new UpdateAvailabilityCommand(
                application.getId(), otherUser.getId(), List.of(slot.getId()));

        assertThatThrownBy(() -> availabilityService.replace(command))
                .isInstanceOf(InterviewException.NotApplicationOwner.class);
    }

    @Test
    @DisplayName("deadline 이후 PUT 은 409 AvailabilityPeriodClosed 가 반환된다")
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void putAfterDeadlineThrows409() {
        User leader = saveStudent("리더");
        Club club = saveActiveClub("마감동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = saveOpenRecruitment(club);
        saveClosedConfig(recruitment.getId());
        InterviewSlot slot = saveSlot(recruitment.getId());
        User applicant = saveStudent("지원자");
        Application application = saveApplication(recruitment, applicant);

        UpdateAvailabilityCommand command = new UpdateAvailabilityCommand(
                application.getId(), applicant.getId(), List.of(slot.getId()));

        assertThatThrownBy(() -> availabilityService.replace(command))
                .isInstanceOf(InterviewException.AvailabilityPeriodClosed.class);
    }

    @Test
    @DisplayName("assignmentCompletedAt 이 채워진 후 PUT 은 409 AssignmentAlreadyCompleted 가 반환된다")
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void putAfterAssignmentCompletedThrows409() {
        User leader = saveStudent("리더");
        Club club = saveActiveClub("배정완료동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = saveOpenRecruitment(club);
        InterviewSlot slot = saveSlot(recruitment.getId());
        User applicant = saveStudent("지원자");
        Application application = saveApplication(recruitment, applicant);

        // assignmentCompletedAt 이 채워진 InterviewConfig 를 직접 저장
        InterviewConfig completedConfig = configRepository.save(
                InterviewConfig.create(recruitment.getId(), LocalDateTime.now().plusDays(7)));
        completedConfig.markAssignmentCompleted(LocalDateTime.now());
        configRepository.save(completedConfig);

        UpdateAvailabilityCommand command = new UpdateAvailabilityCommand(
                application.getId(), applicant.getId(), List.of(slot.getId()));

        assertThatThrownBy(() -> availabilityService.replace(command))
                .isInstanceOf(InterviewException.AssignmentAlreadyCompleted.class);
    }

    @Test
    @DisplayName("빈 slotIds 로 PUT 호출 시 400 InvalidSlotSelection 이 반환된다")
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void putWithEmptySlotIdsThrows400() {
        User leader = saveStudent("리더");
        Club club = saveActiveClub("빈슬롯동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = saveOpenRecruitment(club);
        saveOpenConfig(recruitment.getId());
        User applicant = saveStudent("지원자");
        Application application = saveApplication(recruitment, applicant);

        UpdateAvailabilityCommand command = new UpdateAvailabilityCommand(
                application.getId(), applicant.getId(), List.of());

        assertThatThrownBy(() -> availabilityService.replace(command))
                .isInstanceOf(InterviewException.InvalidSlotSelection.class);
    }

    @Test
    @DisplayName("동일 slotId 가 중복된 PUT 호출은 400 DuplicateSlotInRequest 가 반환된다")
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void putWithDuplicateSlotIdsThrows400() {
        User leader = saveStudent("리더");
        Club club = saveActiveClub("중복슬롯동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = saveOpenRecruitment(club);
        saveOpenConfig(recruitment.getId());
        InterviewSlot slot = saveSlot(recruitment.getId());
        User applicant = saveStudent("지원자");
        Application application = saveApplication(recruitment, applicant);

        UpdateAvailabilityCommand command = new UpdateAvailabilityCommand(
                application.getId(), applicant.getId(), List.of(slot.getId(), slot.getId()));

        assertThatThrownBy(() -> availabilityService.replace(command))
                .isInstanceOf(InterviewException.DuplicateSlotInRequest.class);
    }

    @Test
    @DisplayName("PUT 으로 교체된 이전 availability 는 deleted_at 이 설정되고 활성 조회에서 제외된다")
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void replacedAvailabilitiesAreSoftDeletedAndExcludedFromActiveQuery() {
        User leader = saveStudent("리더");
        Club club = saveActiveClub("소프트삭제동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = saveOpenRecruitment(club);
        saveOpenConfig(recruitment.getId());
        InterviewSlot slotA = saveSlot(recruitment.getId());
        InterviewSlot slotB = saveSlot(recruitment.getId());
        InterviewSlot slotC = saveSlot(recruitment.getId());
        User applicant = saveStudent("지원자");
        Application application = saveApplication(recruitment, applicant);

        // 첫 번째 PUT — slotA, slotB 등록
        availabilityService.replace(new UpdateAvailabilityCommand(
                application.getId(), applicant.getId(), List.of(slotA.getId(), slotB.getId())));

        // 두 번째 PUT — slotC 로 완전 교체
        availabilityService.replace(new UpdateAvailabilityCommand(
                application.getId(), applicant.getId(), List.of(slotC.getId())));

        // 활성 조회(@SQLRestriction 적용) — slotC 만 반환되어야 함
        List<InterviewAvailability> activeAvailabilities =
                availabilityRepository.findByApplicationId(application.getId());
        assertThat(activeAvailabilities).hasSize(1);
        assertThat(activeAvailabilities.get(0).getSlotId()).isEqualTo(slotC.getId());

        // 물리 행 수 확인 — slotA, slotB, slotC 총 3행이 존재해야 함 (hard delete 가 아님)
        Integer totalRowCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM interview_availability WHERE application_id = ?",
                Integer.class,
                application.getId());
        assertThat(totalRowCount).isEqualTo(3);

        // slotA, slotB 의 deleted_at 이 설정되어 있어야 함
        Integer softDeletedCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM interview_availability WHERE application_id = ? AND slot_id IN (?, ?) AND deleted_at IS NOT NULL",
                Integer.class,
                application.getId(), slotA.getId(), slotB.getId());
        assertThat(softDeletedCount).isEqualTo(2);
    }
}
