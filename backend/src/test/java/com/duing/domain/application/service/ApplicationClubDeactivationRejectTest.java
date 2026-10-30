package com.duing.domain.application.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.PendingItemsFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.application.service.dto.command.UpdateApplicationStatusCommand;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

/** 운영 중단 동아리 남은 미결 정리의 지원서 쪽(스펙 §4-1·§3-2) — 서비스를 직접 부른다(동아리 잠금·상태 확인은 정리 조립 서비스 몫). */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class ApplicationClubDeactivationRejectTest extends IntegrationTestBase {

    @Autowired ApplicationService applicationService;
    @Autowired ApplicationRepository applicationRepository;
    @Autowired RecruitmentRepository recruitmentRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired UserRepository userRepository;
    @Autowired JdbcTemplate jdbcTemplate;
    @Autowired Clock clock;

    private LocalDate today;
    private User adminUser;

    @BeforeEach
    void setUp() {
        today = LocalDate.now(clock);
        // 동아리 id 와 처리자 id 가 겹치면 두 인자를 뒤바꾼 회귀를 못 잡는다 — 일부러 어긋나게 둔다.
        userRepository.save(UserFixture.unique());
        adminUser = userRepository.save(UserFixture.admin());
    }

    @Test
    @DisplayName("운영 중단 정리는 그 동아리의 마감·진행 모집 결과 미정 지원서를 모두 불합격·운영 중단 표시로 바꾸고, 건마다 총동연 처리자의 상태 이력을 남기며 처리 건수를 돌려준다")
    void rejectsUndecidedApplicationsOfClubWithDeactivationFlag() {
        Club club = saveClub(ClubStatus.INACTIVE);
        Recruitment openRecruitment = saveRecruitment(club, false);
        Recruitment closedRecruitment = saveRecruitment(club, true);
        Application submitted = saveApplication(openRecruitment, ApplicationStatus.SUBMITTED);
        Application onHold = saveApplication(openRecruitment, ApplicationStatus.ON_HOLD);
        Application interviewPending = saveApplication(closedRecruitment, ApplicationStatus.INTERVIEW_PENDING);
        User withdrawnApplicant = userRepository.save(UserFixture.unique());
        Application withdrawnApplicantApplication = PendingItemsFixture.saveApplication(applicationRepository,
                closedRecruitment, withdrawnApplicant, ApplicationStatus.SUBMITTED);
        softDelete("users", withdrawnApplicant.getId());
        Application accepted = saveApplication(openRecruitment, ApplicationStatus.ACCEPTED);
        Application alreadyRejected = saveApplication(closedRecruitment, ApplicationStatus.REJECTED);
        Recruitment deletedRecruitment = saveRecruitment(club, true);
        Application onDeletedRecruitment = saveApplication(deletedRecruitment, ApplicationStatus.SUBMITTED);
        softDelete("recruitment", deletedRecruitment.getId());
        Application deletedApplication = saveApplication(openRecruitment, ApplicationStatus.SUBMITTED);
        softDelete("application", deletedApplication.getId());
        Club otherClub = saveClub(ClubStatus.INACTIVE);
        Application otherClubApplication = saveApplication(saveRecruitment(otherClub, true), ApplicationStatus.SUBMITTED);

        int rejectedCount = applicationService.rejectActiveOnClubDeactivation(club.getId(), adminUser.getId());

        assertThat(rejectedCount).as("제출·보류·면접 대기·탈퇴한 지원자의 제출").isEqualTo(4);
        assertThat(List.of(rowOf(submitted), rowOf(onHold), rowOf(interviewPending), rowOf(withdrawnApplicantApplication)))
                .containsOnly(new ApplicationRow("REJECTED", true));
        assertThat(rowOf(accepted)).as("이미 합격").isEqualTo(new ApplicationRow("ACCEPTED", false));
        assertThat(rowOf(alreadyRejected)).as("이미 불합격").isEqualTo(new ApplicationRow("REJECTED", false));
        assertThat(rowOf(onDeletedRecruitment)).as("삭제된 모집").isEqualTo(new ApplicationRow("SUBMITTED", false));
        assertThat(rowOf(deletedApplication)).as("삭제된(철회한) 지원서").isEqualTo(new ApplicationRow("SUBMITTED", false));
        assertThat(rowOf(otherClubApplication)).as("다른 동아리").isEqualTo(new ApplicationRow("SUBMITTED", false));

        assertRejectionHistory(submitted, "SUBMITTED");
        assertRejectionHistory(onHold, "ON_HOLD");
        assertRejectionHistory(interviewPending, "INTERVIEW_PENDING");
        assertRejectionHistory(withdrawnApplicantApplication, "SUBMITTED");
        assertThat(historyCountOf(onDeletedRecruitment) + historyCountOf(otherClubApplication))
                .as("대상이 아닌 지원서에는 이력이 없다").isZero();
    }

    @Test
    @DisplayName("정리할 지원서가 없으면 처리자를 조회하지 않고 0 을 돌려준다")
    void returnsZeroWithoutActorLookupWhenNothingToReject() {
        Club club = saveClub(ClubStatus.INACTIVE);
        saveApplication(saveRecruitment(club, true), ApplicationStatus.REJECTED);

        // 없는 처리자 id 로도 예외가 없다 — 대상이 없으면 처리자를 읽지 않는다.
        assertThat(applicationService.rejectActiveOnClubDeactivation(club.getId(), Long.MAX_VALUE)).isZero();
    }

    @Test
    @DisplayName("동아리 폐쇄의 일괄 불합격은 운영 중단 표시를 남기지 않는다")
    void closureRejectionLeavesDeactivationFlagFalse() {
        Club club = saveClub(ClubStatus.INACTIVE);
        Recruitment recruitment = saveRecruitment(club, true);
        Application application = saveApplication(recruitment, ApplicationStatus.SUBMITTED);

        applicationService.rejectActiveOnClubClosure(List.of(recruitment.getId()), adminUser.getId());

        assertThat(rowOf(application)).isEqualTo(new ApplicationRow("REJECTED", false));
    }

    @Test
    @DisplayName("운영진이 불합격 처리한 지원서는 처리자가 회장을 겸하는 총동연 계정이어도 운영 중단 표시가 없다")
    void operatorRejectionLeavesDeactivationFlagFalse() {
        Club club = saveClub(ClubStatus.ACTIVE);
        clubMemberRepository.save(ClubMember.asLeader(club, adminUser));
        Application application = saveApplication(saveRecruitment(club, false), ApplicationStatus.SUBMITTED);

        applicationService.updateStatus(new UpdateApplicationStatusCommand(
                application.getId(), adminUser.getId(), ApplicationStatus.REJECTED));

        assertThat(rowOf(application)).isEqualTo(new ApplicationRow("REJECTED", false));
    }

    private record ApplicationRow(String status, boolean endedByClubDeactivation) {
    }

    /** soft-delete 행도 읽도록 jdbc 로 본다(@SQLRestriction 우회). */
    private ApplicationRow rowOf(Application application) {
        return jdbcTemplate.queryForObject(
                "SELECT status, ended_by_club_deactivation FROM application WHERE id = ?",
                (resultSet, rowNumber) -> new ApplicationRow(
                        resultSet.getString("status"), resultSet.getBoolean("ended_by_club_deactivation")),
                application.getId());
    }

    private void assertRejectionHistory(Application application, String previousStatus) {
        List<Map<String, Object>> historyRows = jdbcTemplate.queryForList(
                "SELECT previous_status, new_status, changed_by FROM application_status_history WHERE application_id = ?",
                application.getId());
        assertThat(historyRows).hasSize(1);
        assertThat(historyRows.get(0).get("previous_status")).isEqualTo(previousStatus);
        assertThat(historyRows.get(0).get("new_status")).isEqualTo("REJECTED");
        assertThat(((Number) historyRows.get(0).get("changed_by")).longValue()).isEqualTo(adminUser.getId());
    }

    private int historyCountOf(Application application) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM application_status_history WHERE application_id = ?",
                Integer.class, application.getId());
        return count == null ? 0 : count;
    }

    private Club saveClub(ClubStatus status) {
        return PendingItemsFixture.saveClub(clubRepository, status);
    }

    private Recruitment saveRecruitment(Club club, boolean closed) {
        return PendingItemsFixture.saveRecruitment(recruitmentRepository, club, today, closed);
    }

    private Application saveApplication(Recruitment recruitment, ApplicationStatus status) {
        return PendingItemsFixture.saveApplication(applicationRepository, recruitment,
                userRepository.save(UserFixture.unique()), status);
    }

    /** 테이블 이름은 이 클래스의 상수 인자뿐이다. */
    private void softDelete(String tableName, Long id) {
        jdbcTemplate.update("UPDATE " + tableName + " SET deleted_at = NOW() WHERE id = ?", id);
    }
}
