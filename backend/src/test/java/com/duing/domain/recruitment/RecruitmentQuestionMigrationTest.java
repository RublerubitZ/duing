package com.duing.domain.recruitment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.equalTo;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationAnswer;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.draft.entity.ApplicationDraft;
import com.duing.domain.draft.repository.ApplicationDraftRepository;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentForm;
import com.duing.domain.recruitment.entity.RecruitmentQuestion;
import com.duing.domain.recruitment.entity.TargetRole;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.restassured.RestAssured;
import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * V78 마이그레이션 SQL(questions/answers/draft.answers 의 jsonb 구조화)이 실제 데이터를
 * 의도대로 변환하는지 검증한다.
 *
 * <p>Testcontainers 가 스키마 초기화 시 V78 을 이미 1회 실행하지만, 그 시점엔 데이터가 없어
 * SQL 문법만 검증된다. 이 테스트는 legacy 형태로 강제 치환한 실데이터에 V78 의 3개 UPDATE 문을
 * "그대로" 다시 실행해 변환 결과를 단언한다.
 *
 * <p>변환 정확성뿐 아니라 다음 두 가지를 함께 지킨다.
 * <ul>
 *   <li><b>총체성</b> — 어떤 legacy·malformed 형태도 미변환으로 남지 않는다. 남으면 Hibernate 가
 *       record 로 역직렬화하다 실패해 조회가 HTTP 500 이 된다.</li>
 *   <li><b>멱등성</b> — 이미 신형인 행에 SQL 을 다시 실행해도 질문 id 와 내용이 바뀌지 않는다.
 *       (legacy 행만 보는 테스트는 이 성질을 검증하지 못하므로 별도 케이스를 둔다.)</li>
 * </ul>
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class RecruitmentQuestionMigrationTest extends IntegrationTestBase {

    private static final String V78_MIGRATION_PATH = "db/migration/V78__recruitment_question_types.sql";

    @LocalServerPort
    private int port;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ClubRepository clubRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private RecruitmentRepository recruitmentRepository;

    @Autowired
    private ApplicationRepository applicationRepository;

    @Autowired
    private ApplicationDraftRepository draftRepository;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Test
    @DisplayName("V78 마이그레이션 SQL 은 legacy 문자열/인덱스 jsonb 를 질문 id 기준 구조화 스키마로 정확히 변환한다")
    void v78MigrationConvertsLegacyJsonbToStructuredSchema() throws Exception {
        // given: 정상 경로(JPA)로 club/user/recruitment(+form)/application/draft 를 저장해
        // FK·NOT NULL 제약을 만족시킨다. jsonb 내용 자체는 이후 raw SQL 로 legacy 형태로 덮어쓴다.
        Club club = saveActiveClub();
        User student = saveStudent();
        Recruitment recruitment = saveSelfRecruitmentWithForm(club);
        Application application = applicationRepository.save(Application.submit(recruitment, student,
                List.of(new ApplicationAnswer("placeholder", List.of("placeholder")))));
        ApplicationDraft draft = draftRepository.save(ApplicationDraft.create(student.getId(), recruitment.getId(),
                List.of(new ApplicationDraft.DraftAnswer("placeholder", List.of("placeholder")))));

        // legacy 형태로 강제 치환 (V78 실행 전 저장 형태 재현).
        // 질문 2개, 답변 3개(질문 수를 초과하는 잉여 답변 1개 포함), draft 는 숫자 인덱스(0,1)와
        // 범위를 벗어난 인덱스(99) 를 함께 넣어 "폐기" 케이스도 검증한다.
        jdbcTemplate.update("UPDATE recruitment_form SET questions = ?::jsonb WHERE recruitment_id = ?",
                "[\"질문1\", \"질문2\"]", recruitment.getId());
        jdbcTemplate.update("UPDATE application SET answers = ?::jsonb WHERE id = ?",
                "[\"답변1\", \"답변2\", \"잉여답변\"]", application.getId());
        jdbcTemplate.update("UPDATE application_draft SET answers = ?::jsonb WHERE id = ?",
                "[{\"questionId\":0,\"value\":\"초안0\"},"
                        + "{\"questionId\":1,\"value\":\"초안1\"},"
                        + "{\"questionId\":99,\"value\":\"범위밖\"}]",
                draft.getId());

        // when: V78 마이그레이션 SQL 파일을 그대로 재실행한다.
        runV78MigrationSql();

        // then: 질문 — 각 원소가 {id, text, type:TEXT, required:true, choices:[]} 로 승격된다.
        JsonNode questions = fetchJsonColumn(
                "SELECT questions::text FROM recruitment_form WHERE recruitment_id = ?", recruitment.getId());
        assertThat(questions.size()).isEqualTo(2);
        assertThat(questions.get(0).get("text").asText()).isEqualTo("질문1");
        assertThat(questions.get(0).get("type").asText()).isEqualTo("TEXT");
        assertThat(questions.get(0).get("required").asBoolean()).isTrue();
        assertThat(questions.get(0).get("choices").size()).isZero();
        assertThat(questions.get(0).get("id").asText()).isNotBlank();
        assertThat(questions.get(1).get("text").asText()).isEqualTo("질문2");
        String questionOneId = questions.get(0).get("id").asText();
        String questionTwoId = questions.get(1).get("id").asText();
        assertThat(questionOneId).isNotEqualTo(questionTwoId);

        // then: 답변 — 앞 2개는 같은 위치 질문의 id 로, 초과분(3번째)은 questionId=null 로 무손실 보존된다.
        JsonNode answers = fetchJsonColumn("SELECT answers::text FROM application WHERE id = ?", application.getId());
        assertThat(answers.size()).isEqualTo(3);
        assertThat(answers.get(0).get("questionId").asText()).isEqualTo(questionOneId);
        assertThat(answers.get(0).get("values").get(0).asText()).isEqualTo("답변1");
        assertThat(answers.get(1).get("questionId").asText()).isEqualTo(questionTwoId);
        assertThat(answers.get(1).get("values").get(0).asText()).isEqualTo("답변2");
        assertThat(answers.get(2).get("questionId").isNull()).isTrue();
        assertThat(answers.get(2).get("values").get(0).asText()).isEqualTo("잉여답변");

        // then: 임시저장 — 숫자 인덱스가 같은 위치 질문의 uuid 로 치환되고, 범위를 벗어난 인덱스(99)는
        // 답변 마이그레이션(2번)과 동일하게 questionId=null 로 무손실 보존된다(폐기되지 않는다).
        JsonNode draftAnswers = fetchJsonColumn(
                "SELECT answers::text FROM application_draft WHERE id = ?", draft.getId());
        assertThat(draftAnswers.size()).isEqualTo(3);
        assertThat(draftAnswers.get(0).get("questionId").asText()).isEqualTo(questionOneId);
        assertThat(draftAnswers.get(0).get("values").get(0).asText()).isEqualTo("초안0");
        assertThat(draftAnswers.get(1).get("questionId").asText()).isEqualTo(questionTwoId);
        assertThat(draftAnswers.get(1).get("values").get(0).asText()).isEqualTo("초안1");
        assertThat(draftAnswers.get(2).get("questionId").isNull()).isTrue();
        assertThat(draftAnswers.get(2).get("values").get(0).asText()).isEqualTo("범위밖");

        // and: JPA 로 읽어도 정상 매핑되어, 기존 응답 형태(questions/answers 문자열 배열)로 그대로 조회된다.
        RestAssured.port = port;
        String studentToken = jwtTokenProvider.createToken(student.getId(), student.getRole().name());
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when()
                    .get("/api/v1/users/me/applications/{applicationId}", application.getId())
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("ok", equalTo(true))
                    .body("data.questions", contains("질문1", "질문2"))
                    .body("data.answers", contains("답변1", "답변2"));
    }

    @Test
    @DisplayName("V78 마이그레이션은 폼이 없는 모집(EXTERNAL 등)에 남은 임시저장도 questionId=null 로 무손실 보존한다")
    void v78MigrationPreservesDraftAnswersWhenRecruitmentHasNoForm() throws Exception {
        // EXTERNAL 모집은 RecruitmentForm 이 아예 attach 되지 않는다(GeneralRecruitmentService.buildAndPersist).
        // upsert 는 applicationMode 를 검사하지 않으므로, 과거엔 이런 모집에도 draft 가 저장될 수 있었다.
        // 이 잔재 행에 대해 (form 과의) INNER JOIN 으로 마이그레이션하면 매치가 0건이라 answers 전체가
        // '[]' 로 비워져 버린다 — LEFT JOIN LATERAL 이어야 questionId=null 로 무손실 보존된다.
        Club club = saveActiveClub();
        User student = saveStudent();
        Recruitment externalRecruitment = recruitmentRepository.save(Recruitment.createWithOptions(
                club, "폼 없는 모집", null, LocalDate.now().minusDays(1), LocalDate.now().plusDays(7), 10,
                ApplicationMode.EXTERNAL, "https://example.com/form", false, TargetRole.MEMBER,
                null, null, false));
        ApplicationDraft draft = draftRepository.save(ApplicationDraft.create(
                student.getId(), externalRecruitment.getId(),
                List.of(new ApplicationDraft.DraftAnswer("placeholder", List.of("placeholder")))));

        jdbcTemplate.update("UPDATE application_draft SET answers = ?::jsonb WHERE id = ?",
                "[{\"questionId\":0,\"value\":\"고아초안\"}]", draft.getId());

        runV78MigrationSql();

        JsonNode draftAnswers = fetchJsonColumn(
                "SELECT answers::text FROM application_draft WHERE id = ?", draft.getId());
        assertThat(draftAnswers.size()).isEqualTo(1);
        assertThat(draftAnswers.get(0).get("questionId").isNull()).isTrue();
        assertThat(draftAnswers.get(0).get("values").get(0).asText()).isEqualTo("고아초안");
    }

    @Test
    @DisplayName("V78 마이그레이션은 한 행 안에 questionId=null(malformed) 원소가 섞여 있어도 "
            + "나머지 숫자 인덱스 원소는 정상 변환하고, 그 행이 legacy 상태로 영영 남지 않는다")
    void v78MigrationConvertsRowEvenWhenOneEntryHasNullQuestionId() throws Exception {
        // 과거 UpsertDraftRequest.DraftAnswerPayload.questionId 는 @NotNull 이 없어 null 전송이 가능했다.
        // 행 전체를 "모든 원소가 number 타입" 게이트로만 판별하면, null 원소 하나가 섞인 행은 영원히
        // legacy 모양으로 남는다 — 다음 조회 시 Hibernate 가 신형 DraftAnswer(questionId, values) 로
        // 역직렬화를 시도하며 UnrecognizedPropertyException("value" 필드) 을 던지는 것을 실제로 재현·확인했다.
        // 게이트가 'null' 타입도 허용해야 이 행이 계속 변환 대상에 남아, 유효한 숫자 원소는 정상 변환된다.
        Club club = saveActiveClub();
        User student = saveStudent();
        Recruitment recruitment = saveSelfRecruitmentWithForm(club);
        jdbcTemplate.update("UPDATE recruitment_form SET questions = ?::jsonb WHERE recruitment_id = ?",
                "[\"질문1\"]", recruitment.getId());
        ApplicationDraft draft = draftRepository.save(ApplicationDraft.create(
                student.getId(), recruitment.getId(),
                List.of(new ApplicationDraft.DraftAnswer("placeholder", List.of("placeholder")))));

        jdbcTemplate.update("UPDATE application_draft SET answers = ?::jsonb WHERE id = ?",
                "[{\"questionId\":0,\"value\":\"정상\"},{\"questionId\":null,\"value\":\"깨진값\"}]",
                draft.getId());

        runV78MigrationSql();

        JsonNode formQuestions = fetchJsonColumn(
                "SELECT questions::text FROM recruitment_form WHERE recruitment_id = ?", recruitment.getId());
        String questionId = formQuestions.get(0).get("id").asText();

        // null-questionId 원소는 폐기되지만, 숫자 인덱스 원소는 새 형태로 정상 변환된다.
        JsonNode draftAnswers = fetchJsonColumn(
                "SELECT answers::text FROM application_draft WHERE id = ?", draft.getId());
        assertThat(draftAnswers.size()).isEqualTo(1);
        assertThat(draftAnswers.get(0).get("questionId").asText()).isEqualTo(questionId);
        assertThat(draftAnswers.get(0).get("values").get(0).asText()).isEqualTo("정상");

        // JPA 로도 예외 없이 정상 조회된다 — 고정 전에는 이 지점에서 500(UnrecognizedPropertyException)
        // 위험이 있었다.
        assertThat(draftRepository.findByUserIdAndRecruitmentId(student.getId(), recruitment.getId())).isPresent();
    }

    @Test
    @DisplayName("질문 배열에 JSON null 원소가 남아 있어도 마이그레이션이 빈 문자열 질문으로 변환해 조회가 실패하지 않는다")
    void v78MigrationNormalizesNullQuestionElementToEmptyText() throws Exception {
        // #604 이전 UpdateRecruitmentRequest.questions 는 List<String> 에 원소 검증이 없어 PATCH 로
        // ["질문1", null] 저장이 가능했다. "모든 원소가 문자열" 게이트는 이 행을 건너뛰어 legacy 로
        // 남기고, 다음 조회에서 Hibernate 가 String → RecruitmentQuestion 역직렬화에 실패해 500 이 된다.
        Club club = saveActiveClub();
        User student = saveStudent();
        Recruitment recruitment = saveSelfRecruitmentWithForm(club);
        Application application = applicationRepository.save(Application.submit(recruitment, student,
                List.of(new ApplicationAnswer("placeholder", List.of("placeholder")))));

        jdbcTemplate.update("UPDATE recruitment_form SET questions = ?::jsonb WHERE recruitment_id = ?",
                "[\"질문1\", null]", recruitment.getId());
        jdbcTemplate.update("UPDATE application SET answers = ?::jsonb WHERE id = ?",
                "[\"답변1\", \"답변2\"]", application.getId());

        runV78MigrationSql();

        JsonNode questions = fetchJsonColumn(
                "SELECT questions::text FROM recruitment_form WHERE recruitment_id = ?", recruitment.getId());
        assertThat(questions.size()).isEqualTo(2);
        assertThat(questions.get(0).get("text").textValue()).isEqualTo("질문1");
        // JSON null 원소는 빈 문자열로 정규화된다. COALESCE 가 없으면 text 가 JSON null 이라
        // textValue() 가 null 이 되어 아래 단언이 실패한다.
        assertThat(questions.get(1).get("text").textValue()).isEmpty();
        assertThat(questions.get(1).get("type").asText()).isEqualTo("TEXT");
        assertThat(questions.get(1).get("required").asBoolean()).isTrue();
        assertThat(questions.get(1).get("choices").size()).isZero();
        assertThat(questions.get(1).get("id").asText()).isNotBlank();

        // and: JPA 로 실제 조회해도 역직렬화 예외 없이 200 을 반환한다 — 게이트를 뒤집은 진짜 목적.
        RestAssured.port = port;
        String studentToken = jwtTokenProvider.createToken(student.getId(), student.getRole().name());
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when()
                    .get("/api/v1/users/me/applications/{applicationId}", application.getId())
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("ok", equalTo(true))
                    .body("data.questions", contains("질문1", ""))
                    .body("data.answers", contains("답변1", "답변2"));
    }

    @Test
    @DisplayName("임시저장 questionId 가 Long 최대값이어도 마이그레이션이 실패하지 않고 해당 원소만 폐기한다")
    void v78MigrationSurvivesOutOfRangeDraftQuestionId() throws Exception {
        // UpsertDraftRequest.DraftAnswerPayload.questionId 는 Long 에 범위 검증이 없어 Long.MAX_VALUE
        // 저장이 가능했다. 가드가 없으면 (questionId)::bigint + 1 이 "bigint out of range" 로 터져
        // 마이그레이션 전체가 실패한다 — 한 행 때문에 배포가 막히는 상황.
        Club club = saveActiveClub();
        User student = saveStudent();
        Recruitment recruitment = saveSelfRecruitmentWithForm(club);
        jdbcTemplate.update("UPDATE recruitment_form SET questions = ?::jsonb WHERE recruitment_id = ?",
                "[\"질문1\"]", recruitment.getId());
        ApplicationDraft draft = draftRepository.save(ApplicationDraft.create(
                student.getId(), recruitment.getId(),
                List.of(new ApplicationDraft.DraftAnswer("placeholder", List.of("placeholder")))));

        jdbcTemplate.update("UPDATE application_draft SET answers = ?::jsonb WHERE id = ?",
                "[{\"questionId\":0,\"value\":\"정상\"},"
                        + "{\"questionId\":9223372036854775807,\"value\":\"오버플로\"}]",
                draft.getId());

        assertThatCode(this::runV78MigrationSql).doesNotThrowAnyException();

        JsonNode formQuestions = fetchJsonColumn(
                "SELECT questions::text FROM recruitment_form WHERE recruitment_id = ?", recruitment.getId());
        String questionId = formQuestions.get(0).get("id").asText();

        // 안전 범위를 벗어난 원소는 폐기된다(애초에 매칭될 질문이 없다). 유효한 원소는 정상 변환된다.
        JsonNode draftAnswers = fetchJsonColumn(
                "SELECT answers::text FROM application_draft WHERE id = ?", draft.getId());
        assertThat(draftAnswers.size()).isEqualTo(1);
        assertThat(draftAnswers.get(0).get("questionId").asText()).isEqualTo(questionId);
        assertThat(draftAnswers.get(0).get("values").get(0).asText()).isEqualTo("정상");

        assertThat(draftRepository.findByUserIdAndRecruitmentId(student.getId(), recruitment.getId())).isPresent();
    }

    @Test
    @DisplayName("이미 신형으로 변환된 질문·답변·임시저장 행은 마이그레이션을 다시 실행해도 질문 id 와 내용이 그대로 유지된다")
    void v78MigrationIsIdempotentAcrossQuestionsAnswersAndDrafts() throws Exception {
        Club club = saveActiveClub();
        User student = saveStudent();
        Recruitment recruitment = saveSelfRecruitmentWithForm(club);
        Application application = applicationRepository.save(Application.submit(recruitment, student,
                List.of(new ApplicationAnswer("placeholder", List.of("placeholder")))));
        ApplicationDraft draft = draftRepository.save(ApplicationDraft.create(student.getId(), recruitment.getId(),
                List.of(new ApplicationDraft.DraftAnswer("placeholder", List.of("placeholder")))));

        jdbcTemplate.update("UPDATE recruitment_form SET questions = ?::jsonb WHERE recruitment_id = ?",
                "[\"질문1\", \"질문2\"]", recruitment.getId());
        // 잉여 답변(3번째)과 범위 밖 인덱스(99)는 1 회차에서 questionId=null 로 무손실 보존된다.
        // 2 회차 게이트가 이 행을 "아직 legacy" 로 오판하면 원소가 전부 폐기되어 '[]' 로 날아간다 —
        // 멱등성의 핵심 회귀 지점이라 두 케이스를 반드시 포함한다.
        jdbcTemplate.update("UPDATE application SET answers = ?::jsonb WHERE id = ?",
                "[\"답변1\", \"답변2\", \"잉여답변\"]", application.getId());
        jdbcTemplate.update("UPDATE application_draft SET answers = ?::jsonb WHERE id = ?",
                "[{\"questionId\":0,\"value\":\"초안0\"},{\"questionId\":99,\"value\":\"범위밖\"}]", draft.getId());

        runV78MigrationSql();

        JsonNode questionsAfterFirstRun = fetchJsonColumn(
                "SELECT questions::text FROM recruitment_form WHERE recruitment_id = ?", recruitment.getId());
        JsonNode answersAfterFirstRun = fetchJsonColumn(
                "SELECT answers::text FROM application WHERE id = ?", application.getId());
        JsonNode draftAfterFirstRun = fetchJsonColumn(
                "SELECT answers::text FROM application_draft WHERE id = ?", draft.getId());
        // 전제 조건: 1 회차 결과에 questionId=null 보존 원소가 실제로 존재해야 이 테스트가 의미를 갖는다.
        assertThat(answersAfterFirstRun.get(2).get("questionId").isNull()).isTrue();
        assertThat(draftAfterFirstRun.size()).isEqualTo(2);
        assertThat(draftAfterFirstRun.get(1).get("questionId").isNull()).isTrue();

        // when: 이미 신형인 데이터 위에 같은 SQL 을 한 번 더 실행한다 (부분 적용·복구 재실행 시나리오).
        runV78MigrationSql();

        // then: 세 테이블 모두 1 회차 결과와 완전히 동일하다 — 질문 uuid 재발급도, 원소 폐기도 없다.
        assertThat(fetchJsonColumn(
                "SELECT questions::text FROM recruitment_form WHERE recruitment_id = ?", recruitment.getId()))
                .isEqualTo(questionsAfterFirstRun);
        assertThat(fetchJsonColumn("SELECT answers::text FROM application WHERE id = ?", application.getId()))
                .isEqualTo(answersAfterFirstRun);
        assertThat(fetchJsonColumn("SELECT answers::text FROM application_draft WHERE id = ?", draft.getId()))
                .isEqualTo(draftAfterFirstRun);
    }

    @Test
    @DisplayName("답변 배열에 JSON null 원소가 있어도 마이그레이션이 빈 문자열 답변으로 변환한다")
    void v78MigrationNormalizesNullAnswerElementToEmptyString() throws Exception {
        Club club = saveActiveClub();
        User student = saveStudent();
        Recruitment recruitment = saveSelfRecruitmentWithForm(club);
        Application application = applicationRepository.save(Application.submit(recruitment, student,
                List.of(new ApplicationAnswer("placeholder", List.of("placeholder")))));

        jdbcTemplate.update("UPDATE recruitment_form SET questions = ?::jsonb WHERE recruitment_id = ?",
                "[\"질문1\", \"질문2\"]", recruitment.getId());
        jdbcTemplate.update("UPDATE application SET answers = ?::jsonb WHERE id = ?",
                "[\"답변1\", null]", application.getId());

        runV78MigrationSql();

        JsonNode answers = fetchJsonColumn("SELECT answers::text FROM application WHERE id = ?", application.getId());
        assertThat(answers.size()).isEqualTo(2);
        assertThat(answers.get(0).get("values").get(0).textValue()).isEqualTo("답변1");
        assertThat(answers.get(1).get("values").get(0).textValue()).isEmpty();

        RestAssured.port = port;
        String studentToken = jwtTokenProvider.createToken(student.getId(), student.getRole().name());
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when()
                    .get("/api/v1/users/me/applications/{applicationId}", application.getId())
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("ok", equalTo(true))
                    .body("data.answers", contains("답변1", ""));
    }

    private void runV78MigrationSql() throws Exception {
        String migrationSql = new String(
                new ClassPathResource(V78_MIGRATION_PATH).getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        for (String statement : migrationSql.split(";")) {
            String trimmedStatement = statement.strip();
            if (!trimmedStatement.isEmpty()) {
                jdbcTemplate.execute(trimmedStatement);
            }
        }
    }

    private JsonNode fetchJsonColumn(String sql, Long id) throws Exception {
        String json = jdbcTemplate.queryForObject(sql, String.class, id);
        return objectMapper.readTree(json);
    }

    private Club saveActiveClub() throws Exception {
        Club club = Club.create("마이그레이션동아리-" + sequence.getAndIncrement(),
                ClubCategory.OTHER, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(club, ClubStatus.ACTIVE);
        return clubRepository.save(club);
    }

    private User saveStudent() {
        long unique = sequence.getAndIncrement();
        User user = User.create(
                String.format("%010d", unique % 10_000_000_000L),
                "마이그레이션학생",
                "migration" + unique + "@daegu.ac.kr",
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

    private Recruitment saveSelfRecruitmentWithForm(Club club) {
        LocalDate today = LocalDate.now();
        Recruitment recruitment = Recruitment.createWithOptions(
                club, "마이그레이션 테스트 모집", null,
                today.minusDays(1), today.plusDays(7), 10,
                ApplicationMode.SELF, null, false, TargetRole.MEMBER,
                null, null, false);
        // 실제 문항 내용은 이후 raw SQL 로 legacy 형태로 덮어쓰므로 placeholder 면 충분하다.
        recruitment.attachForm(RecruitmentForm.create(recruitment,
                List.of(RecruitmentQuestion.createText("placeholder1"),
                        RecruitmentQuestion.createText("placeholder2"))));
        return recruitmentRepository.save(recruitment);
    }
}
