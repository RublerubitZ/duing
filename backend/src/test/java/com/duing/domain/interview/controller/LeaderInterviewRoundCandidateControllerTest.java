package com.duing.domain.interview.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;

import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.InterviewRoundFixture;
import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.club.entity.Club;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.interview.entity.InterviewRound;
import com.duing.domain.interview.entity.InterviewRoundMember;
import com.duing.domain.interview.entity.RoundMemberStatus;
import com.duing.domain.interview.entity.RoundStatus;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.user.entity.User;
import com.duing.global.time.TimeMapper;
import io.restassured.RestAssured;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;

// 라운드 생성 wizard Step1 / 상시모집 대기열의 후보 조회를 검증한다.
// 후보 = 후보 상태(기본 INTERVIEW_PENDING, 옵션 미결정(SUBMITTED·ON_HOLD) 포함) && placement-active 멤버십 없음 (스펙 §5.4·§9.1 API 1).
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class LeaderInterviewRoundCandidateControllerTest extends InterviewControllerTestSupport {

    private static final String CANDIDATES_PATH = "/api/v1/leader/recruitments/{recruitmentId}/interview-round-candidates";

    @LocalServerPort
    private int port;

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
    @DisplayName("기본 호출은 면접 대기열만 반환한다 — 아직 결정하지 않은 지원자는 포함되지 않는다")
    void defaultCallReturnsQueueOnly() {
        Application queued = saveInterviewPendingApplication(recruitment, "대기열");
        saveSubmittedApplication(recruitment, "지원완료");
        saveOnHoldApplication(recruitment, "보류");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get(CANDIDATES_PATH, recruitment.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data", hasSize(1))
                .body("data[0].applicationId", equalTo(queued.getId().intValue()))
                .body("data[0].status", equalTo("INTERVIEW_PENDING"));
    }

    @Test
    @DisplayName("후보 한 건은 9개 필드를 모두 담고, 각 값이 해당 지원서·지원자의 것과 일치한다")
    void candidateRowCarriesEveryContractField() {
        User applicant = saveUser("계약검증");
        Application application = applicationRepository.save(Application.submit(recruitment, applicant, List.of()));
        application.transitionTo(ApplicationStatus.INTERVIEW_PENDING, true);
        application = applicationRepository.save(application);
        // 지원서 시각은 DB 에 저장된 값(마이크로초 절삭)을 기준으로 비교한다 — 저장 직후 인메모리 엔티티의
        // 나노초 값과 달라질 수 있어, 응답과 같은 출처인 DB 를 다시 읽는다.
        LocalDateTime persistedCreatedAt = applicationRepository.findById(application.getId())
                .orElseThrow().getCreatedAt();
        // 같은 타입(String·Long) 필드끼리 자리가 바뀌어도 잡히도록, 비교 대상 값이 서로 다름을 먼저 못 박는다.
        assertThat(List.of(applicant.getName(), applicant.getStudentId(), applicant.getMajor()))
                .as("이름·학번·전공이 같은 값이면 필드 스왑을 검출할 수 없다").doesNotHaveDuplicates();
        assertThat(application.getId())
                .as("applicationId·userId 가 같은 값이면 필드 스왑을 검출할 수 없다").isNotEqualTo(applicant.getId());

        Map<String, Object> candidate = RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get(CANDIDATES_PATH, recruitment.getId())
                .then().statusCode(HttpStatus.OK.value())
                .extract().jsonPath().getMap("data[0]");

        assertThat(candidate.keySet()).containsExactlyInAnyOrder(
                "applicationId", "userId", "userName", "studentId",
                "college", "major", "grade", "status", "submittedAt");
        assertThat(candidate.get("applicationId")).isEqualTo(application.getId().intValue());
        assertThat(candidate.get("userId")).isEqualTo(applicant.getId().intValue());
        assertThat(candidate.get("userName")).isEqualTo(applicant.getName());
        assertThat(candidate.get("studentId")).isEqualTo(applicant.getStudentId());
        assertThat(candidate.get("college")).isEqualTo("IT_ENGINEERING");
        assertThat(candidate.get("major")).isEqualTo(applicant.getMajor());
        assertThat(candidate.get("grade")).isEqualTo("FRESHMAN");
        assertThat(candidate.get("status")).isEqualTo("INTERVIEW_PENDING");
        assertThat(Instant.parse((String) candidate.get("submittedAt")))
                .as("제출 시각은 지원서 생성 시각을 절대시각으로 환산한 값이다")
                .isEqualTo(TimeMapper.systemWallClockToInstant(persistedCreatedAt));
    }

    @Test
    @DisplayName("미결정 포함 옵션을 켜면 지원 완료·보류 지원자도 후보에 포함된다")
    void includeUndecidedAddsSubmittedAndOnHoldApplicants() {
        Application queued = saveInterviewPendingApplication(recruitment, "대기열");
        Application submitted = saveSubmittedApplication(recruitment, "지원완료");
        Application onHold = saveOnHoldApplication(recruitment, "보류");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .queryParam("includeUndecided", true)
                .when().get(CANDIDATES_PATH, recruitment.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data", hasSize(3))
                .body("data.applicationId", containsInAnyOrder(
                        queued.getId().intValue(), submitted.getId().intValue(), onHold.getId().intValue()));
    }

    @Test
    @DisplayName("합격·불합격으로 종료된 지원자는 어떤 옵션에서도 후보에 포함되지 않는다")
    void terminalStatusesAreNeverCandidates() {
        saveApplicationWithStatus(recruitment, "합격", ApplicationStatus.ACCEPTED);
        saveApplicationWithStatus(recruitment, "불합격", ApplicationStatus.REJECTED);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .queryParam("includeUndecided", true)
                .when().get(CANDIDATES_PATH, recruitment.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data", hasSize(0));
    }

    @Test
    @DisplayName("발송 전(DRAFT) 라운드에 소속된 지원자도 placement 기준으로는 후보에서 제외된다")
    void draftRoundMemberIsExcludedFromCandidates() {
        Application application = saveInterviewPendingApplication(recruitment, "드래프트소속");
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
        Application application = saveInterviewPendingApplication(recruitment, "확정자");
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
        Application application = saveInterviewPendingApplication(recruitment, "제외자");
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
        Application application = saveInterviewPendingApplication(recruitment, "취소복귀");
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
        Club simpleClub = saveActiveClub("면접없는동아리");
        clubMemberRepository.save(ClubMember.asLeader(simpleClub, leader));
        Recruitment simpleRecruitment = saveSimpleRecruitment(simpleClub, "면접없는모집");

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
}
