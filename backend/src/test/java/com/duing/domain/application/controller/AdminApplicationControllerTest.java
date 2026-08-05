package com.duing.domain.application.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.ClubFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationAnswer;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.entity.ApplicationStatusHistory;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.application.repository.ApplicationStatusHistoryRepository;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubaudit.entity.ClubAuditEvent;
import com.duing.domain.clubaudit.entity.ClubAuditEventType;
import com.duing.domain.clubaudit.repository.ClubAuditEventRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentForm;
import com.duing.domain.recruitment.entity.RecruitmentQuestion;
import com.duing.domain.recruitment.entity.TargetRole;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import io.restassured.response.Response;
import java.lang.reflect.Field;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;

/**
 * 총동연(ADMIN) 지원자 목록·지원서 상세 조회 검증.
 *
 * <p>상태 시드는 지원 FSM 이 바뀌어도 살아남는 값(SUBMITTED·ACCEPTED·REJECTED)만 쓴다.
 * 중간 상태를 거치는 전이 메서드 대신 필드를 직접 세팅하는 것도 같은 이유다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AdminApplicationControllerTest extends IntegrationTestBase {

    private static final String LIST_PATH = "/api/v1/admin/recruitments/{recruitmentId}/applications";
    private static final String DETAIL_PATH = "/api/v1/admin/applications/{applicationId}";
    private static final String EXTERNAL_FORM_URL = "https://forms.example.com/duing";

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired RecruitmentRepository recruitmentRepository;
    @Autowired ApplicationRepository applicationRepository;
    @Autowired ApplicationStatusHistoryRepository applicationStatusHistoryRepository;
    @Autowired ClubAuditEventRepository clubAuditEventRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;

    private Club alphaClub;
    private Recruitment selfRecruitment;
    private RecruitmentQuestion motivationQuestion;

    private User adminUser;
    private User leaderUser;
    private String adminToken;
    private String studentToken;
    private String leaderToken;

    private Application submittedApplication;
    private Application acceptedApplication;
    private Application rejectedApplication;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;

        adminUser = userRepository.save(UserFixture.admin());
        User studentUser = userRepository.save(UserFixture.unique());
        leaderUser = userRepository.save(UserFixture.unique());
        adminToken = tokenOf(adminUser);
        studentToken = tokenOf(studentUser);
        leaderToken = tokenOf(leaderUser);

        alphaClub = clubRepository.save(ClubFixture.academic("알파동아리"));
        clubMemberRepository.save(ClubMember.asLeader(alphaClub, leaderUser));

        motivationQuestion = RecruitmentQuestion.createText("지원 동기는?");
        selfRecruitment = Recruitment.createWithOptions(alphaClub, "자체 폼 신입 모집", "내용",
                LocalDate.now().minusDays(3), LocalDate.now().plusDays(7), 10, ApplicationMode.SELF,
                null, false, TargetRole.MEMBER, null, null, false);
        selfRecruitment.attachForm(RecruitmentForm.create(selfRecruitment, List.of(motivationQuestion)));
        selfRecruitment = recruitmentRepository.save(selfRecruitment);

        // 시드 순서 = 오래된 순. 최신순 기대값은 이 순서의 역순이다.
        submittedApplication = saveApplication("김제출", ApplicationStatus.SUBMITTED, "열심히 하겠습니다.");
        acceptedApplication = saveApplication("이합격", ApplicationStatus.ACCEPTED, "잘 하겠습니다.");
        rejectedApplication = saveApplication("박탈락", ApplicationStatus.REJECTED, "노력하겠습니다.");
        applicationRepository.delete(saveApplication("최취소", ApplicationStatus.SUBMITTED, "취소했습니다."));
    }

    @Test
    @DisplayName("지원자 목록은 최신순 행과 상태별 건수·총원을 함께 주고 취소된 지원서는 빼놓는다")
    void listReturnsApplicantsWithStatusCounts() {
        Response listed = getList(adminToken, selfRecruitment.getId(), Map.of());

        listed.then()
                .statusCode(HttpStatus.OK.value())
                .body("data.total", equalTo(3))
                .body("data.applicants", hasSize(3))
                .body("data.statusCounts.SUBMITTED", equalTo(1))
                .body("data.statusCounts.ACCEPTED", equalTo(1))
                .body("data.statusCounts.REJECTED", equalTo(1));

        assertThat(listed.jsonPath().getList("data.applicants.applicationId", Long.class))
                .as("정렬을 생략하면 최신 지원자가 위다")
                .containsExactly(rejectedApplication.getId(), acceptedApplication.getId(),
                        submittedApplication.getId());

        Map<String, Object> submittedRow = findApplicantRow(listed, submittedApplication.getId());
        assertThat(submittedRow.get("userName")).isEqualTo("김제출");
        assertThat(submittedRow.get("status")).isEqualTo("SUBMITTED");
        assertThat(submittedRow.get("college")).isEqualTo("IT_ENGINEERING");
        assertThat(submittedRow.get("major")).isEqualTo("미설정");
        assertThat((String) submittedRow.get("studentId")).isNotBlank();
        assertThat((String) submittedRow.get("submittedAt"))
                .as("제출 시각은 오프셋 있는 절대시각(…Z)으로 직렬화된다").endsWith("Z");
    }

    @Test
    @DisplayName("상태 필터와 검색어는 지원자 목록만 좁히고 상태별 건수는 전체 기준을 유지한다")
    void filtersNarrowApplicantsButNotStatusCounts() {
        Response filteredByStatus = getList(adminToken, selfRecruitment.getId(),
                Map.of("status", "ACCEPTED"));
        assertThat(filteredByStatus.jsonPath().getList("data.applicants.applicationId", Long.class))
                .containsExactly(acceptedApplication.getId());
        filteredByStatus.then()
                .body("data.total", equalTo(3))
                .body("data.statusCounts.SUBMITTED", equalTo(1));

        assertThat(getList(adminToken, selfRecruitment.getId(), Map.of("q", "박탈락"))
                .jsonPath().getList("data.applicants.applicationId", Long.class))
                .as("검색어는 이름에 걸린다")
                .containsExactly(rejectedApplication.getId());

        getList(adminToken, selfRecruitment.getId(), Map.of("q", "존재하지않는지원자"))
                .then().statusCode(HttpStatus.OK.value()).body("data.applicants", hasSize(0));
    }

    @Test
    @DisplayName("정렬을 등록 오래된 순으로 바꾸면 지원자 순서가 뒤집힌다")
    void oldestSortReversesApplicants() {
        assertThat(getList(adminToken, selfRecruitment.getId(), Map.of("sort", "OLDEST"))
                .jsonPath().getList("data.applicants.applicationId", Long.class))
                .containsExactly(submittedApplication.getId(), acceptedApplication.getId(),
                        rejectedApplication.getId());
    }

    @Test
    @DisplayName("외부 폼 모집의 지원자 목록은 오류가 아니라 빈 목록으로 내려온다")
    void externalRecruitmentReturnsEmptyList() {
        Club betaClub = clubRepository.save(ClubFixture.academic("베타동아리"));
        Recruitment externalRecruitment = recruitmentRepository.save(Recruitment.createWithOptions(
                betaClub, "외부 폼 모집", "내용", LocalDate.now().minusDays(1), LocalDate.now().plusDays(3),
                10, ApplicationMode.EXTERNAL, EXTERNAL_FORM_URL, false, TargetRole.MEMBER, null, null, false));

        getList(adminToken, externalRecruitment.getId(), Map.of()).then()
                .statusCode(HttpStatus.OK.value())
                .body("data.total", equalTo(0))
                .body("data.applicants", hasSize(0))
                .body("data.statusCounts", equalTo(Map.of()));
    }

    @Test
    @DisplayName("존재하지 않는 모집의 지원자 목록은 빈 목록이 아니라 404 로 답한다")
    void missingRecruitmentReturnsNotFound() {
        // 없는 모집에 "지원자 0명"을 돌려주면 모집이 사라진 것과 아무도 지원하지 않은 것이
        // 같은 응답이 된다. 상세는 이미 404 라 목록만 계약이 어긋나 있었다(#880).
        getList(adminToken, 99_999_999L, Map.of()).then()
                .statusCode(HttpStatus.NOT_FOUND.value());
    }

    @Test
    @DisplayName("삭제된 모집의 지원자 목록도 404 로 답한다")
    void deletedRecruitmentReturnsNotFound() {
        Club gammaClub = clubRepository.save(ClubFixture.academic("삭제모집동아리"));
        Recruitment deletedRecruitment = recruitmentRepository.save(Recruitment.create(
                gammaClub, "삭제될 모집", "내용",
                LocalDate.now().minusDays(1), LocalDate.now().plusDays(3), 10));
        Long deletedRecruitmentId = deletedRecruitment.getId();
        recruitmentRepository.delete(deletedRecruitment);

        getList(adminToken, deletedRecruitmentId, Map.of()).then()
                .statusCode(HttpStatus.NOT_FOUND.value());
    }

    @Test
    @DisplayName("지원자 목록 조회는 개인정보 열람 감사를 남기지 않는다")
    void listDoesNotRecordAuditEvent() {
        getList(adminToken, selfRecruitment.getId(), Map.of())
                .then().statusCode(HttpStatus.OK.value());

        assertThat(clubAuditEventRepository.findAll())
                .as("목록은 신원 요약만 보므로 열람 감사 대상이 아니다").isEmpty();
    }

    @Test
    @DisplayName("지원서 상세는 답변·상태 이력을 주되 전화번호와 평가·면접 정보는 담지 않는다")
    void detailExposesAnswersAndHistoryWithoutSensitiveFields() {
        applicationStatusHistoryRepository.save(ApplicationStatusHistory.record(
                acceptedApplication, ApplicationStatus.SUBMITTED, ApplicationStatus.ACCEPTED, leaderUser));

        Response detail = getDetail(adminToken, acceptedApplication.getId());

        detail.then()
                .statusCode(HttpStatus.OK.value())
                .body("data.applicationId", equalTo(acceptedApplication.getId().intValue()))
                .body("data.recruitmentId", equalTo(selfRecruitment.getId().intValue()))
                .body("data.recruitmentTitle", equalTo("자체 폼 신입 모집"))
                .body("data.clubId", equalTo(alphaClub.getId().intValue()))
                .body("data.clubName", equalTo("알파동아리"))
                .body("data.status", equalTo("ACCEPTED"))
                .body("data.applicant.name", equalTo("이합격"))
                .body("data.applicant.college", equalTo("IT_ENGINEERING"))
                .body("data.answers", hasSize(1))
                .body("data.answers[0].question", equalTo("지원 동기는?"))
                .body("data.answers[0].answer", equalTo("잘 하겠습니다."))
                .body("data.statusHistory", hasSize(1))
                .body("data.statusHistory[0].previousStatus", equalTo("SUBMITTED"))
                .body("data.statusHistory[0].newStatus", equalTo("ACCEPTED"));

        assertThat(detail.jsonPath().getMap("data.applicant"))
                .as("관리자 응답에는 전화번호·학년 필드 자체가 없다")
                .doesNotContainKeys("phone", "grade");
        assertThat(detail.jsonPath().getMap("data"))
                .as("평가·면접 정보는 관리자에게 노출하지 않는다")
                .doesNotContainKeys("myEvaluation", "otherEvaluations", "interview", "interviewRound");
        assertThat((String) detail.jsonPath().get("data.submittedAt")).endsWith("Z");
        assertThat((String) detail.jsonPath().get("data.statusHistory[0].changedAt")).endsWith("Z");
    }

    @Test
    @DisplayName("지원서 상세를 열 때마다 열람 감사가 지원서 단위로 쌓인다")
    void detailRecordsViewAuditEveryTime() {
        getDetail(adminToken, submittedApplication.getId()).then().statusCode(HttpStatus.OK.value());
        getDetail(adminToken, submittedApplication.getId()).then().statusCode(HttpStatus.OK.value());

        List<ClubAuditEvent> auditEvents = clubAuditEventRepository.findAll();
        assertThat(auditEvents)
                .as("개인정보 열람 이력이 목적이라 같은 지원서라도 매번 남긴다").hasSize(2);
        assertThat(auditEvents).allSatisfy(viewEvent -> {
            assertThat(viewEvent.getEventType()).isEqualTo(ClubAuditEventType.APPLICATION_VIEWED);
            assertThat(viewEvent.getClubId()).isEqualTo(alphaClub.getId());
            assertThat(viewEvent.getRecruitmentId()).isEqualTo(selfRecruitment.getId());
            assertThat(viewEvent.getApplicationId()).isEqualTo(submittedApplication.getId());
            assertThat(viewEvent.getActorUserId()).isEqualTo(adminUser.getId());
            assertThat(viewEvent.getReason()).isNull();
        });
    }

    @Test
    @DisplayName("없는 지원서나 취소된 지원서의 상세를 요청하면 404 를 반환하고 열람 감사도 남지 않는다")
    void detailOfMissingApplicationReturns404() {
        Application cancelledApplication = saveApplication("한취소", ApplicationStatus.SUBMITTED, "취소");
        applicationRepository.delete(cancelledApplication);

        getDetail(adminToken, cancelledApplication.getId())
                .then().statusCode(HttpStatus.NOT_FOUND.value());
        getDetail(adminToken, 999_999L)
                .then().statusCode(HttpStatus.NOT_FOUND.value());

        assertThat(clubAuditEventRepository.findAll()).isEmpty();
    }

    @Test
    @DisplayName("관리자가 아니면 지원자 목록·지원서 상세에 접근할 수 없다 — 동아리 운영진도 전역 역할은 학생이라 막힌다")
    void nonAdminIsForbidden() {
        getList(studentToken, selfRecruitment.getId(), Map.of())
                .then().statusCode(HttpStatus.FORBIDDEN.value());
        getDetail(studentToken, submittedApplication.getId())
                .then().statusCode(HttpStatus.FORBIDDEN.value());

        getList(leaderToken, selfRecruitment.getId(), Map.of())
                .then().statusCode(HttpStatus.FORBIDDEN.value());
        getDetail(leaderToken, submittedApplication.getId())
                .then().statusCode(HttpStatus.FORBIDDEN.value());

        assertThat(clubAuditEventRepository.findAll()).isEmpty();
    }

    @Test
    @DisplayName("비로그인 상태에서는 지원자 목록·지원서 상세 조회가 401 로 막힌다")
    void anonymousAccessReturns401() {
        RestAssured.given()
                .when().get(LIST_PATH, selfRecruitment.getId())
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());
        RestAssured.given()
                .when().get(DETAIL_PATH, submittedApplication.getId())
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());
    }

    private Response getList(String token, Long recruitmentId, Map<String, ?> queryParams) {
        return RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                    .queryParams(queryParams)
                .when()
                    .get(LIST_PATH, recruitmentId);
    }

    private Response getDetail(String token, Long applicationId) {
        return RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .when()
                    .get(DETAIL_PATH, applicationId);
    }

    private Map<String, Object> findApplicantRow(Response listed, Long applicationId) {
        return listed.jsonPath()
                .getMap("data.applicants.find { it.applicationId == %d }".formatted(applicationId));
    }

    private String tokenOf(User user) {
        return jwtTokenProvider.createToken(user.getId(), user.getRole().name());
    }

    /**
     * 상태는 전이 메서드가 아니라 필드로 직접 세팅한다 — 목표 상태에 닿기까지 거치는 중간 상태가
     * FSM 개편에 종속되기 때문이다(LeaderApplicationControllerTest 전례).
     */
    private Application saveApplication(String applicantName, ApplicationStatus status, String answer) {
        User applicant = userRepository.save(UserFixture.withName(applicantName));
        Application application = Application.submit(selfRecruitment, applicant,
                List.of(new ApplicationAnswer(motivationQuestion.id(), List.of(answer))));
        try {
            Field statusField = Application.class.getDeclaredField("status");
            statusField.setAccessible(true);
            statusField.set(application, status);
        } catch (ReflectiveOperationException reflectionFailure) {
            throw new IllegalStateException(reflectionFailure);
        }
        return applicationRepository.save(application);
    }
}
