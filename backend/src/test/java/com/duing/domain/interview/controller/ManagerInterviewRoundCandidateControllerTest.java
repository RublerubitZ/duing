package com.duing.domain.interview.controller;

import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.InterviewRoundFixture;
import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.interview.entity.InterviewRound;
import com.duing.domain.interview.entity.InterviewRoundMember;
import com.duing.domain.interview.entity.RoundMemberStatus;
import com.duing.domain.interview.entity.RoundStatus;
import com.duing.domain.interview.repository.InterviewRoundMemberRepository;
import com.duing.domain.interview.repository.InterviewRoundRepository;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.TargetRole;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
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
import org.springframework.test.util.ReflectionTestUtils;

// 라운드 생성 wizard Step1 / 상시모집 대기열의 후보 조회를 검증한다.
// 후보 = 후보 상태(기본 INTERVIEW_PENDING, 옵션 UNDER_REVIEW 포함) && placement-active 멤버십 없음 (스펙 §5.4·§9.1 API 1).
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ManagerInterviewRoundCandidateControllerTest extends IntegrationTestBase {

    private static final String CANDIDATES_PATH = "/api/v1/recruitments/{recruitmentId}/interview-round-candidates";

    @LocalServerPort
    private int port;

    @Autowired private UserRepository userRepository;
    @Autowired private ClubRepository clubRepository;
    @Autowired private ClubMemberRepository clubMemberRepository;
    @Autowired private RecruitmentRepository recruitmentRepository;
    @Autowired private ApplicationRepository applicationRepository;
    @Autowired private InterviewRoundRepository interviewRoundRepository;
    @Autowired private InterviewRoundMemberRepository interviewRoundMemberRepository;
    @Autowired private JwtTokenProvider jwtTokenProvider;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private User leader;
    private String leaderToken;
    private Recruitment recruitment;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        leader = saveUser("리더");
        leaderToken = jwtTokenProvider.createToken(leader.getId(), leader.getRole().name());
        Club club = saveActiveClub("후보동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        recruitment = saveInterviewRecruitment(club, "후보모집");
    }

    @Test
    @DisplayName("기본 호출은 면접 대기열만 반환한다 — 서류 검토 중 지원자는 포함되지 않는다")
    void defaultCallReturnsQueueOnly() {
        Application queued = saveInterviewPendingApplication("대기열");
        saveUnderReviewApplication("서류중");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get(CANDIDATES_PATH, recruitment.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data", hasSize(1))
                .body("data[0].applicationId", equalTo(queued.getId().intValue()))
                .body("data[0].status", equalTo("INTERVIEW_PENDING"));
    }

    @Test
    @DisplayName("includeUnderReview=true 면 서류 검토 중 지원자도 후보에 포함된다")
    void includeUnderReviewAddsUnderReviewApplicants() {
        Application queued = saveInterviewPendingApplication("대기열");
        Application reviewing = saveUnderReviewApplication("서류중");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .queryParam("includeUnderReview", true)
                .when().get(CANDIDATES_PATH, recruitment.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data", hasSize(2))
                .body("data.applicationId", containsInAnyOrder(
                        queued.getId().intValue(), reviewing.getId().intValue()));
    }

    @Test
    @DisplayName("SUBMITTED·ACCEPTED·REJECTED 지원자는 어떤 옵션에서도 후보에 포함되지 않는다")
    void terminalAndUnreviewedStatusesAreNeverCandidates() {
        saveApplicationWithStatus("미열람", ApplicationStatus.SUBMITTED);
        saveApplicationWithStatus("합격", ApplicationStatus.ACCEPTED);
        saveApplicationWithStatus("불합격", ApplicationStatus.REJECTED);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .queryParam("includeUnderReview", true)
                .when().get(CANDIDATES_PATH, recruitment.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data", hasSize(0));
    }

    @Test
    @DisplayName("발송 전(DRAFT) 라운드에 소속된 지원자도 placement 기준으로는 후보에서 제외된다")
    void draftRoundMemberIsExcludedFromCandidates() {
        Application application = saveInterviewPendingApplication("드래프트소속");
        InterviewRound draftRound = interviewRoundRepository.save(
                InterviewRoundFixture.draft(recruitment.getId(), LocalDateTime.now().plusDays(7)));
        interviewRoundMemberRepository.save(
                InterviewRoundMember.invite(draftRound.getId(), application.getId()));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get(CANDIDATES_PATH, recruitment.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data", hasSize(0));
    }

    @Test
    @DisplayName("일정이 확정된(SCHEDULED) 라운드의 배정 멤버는 후보·대기열에 다시 나타나지 않는다")
    void scheduledRoundMemberNeverReentersQueue() {
        // 더블부킹 회귀 테스트 (스펙 §11 필수) — placement 정의에서 SCHEDULED 를 빼면 이 테스트가 깨진다.
        Application application = saveInterviewPendingApplication("확정자");
        InterviewRound scheduledRound = interviewRoundRepository.save(InterviewRoundFixture.withStatus(
                recruitment.getId(), LocalDateTime.now().minusDays(1), "본관 201호", RoundStatus.SCHEDULED));
        InterviewRoundMember member = InterviewRoundMember.invite(scheduledRound.getId(), application.getId());
        ReflectionTestUtils.setField(member, "status", RoundMemberStatus.ASSIGNED);
        interviewRoundMemberRepository.save(member);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get(CANDIDATES_PATH, recruitment.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data", hasSize(0));
    }

    @Test
    @DisplayName("진행 중인 라운드에서 제외(EXCLUDED)된 지원자는 즉시 대기열로 복귀한다")
    void excludedMemberReentersQueueImmediately() {
        Application application = saveInterviewPendingApplication("제외자");
        InterviewRound collectingRound = interviewRoundRepository.save(InterviewRoundFixture.withStatus(
                recruitment.getId(), LocalDateTime.now().plusDays(7), null, RoundStatus.COLLECTING));
        InterviewRoundMember member = InterviewRoundMember.invite(collectingRound.getId(), application.getId());
        ReflectionTestUtils.setField(member, "status", RoundMemberStatus.EXCLUDED);
        interviewRoundMemberRepository.save(member);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get(CANDIDATES_PATH, recruitment.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data", hasSize(1))
                .body("data[0].applicationId", equalTo(application.getId().intValue()));
    }

    @Test
    @DisplayName("취소(CANCELLED)된 라운드의 멤버였던 지원자는 대기열로 복귀한다")
    void cancelledRoundMemberReentersQueue() {
        Application application = saveInterviewPendingApplication("취소복귀");
        InterviewRound cancelledRound = interviewRoundRepository.save(InterviewRoundFixture.withStatus(
                recruitment.getId(), LocalDateTime.now().plusDays(7), null, RoundStatus.CANCELLED));
        interviewRoundMemberRepository.save(
                InterviewRoundMember.invite(cancelledRound.getId(), application.getId()));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get(CANDIDATES_PATH, recruitment.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data", hasSize(1))
                .body("data[0].applicationId", equalTo(application.getId().intValue()));
    }

    @Test
    @DisplayName("해당 동아리 운영진이 아니면 후보를 조회할 수 없다")
    void nonManagerCannotQueryCandidates() {
        User outsider = saveUser("외부인");
        String outsiderToken = jwtTokenProvider.createToken(outsider.getId(), outsider.getRole().name());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + outsiderToken)
                .when().get(CANDIDATES_PATH, recruitment.getId())
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("면접을 사용하지 않는 모집의 후보 조회는 400 으로 거부된다")
    void interviewNotUsedRecruitmentIsRejected() {
        Recruitment simpleRecruitment = saveSimpleRecruitment("면접없는모집");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get(CANDIDATES_PATH, simpleRecruitment.getId())
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("존재하지 않는 모집의 후보 조회는 404 를 반환한다")
    void unknownRecruitmentReturnsNotFound() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get(CANDIDATES_PATH, 999_999L)
                .then().statusCode(HttpStatus.NOT_FOUND.value());
    }

    // ── 헬퍼 (LeaderApplicantDetailInterviewTest 패턴) ───────────────────────────

    private User saveUser(String nameSuffix) {
        long unique = sequence.incrementAndGet();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                nameSuffix + unique,
                "candidate" + unique + "@daegu.ac.kr",
                "hash",
                UserRole.STUDENT,
                Grade.FRESHMAN,
                College.IT_ENGINEERING,
                "컴퓨터공학",
                "010-0000-0000",
                LocalDateTime.now()));
    }

    private Club saveActiveClub(String name) {
        Club club = Club.create(name + sequence.incrementAndGet(),
                ClubCategory.ACADEMIC, "공학계열", "설명", null);
        ReflectionTestUtils.setField(club, "status", ClubStatus.ACTIVE);
        return clubRepository.save(club);
    }

    private Recruitment saveInterviewRecruitment(Club club, String title) {
        LocalDate today = LocalDate.now();
        return recruitmentRepository.save(Recruitment.createWithOptions(club,
                title + "-" + sequence.incrementAndGet(), null,
                today.minusDays(1), today.plusDays(7), 10,
                ApplicationMode.SELF, null,
                true, TargetRole.MEMBER,
                today.plusDays(7), today.plusDays(14),
                false));
    }

    private Recruitment saveSimpleRecruitment(String title) {
        LocalDate today = LocalDate.now();
        Club club = saveActiveClub("면접없는동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        return recruitmentRepository.save(Recruitment.create(club,
                title + "-" + sequence.incrementAndGet(), null,
                today.minusDays(1), today.plusDays(7), 10));
    }

    private Application saveInterviewPendingApplication(String applicantSuffix) {
        Application application = saveUnderReviewApplication(applicantSuffix);
        application.transitionTo(ApplicationStatus.INTERVIEW_PENDING, true);
        return applicationRepository.save(application);
    }

    private Application saveUnderReviewApplication(String applicantSuffix) {
        User applicant = saveUser(applicantSuffix);
        Application application = applicationRepository.save(
                Application.submit(recruitment, applicant, List.of()));
        application.transitionTo(ApplicationStatus.UNDER_REVIEW, true);
        return applicationRepository.save(application);
    }

    private void saveApplicationWithStatus(String applicantSuffix, ApplicationStatus status) {
        User applicant = saveUser(applicantSuffix);
        Application application = applicationRepository.save(
                Application.submit(recruitment, applicant, List.of()));
        if (status != ApplicationStatus.SUBMITTED) {
            // 전이 규칙을 우회하지 않으면 ACCEPTED/REJECTED 셋업이 번거로우므로
            // 셋업 한정으로 리플렉션을 사용한다 (saveActiveClub 의 ClubStatus 전례).
            ReflectionTestUtils.setField(application, "status", status);
            application = applicationRepository.save(application);
        }
    }
}
