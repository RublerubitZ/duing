package com.duing.domain.recruitment.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import io.restassured.path.json.JsonPath;
import io.restassured.response.ValidatableResponse;
import java.lang.reflect.Field;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
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

/**
 * 지원서 질문 유형 확장(TEXT / SINGLE_CHOICE / MULTIPLE_CHOICE)의 end-to-end 계약 테스트.
 *
 * <p>모집 생성(questionItems) → 상세 조회(questionItems 노출) → 제출(answerItems) →
 * 내 지원서·운영진 화면(라벨 표시) 까지의 전 구간을 실제 HTTP 로 통과시킨다.
 * 모집당 활성 공고가 1개로 제한되므로(uk_recruitment_club_active) 각 테스트는 자기 동아리를 새로 만든다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class RecruitmentQuestionTypesIntegrationTest extends IntegrationTestBase {

    private static final String MOTIVATION_QUESTION_TEXT = "지원 동기를 알려주세요";
    private static final String WEEKDAY_QUESTION_TEXT = "선호 활동 요일";
    private static final String INTEREST_QUESTION_TEXT = "관심 분야";
    private static final String MOTIVATION_ANSWER_TEXT = "동아리 활동에 열심히 참여하고 싶습니다";

    @LocalServerPort
    private int port;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private ClubRepository clubRepository;

    @Autowired
    private ClubMemberRepository clubMemberRepository;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private User leader;
    private User applicant;
    private String leaderToken;
    private String applicantToken;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        leader = saveStudent("질문유형리더");
        applicant = saveStudent("질문유형지원자");
        leaderToken = jwtTokenProvider.createToken(leader.getId(), leader.getRole().name());
        applicantToken = jwtTokenProvider.createToken(applicant.getId(), applicant.getRole().name());
    }

    @Test
    @DisplayName("questionItems 로 생성한 모집 상세는 텍스트 배열과 구조화 질문을 함께 반환한다")
    void recruitmentDetailExposesBothLegacyQuestionsAndQuestionItems() {
        Long recruitmentId = createChoiceQuestionRecruitment();

        JsonPath detail = fetchRecruitmentDetail(recruitmentId);

        // legacy 텍스트 배열은 그대로 유지된다 — 구 FE 계약 보호.
        assertThat(detail.getList("data.questions", String.class))
                .containsExactly(MOTIVATION_QUESTION_TEXT, WEEKDAY_QUESTION_TEXT, INTEREST_QUESTION_TEXT);

        assertThat(detail.getList("data.questionItems")).hasSize(3);
        assertThat(detail.getString("data.questionItems[0].type")).isEqualTo("TEXT");
        assertThat(detail.getList("data.questionItems[0].choices")).isEmpty();
        assertThat(detail.getString("data.questionItems[1].type")).isEqualTo("SINGLE_CHOICE");
        assertThat(detail.getBoolean("data.questionItems[1].required")).isTrue();
        assertThat(detail.getString("data.questionItems[2].type")).isEqualTo("MULTIPLE_CHOICE");
        assertThat(detail.getBoolean("data.questionItems[2].required")).isFalse();
        assertThat(detail.getList("data.questionItems[1].choices.label", String.class))
                .containsExactly("평일", "주말");
        assertThat(detail.getList("data.questionItems[2].choices.label", String.class))
                .containsExactly("백엔드", "프론트엔드", "디자인");

        // 질문 id 와 선택지 id 는 서버가 발급하며 전역적으로 서로 달라야 한다 — 답변이 id 로 질문을 참조하기 때문.
        List<String> questionIds = detail.getList("data.questionItems.id", String.class);
        List<String> weekdayChoiceIds = detail.getList("data.questionItems[1].choices.id", String.class);
        List<String> interestChoiceIds = detail.getList("data.questionItems[2].choices.id", String.class);

        List<String> allIssuedIds = new ArrayList<>(questionIds);
        allIssuedIds.addAll(weekdayChoiceIds);
        allIssuedIds.addAll(interestChoiceIds);
        assertThat(allIssuedIds).hasSize(8).doesNotContainNull().doesNotHaveDuplicates();
    }

    @Test
    @DisplayName("answerItems 로 제출하면 내 지원서와 운영진 화면에 선택지 라벨로 표시된다")
    void submittedChoiceAnswersAreRenderedAsLabels() {
        Long recruitmentId = createChoiceQuestionRecruitment();
        RecruitmentFormIds formIds = readFormIds(recruitmentId);

        Long applicationId = submitAnswerItems(recruitmentId, """
                {"answerItems": [
                  {"questionId": "%s", "values": ["%s"]},
                  {"questionId": "%s", "values": ["%s"]},
                  {"questionId": "%s", "values": ["%s", "%s"]}
                ]}
                """.formatted(
                        formIds.motivationQuestionId(), MOTIVATION_ANSWER_TEXT,
                        formIds.weekdayQuestionId(), formIds.weekdayChoiceIds().get(0),
                        formIds.interestQuestionId(),
                        formIds.interestChoiceIds().get(0), formIds.interestChoiceIds().get(1)))
                .statusCode(HttpStatus.CREATED.value())
                .extract().jsonPath().getLong("data");

        // 내 지원서 — 선택형 답변은 choiceId 가 아니라 라벨(다중 선택은 ", " 조인)로 표시된다.
        RestAssured.given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + applicantToken)
                .when()
                    .get("/api/v1/users/me/applications/{applicationId}", applicationId)
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.questions", contains(
                            MOTIVATION_QUESTION_TEXT, WEEKDAY_QUESTION_TEXT, INTEREST_QUESTION_TEXT))
                    .body("data.answers[0]", equalTo(MOTIVATION_ANSWER_TEXT))
                    .body("data.answers[1]", equalTo("평일"))
                    .body("data.answers[2]", equalTo("백엔드, 프론트엔드"));

        // 운영진 상세 — question/answer 쌍이 폼 순서대로 라벨과 함께 실린다.
        RestAssured.given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when()
                    .get("/api/v1/leader/applications/{applicationId}", applicationId)
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.answers", hasSize(3))
                    .body("data.answers[0].question", equalTo(MOTIVATION_QUESTION_TEXT))
                    .body("data.answers[0].answer", equalTo(MOTIVATION_ANSWER_TEXT))
                    .body("data.answers[1].question", equalTo(WEEKDAY_QUESTION_TEXT))
                    .body("data.answers[1].answer", equalTo("평일"))
                    .body("data.answers[2].question", equalTo(INTEREST_QUESTION_TEXT))
                    .body("data.answers[2].answer", equalTo("백엔드, 프론트엔드"));

        // 운영진 목록 미리보기 — 여기에도 choiceId 가 아니라 라벨이 실려야 한다.
        RestAssured.given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when()
                    .get("/api/v1/leader/recruitments/{recruitmentId}/applications", recruitmentId)
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data", hasSize(1))
                    .body("data[0].answers", contains(
                            MOTIVATION_ANSWER_TEXT, "평일", "백엔드, 프론트엔드"));
    }

    @Test
    @DisplayName("필수 단일 선택을 고르지 않고 제출하면 400 과 필수 답변 안내를 받는다")
    void submittingWithoutRequiredSingleChoiceIsRejected() {
        Long recruitmentId = createChoiceQuestionRecruitment();
        RecruitmentFormIds formIds = readFormIds(recruitmentId);

        submitAnswerItems(recruitmentId, """
                {"answerItems": [
                  {"questionId": "%s", "values": ["%s"]},
                  {"questionId": "%s", "values": []},
                  {"questionId": "%s", "values": []}
                ]}
                """.formatted(
                        formIds.motivationQuestionId(), MOTIVATION_ANSWER_TEXT,
                        formIds.weekdayQuestionId(),
                        formIds.interestQuestionId()))
                .statusCode(HttpStatus.BAD_REQUEST.value())
                .body("ok", equalTo(false))
                .body("message", equalTo("필수 질문에 답변을 입력해주세요."));
    }

    @Test
    @DisplayName("다른 질문의 선택지 id 로 제출하면 400 유효하지 않은 선택지 안내를 받는다")
    void submittingChoiceIdFromAnotherQuestionIsRejected() {
        Long recruitmentId = createChoiceQuestionRecruitment();
        RecruitmentFormIds formIds = readFormIds(recruitmentId);

        submitAnswerItems(recruitmentId, """
                {"answerItems": [
                  {"questionId": "%s", "values": ["%s"]},
                  {"questionId": "%s", "values": ["%s"]},
                  {"questionId": "%s", "values": []}
                ]}
                """.formatted(
                        formIds.motivationQuestionId(), MOTIVATION_ANSWER_TEXT,
                        // 단일 선택 질문에 관심 분야(다른 질문) 선택지 id 를 실어 보낸다.
                        formIds.weekdayQuestionId(), formIds.interestChoiceIds().get(0),
                        formIds.interestQuestionId()))
                .statusCode(HttpStatus.BAD_REQUEST.value())
                .body("ok", equalTo(false))
                .body("message", equalTo("유효하지 않은 선택지입니다."));
    }

    @Test
    @DisplayName("선택 질문은 빈 values 로 제출할 수 있다")
    void optionalChoiceQuestionAcceptsEmptyValues() {
        Long recruitmentId = createChoiceQuestionRecruitment();
        RecruitmentFormIds formIds = readFormIds(recruitmentId);

        Long applicationId = submitAnswerItems(recruitmentId, """
                {"answerItems": [
                  {"questionId": "%s", "values": ["%s"]},
                  {"questionId": "%s", "values": ["%s"]},
                  {"questionId": "%s", "values": []}
                ]}
                """.formatted(
                        formIds.motivationQuestionId(), MOTIVATION_ANSWER_TEXT,
                        formIds.weekdayQuestionId(), formIds.weekdayChoiceIds().get(1),
                        formIds.interestQuestionId()))
                .statusCode(HttpStatus.CREATED.value())
                .extract().jsonPath().getLong("data");

        RestAssured.given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + applicantToken)
                .when()
                    .get("/api/v1/users/me/applications/{applicationId}", applicationId)
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.answers[1]", equalTo("주말"))
                    .body("data.answers[2]", equalTo(""));
    }

    @Test
    @DisplayName("legacy questions 로 생성한 모집도 상세에서 필수 주관식 questionItems 로 승격되어 보인다")
    void legacyCreatedRecruitmentIsPromotedToRequiredTextQuestionItems() {
        Club club = saveActiveClubLedByLeader("legacy승격동아리");
        LocalDate today = LocalDate.now();
        Long recruitmentId = createRecruitment("""
                {
                  "title": "legacy 승격 모집",
                  "startDate": "%s",
                  "endDate": "%s",
                  "capacity": 10,
                  "questions": ["%s", "%s"]
                }
                """.formatted(today.minusDays(1), today.plusDays(7),
                        MOTIVATION_QUESTION_TEXT, "각오 한마디"), club.getId());

        JsonPath detail = fetchRecruitmentDetail(recruitmentId);

        assertThat(detail.getList("data.questions", String.class))
                .containsExactly(MOTIVATION_QUESTION_TEXT, "각오 한마디");
        assertThat(detail.getList("data.questionItems")).hasSize(2);
        assertThat(detail.getList("data.questionItems.type", String.class))
                .containsExactly("TEXT", "TEXT");
        assertThat(detail.getList("data.questionItems.required", Boolean.class))
                .containsExactly(true, true);
        assertThat(detail.getList("data.questionItems[0].choices")).isEmpty();
        assertThat(detail.getList("data.questionItems.id", String.class))
                .hasSize(2).doesNotContainNull().doesNotHaveDuplicates();
    }

    @Test
    @DisplayName("외부 폼 모집 상세는 questions 와 questionItems 를 모두 빈 배열로 반환한다")
    void externalFormRecruitmentExposesEmptyQuestionArrays() {
        Club club = saveActiveClubLedByLeader("외부폼동아리");
        LocalDate today = LocalDate.now();
        Long recruitmentId = createRecruitment("""
                {
                  "title": "외부 폼 모집",
                  "startDate": "%s",
                  "endDate": "%s",
                  "capacity": 10,
                  "applicationMode": "EXTERNAL",
                  "externalFormUrl": "https://forms.example.com/apply"
                }
                """.formatted(today.minusDays(1), today.plusDays(7)), club.getId());

        // 폼이 없어도 두 필드는 null 이 아닌 빈 배열이어야 한다 — FE 가 곧바로 map() 을 돌린다.
        RestAssured.given()
                .when()
                    .get("/api/v1/recruitments/{recruitmentId}", recruitmentId)
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.applicationMode", equalTo("EXTERNAL"))
                    .body("data.questions", hasSize(0))
                    .body("data.questionItems", hasSize(0));
    }

    @Test
    @DisplayName("전 질문이 주관식인 모집은 legacy answers 로 계속 제출할 수 있다")
    void legacyAnswersStillWorkForTextOnlyRecruitment() {
        Club club = saveActiveClubLedByLeader("legacy주관식동아리");
        LocalDate today = LocalDate.now();
        Long recruitmentId = createRecruitment("""
                {
                  "title": "legacy 주관식 모집",
                  "content": "본문",
                  "startDate": "%s",
                  "endDate": "%s",
                  "capacity": 10,
                  "questions": ["%s", "%s"]
                }
                """.formatted(today.minusDays(1), today.plusDays(7),
                        MOTIVATION_QUESTION_TEXT, "각오 한마디"), club.getId());

        Long applicationId = submitAnswerItems(recruitmentId, """
                {"answers": ["%s", "최선을 다하겠습니다"]}
                """.formatted(MOTIVATION_ANSWER_TEXT))
                .statusCode(HttpStatus.CREATED.value())
                .extract().jsonPath().getLong("data");

        RestAssured.given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + applicantToken)
                .when()
                    .get("/api/v1/users/me/applications/{applicationId}", applicationId)
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.answers", contains(MOTIVATION_ANSWER_TEXT, "최선을 다하겠습니다"));
    }

    @Test
    @DisplayName("선택형 질문이 있는 모집에 legacy answers 를 보내면 400 으로 거부된다")
    void legacyAnswersAreRejectedForChoiceQuestionRecruitment() {
        Long recruitmentId = createChoiceQuestionRecruitment();

        // 개수는 질문 수와 같지만, 선택형 질문의 값은 choiceId 여야 하므로 라벨 문자열은 거부된다.
        submitAnswerItems(recruitmentId, """
                {"answers": ["%s", "평일", "백엔드"]}
                """.formatted(MOTIVATION_ANSWER_TEXT))
                .statusCode(HttpStatus.BAD_REQUEST.value())
                .body("ok", equalTo(false))
                .body("message", equalTo("유효하지 않은 선택지입니다."));
    }

    @Test
    @DisplayName("지원자가 생긴 뒤 선택지 라벨을 바꾸면 409 이고, 동일 questionItems 재전송은 204 이다")
    void changingChoiceLabelAfterSubmissionConflictsButIdenticalResendSucceeds() {
        Long recruitmentId = createChoiceQuestionRecruitment();
        RecruitmentFormIds formIds = readFormIds(recruitmentId);

        submitAnswerItems(recruitmentId, """
                {"answerItems": [
                  {"questionId": "%s", "values": ["%s"]},
                  {"questionId": "%s", "values": ["%s"]},
                  {"questionId": "%s", "values": []}
                ]}
                """.formatted(
                        formIds.motivationQuestionId(), MOTIVATION_ANSWER_TEXT,
                        formIds.weekdayQuestionId(), formIds.weekdayChoiceIds().get(0),
                        formIds.interestQuestionId()))
                .statusCode(HttpStatus.CREATED.value());

        // 라벨만 바뀌어도 이미 제출된 답변의 의미가 달라지므로 수정을 막는다.
        RestAssured.given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                    .contentType(ContentType.JSON)
                    .body(updateBodyPreservingIds(formIds, "백엔드 개발"))
                .when()
                    .patch("/api/v1/leader/recruitments/{recruitmentId}", recruitmentId)
                .then()
                    .statusCode(HttpStatus.CONFLICT.value())
                    .body("ok", equalTo(false))
                    .body("message", containsString("질문을 수정할 수 없습니다"));

        // 동일한 질문·선택지를 그대로 재전송하면 변경이 없으므로 통과한다 (다른 필드 수정과 함께 보내는 일반 경로).
        RestAssured.given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                    .contentType(ContentType.JSON)
                    .body(updateBodyPreservingIds(formIds, "백엔드"))
                .when()
                    .patch("/api/v1/leader/recruitments/{recruitmentId}", recruitmentId)
                .then()
                    .statusCode(HttpStatus.NO_CONTENT.value());

        // 409 로 막힌 라벨 변경이 실제로 반영되지 않았는지 상세로 확인한다.
        assertThat(fetchRecruitmentDetail(recruitmentId)
                .getList("data.questionItems[2].choices.label", String.class))
                .containsExactly("백엔드", "프론트엔드", "디자인");
    }

    @Test
    @DisplayName("임시저장 신형 페이로드를 저장하고 조회하면 questionId 와 values 가 보존된다")
    void draftKeepsStructuredQuestionIdAndValues() {
        Long recruitmentId = createChoiceQuestionRecruitment();
        RecruitmentFormIds formIds = readFormIds(recruitmentId);
        String selectedInterestChoiceId = formIds.interestChoiceIds().get(2);

        RestAssured.given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + applicantToken)
                    .contentType(ContentType.JSON)
                    .body("""
                            {"answers": [
                              {"questionId": "%s", "values": ["%s"]},
                              {"questionId": "%s", "values": ["%s"]}
                            ]}
                            """.formatted(
                                    formIds.motivationQuestionId(), MOTIVATION_ANSWER_TEXT,
                                    formIds.interestQuestionId(), selectedInterestChoiceId))
                .when()
                    .put("/api/v1/recruitments/{recruitmentId}/draft", recruitmentId)
                .then()
                    .statusCode(HttpStatus.NO_CONTENT.value());

        RestAssured.given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + applicantToken)
                .when()
                    .get("/api/v1/recruitments/{recruitmentId}/draft", recruitmentId)
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.exists", is(true))
                    .body("data.answers[0].questionId", equalTo(formIds.motivationQuestionId()))
                    .body("data.answers[0].values", contains(MOTIVATION_ANSWER_TEXT))
                    .body("data.answers[1].questionId", equalTo(formIds.interestQuestionId()))
                    .body("data.answers[1].values", contains(selectedInterestChoiceId));
    }

    @Test
    @DisplayName("questions 와 questionItems 를 함께 보내 생성하면 400 으로 거부된다")
    void creatingWithBothQuestionChannelsIsRejected() {
        Club club = saveActiveClubLedByLeader("양쪽질문동아리");
        LocalDate today = LocalDate.now();

        RestAssured.given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                    .contentType(ContentType.JSON)
                    .body("""
                            {
                              "title": "양쪽 질문 모집",
                              "startDate": "%s",
                              "endDate": "%s",
                              "capacity": 10,
                              "questions": ["%s"],
                              "questionItems": [{"text": "%s", "type": "TEXT", "required": true}]
                            }
                            """.formatted(today.minusDays(1), today.plusDays(7),
                                    MOTIVATION_QUESTION_TEXT, MOTIVATION_QUESTION_TEXT))
                .when()
                    .post("/api/v1/leader/clubs/{clubId}/recruitments", club.getId())
                .then()
                    .statusCode(HttpStatus.BAD_REQUEST.value())
                    .body("ok", equalTo(false))
                    .body("message", equalTo("questions 와 questionItems 는 함께 보낼 수 없습니다."));
    }

    @Test
    @DisplayName("answers 와 answerItems 를 함께 보내 제출하면 400 으로 거부된다")
    void submittingWithBothAnswerChannelsIsRejected() {
        Long recruitmentId = createChoiceQuestionRecruitment();
        RecruitmentFormIds formIds = readFormIds(recruitmentId);

        submitAnswerItems(recruitmentId, """
                {
                  "answers": ["%s", "평일", "백엔드"],
                  "answerItems": [{"questionId": "%s", "values": ["%s"]}]
                }
                """.formatted(MOTIVATION_ANSWER_TEXT, formIds.motivationQuestionId(), MOTIVATION_ANSWER_TEXT))
                .statusCode(HttpStatus.BAD_REQUEST.value())
                .body("ok", equalTo(false))
                .body("message", equalTo("answers 와 answerItems 는 함께 보낼 수 없습니다."));
    }

    @Test
    @DisplayName("빈 바디로 제출하면 400 과 답변 목록 필수 안내를 받는다")
    void submittingEmptyBodyIsRejected() {
        Long recruitmentId = createChoiceQuestionRecruitment();

        submitAnswerItems(recruitmentId, "{}")
                .statusCode(HttpStatus.BAD_REQUEST.value())
                .body("ok", equalTo(false))
                .body("message", equalTo("답변 목록은 필수 입력값입니다."));
    }

    @Test
    @DisplayName("answerItems 원소가 null 이면 400 으로 거부된다")
    void submittingNullAnswerItemElementIsRejected() {
        Long recruitmentId = createChoiceQuestionRecruitment();

        // Bean Validation 이 원소 @NotNull 로 먼저 막지 못하면 toCommand 가 NPE 를 던져 500 이 된다.
        submitAnswerItems(recruitmentId, """
                {"answerItems": [null]}
                """)
                .statusCode(HttpStatus.BAD_REQUEST.value())
                .body("ok", equalTo(false))
                .body("message", containsString("답변 항목은 비어 있을 수 없습니다"));
    }

    @Test
    @DisplayName("questionItems 원소가 null 이면 400 으로 거부된다")
    void creatingWithNullQuestionItemElementIsRejected() {
        Club club = saveActiveClubLedByLeader("null질문항목동아리");
        LocalDate today = LocalDate.now();

        RestAssured.given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                    .contentType(ContentType.JSON)
                    .body("""
                            {
                              "title": "null 질문 항목 모집",
                              "startDate": "%s",
                              "endDate": "%s",
                              "capacity": 10,
                              "questionItems": [null]
                            }
                            """.formatted(today.minusDays(1), today.plusDays(7)))
                .when()
                    .post("/api/v1/leader/clubs/{clubId}/recruitments", club.getId())
                .then()
                    .statusCode(HttpStatus.BAD_REQUEST.value())
                    .body("ok", equalTo(false))
                    .body("message", containsString("질문 항목은 비어 있을 수 없습니다"));
    }

    /** 상세 조회로 얻은 서버 발급 id 묶음 — 제출·수정 페이로드가 위치가 아닌 id 로 질문을 참조하기 때문에 필요하다. */
    private record RecruitmentFormIds(
            String motivationQuestionId,
            String weekdayQuestionId,
            String interestQuestionId,
            List<String> weekdayChoiceIds,
            List<String> interestChoiceIds
    ) {}

    /** TEXT(필수) + SINGLE_CHOICE(필수) + MULTIPLE_CHOICE(선택) 3문항 모집을 새 동아리에 생성한다. */
    private Long createChoiceQuestionRecruitment() {
        Club club = saveActiveClubLedByLeader("질문유형동아리");
        LocalDate today = LocalDate.now();
        return createRecruitment("""
                {
                  "title": "질문 유형 통합 모집",
                  "content": "본문",
                  "startDate": "%s",
                  "endDate": "%s",
                  "capacity": 10,
                  "questionItems": [
                    {"text": "%s", "type": "TEXT", "required": true},
                    {"text": "%s", "type": "SINGLE_CHOICE", "required": true,
                     "choices": [{"label": "평일"}, {"label": "주말"}]},
                    {"text": "%s", "type": "MULTIPLE_CHOICE", "required": false,
                     "choices": [{"label": "백엔드"}, {"label": "프론트엔드"}, {"label": "디자인"}]}
                  ]
                }
                """.formatted(today.minusDays(1), today.plusDays(7),
                        MOTIVATION_QUESTION_TEXT, WEEKDAY_QUESTION_TEXT, INTEREST_QUESTION_TEXT),
                club.getId());
    }

    /** 기존 질문·선택지 id 를 그대로 왕복시키는 수정 페이로드. interestFirstChoiceLabel 만 바꿔 라벨 변경을 재현한다. */
    private String updateBodyPreservingIds(RecruitmentFormIds formIds, String interestFirstChoiceLabel) {
        return """
                {
                  "questionItems": [
                    {"id": "%s", "text": "%s", "type": "TEXT", "required": true, "choices": []},
                    {"id": "%s", "text": "%s", "type": "SINGLE_CHOICE", "required": true,
                     "choices": [{"id": "%s", "label": "평일"}, {"id": "%s", "label": "주말"}]},
                    {"id": "%s", "text": "%s", "type": "MULTIPLE_CHOICE", "required": false,
                     "choices": [{"id": "%s", "label": "%s"}, {"id": "%s", "label": "프론트엔드"},
                                 {"id": "%s", "label": "디자인"}]}
                  ]
                }
                """.formatted(
                        formIds.motivationQuestionId(), MOTIVATION_QUESTION_TEXT,
                        formIds.weekdayQuestionId(), WEEKDAY_QUESTION_TEXT,
                        formIds.weekdayChoiceIds().get(0), formIds.weekdayChoiceIds().get(1),
                        formIds.interestQuestionId(), INTEREST_QUESTION_TEXT,
                        formIds.interestChoiceIds().get(0), interestFirstChoiceLabel,
                        formIds.interestChoiceIds().get(1),
                        formIds.interestChoiceIds().get(2));
    }

    private Long createRecruitment(String requestBody, Long clubId) {
        return RestAssured.given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                    .contentType(ContentType.JSON)
                    .body(requestBody)
                .when()
                    .post("/api/v1/leader/clubs/{clubId}/recruitments", clubId)
                .then()
                    .statusCode(HttpStatus.CREATED.value())
                    .extract().jsonPath().getLong("data");
    }

    private JsonPath fetchRecruitmentDetail(Long recruitmentId) {
        return RestAssured.given()
                .when()
                    .get("/api/v1/recruitments/{recruitmentId}", recruitmentId)
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .extract().jsonPath();
    }

    private RecruitmentFormIds readFormIds(Long recruitmentId) {
        JsonPath detail = fetchRecruitmentDetail(recruitmentId);
        return new RecruitmentFormIds(
                detail.getString("data.questionItems[0].id"),
                detail.getString("data.questionItems[1].id"),
                detail.getString("data.questionItems[2].id"),
                detail.getList("data.questionItems[1].choices.id", String.class),
                detail.getList("data.questionItems[2].choices.id", String.class));
    }

    private ValidatableResponse submitAnswerItems(Long recruitmentId, String requestBody) {
        return RestAssured.given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + applicantToken)
                    .contentType(ContentType.JSON)
                    .body(requestBody)
                .when()
                    .post("/api/v1/recruitments/{recruitmentId}/applications", recruitmentId)
                .then();
    }

    private User saveStudent(String name) {
        long unique = sequence.incrementAndGet();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                name + unique,
                "qtypes" + unique + "@daegu.ac.kr",
                "hashed",
                UserRole.STUDENT,
                Grade.FRESHMAN,
                College.IT_ENGINEERING,
                "컴퓨터공학",
                "010-0000-0000",
                LocalDateTime.now()
        ));
    }

    private Club saveActiveClubLedByLeader(String name) {
        String uniqueName = name + "-" + sequence.incrementAndGet();
        Club club = Club.create(uniqueName, ClubCategory.ACADEMIC, "분과", "설명", null);
        try {
            Field statusField = Club.class.getDeclaredField("status");
            statusField.setAccessible(true);
            statusField.set(club, ClubStatus.ACTIVE);
        } catch (ReflectiveOperationException reflectionFailure) {
            throw new IllegalStateException(reflectionFailure);
        }
        Club savedClub = clubRepository.save(club);
        clubMemberRepository.save(ClubMember.asLeader(savedClub, leader));
        return savedClub;
    }
}
