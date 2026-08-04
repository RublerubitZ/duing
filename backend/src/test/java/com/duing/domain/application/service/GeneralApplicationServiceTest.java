package com.duing.domain.application.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.entity.ApplicationStatusHistory;
import com.duing.domain.application.exception.ApplicationDomainException;
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
import javax.sql.DataSource;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.context.annotation.Import;

// @DirtiesContext 제거:
// 1. @MockitoSpyBean — Spring Boot 3.4 (Spring Framework 6.2) 의 @BeanOverride 메커니즘은
//    각 테스트 메서드 후 spy 의 Mockito 스텁을 자동으로 초기화(reset)하므로 ApplicationContext
//    재시작 없이 테스트 간 spy 잔존 영향이 없다.
// 2. 데이터 격리 — IntegrationTestBase.cleanDatabase() 가 매 테스트 전 전체 테이블을 TRUNCATE 해
//    이전 테스트의 application_status_history 등 잔존 데이터를 제거한다.
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class GeneralApplicationServiceTest extends IntegrationTestBase {

    @Autowired ApplicationService applicationService;
    @Autowired ApplicationRepository applicationRepository;
    @Autowired RecruitmentRepository recruitmentRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired UserRepository userRepository;
    @Autowired JdbcTemplate jdbcTemplate;
    @Autowired DataSource dataSource;
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

    /** 도메인 전이 경로만으로 목표 상태까지 도달시킨다 (면접 사용 여부는 activeRecruitment 설정을 따른다). */
    private Long createApplicationWithStatus(ApplicationStatus targetStatus) {
        User applicant = saveUser("지원자", UserRole.STUDENT);
        Application application = applicationRepository.save(
                Application.submit(activeRecruitment, applicant, List.of()));
        if (targetStatus == ApplicationStatus.SUBMITTED) {
            return application.getId();
        }

        boolean useInterview = activeRecruitment.isUseInterview();
        if (targetStatus == ApplicationStatus.ON_HOLD) {
            application.transitionTo(ApplicationStatus.ON_HOLD, useInterview);
        } else if (useInterview && targetStatus != ApplicationStatus.REJECTED) {
            // 면접 모집의 합격은 반드시 면접 대상(INTERVIEW_PENDING) 을 경유한다.
            application.transitionTo(ApplicationStatus.INTERVIEW_PENDING, true);
            if (targetStatus != ApplicationStatus.INTERVIEW_PENDING) {
                application.transitionTo(targetStatus, true);
            }
        } else {
            application.transitionTo(targetStatus, useInterview);
        }

        return applicationRepository.save(application).getId();
    }

    private User saveUser(String nameSuffix, UserRole role) {
        long unique = sequence.getAndIncrement();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                nameSuffix + unique,
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
                new UpdateApplicationStatusCommand(applicationId, leaderId, ApplicationStatus.ON_HOLD));

        List<ApplicationStatusHistory> rows =
                applicationStatusHistoryRepository.findByApplicationIdOrderByCreatedAtDesc(applicationId);
        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).getPreviousStatus()).isEqualTo(ApplicationStatus.SUBMITTED);
        assertThat(rows.get(0).getNewStatus()).isEqualTo(ApplicationStatus.ON_HOLD);
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
        // ACCEPTED 는 terminal 상태 — ON_HOLD 로의 전이 불가
        Long failId = createApplicationWithStatus(ApplicationStatus.ACCEPTED);

        applicationService.bulkUpdateStatus(
                new BulkUpdateApplicationStatusCommand(
                        List.of(successId, failId), leaderId, ApplicationStatus.ON_HOLD));

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
        // 면접 사용 모집으로 SUBMITTED → ON_HOLD → INTERVIEW_PENDING 경로 확인
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
                new UpdateApplicationStatusCommand(applicationId, leaderId, ApplicationStatus.ON_HOLD));
        applicationService.updateStatus(
                new UpdateApplicationStatusCommand(applicationId, leaderId, ApplicationStatus.INTERVIEW_PENDING));

        ApplicantDetailQuery detail = applicationService.getApplicantDetail(applicationId, leaderId);

        assertThat(detail.statusHistory()).hasSize(2);
        assertThat(detail.statusHistory().get(0).newStatus()).isEqualTo(ApplicationStatus.INTERVIEW_PENDING);
        assertThat(detail.statusHistory().get(1).newStatus()).isEqualTo(ApplicationStatus.ON_HOLD);
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
                        new UpdateApplicationStatusCommand(applicationId, leaderId, ApplicationStatus.ON_HOLD)))
                .isInstanceOf(RuntimeException.class);

        Application reloaded = applicationRepository.findById(applicationId).orElseThrow();
        assertThat(reloaded.getStatus()).isEqualTo(ApplicationStatus.SUBMITTED);
    }

    // ────────────────────────────────────────────────────────────
    // 5. 지원 철회 (미결정 상태 소프트 삭제)
    // ────────────────────────────────────────────────────────────

    @Test
    @DisplayName("SUBMITTED 상태의 본인 지원을 철회하면 목록에서 빠지고 같은 공고에 재지원할 수 있다")
    void withdrawSubmittedApplicationFreesSlot() throws Exception {
        setupClubAndLeader("철회-기본동아리");
        User applicant = saveUser("철회지원자", UserRole.STUDENT);
        Long applicationId = applicationRepository.save(
                Application.submit(activeRecruitment, applicant, List.of())).getId();

        applicationService.withdraw(applicationId, applicant.getId());

        // 소프트 삭제 → @SQLRestriction 으로 더 이상 조회되지 않는다.
        assertThat(applicationRepository.findById(applicationId)).isEmpty();
        // 부분 유니크 인덱스(WHERE deleted_at IS NULL)라 슬롯이 비어 재지원이 막히지 않는다.
        assertThat(applicationRepository
                .existsByRecruitmentIdAndUserId(activeRecruitment.getId(), applicant.getId()))
                .isFalse();
    }

    @Test
    @DisplayName("운영진이 보류해 둔 지원도 지원자가 철회하면 목록에서 빠지고 같은 공고에 재지원할 수 있다")
    void withdrawOnHoldApplicationFreesSlot() throws Exception {
        setupClubAndLeader("철회-보류동아리");
        User applicant = saveUser("보류지원자", UserRole.STUDENT);
        Application application = applicationRepository.save(
                Application.submit(activeRecruitment, applicant, List.of()));
        application.transitionTo(ApplicationStatus.ON_HOLD, false);
        Long applicationId = applicationRepository.save(application).getId();

        applicationService.withdraw(applicationId, applicant.getId());

        assertThat(applicationRepository.findById(applicationId)).isEmpty();
        assertThat(applicationRepository
                .existsByRecruitmentIdAndUserId(activeRecruitment.getId(), applicant.getId()))
                .isFalse();
    }

    @ParameterizedTest
    @EnumSource(value = ApplicationStatus.class, names = {"INTERVIEW_PENDING", "ACCEPTED", "REJECTED"})
    @DisplayName("면접 대상으로 선정됐거나 합불이 정해진 지원은 철회할 수 없다")
    void cannotWithdrawDecidedApplication(ApplicationStatus status) throws Exception {
        setupClubAndLeader("철회-결정동아리");
        User applicant = saveUser("결정지원자", UserRole.STUDENT);
        Application application = applicationRepository.save(
                Application.submit(activeRecruitment, applicant, List.of()));
        // SUBMITTED → INTERVIEW_PENDING 은 면접 모집에서만 열리는 전이라 그 경우에만 useInterview 를 켠다.
        application.transitionTo(status, status == ApplicationStatus.INTERVIEW_PENDING);
        applicationRepository.save(application);

        assertThatThrownBy(() -> applicationService.withdraw(application.getId(), applicant.getId()))
                .isInstanceOf(ApplicationDomainException.CannotWithdrawApplicationException.class);
    }

    @Test
    @DisplayName("본인 지원이 아니면 철회할 수 없다")
    void cannotWithdrawOthersApplication() throws Exception {
        setupClubAndLeader("철회-타인동아리");
        User owner = saveUser("소유자", UserRole.STUDENT);
        User other = saveUser("타인", UserRole.STUDENT);
        Long applicationId = applicationRepository.save(
                Application.submit(activeRecruitment, owner, List.of())).getId();

        assertThatThrownBy(() -> applicationService.withdraw(applicationId, other.getId()))
                .isInstanceOf(ApplicationDomainException.ForbiddenApplicationAccessException.class);
    }

    @Test
    @DisplayName("존재하지 않는 지원은 철회할 수 없다")
    void cannotWithdrawMissingApplication() throws Exception {
        setupClubAndLeader("철회-없음동아리");
        User applicant = saveUser("없음지원자", UserRole.STUDENT);

        assertThatThrownBy(() -> applicationService.withdraw(999_999L, applicant.getId()))
                .isInstanceOf(ApplicationDomainException.ApplicationNotFoundException.class);
    }

    // ────────────────────────────────────────────────────────────
    // 6. 동아리 폐쇄 일괄 거절 — 진행 중 상태는 중간 단계 없이 REJECTED 로 종료
    // ────────────────────────────────────────────────────────────

    @Test
    @DisplayName("동아리 폐쇄 시 지원·보류·면접 대상 지원서가 중간 단계 없이 곧바로 불합격으로 종료된다")
    void clubClosureRejectsActiveApplicationsDirectly() throws Exception {
        User leader = saveUser("폐쇄리더", UserRole.STUDENT);
        leaderId = leader.getId();
        Club club = saveActiveClub("폐쇄-일괄거절동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        activeRecruitment = recruitmentRepository.save(
                Recruitment.createWithOptions(club, "폐쇄대상모집", null,
                        LocalDate.now().minusDays(1), LocalDate.now().plusDays(7), 10,
                        ApplicationMode.SELF, null, true, TargetRole.MEMBER, null, null, false));

        Long submittedId = createApplicationWithStatus(ApplicationStatus.SUBMITTED);
        Long onHoldId = createApplicationWithStatus(ApplicationStatus.ON_HOLD);
        Long interviewPendingId = createApplicationWithStatus(ApplicationStatus.INTERVIEW_PENDING);
        Long acceptedId = createApplicationWithStatus(ApplicationStatus.ACCEPTED);

        applicationService.rejectActiveOnClubClosure(List.of(activeRecruitment.getId()));

        assertThat(statusOf(submittedId)).isEqualTo(ApplicationStatus.REJECTED);
        assertThat(statusOf(onHoldId)).isEqualTo(ApplicationStatus.REJECTED);
        assertThat(statusOf(interviewPendingId)).isEqualTo(ApplicationStatus.REJECTED);
        // 이미 종료된 지원은 일괄 거절 대상이 아니다.
        assertThat(statusOf(acceptedId)).isEqualTo(ApplicationStatus.ACCEPTED);
    }

    // ────────────────────────────────────────────────────────────
    // 7. V103 마이그레이션 — 서류심사 잔존 값 치환 후에도 이력 포함 상세 조회가 정상
    // ────────────────────────────────────────────────────────────

    // 이 테스트의 'UNDER_REVIEW' 문자열 리터럴은 레거시 데이터 시드용이며 enum 참조가 아니다 — UNDER_REVIEW grep 검증의 명시 예외.
    @Test
    @DisplayName("서류심사 값이 남아 있어도 V103 치환 후에는 이력을 포함한 지원자 상세 조회가 정상 동작한다")
    void migrationReplacesLeftoverUnderReviewValues() throws Exception {
        setupClubAndLeader("마이그레이션-치환동아리");
        Long applicationId = createSubmittedApplication();
        // 테스트 컨테이너에는 이미 V103 이 적용된 뒤라, 레거시 데이터는 enum 을 우회해 직접 심는다.
        jdbcTemplate.update("UPDATE application SET status = 'UNDER_REVIEW' WHERE id = ?", applicationId);
        jdbcTemplate.update("INSERT INTO application_status_history "
                        + "(application_id, previous_status, new_status, changed_by) "
                        + "VALUES (?, 'SUBMITTED', 'UNDER_REVIEW', ?)",
                applicationId, leaderId);

        // 마이그레이션 파일 원본을 그대로 다시 실행해 치환 SQL 자체를 검증한다.
        new ResourceDatabasePopulator(
                new ClassPathResource("db/migration/V103__replace_under_review_with_submitted.sql"))
                .execute(dataSource);

        ApplicantDetailQuery detail = applicationService.getApplicantDetail(applicationId, leaderId);
        assertThat(detail.status()).isEqualTo(ApplicationStatus.SUBMITTED);
        assertThat(detail.statusHistory())
                .isNotEmpty()
                .allSatisfy(historyRow -> {
                    assertThat(historyRow.previousStatus()).isEqualTo(ApplicationStatus.SUBMITTED);
                    assertThat(historyRow.newStatus()).isEqualTo(ApplicationStatus.SUBMITTED);
                });
    }

    private ApplicationStatus statusOf(Long applicationId) {
        return applicationRepository.findById(applicationId).orElseThrow().getStatus();
    }
}
