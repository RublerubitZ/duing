package com.duing.domain.draft.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.draft.entity.ApplicationDraft;
import com.duing.domain.draft.repository.ApplicationDraftRepository;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import java.lang.reflect.Field;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ApplicationDraftControllerTest extends IntegrationTestBase {

    @LocalServerPort
    private int port;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private ClubRepository clubRepository;

    @Autowired
    private RecruitmentRepository recruitmentRepository;

    @Autowired
    private ApplicationDraftRepository draftRepository;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private User student;
    private Recruitment openRecruitment;
    private String studentToken;

    @BeforeEach
    void setUp() throws Exception {
        RestAssured.port = port;

        student = saveStudent("임시저장학생");
        Club activeClub = saveActiveClub("임시저장테스트동아리");
        openRecruitment = saveOpenRecruitment(activeClub, "임시저장모집");
        studentToken = jwtTokenProvider.createToken(student.getId(), student.getRole().name());
    }

    @Test
    @DisplayName("GET draft — 임시저장이 없을 때 exists=false 로 200 반환한다")
    void getDraftWhenEmptyReturns200WithExistsFalse() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when()
                    .get("/api/v1/recruitments/{recruitmentId}/draft", openRecruitment.getId())
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("ok", equalTo(true))
                    .body("data.exists", equalTo(false));
    }

    @Test
    @DisplayName("GET draft — 임시저장이 있을 때 exists=true 와 answers 를 200 으로 반환한다")
    void getDraftWhenExistsReturns200WithExistsTrue() {
        List<ApplicationDraft.DraftAnswer> savedAnswers = List.of(
                new ApplicationDraft.DraftAnswer(1L, "가나다")
        );
        draftRepository.save(ApplicationDraft.create(student.getId(), openRecruitment.getId(), savedAnswers));

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when()
                    .get("/api/v1/recruitments/{recruitmentId}/draft", openRecruitment.getId())
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("ok", equalTo(true))
                    .body("data.exists", equalTo(true));
    }

    @Test
    @DisplayName("PUT draft — 첫 upsert 후 204 반환한다")
    void upsertDraftFirstTimeReturns204() {
        String requestBody = """
                {"answers": [{"questionId": 1, "value": "답변1"}]}
                """;

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                    .contentType(ContentType.JSON)
                    .body(requestBody)
                .when()
                    .put("/api/v1/recruitments/{recruitmentId}/draft", openRecruitment.getId())
                .then()
                    .statusCode(HttpStatus.NO_CONTENT.value());
    }

    @Test
    @DisplayName("PUT draft — 두 번 upsert 하면 마지막 answers 가 유지된다")
    void upsertDraftTwiceKeepsLastAnswers() {
        String firstBody = """
                {"answers": [{"questionId": 1, "value": "첫번째"}]}
                """;
        String secondBody = """
                {"answers": [{"questionId": 1, "value": "두번째"}]}
                """;

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                    .contentType(ContentType.JSON)
                    .body(firstBody)
                .when()
                    .put("/api/v1/recruitments/{recruitmentId}/draft", openRecruitment.getId())
                .then()
                    .statusCode(HttpStatus.NO_CONTENT.value());

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                    .contentType(ContentType.JSON)
                    .body(secondBody)
                .when()
                    .put("/api/v1/recruitments/{recruitmentId}/draft", openRecruitment.getId())
                .then()
                    .statusCode(HttpStatus.NO_CONTENT.value());

        Optional<ApplicationDraft> draft = draftRepository
                .findByUserIdAndRecruitmentId(student.getId(), openRecruitment.getId());
        assertThat(draft).isPresent();
        assertThat(draft.get().getAnswers().get(0).value()).isEqualTo("두번째");
    }

    @Test
    @DisplayName("PUT draft — 마감된 모집에 upsert 하면 410 반환한다")
    void upsertDraftOnClosedRecruitmentReturns410() throws Exception {
        Club activeClub = saveActiveClub("마감동아리");
        Recruitment closedRecruitment = saveClosedRecruitment(activeClub, "마감모집");

        String requestBody = """
                {"answers": [{"questionId": 1, "value": "답변"}]}
                """;

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                    .contentType(ContentType.JSON)
                    .body(requestBody)
                .when()
                    .put("/api/v1/recruitments/{recruitmentId}/draft", closedRecruitment.getId())
                .then()
                    .statusCode(HttpStatus.GONE.value())
                    .body("ok", equalTo(false));
    }

    @Test
    @DisplayName("PUT draft — 운영 중이 아닌 동아리의 모집에 upsert 하면 404 반환한다")
    void upsertDraftOnInactiveClubRecruitmentReturns404() throws Exception {
        Club deactivatedClub = saveActiveClub("중단임시저장동아리");
        Recruitment hiddenRecruitment = saveOpenRecruitment(deactivatedClub, "중단임시저장모집");
        // 벌크 마감을 우회해 club 만 INACTIVE 로 바꿔 정합 깨진 레거시 상태를 재현한다 —
        // 숨겨진 동아리의 모집에는 임시저장(쓰기)도 404 존재 은닉이어야 한다 (공개 상세와 동일 의미론).
        jdbcTemplate.update("UPDATE club SET status = 'INACTIVE' WHERE id = ?", deactivatedClub.getId());

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                    .contentType(ContentType.JSON)
                    .body("""
                            {"answers": [{"questionId": 1, "value": "답변"}]}
                            """)
                .when()
                    .put("/api/v1/recruitments/{recruitmentId}/draft", hiddenRecruitment.getId())
                .then()
                    .statusCode(HttpStatus.NOT_FOUND.value())
                    .body("ok", equalTo(false));
    }

    @Test
    @DisplayName("DELETE draft — 임시저장이 있을 때 204 반환하고 삭제된다")
    void deleteDraftReturns204() {
        draftRepository.save(ApplicationDraft.create(student.getId(), openRecruitment.getId(), List.of()));

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when()
                    .delete("/api/v1/recruitments/{recruitmentId}/draft", openRecruitment.getId())
                .then()
                    .statusCode(HttpStatus.NO_CONTENT.value());

        assertThat(draftRepository.findByUserIdAndRecruitmentId(student.getId(), openRecruitment.getId()))
                .isEmpty();
    }

    @Test
    @DisplayName("DELETE draft — 임시저장이 없어도 멱등하게 204 반환한다")
    void deleteDraftIsIdempotentWhenEmpty() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when()
                    .delete("/api/v1/recruitments/{recruitmentId}/draft", openRecruitment.getId())
                .then()
                    .statusCode(HttpStatus.NO_CONTENT.value());

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when()
                    .delete("/api/v1/recruitments/{recruitmentId}/draft", openRecruitment.getId())
                .then()
                    .statusCode(HttpStatus.NO_CONTENT.value());
    }

    @Test
    @DisplayName("인증 없이 GET draft 를 호출하면 인증 오류(4xx)를 반환한다")
    void getDraftWithoutAuthIsRejected() {
        int statusCode = RestAssured
                .given()
                .when()
                    .get("/api/v1/recruitments/{recruitmentId}/draft", openRecruitment.getId())
                .then()
                    .extract().statusCode();

        assertThat(statusCode).isIn(401, 403);
    }

    @Test
    @DisplayName("인증 없이 PUT draft 를 호출하면 인증 오류(4xx)를 반환한다")
    void putDraftWithoutAuthIsRejected() {
        int statusCode = RestAssured
                .given()
                    .contentType(ContentType.JSON)
                    .body("""
                            {"answers": []}
                            """)
                .when()
                    .put("/api/v1/recruitments/{recruitmentId}/draft", openRecruitment.getId())
                .then()
                    .extract().statusCode();

        assertThat(statusCode).isIn(401, 403);
    }

    @Test
    @DisplayName("인증 없이 DELETE draft 를 호출하면 인증 오류(4xx)를 반환한다")
    void deleteDraftWithoutAuthIsRejected() {
        int statusCode = RestAssured
                .given()
                .when()
                    .delete("/api/v1/recruitments/{recruitmentId}/draft", openRecruitment.getId())
                .then()
                    .extract().statusCode();

        assertThat(statusCode).isIn(401, 403);
    }

    private User saveStudent(String name) {
        long unique = sequence.getAndIncrement();
        User user = User.create(
                String.format("%010d", unique % 10_000_000_000L),
                name,
                "draft_ctrl" + unique + "@daegu.ac.kr",
                "hashed",
                UserRole.STUDENT,
                Grade.FRESHMAN,
                College.IT_ENGINEERING,
                "미설정",
                "010-0000-0000",
                java.time.LocalDateTime.now()
        );
        return userRepository.save(user);
    }

    private Club saveActiveClub(String name) throws Exception {
        String uniqueName = name + "-" + sequence.getAndIncrement();
        Club club = Club.create(uniqueName, ClubCategory.OTHER, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(club, ClubStatus.ACTIVE);
        return clubRepository.save(club);
    }

    private Recruitment saveOpenRecruitment(Club club, String title) {
        LocalDate today = LocalDate.now();
        Recruitment recruitment = Recruitment.create(club, title + "-" + sequence.getAndIncrement(),
                null, today.minusDays(1), today.plusDays(7), 10);
        return recruitmentRepository.save(recruitment);
    }

    private Recruitment saveClosedRecruitment(Club club, String title) throws Exception {
        LocalDate today = LocalDate.now();
        Recruitment recruitment = Recruitment.create(club, title + "-" + sequence.getAndIncrement(),
                null, today.minusDays(10), today.minusDays(1), 10);
        Field statusField = Recruitment.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(recruitment, RecruitmentStatus.CLOSED);
        return recruitmentRepository.save(recruitment);
    }
}