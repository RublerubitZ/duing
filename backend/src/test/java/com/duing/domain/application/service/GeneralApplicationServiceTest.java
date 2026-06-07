package com.duing.domain.application.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;

import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.entity.ApplicationStatusHistory;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.application.repository.ApplicationStatusHistoryRepository;
import com.duing.domain.application.service.dto.command.BulkUpdateApplicationStatusCommand;
import com.duing.domain.application.service.dto.command.UpdateApplicationStatusCommand;
import com.duing.domain.application.service.dto.query.ApplicantDetailQuery;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.TargetRole;
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
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.context.annotation.Import;
import org.springframework.test.annotation.DirtiesContext;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class GeneralApplicationServiceTest {

    @Autowired ApplicationService applicationService;
    @Autowired ApplicationRepository applicationRepository;
    @Autowired RecruitmentRepository recruitmentRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired UserRepository userRepository;
    @MockitoSpyBean ApplicationStatusHistoryRepository applicationStatusHistoryRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    // ────────────────────────────────────────────────────────────
    // 공통 픽스처
    // ────────────────────────────────────────────────────────────

    private Long leaderId;
    private Recruitment activeRecruitment;

    private void setupClubAndLeader(String clubName) throws Exception {
        User leader = saveUser("리더", UserRole.STUDENT);
        leaderId = leader.getId();
        Club club = saveActiveClub(clubName);
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        activeRecruitment = recruitmentRepository.save(
                Recruitment.create(club, "테스트 모집", null,
                        LocalDate.now().minusDays(1), LocalDate.now().plusDays(7), 10));
    }

    private Long createSubmittedApplication() throws Exception {
        User applicant = saveUser("지원자", UserRole.STUDENT);
        Application application = Application.submit(activeRecruitment, applicant, List.of());
        return applicationRepository.save(application).getId();
    }

    private Long createApplicationWithStatus(ApplicationStatus status) throws Exception {
        User applicant = saveUser("지원자", UserRole.STUDENT);
        Application application = Application.submit(activeRecruitment, applicant, List.of());
        Field statusField = Application.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(application, status);
        return applicationRepository.save(application).getId();
    }

    private User saveUser(String nameSuffix, UserRole role) {
        long unique = sequence.getAndIncrement();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                nameSuffix + unique,
                "hist" + unique + "@daegu.ac.kr",
                "hashed",
                role,
                Grade.FRESHMAN,
                College.IT_ENGINEERING,
                "미설정",
                "010-0000-0000",
                LocalDateTime.now()));
    }

    private Club saveActiveClub(String name) throws Exception {
        Club club = Club.create(name + "-" + sequence.getAndIncrement(),
                ClubCategory.OTHER, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(club, ClubStatus.ACTIVE);
        return clubRepository.save(club);
    }

    // ────────────────────────────────────────────────────────────
    // 1. 상태 변경 시 history 적재
    // ────────────────────────────────────────────────────────────

    @Test
    @DisplayName("상태 변경 시 history 가 적재된다")
    void statusTransitionRecordsHistory() throws Exception {
        setupClubAndLeader("history-기록동아리");
        Long applicationId = createSubmittedApplication();

        applicationService.updateStatus(
                new UpdateApplicationStatusCommand(applicationId, leaderId, ApplicationStatus.UNDER_REVIEW));

        List<ApplicationStatusHistory> rows =
                applicationStatusHistoryRepository.findByApplicationIdOrderByCreatedAtDesc(applicationId);
        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).getPreviousStatus()).isEqualTo(ApplicationStatus.SUBMITTED);
        assertThat(rows.get(0).getNewStatus()).isEqualTo(ApplicationStatus.UNDER_REVIEW);
        assertThat(rows.get(0).getChangedBy().getId()).isEqualTo(leaderId);
    }

    // ────────────────────────────────────────────────────────────
    // 2. Bulk 부분 성공 시 성공한 건만 history 적재
    // ────────────────────────────────────────────────────────────

    @Test
    @DisplayName("Bulk 상태 변경 시 성공한 건만 history 가 적재된다")
    void bulkPartialSuccessOnlyRecordsSuccessfulRows() throws Exception {
        setupClubAndLeader("history-벌크동아리");
        Long successId = createSubmittedApplication();
        // ACCEPTED 는 terminal 상태 — UNDER_REVIEW 로의 전이 불가
        Long failId = createApplicationWithStatus(ApplicationStatus.ACCEPTED);

        applicationService.bulkUpdateStatus(
                new BulkUpdateApplicationStatusCommand(
                        List.of(successId, failId), leaderId, ApplicationStatus.UNDER_REVIEW));

        assertThat(applicationStatusHistoryRepository
                .findByApplicationIdOrderByCreatedAtDesc(successId)).hasSize(1);
        assertThat(applicationStatusHistoryRepository
                .findByApplicationIdOrderByCreatedAtDesc(failId)).isEmpty();
    }

    // ────────────────────────────────────────────────────────────
    // 3. 상세 응답의 statusHistory 가 newest-first 정렬
    // ────────────────────────────────────────────────────────────

    @Test
    @DisplayName("상세 응답의 statusHistory 가 newest-first 로 정렬된다")
    void statusHistoryIsNewestFirstInDetail() throws Exception {
        // 면접 사용 모집으로 SUBMITTED → UNDER_REVIEW → INTERVIEW_PENDING 경로 확인
        User leader = saveUser("정렬리더", UserRole.STUDENT);
        leaderId = leader.getId();
        Club club = saveActiveClub("history-정렬동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        activeRecruitment = recruitmentRepository.save(
                Recruitment.createWithOptions(club, "면접사용모집", null,
                        LocalDate.now().minusDays(1), LocalDate.now().plusDays(7), 10,
                        ApplicationMode.SELF, null, true, TargetRole.MEMBER, null, null, false));

        Long applicationId = createSubmittedApplication();

        applicationService.updateStatus(
                new UpdateApplicationStatusCommand(applicationId, leaderId, ApplicationStatus.UNDER_REVIEW));
        applicationService.updateStatus(
                new UpdateApplicationStatusCommand(applicationId, leaderId, ApplicationStatus.INTERVIEW_PENDING));

        ApplicantDetailQuery detail = applicationService.getApplicantDetail(applicationId, leaderId);

        assertThat(detail.statusHistory()).hasSize(2);
        assertThat(detail.statusHistory().get(0).newStatus()).isEqualTo(ApplicationStatus.INTERVIEW_PENDING);
        assertThat(detail.statusHistory().get(1).newStatus()).isEqualTo(ApplicationStatus.UNDER_REVIEW);
    }

    // ────────────────────────────────────────────────────────────
    // 4. history save 실패 시 transition 도 롤백
    // ────────────────────────────────────────────────────────────

    @Test
    @DisplayName("history save 가 실패하면 상태 전이도 롤백된다")
    void transitionRollsBackWhenHistorySaveFails() throws Exception {
        setupClubAndLeader("history-롤백동아리");
        Long applicationId = createSubmittedApplication();

        doThrow(new RuntimeException("history save 강제 실패"))
                .when(applicationStatusHistoryRepository).save(any());

        assertThatThrownBy(() ->
                applicationService.updateStatus(
                        new UpdateApplicationStatusCommand(applicationId, leaderId, ApplicationStatus.UNDER_REVIEW)))
                .isInstanceOf(RuntimeException.class);

        Application reloaded = applicationRepository.findById(applicationId).orElseThrow();
        assertThat(reloaded.getStatus()).isEqualTo(ApplicationStatus.SUBMITTED);
    }
}
