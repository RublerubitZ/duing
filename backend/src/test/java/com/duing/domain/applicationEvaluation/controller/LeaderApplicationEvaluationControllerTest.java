package com.duing.domain.applicationEvaluation.controller;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.application.service.ApplicationService;
import com.duing.domain.application.service.dto.query.ApplicantDetailQuery;
import com.duing.domain.application.service.dto.query.ApplicantQuery;
import com.duing.domain.application.service.dto.query.ApplicantSearchCondition;
import com.duing.domain.applicationEvaluation.entity.ApplicationEvaluation;
import com.duing.domain.applicationEvaluation.repository.ApplicationEvaluationRepository;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import io.restassured.response.Response;
import java.lang.reflect.Field;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;

// @DirtiesContext 제거: IntegrationTestBase.cleanDatabase() 가 매 테스트 전 전체 테이블을 TRUNCATE 해
// 이전 테스트의 evaluation / application / club 데이터가 다음 테스트 assertion 에 영향을 주지 않는다.
// RestAssured HTTP 레벨 테스트라 @Transactional rollback 은 적용 불가 → truncate 전략.
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class LeaderApplicationEvaluationControllerTest extends IntegrationTestBase {

    @LocalServerPort
    private int port;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private ClubRepository clubRepository;

    @Autowired
    private ClubMemberRepository clubMemberRepository;

    @Autowired
    private RecruitmentRepository recruitmentRepository;

    @Autowired
    private ApplicationRepository applicationRepository;

    @Autowired
    private ApplicationEvaluationRepository evaluationRepository;

    @Autowired
    private ApplicationService applicationService;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private User leader;
    private User otherLeader;
    private User applicantUser;
    private Long leaderId;
    private Long otherLeaderId;
    private String leaderToken;
    private String otherLeaderToken;
    private String applicantToken;
    private String memberToken;
    private Club sharedClub;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;

        leader = saveUser("리더", UserRole.STUDENT, College.IT_ENGINEERING, "컴퓨터공학");
        otherLeader = saveUser("다른운영진", UserRole.STUDENT, College.IT_ENGINEERING, "소프트웨어공학");
        applicantUser = saveUser("지원자", UserRole.STUDENT, College.EDUCATION, "교육학");
        User memberUser = saveUser("일반멤버", UserRole.STUDENT, College.EDUCATION, "교육학");

        leaderId = leader.getId();
        otherLeaderId = otherLeader.getId();

        leaderToken = jwtTokenProvider.createToken(leader.getId(), leader.getRole().name());
        otherLeaderToken = jwtTokenProvider.createToken(otherLeader.getId(), otherLeader.getRole().name());
        applicantToken = jwtTokenProvider.createToken(applicantUser.getId(), applicantUser.getRole().name());
        memberToken = jwtTokenProvider.createToken(memberUser.getId(), memberUser.getRole().name());

        sharedClub = saveActiveClub("평가테스트동아리");
        clubMemberRepository.save(ClubMember.asLeader(sharedClub, leader));
        // 동아리당 LEADER 는 1명 unique 제약 — otherLeader 는 OFFICER 로 등록 (둘 다 requireManager 통과 가능)
        clubMemberRepository.save(ClubMember.of(sharedClub, otherLeader, ClubMemberRole.OFFICER));
    }

    @Test
    @DisplayName("운영진이 처음 평가를 제출하면 새 평가가 생성된다")
    void putCreates() {
        Long applicationId = createApplicationForApplicant(sharedClub);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("score", 4, "memo", "프로젝트 우수"))
                .when().put("/api/v1/leader/applications/{id}/evaluations/me", applicationId)
                .then().statusCode(204);

        Optional<ApplicationEvaluation> saved = evaluationRepository
                .findByApplicationIdAndEvaluatorId(applicationId, leaderId);
        assertThat(saved).isPresent();
        assertThat(saved.get().getScore()).isEqualTo(4);
        assertThat(saved.get().getMemo()).isEqualTo("프로젝트 우수");
    }

    @Test
    @DisplayName("운영진이 기존 평가를 재제출하면 점수와 메모가 갱신된다")
    void putUpdates() {
        Long applicationId = createApplicationForApplicant(sharedClub);
        evaluationRepository.save(ApplicationEvaluation.create(
                applicationRepository.findById(applicationId).orElseThrow(),
                leader,
                3, "초기 메모"));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("score", 5, "memo", "재평가"))
                .when().put("/api/v1/leader/applications/{id}/evaluations/me", applicationId)
                .then().statusCode(204);

        ApplicationEvaluation reloaded = evaluationRepository
                .findByApplicationIdAndEvaluatorId(applicationId, leaderId).orElseThrow();
        assertThat(reloaded.getScore()).isEqualTo(5);
        assertThat(reloaded.getMemo()).isEqualTo("재평가");
    }

    @Test
    @DisplayName("허용 범위를 벗어난 점수나 점수 누락 시 요청이 거부된다")
    void invalidScoreRejected() {
        Long applicationId = createApplicationForApplicant(sharedClub);

        for (Integer invalidScore : Arrays.asList(0, 6)) {
            RestAssured.given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("score", invalidScore, "memo", "x"))
                    .when().put("/api/v1/leader/applications/{id}/evaluations/me", applicationId)
                    .then().statusCode(400);
        }

        // score 필드 없음 (null)
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("memo", "no score"))
                .when().put("/api/v1/leader/applications/{id}/evaluations/me", applicationId)
                .then().statusCode(400);
    }

    @Test
    @DisplayName("memo 가 2000자 초과면 400, null 은 허용")
    void memoSize() {
        Long applicationId = createApplicationForApplicant(sharedClub);

        String overLengthMemo = "a".repeat(2001);
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("score", 3, "memo", overLengthMemo))
                .when().put("/api/v1/leader/applications/{id}/evaluations/me", applicationId)
                .then().statusCode(400);

        // memo null 허용 — score 만 전달
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("score", 3))
                .when().put("/api/v1/leader/applications/{id}/evaluations/me", applicationId)
                .then().statusCode(204);
    }

    @Test
    @DisplayName("다른 운영진의 평가는 본인 PUT 으로 수정되지 않는다")
    void putDoesNotTouchOthers() {
        Long applicationId = createApplicationForApplicant(sharedClub);
        evaluationRepository.save(ApplicationEvaluation.create(
                applicationRepository.findById(applicationId).orElseThrow(),
                otherLeader,
                2, "다른 평가"));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("score", 5, "memo", "내 평가"))
                .when().put("/api/v1/leader/applications/{id}/evaluations/me", applicationId)
                .then().statusCode(204);

        ApplicationEvaluation othersEvaluation = evaluationRepository
                .findByApplicationIdAndEvaluatorId(applicationId, otherLeaderId).orElseThrow();
        assertThat(othersEvaluation.getScore()).isEqualTo(2);
        assertThat(othersEvaluation.getMemo()).isEqualTo("다른 평가");
    }

    @Test
    @DisplayName("평가가 존재하지 않아도 삭제 요청은 멱등하게 204로 응답한다")
    void deleteIdempotent() {
        Long applicationId = createApplicationForApplicant(sharedClub);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().delete("/api/v1/leader/applications/{id}/evaluations/me", applicationId)
                .then().statusCode(204);
    }

    @Test
    @DisplayName("운영진이 아닌 사용자가 PUT/DELETE 호출 시 403")
    void nonManagerRejected() {
        Long applicationId = createApplicationForApplicant(sharedClub);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + memberToken)
                .contentType(ContentType.JSON)
                .body(Map.of("score", 3))
                .when().put("/api/v1/leader/applications/{id}/evaluations/me", applicationId)
                .then().statusCode(403);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + memberToken)
                .when().delete("/api/v1/leader/applications/{id}/evaluations/me", applicationId)
                .then().statusCode(403);
    }

    @Test
    @DisplayName("지원자 본인의 마이페이지 응답에 평가 관련 필드가 존재하지 않는다 (privacy 회귀)")
    void privacyRegressionForApplicant() {
        Long applicationId = createApplicationForApplicant(sharedClub);
        evaluationRepository.save(ApplicationEvaluation.create(
                applicationRepository.findById(applicationId).orElseThrow(),
                leader,
                5, "비공개 메모"));

        Response response = RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + applicantToken)
                .when().get("/api/v1/users/me/applications/{id}", applicationId);
        response.then().statusCode(200);

        String responseBody = response.getBody().asString();
        assertThat(responseBody).doesNotContain("myEvaluation");
        assertThat(responseBody).doesNotContain("otherEvaluations");
        assertThat(responseBody).doesNotContain("비공개 메모");
    }

    @Test
    @DisplayName("상세 응답에서 myEvaluation 과 otherEvaluations 가 currentUserId 기준으로 분리된다")
    void detailSplitsByCurrentUser() {
        Long applicationId = createApplicationForApplicant(sharedClub);
        Application application = applicationRepository.findById(applicationId).orElseThrow();
        evaluationRepository.save(ApplicationEvaluation.create(application, leader, 4, "내 평가"));
        evaluationRepository.save(ApplicationEvaluation.create(application, otherLeader, 3, "타인 평가"));

        ApplicantDetailQuery detailForLeader = applicationService.getApplicantDetail(applicationId, leaderId);

        assertThat(detailForLeader.myEvaluation()).isNotNull();
        assertThat(detailForLeader.myEvaluation().score()).isEqualTo(4);
        assertThat(detailForLeader.otherEvaluations()).hasSize(1);
        assertThat(detailForLeader.otherEvaluations().get(0).score()).isEqualTo(3);

        ApplicantDetailQuery detailForOtherLeader = applicationService.getApplicantDetail(applicationId, otherLeaderId);
        assertThat(detailForOtherLeader.myEvaluation()).isNotNull();
        assertThat(detailForOtherLeader.myEvaluation().score()).isEqualTo(3);
        assertThat(detailForOtherLeader.otherEvaluations()).hasSize(1);
        assertThat(detailForOtherLeader.otherEvaluations().get(0).score()).isEqualTo(4);
    }

    @Test
    @DisplayName("목록 응답에 myScore 가 currentUser 의 평가 점수로 채워진다 (없으면 null)")
    void listMyScoreReflectsCurrentUserEvaluation() {
        Long applicationId1 = createApplicationForApplicant(sharedClub);
        User secondApplicant = saveUser("두번째지원자", UserRole.STUDENT, College.EDUCATION, "교육학");
        Long applicationId2 = createApplicationForUser(sharedClub, secondApplicant);

        // applicationId1 에만 leader 가 평가
        evaluationRepository.save(ApplicationEvaluation.create(
                applicationRepository.findById(applicationId1).orElseThrow(),
                leader, 4, null));

        ApplicantSearchCondition noFilter = new ApplicantSearchCondition(null, null, null, null, null);
        List<ApplicantQuery> applicants = applicationService.getApplicants(
                recruitmentRepository.findAll().stream()
                        .filter(recruitment -> recruitment.getClub().getId().equals(sharedClub.getId()))
                        .findFirst().orElseThrow().getId(),
                leaderId,
                noFilter);

        ApplicantQuery rowForApplication1 = applicants.stream()
                .filter(row -> row.applicationId().equals(applicationId1))
                .findFirst().orElseThrow();
        ApplicantQuery rowForApplication2 = applicants.stream()
                .filter(row -> row.applicationId().equals(applicationId2))
                .findFirst().orElseThrow();

        assertThat(rowForApplication1.myScore()).isEqualTo(4);
        assertThat(rowForApplication2.myScore()).isNull();
    }

    @Test
    @DisplayName("내 평가를 삭제하면 목록의 myScore 가 null 로 돌아온다")
    void myScoreClearsAfterDelete() {
        Long applicationId = createApplicationForApplicant(sharedClub);

        // 1. PUT /evaluations/me 로 score 작성 → 204
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("score", 3, "memo", "삭제 전 평가"))
                .when().put("/api/v1/leader/applications/{id}/evaluations/me", applicationId)
                .then().statusCode(204);

        // 2. 목록 조회 → myScore = 3
        Recruitment recruitment = recruitmentRepository.findAll().stream()
                .filter(each -> each.getClub().getId().equals(sharedClub.getId()))
                .findFirst().orElseThrow();
        ApplicantSearchCondition noFilter = new ApplicantSearchCondition(null, null, null, null, null);
        List<ApplicantQuery> beforeDelete = applicationService.getApplicants(
                recruitment.getId(), leaderId, noFilter);
        ApplicantQuery rowBefore = beforeDelete.stream()
                .filter(row -> row.applicationId().equals(applicationId))
                .findFirst().orElseThrow();
        assertThat(rowBefore.myScore()).isEqualTo(3);

        // 3. DELETE /evaluations/me → 204
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().delete("/api/v1/leader/applications/{id}/evaluations/me", applicationId)
                .then().statusCode(204);

        // 4. 목록 조회 → myScore = null (soft-delete 된 평가가 새어나오지 않아야 한다)
        List<ApplicantQuery> afterDelete = applicationService.getApplicants(
                recruitment.getId(), leaderId, noFilter);
        ApplicantQuery rowAfter = afterDelete.stream()
                .filter(row -> row.applicationId().equals(applicationId))
                .findFirst().orElseThrow();
        assertThat(rowAfter.myScore()).isNull();
    }

    @Test
    @DisplayName("내 평가를 삭제한 뒤 다시 작성하면 새 평가가 정상 생성된다")
    void recreateEvaluationAfterDelete() {
        Long applicationId = createApplicationForApplicant(sharedClub);

        // 1. 작성
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("score", 3, "memo", "초기"))
                .when().put("/api/v1/leader/applications/{id}/evaluations/me", applicationId)
                .then().statusCode(204);

        // 2. 삭제
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().delete("/api/v1/leader/applications/{id}/evaluations/me", applicationId)
                .then().statusCode(204);

        // 3. 재작성
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("score", 5, "memo", "재작성"))
                .when().put("/api/v1/leader/applications/{id}/evaluations/me", applicationId)
                .then().statusCode(204);

        Optional<ApplicationEvaluation> reloaded =
                evaluationRepository.findByApplicationIdAndEvaluatorId(applicationId, leaderId);
        assertThat(reloaded).isPresent();
        assertThat(reloaded.get().getScore()).isEqualTo(5);
        assertThat(reloaded.get().getMemo()).isEqualTo("재작성");
    }

    // ─────────────────────────────────────────────────────────────
    // 픽스처 헬퍼
    // ─────────────────────────────────────────────────────────────

    private User saveUser(String name, UserRole role, College college, String major) {
        long unique = sequence.incrementAndGet();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                name + unique,
                "eval" + unique + "@daegu.ac.kr",
                "hashed",
                role,
                Grade.FRESHMAN,
                college,
                major,
                "010-0000-0000",
                LocalDateTime.now()
        ));
    }

    private Club saveActiveClub(String name) {
        String uniqueName = name + "-" + sequence.incrementAndGet();
        Club club = Club.create(uniqueName, ClubCategory.ACADEMIC, "분과", "설명", null);
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
        Recruitment recruitment = Recruitment.create(
                club, "평가테스트모집-" + sequence.incrementAndGet(),
                null, today.minusDays(1), today.plusDays(7), 10);
        return recruitmentRepository.save(recruitment);
    }

    private Long createApplicationForApplicant(Club club) {
        return createApplicationForUser(club, applicantUser);
    }

    private Long createApplicationForUser(Club club, User user) {
        Recruitment existingRecruitment = recruitmentRepository.findAll().stream()
                .filter(r -> r.getClub().getId().equals(club.getId()))
                .findFirst()
                .orElseGet(() -> saveOpenRecruitment(club));
        Application application = Application.submit(existingRecruitment, user, List.of());
        try {
            Field statusField = Application.class.getDeclaredField("status");
            statusField.setAccessible(true);
            statusField.set(application, ApplicationStatus.SUBMITTED);
        } catch (ReflectiveOperationException reflectionFailure) {
            throw new IllegalStateException(reflectionFailure);
        }
        return applicationRepository.save(application).getId();
    }
}
