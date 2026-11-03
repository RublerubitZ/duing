package com.duing.domain.recruitment.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.FixedClockConfig;
import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.ClubFixture;
import com.duing.common.fixture.InterviewRoundFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.interview.entity.InterviewRound;
import com.duing.domain.interview.entity.RoundStatus;
import com.duing.domain.interview.repository.InterviewRoundRepository;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import com.duing.domain.recruitment.entity.TargetRole;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.recruitment.service.dto.query.AutoCloseOutlookQuery;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.domain.user.service.UserService;
import com.duing.global.auth.JwtTokenProvider;
import com.duing.global.frontend.FrontendRevalidator;
import io.restassured.RestAssured;
import io.restassured.response.Response;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

/**
 * 자동 마감 전망(#1572·#1583) — 화면이 보는 전망과 잡의 마감 판정이 같은 계산에서 나오는지,
 * 운영진 통계 요약과 총동연 목록이 같은 모집에 같은 값을 싣는지 본다.
 *
 * <p>오늘은 {@link FixedClockConfig#TODAY}(2026-06-15 KST)이고 자동 마감을 켠다(꺼져 있으면 화면용 전망은 없다).
 * 동아리당 OPEN 모집은 1건(uk_recruitment_club_active)이라 모집마다 동아리를 따로 만든다.
 */
@Import({TestcontainersConfiguration.class, FixedClockConfig.class})
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "duing.recruitment.auto-close.enabled=true")
class AutoCloseOutlookTest extends IntegrationTestBase {

    private static final LocalDate TODAY = FixedClockConfig.TODAY;
    private static final String SUMMARY_PATH = "/api/v1/leader/recruitments/{recruitmentId}/stats/summary";
    private static final String ADMIN_LIST_PATH = "/api/v1/admin/recruitments";

    @LocalServerPort int port;

    @MockitoBean FrontendRevalidator frontendRevalidator;

    @Autowired RecruitmentAutoCloseService recruitmentAutoCloseService;
    @Autowired RecruitmentRepository recruitmentRepository;
    @Autowired ApplicationRepository applicationRepository;
    @Autowired InterviewRoundRepository interviewRoundRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired UserRepository userRepository;
    @Autowired UserService userService;
    @Autowired JdbcTemplate jdbcTemplate;
    @Autowired JwtTokenProvider jwtTokenProvider;

    private final AtomicLong sequence = new AtomicLong();
    private User leader;
    private String leaderToken;
    private String adminToken;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        leader = userRepository.save(UserFixture.unique());
        leaderToken = jwtTokenProvider.createToken(leader.getId(), leader.getRole().name());
        User admin = userRepository.save(UserFixture.admin());
        adminToken = jwtTokenProvider.createToken(admin.getId(), admin.getRole().name());
    }

    @Test
    @DisplayName("유예 마지막 날에는 막는 것이 없어도 닫지 않고, 전망은 다음 날 자동 마감을 알린다")
    void lastGraceDayIsNotClosable() {
        assertOutlookMatchesJob(saveSelfRecruitmentEndedDaysAgo(7), TODAY.plusDays(1), false, 0, 0);
    }

    @Test
    @DisplayName("유예가 끝난 날 막는 것이 없으면 잡이 닫고, 전망도 닫을 수 있다고 본다")
    void closesOnTheFirstClosableDay() {
        assertOutlookMatchesJob(saveSelfRecruitmentEndedDaysAgo(8), TODAY, true, 0, 0);
    }

    @Test
    @DisplayName("결과 없는 지원이 남은 모집은 닫지 않고 전망이 그 수를 알린다 — 삭제된 지원과 탈퇴한 지원자의 지원은 세지 않는다")
    void undecidedApplicationsBlockClosing() {
        Recruitment blocked = saveSelfRecruitmentEndedDaysAgo(10);
        saveApplication(blocked, ApplicationStatus.SUBMITTED);
        saveApplication(blocked, ApplicationStatus.INTERVIEW_PENDING);
        saveApplication(blocked, ApplicationStatus.ACCEPTED);
        assertOutlookMatchesJob(blocked, TODAY.minusDays(2), true, 2, 0);

        Recruitment onlyDeleted = saveSelfRecruitmentEndedDaysAgo(10);
        Application deletedApplication = saveApplication(onlyDeleted, ApplicationStatus.SUBMITTED);
        jdbcTemplate.update("UPDATE application SET deleted_at = NOW() WHERE id = ?", deletedApplication.getId());
        assertOutlookMatchesJob(onlyDeleted, TODAY.minusDays(2), true, 0, 0);

        Recruitment onlyWithdrawn = saveSelfRecruitmentEndedDaysAgo(10);
        Application withdrawnApplication = saveApplication(onlyWithdrawn, ApplicationStatus.ON_HOLD);
        userService.withdraw(withdrawnApplication.getUser().getId());
        assertOutlookMatchesJob(onlyWithdrawn, TODAY.minusDays(2), true, 0, 0);
    }

    @Test
    @DisplayName("진행 중 면접 라운드가 남은 모집은 닫지 않는다 — 확정·취소·삭제된 라운드는 막지 않는다")
    void inProgressRoundsBlockClosing() {
        Recruitment blocked = saveSelfRecruitmentEndedDaysAgo(10);
        saveRound(blocked, RoundStatus.COLLECTING);
        saveRound(blocked, RoundStatus.SCHEDULED);
        assertOutlookMatchesJob(blocked, TODAY.minusDays(2), true, 0, 1);

        Recruitment finishedRoundsOnly = saveSelfRecruitmentEndedDaysAgo(10);
        saveRound(finishedRoundsOnly, RoundStatus.SCHEDULED);
        saveRound(finishedRoundsOnly, RoundStatus.CANCELLED);
        interviewRoundRepository.delete(saveRound(finishedRoundsOnly, RoundStatus.DRAFT));
        assertOutlookMatchesJob(finishedRoundsOnly, TODAY.minusDays(2), true, 0, 0);
    }

    @Test
    @DisplayName("외부 폼 모집은 결과 없는 지원·라운드가 없어 날짜만으로 닫힌다")
    void externalFormClosesByDateOnly() {
        assertOutlookMatchesJob(saveExternalRecruitmentEndedDaysAgo(3), TODAY.plusDays(5), false, 0, 0);
        assertOutlookMatchesJob(saveExternalRecruitmentEndedDaysAgo(8), TODAY, true, 0, 0);
    }

    @Test
    @DisplayName("기간이 끝난 OPEN 모집이 아니면 전망이 없고 잡도 닫지 않는다 — 상시모집·기간 중·이미 마감")
    void noOutlookOutsideExpiredOpen() {
        Recruitment alwaysOpen = saveSelfRecruitment(TODAY.minusDays(60), null);
        Recruitment inPeriod = saveSelfRecruitment(TODAY.minusDays(3), TODAY.plusDays(3));
        Recruitment closed = saveSelfRecruitmentEndedDaysAgo(10);
        closed.close(TODAY.minusDays(1).atStartOfDay());
        recruitmentRepository.save(closed);

        for (Recruitment recruitment : List.of(alwaysOpen, inPeriod, closed)) {
            assertThat(recruitmentAutoCloseService.findOutlook(reload(recruitment))).isNull();
            assertThat(recruitmentAutoCloseService.closeIfSettled(recruitment.getId())).isFalse();
        }
    }

    @Test
    @DisplayName("운영진 통계 요약과 총동연 목록은 같은 모집에 같은 자동 마감 전망을 싣고, 기간 중 모집에는 싣지 않는다")
    void summaryAndAdminListCarryTheSameOutlook() {
        Recruitment inGrace = saveSelfRecruitmentEndedDaysAgo(2);
        Recruitment blockedByRound = saveSelfRecruitmentEndedDaysAgo(10);
        saveRound(blockedByRound, RoundStatus.COLLECTING);
        Recruitment blockedByApplication = saveSelfRecruitmentEndedDaysAgo(10);
        saveApplication(blockedByApplication, ApplicationStatus.SUBMITTED);
        Recruitment externalInGrace = saveExternalRecruitmentEndedDaysAgo(2);
        Recruitment inPeriod = saveSelfRecruitment(TODAY.minusDays(3), TODAY.plusDays(5));

        Response adminList = RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get(ADMIN_LIST_PATH);
        adminList.then().statusCode(HttpStatus.OK.value());

        assertSameOutlook(adminList, inGrace, expectedOutlook(TODAY.plusDays(6), false, 0, 0));
        assertSameOutlook(adminList, blockedByRound, expectedOutlook(TODAY.minusDays(2), true, 0, 1));
        assertSameOutlook(adminList, blockedByApplication, expectedOutlook(TODAY.minusDays(2), true, 1, 0));
        assertSameOutlook(adminList, externalInGrace, expectedOutlook(TODAY.plusDays(6), false, 0, 0));
        assertThat(summaryOutlookOf(inPeriod)).as("기간 중 모집 — 통계 요약").isNull();
        assertThat(adminRowOf(adminList, inPeriod)).as("기간 중 모집 — 총동연 목록").containsEntry("autoClose", null);
    }

    // ── 헬퍼 ─────────────────────────────────────────────────────────────────

    /** 화면 전망 값을 확인한 뒤 잡을 돌려, 잡의 마감 여부가 전망의 '유예 끝남·막는 것 없음'과 같은지 본다. */
    private void assertOutlookMatchesJob(Recruitment recruitment, LocalDate closesOn, boolean gracePeriodOver,
                                         long undecidedApplicationCount, long inProgressRoundCount) {
        AutoCloseOutlookQuery outlook = recruitmentAutoCloseService.findOutlook(reload(recruitment));
        assertThat(outlook).isEqualTo(new AutoCloseOutlookQuery(
                closesOn, gracePeriodOver, undecidedApplicationCount, inProgressRoundCount));

        boolean closed = recruitmentAutoCloseService.closeIfSettled(recruitment.getId());

        assertThat(closed).as("잡의 마감 = 전망의 '유예 끝남·막는 것 없음'").isEqualTo(outlook.closable());
        assertThat(reload(recruitment).getStatus())
                .isEqualTo(closed ? RecruitmentStatus.CLOSED : RecruitmentStatus.OPEN);
    }

    private void assertSameOutlook(Response adminList, Recruitment recruitment, Map<String, Object> expected) {
        Map<String, Object> summaryOutlook = summaryOutlookOf(recruitment);
        assertThat(summaryOutlook).as("통계 요약 — 모집 %d", recruitment.getId())
                .containsExactlyInAnyOrderEntriesOf(expected);
        assertThat(adminRowOf(adminList, recruitment).get("autoClose"))
                .as("총동연 목록 — 모집 %d", recruitment.getId()).isEqualTo(summaryOutlook);
    }

    private static Map<String, Object> expectedOutlook(LocalDate closesOn, boolean gracePeriodOver,
                                                       int undecidedApplicationCount, int inProgressRoundCount) {
        return Map.of(
                "closesOn", closesOn.toString(),
                "gracePeriodOver", gracePeriodOver,
                "undecidedApplicationCount", undecidedApplicationCount,
                "inProgressRoundCount", inProgressRoundCount);
    }

    private Map<String, Object> summaryOutlookOf(Recruitment recruitment) {
        Response summary = RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get(SUMMARY_PATH, recruitment.getId());
        summary.then().statusCode(HttpStatus.OK.value());
        assertThat(summary.jsonPath().getMap("data")).containsKey("autoClose");
        return summary.jsonPath().getMap("data.autoClose");
    }

    private static Map<String, Object> adminRowOf(Response adminList, Recruitment recruitment) {
        return adminList.jsonPath().getMap("data.find { it.recruitmentId == %d }".formatted(recruitment.getId()));
    }

    private Club saveActiveClubLedByLeader() {
        Club club = ClubFixture.academic("자동마감전망동아리-" + sequence.incrementAndGet());
        club.changeStatus(ClubStatus.ACTIVE, null, null);
        Club savedClub = clubRepository.save(club);
        clubMemberRepository.save(ClubMember.asLeader(savedClub, leader));
        return savedClub;
    }

    private Recruitment saveSelfRecruitment(LocalDate startDate, LocalDate endDate) {
        return recruitmentRepository.save(
                Recruitment.create(saveActiveClubLedByLeader(), "기간 모집", "내용", startDate, endDate, 10));
    }

    private Recruitment saveSelfRecruitmentEndedDaysAgo(long daysSinceEnd) {
        LocalDate endDate = TODAY.minusDays(daysSinceEnd);
        return saveSelfRecruitment(endDate.minusDays(14), endDate);
    }

    private Recruitment saveExternalRecruitmentEndedDaysAgo(long daysSinceEnd) {
        LocalDate endDate = TODAY.minusDays(daysSinceEnd);
        return recruitmentRepository.save(Recruitment.createWithOptions(
                saveActiveClubLedByLeader(), "외부 폼 모집", "내용", endDate.minusDays(14), endDate, 10,
                ApplicationMode.EXTERNAL, "https://forms.example.com/duing", false, TargetRole.MEMBER,
                null, null, false));
    }

    /** 지원서를 제출한 뒤 상태만 JDBC 로 옮긴다 — 전이 규칙을 거치지 않고 원하는 상태를 바로 만든다. */
    private Application saveApplication(Recruitment recruitment, ApplicationStatus status) {
        User applicant = userRepository.save(UserFixture.unique());
        Application application = applicationRepository.save(Application.submit(recruitment, applicant, List.of()));
        jdbcTemplate.update("UPDATE application SET status = ? WHERE id = ?", status.name(), application.getId());
        return application;
    }

    private InterviewRound saveRound(Recruitment recruitment, RoundStatus status) {
        return interviewRoundRepository.save(InterviewRoundFixture.withStatus(
                recruitment.getId(), TODAY.atStartOfDay().minusDays(3), "학생회관 201호", status));
    }

    private Recruitment reload(Recruitment recruitment) {
        return recruitmentRepository.findById(recruitment.getId()).orElseThrow();
    }
}
