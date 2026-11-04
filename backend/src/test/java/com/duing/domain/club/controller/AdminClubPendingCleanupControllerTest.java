package com.duing.domain.club.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.InterviewRoundFixture;
import com.duing.common.fixture.InterviewScheduleFixture;
import com.duing.common.fixture.InterviewSlotFixture;
import com.duing.common.fixture.PendingItemsFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.interview.entity.InterviewRound;
import com.duing.domain.interview.entity.InterviewRoundMember;
import com.duing.domain.interview.entity.InterviewSlot;
import com.duing.domain.interview.entity.RoundStatus;
import com.duing.domain.interview.repository.InterviewRoundMemberRepository;
import com.duing.domain.interview.repository.InterviewRoundRepository;
import com.duing.domain.interview.repository.InterviewScheduleRepository;
import com.duing.domain.interview.repository.InterviewSlotRepository;
import com.duing.domain.joincode.entity.ClubJoinCode;
import com.duing.domain.joincode.entity.ClubJoinRequest;
import com.duing.domain.joincode.entity.JoinRequestStatus;
import com.duing.domain.joincode.repository.ClubJoinCodeRepository;
import com.duing.domain.joincode.repository.ClubJoinRequestRepository;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import io.restassured.response.Response;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AdminClubPendingCleanupControllerTest extends IntegrationTestBase {

    private static final String CLEANUP_PATH = "/api/v1/admin/clubs/{clubId}/pending-cleanup";
    private static final String ADMIN_CLUBS_PATH = "/api/v1/admin/clubs";

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired RecruitmentRepository recruitmentRepository;
    @Autowired ApplicationRepository applicationRepository;
    @Autowired ClubJoinCodeRepository clubJoinCodeRepository;
    @Autowired ClubJoinRequestRepository clubJoinRequestRepository;
    @Autowired InterviewRoundRepository interviewRoundRepository;
    @Autowired InterviewSlotRepository interviewSlotRepository;
    @Autowired InterviewRoundMemberRepository interviewRoundMemberRepository;
    @Autowired InterviewScheduleRepository interviewScheduleRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;
    @Autowired JdbcTemplate jdbcTemplate;
    @Autowired Clock clock;

    private User adminUser;
    private String adminToken;
    private String studentToken;
    private LocalDate today;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        // 동아리 id 와 처리자 id 가 겹치면 두 인자를 뒤바꾼 회귀를 못 잡는다 — 일부러 어긋나게 둔다.
        User studentUser = userRepository.save(UserFixture.unique());
        adminUser = userRepository.save(UserFixture.admin());
        adminToken = jwtTokenProvider.createToken(adminUser.getId(), adminUser.getRole().name());
        studentToken = jwtTokenProvider.createToken(studentUser.getId(), studentUser.getRole().name());
        today = LocalDate.now(clock);
    }

    @Test
    @DisplayName("로그인하지 않으면 401, 학생이면 403 이고 남은 미결은 그대로다")
    void rejectsAnonymousAndStudent() {
        Club club = saveClub(ClubStatus.INACTIVE);
        Application application = saveApplication(saveRecruitment(club, true), ApplicationStatus.SUBMITTED);

        RestAssured
                .when()
                    .post(CLEANUP_PATH, club.getId())
                .then()
                    .statusCode(HttpStatus.UNAUTHORIZED.value());
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when()
                    .post(CLEANUP_PATH, club.getId())
                .then()
                    .statusCode(HttpStatus.FORBIDDEN.value());

        assertThat(rowOf(application)).isEqualTo(new ApplicationRow("SUBMITTED", false));
    }

    @Test
    @DisplayName("총동연이 정리하면 마감·진행 모집의 결과 미정 지원서는 불합격·운영 중단 표시로, 대기 가입 신청은 거절로 바뀌고 처리 건수를 200 으로 돌려준다")
    void adminCleansUpPendingItemsOfInactiveClub() {
        Club club = saveClub(ClubStatus.INACTIVE);
        Recruitment openRecruitment = saveRecruitment(club, false);
        Recruitment closedRecruitment = saveRecruitment(club, true);
        Application submitted = saveApplication(openRecruitment, ApplicationStatus.SUBMITTED);
        Application onHold = saveApplication(closedRecruitment, ApplicationStatus.ON_HOLD);
        Application interviewPending = saveApplication(closedRecruitment, ApplicationStatus.INTERVIEW_PENDING);
        Application accepted = saveApplication(openRecruitment, ApplicationStatus.ACCEPTED);
        Application alreadyRejected = saveApplication(closedRecruitment, ApplicationStatus.REJECTED);
        Recruitment deletedRecruitment = saveRecruitment(club, true);
        Application onDeletedRecruitment = saveApplication(deletedRecruitment, ApplicationStatus.SUBMITTED);
        softDelete("recruitment", deletedRecruitment.getId());
        Application deletedApplication = saveApplication(openRecruitment, ApplicationStatus.SUBMITTED);
        softDelete("application", deletedApplication.getId());
        ClubJoinCode joinCode = saveJoinCode(club, closedRecruitment);
        ClubJoinRequest pendingJoinRequest = savePendingJoinRequest(club, joinCode, saveUser());
        ClubJoinRequest approvedJoinRequest = saveProcessedJoinRequest(club, joinCode, JoinRequestStatus.APPROVED);
        ClubJoinRequest rejectedJoinRequest = saveProcessedJoinRequest(club, joinCode, JoinRequestStatus.REJECTED);
        Club otherClub = saveClub(ClubStatus.INACTIVE);
        Recruitment otherRecruitment = saveRecruitment(otherClub, true);
        Application otherClubApplication = saveApplication(otherRecruitment, ApplicationStatus.SUBMITTED);
        ClubJoinRequest otherClubJoinRequest =
                savePendingJoinRequest(otherClub, saveJoinCode(otherClub, otherRecruitment), saveUser());

        assertThat(adminUser.getId()).as("처리자 id ≠ 동아리 id 전제").isNotEqualTo(club.getId());

        cleanup(club)
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("ok", equalTo(true))
                    .body("data.rejectedApplicationCount", equalTo(3))
                    .body("data.rejectedJoinRequestCount", equalTo(1));

        assertThat(List.of(rowOf(submitted), rowOf(onHold), rowOf(interviewPending)))
                .as("[제출(진행 모집), 보류(마감 모집), 면접 대기(마감 모집)]")
                .containsOnly(new ApplicationRow("REJECTED", true));
        // 스펙 §7 — 처리자는 실행한 총동연이다.
        assertThat(jdbcTemplate.queryForList("SELECT changed_by FROM application_status_history WHERE application_id IN (?, ?, ?)",
                Long.class, submitted.getId(), onHold.getId(), interviewPending.getId()))
                .as("상태 이력 처리자").containsExactly(adminUser.getId(), adminUser.getId(), adminUser.getId());
        assertThat(jdbcTemplate.queryForObject("SELECT reviewed_by FROM club_join_request WHERE id = ?",
                Long.class, pendingJoinRequest.getId())).as("거절한 가입 신청 처리자").isEqualTo(adminUser.getId());
        assertThat(rowOf(accepted)).as("이미 합격").isEqualTo(new ApplicationRow("ACCEPTED", false));
        assertThat(rowOf(alreadyRejected)).as("이미 불합격").isEqualTo(new ApplicationRow("REJECTED", false));
        assertThat(rowOf(onDeletedRecruitment)).as("삭제된 모집").isEqualTo(new ApplicationRow("SUBMITTED", false));
        assertThat(rowOf(deletedApplication)).as("삭제된(철회한) 지원서").isEqualTo(new ApplicationRow("SUBMITTED", false));
        assertThat(rowOf(otherClubApplication)).as("다른 동아리").isEqualTo(new ApplicationRow("SUBMITTED", false));
        assertThat(joinRequestStatusOf(pendingJoinRequest)).isEqualTo("REJECTED");
        assertThat(jdbcTemplate.queryForObject("SELECT reject_reason FROM club_join_request WHERE id = ?",
                String.class, pendingJoinRequest.getId())).isEqualTo("동아리 운영 중단");
        assertThat(List.of(joinRequestStatusOf(approvedJoinRequest), joinRequestStatusOf(rejectedJoinRequest),
                joinRequestStatusOf(otherClubJoinRequest)))
                .as("[승인됨, 이미 거절됨, 다른 동아리 대기]")
                .containsExactly("APPROVED", "REJECTED", "PENDING");
        assertThat(countOf("SELECT used_count FROM club_join_code WHERE id = ?", joinCode.getId()))
                .as("거절한 대기 신청의 자리를 돌려준다(1 → 0)").isZero();
    }

    @ParameterizedTest(name = "{0}")
    @EnumSource(value = ClubStatus.class, names = {"PENDING_APPROVAL", "ACTIVE", "REJECTED"})
    @DisplayName("운영 중단이 아닌 동아리를 정리하려 하면 409 와 안내 문구를 주고 아무것도 바꾸지 않는다")
    void rejectsClubThatIsNotInactive(ClubStatus status) {
        Club club = saveClub(status);
        Application application = saveApplication(saveRecruitment(club, false), ApplicationStatus.SUBMITTED);

        cleanup(club)
                .then()
                    .statusCode(HttpStatus.CONFLICT.value())
                    .body("ok", equalTo(false))
                    .body("message", equalTo("운영 중단 동아리만 남은 미결을 정리할 수 있어요."));

        assertThat(rowOf(application)).isEqualTo(new ApplicationRow("SUBMITTED", false));
    }

    @Test
    @DisplayName("없는 동아리와 폐쇄(soft-delete)된 동아리는 404 다")
    void returns404ForMissingOrClosedClub() {
        Club closedClub = saveClub(ClubStatus.INACTIVE);
        softDelete("club", closedClub.getId());

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when()
                    .post(CLEANUP_PATH, Long.MAX_VALUE)
                .then()
                    .statusCode(HttpStatus.NOT_FOUND.value());
        cleanup(closedClub)
                .then()
                    .statusCode(HttpStatus.NOT_FOUND.value())
                    .body("message", equalTo("동아리를 찾을 수 없습니다."));
    }

    @Test
    @DisplayName("정리 직전 남은 미결 목록 행의 두 건수가 정리 응답 건수와 같고, 정리 뒤 그 동아리는 필터에서 빠지며 행 건수는 0 이다 — 삭제·탈퇴·다른 동아리 데이터가 섞여도")
    void listCountsEqualCleanupResultAndClubLeavesFilterAfterCleanup() {
        Club club = saveClub(ClubStatus.INACTIVE);
        Recruitment openRecruitment = saveRecruitment(club, false);
        Recruitment closedRecruitment = saveRecruitment(club, true);
        saveApplication(openRecruitment, ApplicationStatus.SUBMITTED);
        saveApplication(closedRecruitment, ApplicationStatus.INTERVIEW_PENDING);
        Recruitment deletedRecruitment = saveRecruitment(club, true);
        saveApplication(deletedRecruitment, ApplicationStatus.ON_HOLD);
        softDelete("recruitment", deletedRecruitment.getId());
        softDelete("application", saveApplication(openRecruitment, ApplicationStatus.ON_HOLD).getId());
        User withdrawnApplicant = saveUser();
        PendingItemsFixture.saveApplication(applicationRepository, closedRecruitment, withdrawnApplicant,
                ApplicationStatus.SUBMITTED);
        ClubJoinCode joinCode = saveJoinCode(club, closedRecruitment);
        savePendingJoinRequest(club, joinCode, saveUser());
        User withdrawnRequester = saveUser();
        savePendingJoinRequest(club, joinCode, withdrawnRequester);
        ClubJoinRequest deletedPendingJoinRequest = savePendingJoinRequest(club, joinCode, saveUser());
        softDelete("club_join_request", deletedPendingJoinRequest.getId());
        softDelete("users", withdrawnApplicant.getId());
        softDelete("users", withdrawnRequester.getId());
        Club otherClub = saveClub(ClubStatus.INACTIVE);
        Recruitment otherRecruitment = saveRecruitment(otherClub, true);
        saveApplication(otherRecruitment, ApplicationStatus.SUBMITTED);
        savePendingJoinRequest(otherClub, saveJoinCode(otherClub, otherRecruitment), saveUser());

        // 목록(JSON 숫자)과 응답 건수를 모두 int 로 받아 같은 타입끼리 비교한다.
        Response listBefore = adminClubs(true, null);
        int listedApplicationCount = listBefore.jsonPath().getInt(rowPathOf(club) + ".undecidedApplicationCount");
        int listedJoinRequestCount = listBefore.jsonPath().getInt(rowPathOf(club) + ".pendingJoinRequestCount");
        Response cleanupResponse = cleanup(club);

        assertThat(cleanupResponse.statusCode()).isEqualTo(HttpStatus.OK.value());
        assertThat(List.of(cleanupResponse.jsonPath().getInt("data.rejectedApplicationCount"),
                cleanupResponse.jsonPath().getInt("data.rejectedJoinRequestCount")))
                .as("[지원서, 가입 신청] — 정리 직전 목록 행 건수 = 정리 응답 건수")
                .isEqualTo(List.of(listedApplicationCount, listedJoinRequestCount))
                // 두 쪽이 함께 0 이면 동치가 공허하게 성립한다 — 제출·면접 대기·탈퇴 지원자 3건, 대기·탈퇴 신청자 2건으로 못박는다.
                // soft-delete 된 대기 신청은 목록 건수에도 정리 대상에도 들지 않는다.
                .isEqualTo(List.of(3, 2));
        assertThat(joinRequestStatusOf(deletedPendingJoinRequest)).as("soft-delete 된 대기 신청").isEqualTo("PENDING");
        assertThat(adminClubs(true, null).jsonPath().getList("data.content.id", Long.class))
                .as("정리한 동아리는 필터에서 빠지고 다른 동아리는 남는다")
                .doesNotContain(club.getId())
                .contains(otherClub.getId());
        adminClubs(false, ClubStatus.INACTIVE)
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body(rowPathOf(club) + ".undecidedApplicationCount", equalTo(0))
                    .body(rowPathOf(club) + ".pendingJoinRequestCount", equalTo(0));
    }

    @Test
    @DisplayName("두 번째 정리는 남은 것이 없어 0·0 으로 성공한다")
    void secondCleanupReturnsZeroCounts() {
        Club club = saveClub(ClubStatus.INACTIVE);
        saveApplication(saveRecruitment(club, true), ApplicationStatus.SUBMITTED);

        cleanup(club)
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.rejectedApplicationCount", equalTo(1));
        cleanup(club)
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.rejectedApplicationCount", equalTo(0))
                    .body("data.rejectedJoinRequestCount", equalTo(0));
    }

    @Test
    @DisplayName("정리는 면접 라운드·슬롯·대상·일정을 지우지 않는다 — 운영 중단은 다시 살아날 수 있어 이력을 남긴다")
    void cleanupKeepsInterviewRecords() {
        Club club = saveClub(ClubStatus.INACTIVE);
        Recruitment recruitment = saveRecruitment(club, true);
        User applicant = saveUser();
        Application interviewPending = PendingItemsFixture.saveApplication(applicationRepository, recruitment, applicant,
                ApplicationStatus.INTERVIEW_PENDING);
        InterviewRound round = interviewRoundRepository.save(InterviewRoundFixture.withStatus(
                recruitment.getId(), LocalDateTime.now(clock).minusDays(5), "공학관 101호", RoundStatus.SCHEDULED));
        InterviewSlot slot = interviewSlotRepository.save(
                InterviewSlotFixture.create(round.getId(), LocalDateTime.now(clock).minusDays(2), 5));
        // composite FK (round_id, application_id) → interview_round_member — 일정보다 먼저 저장한다.
        interviewRoundMemberRepository.save(InterviewRoundMember.invite(round.getId(), interviewPending.getId()));
        interviewScheduleRepository.save(
                InterviewScheduleFixture.assigned(interviewPending.getId(), slot.getId(), round.getId()));

        cleanup(club)
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.rejectedApplicationCount", equalTo(1));

        assertThat(List.of(
                countOf("SELECT COUNT(*) FROM interview_round WHERE id = ? AND deleted_at IS NULL", round.getId()),
                countOf("SELECT COUNT(*) FROM interview_slot WHERE round_id = ? AND deleted_at IS NULL", round.getId()),
                countOf("SELECT COUNT(*) FROM interview_round_member WHERE round_id = ?", round.getId()),
                countOf("SELECT COUNT(*) FROM interview_schedule WHERE application_id = ? AND deleted_at IS NULL",
                        interviewPending.getId())))
                .as("[라운드, 슬롯, 대상, 일정]")
                .containsExactly(1, 1, 1, 1);
        // 스펙 §9 #4 — 일정 행이 남아도 불합격 지원자의 면접 화면은 면접 구간 밖(NOT_APPLICABLE)이라 일정이 보이지 않는다.
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION,
                            "Bearer " + jwtTokenProvider.createToken(applicant.getId(), applicant.getRole().name()))
                .when()
                    .get("/api/v1/applications/{applicationId}/interview", interviewPending.getId())
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.phase", equalTo("NOT_APPLICABLE"));
    }

    private record ApplicationRow(String status, boolean endedByClubDeactivation) {
    }

    private Response cleanup(Club club) {
        return RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when()
                    .post(CLEANUP_PATH, club.getId());
    }

    private Response adminClubs(boolean needsPendingCleanup, ClubStatus status) {
        var request = RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .queryParam("needsPendingCleanup", needsPendingCleanup)
                .queryParam("size", 100);
        if (status != null) {
            request.queryParam("status", status.name());
        }
        return request.when().get(ADMIN_CLUBS_PATH);
    }

    private String rowPathOf(Club club) {
        return "data.content.find { it.id == %d }".formatted(club.getId());
    }

    /** soft-delete 행도 읽도록 jdbc 로 본다(@SQLRestriction 우회). */
    private ApplicationRow rowOf(Application application) {
        return jdbcTemplate.queryForObject(
                "SELECT status, ended_by_club_deactivation FROM application WHERE id = ?",
                (resultSet, rowNumber) -> new ApplicationRow(
                        resultSet.getString("status"), resultSet.getBoolean("ended_by_club_deactivation")),
                application.getId());
    }

    private String joinRequestStatusOf(ClubJoinRequest joinRequest) {
        return jdbcTemplate.queryForObject(
                "SELECT status FROM club_join_request WHERE id = ?", String.class, joinRequest.getId());
    }

    private int countOf(String sql, Object... arguments) {
        Integer count = jdbcTemplate.queryForObject(sql, Integer.class, arguments);
        return count == null ? 0 : count;
    }

    private Club saveClub(ClubStatus status) {
        return PendingItemsFixture.saveClub(clubRepository, status);
    }

    private Recruitment saveRecruitment(Club club, boolean closed) {
        return PendingItemsFixture.saveRecruitment(recruitmentRepository, club, today, closed);
    }

    private Application saveApplication(Recruitment recruitment, ApplicationStatus status) {
        return PendingItemsFixture.saveApplication(applicationRepository, recruitment, saveUser(), status);
    }

    private ClubJoinCode saveJoinCode(Club club, Recruitment recruitment) {
        return PendingItemsFixture.saveJoinCode(clubJoinCodeRepository, club, recruitment);
    }

    private ClubJoinRequest savePendingJoinRequest(Club club, ClubJoinCode joinCode, User requester) {
        return PendingItemsFixture.savePendingJoinRequest(clubJoinCodeRepository, clubJoinRequestRepository,
                club, joinCode, requester);
    }

    private ClubJoinRequest saveProcessedJoinRequest(Club club, ClubJoinCode joinCode, JoinRequestStatus processedStatus) {
        return PendingItemsFixture.saveProcessedJoinRequest(clubJoinRequestRepository, club, joinCode, saveUser(),
                adminUser, processedStatus, LocalDateTime.now(clock).minusDays(1));
    }

    private User saveUser() {
        return userRepository.save(UserFixture.unique());
    }

    /** 테이블 이름은 이 클래스의 상수 인자뿐이다. */
    private void softDelete(String tableName, Long id) {
        jdbcTemplate.update("UPDATE " + tableName + " SET deleted_at = NOW() WHERE id = ?", id);
    }
}
