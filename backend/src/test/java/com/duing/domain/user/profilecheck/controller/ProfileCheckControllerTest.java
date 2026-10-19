package com.duing.domain.user.profilecheck.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.nullValue;

import com.duing.common.FixedClockConfig;
import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.profilecheck.entity.ProfileCheckConfirmation;
import com.duing.domain.user.profilecheck.entity.Semester;
import com.duing.domain.user.profilecheck.repository.ProfileCheckConfirmationRepository;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import io.restassured.response.ValidatableResponse;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.HashMap;
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
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * 고정 오늘 2026-06-15(FixedClockConfig) = 2026학년도 1학기.
 *
 * <p>가입 시각 함정: JPA 감사는 실제 시계로 users.created_at 을 채우므로 그대로 두면 모든 테스트 사용자가
 * "2026-01-01 이후 가입자"(겨울방학 예외)로 판정돼 제안이 사라진다. 제안이 필요한 사용자는 {@link #saveStudent}
 * 가 가입 시각을 2025-09-01 로 되돌린다.
 */
@Import({TestcontainersConfiguration.class, FixedClockConfig.class})
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ProfileCheckControllerTest extends IntegrationTestBase {

    private static final String PATH = "/api/v1/users/me/profile-check";
    private static final String ADMIN_PATH = "/api/v1/admin/profile-check";
    private static final LocalDateTime AUTUMN_SIGNUP = LocalDateTime.of(2025, 9, 1, 12, 0);
    private static final LocalDateTime WINTER_SIGNUP = LocalDateTime.of(2026, 1, 10, 12, 0);

    @LocalServerPort
    private int port;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private ProfileCheckConfirmationRepository confirmationRepository;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private User admin;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        admin = userRepository.save(UserFixture.admin());
    }

    @Test
    @DisplayName("팝업이 켜져 있으면 대상 학생에게 노출되고, 현재 정보와 다음 학년 제안을 함께 준다")
    void pendingWhenOnForEligibleStudent() {
        turnOn();
        User sophomore = saveStudent(Grade.SOPHOMORE);

        status(sophomore)
                .statusCode(HttpStatus.OK.value())
                .body("data.pending", equalTo(true))
                .body("data.semesterYear", equalTo(2026))
                .body("data.semesterTerm", equalTo(1))
                .body("data.title", equalTo("새 학기 안내"))
                .body("data.message", equalTo("학년을 확인해 주세요."))
                .body("data.grade", equalTo("SOPHOMORE"))
                .body("data.college", equalTo("IT_ENGINEERING"))
                .body("data.major", equalTo("미설정"))
                .body("data.suggestedGrade", equalTo("JUNIOR"));
    }

    @Test
    @DisplayName("팝업이 꺼져 있거나 저장된 적이 없으면 노출되지 않는다")
    void notPendingWhenOff() {
        User sophomore = saveStudent(Grade.SOPHOMORE);

        status(sophomore)
                .statusCode(HttpStatus.OK.value())
                .body("data.pending", equalTo(false))
                .body("data.semesterYear", nullValue())
                .body("data.suggestedGrade", nullValue());

        turnOn();
        turnOff();
        status(sophomore).body("data.pending", equalTo(false));
    }

    @Test
    @DisplayName("2학년이 '3학년이 맞아요'로 확인하면 서버가 3학년으로 바꾸고 그 학기 확인을 기록한다")
    void acceptingSuggestionRaisesGradeAndRecords() {
        turnOn();
        User sophomore = saveStudent(Grade.SOPHOMORE);

        confirm(sophomore, 2026, 1, "JUNIOR").statusCode(HttpStatus.NO_CONTENT.value());

        assertThat(gradeOf(sophomore)).isEqualTo(Grade.JUNIOR);
        assertThat(isRecorded(sophomore, 2026, 1)).isTrue();
        status(sophomore).body("data.pending", equalTo(false));
    }

    @Test
    @DisplayName("확인하지 않고 넘어가면(나중에) 학년도 확인 기록도 바뀌지 않고 다음에도 노출된다")
    void laterChangesNothing() {
        turnOn();
        User sophomore = saveStudent(Grade.SOPHOMORE);

        status(sophomore).body("data.pending", equalTo(true));

        assertThat(gradeOf(sophomore)).isEqualTo(Grade.SOPHOMORE);
        assertThat(isRecorded(sophomore, 2026, 1)).isFalse();
        status(sophomore).body("data.pending", equalTo(true));
    }

    @Test
    @DisplayName("팝업 대신 프로필 수정으로 저장해도 저장한 값과 확인 상태가 함께 반영되어 더 노출되지 않는다")
    void savingProfileClosesPopup() {
        turnOn();
        User sophomore = saveStudent(Grade.SOPHOMORE);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, bearer(sophomore))
                .contentType(ContentType.JSON)
                .body("{\"name\":\"수정이름\",\"grade\":\"JUNIOR\",\"major\":\"컴퓨터정보공학부\"}")
                .when().patch("/api/v1/users/me")
                .then()
                .statusCode(HttpStatus.NO_CONTENT.value());

        User saved = userRepository.findById(sophomore.getId()).orElseThrow();
        assertThat(saved.getGrade()).isEqualTo(Grade.JUNIOR);
        assertThat(saved.getMajor()).isEqualTo("컴퓨터정보공학부");
        assertThat(isRecorded(sophomore, 2026, 1)).isTrue();
        status(sophomore).body("data.pending", equalTo(false));
    }

    @Test
    @DisplayName("같은 확인을 두 번 보내도 학년이 두 번 오르지 않고 기록은 하나다")
    void confirmingTwiceDoesNotRaiseTwice() {
        turnOn();
        User sophomore = saveStudent(Grade.SOPHOMORE);

        confirm(sophomore, 2026, 1, "JUNIOR").statusCode(HttpStatus.NO_CONTENT.value());
        confirm(sophomore, 2026, 1, "JUNIOR").statusCode(HttpStatus.NO_CONTENT.value());

        assertThat(gradeOf(sophomore)).isEqualTo(Grade.JUNIOR);
        assertThat(confirmationRepository.count()).isEqualTo(1);
        status(sophomore).body("data.pending", equalTo(false));
    }

    @Test
    @DisplayName("지난 학기 확인 기록은 새 학기 확인으로 쓰이지 않는다 — 새 학기에는 다시 노출된다")
    void previousSemesterRecordDoesNotCount() {
        turnOn();
        User sophomore = saveStudent(Grade.SOPHOMORE);
        confirmationRepository.save(ProfileCheckConfirmation.of(
                sophomore.getId(), new Semester(2025, Semester.SECOND_TERM), Instant.parse("2025-09-10T00:00:00Z")));

        status(sophomore)
                .body("data.pending", equalTo(true))
                .body("data.suggestedGrade", equalTo("JUNIOR"));
    }

    @Test
    @DisplayName("다른 사용자의 id 를 바디에 넣어도 그 사용자의 학년·확인 기록은 바뀌지 않는다")
    void cannotChangeAnotherUser() {
        turnOn();
        User requester = saveStudent(Grade.SOPHOMORE);
        User other = saveStudent(Grade.SOPHOMORE);
        Map<String, Object> bodyWithOtherUser = confirmBody(2026, 1, "JUNIOR");
        bodyWithOtherUser.put("userId", other.getId());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, bearer(requester))
                .contentType(ContentType.JSON)
                .body(bodyWithOtherUser)
                .when().put(PATH);

        assertThat(gradeOf(other)).isEqualTo(Grade.SOPHOMORE);
        assertThat(isRecorded(other, 2026, 1)).isFalse();
    }

    @Test
    @DisplayName("팝업이 꺼진 뒤 확인을 보내면 409 이고 학년·확인 기록이 바뀌지 않는다")
    void offRejectsConfirmWithoutChanges() {
        turnOn();
        User sophomore = saveStudent(Grade.SOPHOMORE);
        turnOff();

        confirm(sophomore, 2026, 1, "JUNIOR")
                .statusCode(HttpStatus.CONFLICT.value())
                .body("code", equalTo("PROFILE_CHECK_CLOSED"))
                .body("message", equalTo("지금은 정보 확인 기간이 아닙니다."));

        assertThat(gradeOf(sophomore)).isEqualTo(Grade.SOPHOMORE);
        assertThat(isRecorded(sophomore, 2026, 1)).isFalse();
    }

    @Test
    @DisplayName("서버 제안값이 아닌 학년으로 확인하면 400 이고 학년·확인 기록이 바뀌지 않는다")
    void suggestionMismatchIsRejectedWithoutChanges() {
        turnOn();
        User sophomore = saveStudent(Grade.SOPHOMORE);

        confirm(sophomore, 2026, 1, "SENIOR").statusCode(HttpStatus.BAD_REQUEST.value());

        assertThat(gradeOf(sophomore)).isEqualTo(Grade.SOPHOMORE);
        assertThat(isRecorded(sophomore, 2026, 1)).isFalse();
    }

    @Test
    @DisplayName("오늘 학기가 아닌 학기로 확인하면 409 이고 아무 것도 기록되지 않는다")
    void wrongSemesterIsRejected() {
        turnOn();
        User sophomore = saveStudent(Grade.SOPHOMORE);

        confirm(sophomore, 2025, 2, null).statusCode(HttpStatus.CONFLICT.value());

        assertThat(confirmationRepository.count()).isZero();
    }

    @Test
    @DisplayName("켜 둔 학기가 지난 설정이면 노출되지 않고 확인도 409 다")
    void lapsedSettingIsClosed() {
        User sophomore = saveStudent(Grade.SOPHOMORE);
        jdbcTemplate.update("""
                INSERT INTO profile_check_setting
                    (id, enabled, semester_year, semester_term, title, message,
                     created_by, updated_by, created_at, updated_at)
                VALUES (1, TRUE, 2025, 2, '지난 안내', '지난 문구', ?, ?, now(), now())
                """, admin.getId(), admin.getId());

        status(sophomore).body("data.pending", equalTo(false));
        confirm(sophomore, 2026, 1, null).statusCode(HttpStatus.CONFLICT.value());
    }

    @Test
    @DisplayName("운영진·졸업생에게는 노출되지 않고 확인도 409 다")
    void nonTargetsAreNeverPending() {
        turnOn();
        User graduated = saveStudent(Grade.GRADUATED);

        status(admin).body("data.pending", equalTo(false));
        status(graduated).body("data.pending", equalTo(false));
        confirm(admin, 2026, 1, null).statusCode(HttpStatus.CONFLICT.value());
        confirm(graduated, 2026, 1, null).statusCode(HttpStatus.CONFLICT.value());
        assertThat(confirmationRepository.count()).isZero();
    }

    @Test
    @DisplayName("그해 1월 이후 가입자에게는 학년을 제안하지 않고, 현재 정보 그대로 확인할 수 있다")
    void winterSignupGetsNoSuggestion() {
        turnOn();
        User winterFreshman = saveStudentSignedUpAt(Grade.FRESHMAN, WINTER_SIGNUP);

        status(winterFreshman)
                .body("data.pending", equalTo(true))
                .body("data.suggestedGrade", nullValue());
        confirm(winterFreshman, 2026, 1, "SOPHOMORE").statusCode(HttpStatus.BAD_REQUEST.value());
        confirm(winterFreshman, 2026, 1, null).statusCode(HttpStatus.NO_CONTENT.value());

        assertThat(gradeOf(winterFreshman)).isEqualTo(Grade.FRESHMAN);
        assertThat(isRecorded(winterFreshman, 2026, 1)).isTrue();
    }

    @Test
    @DisplayName("4학년은 제안 없이 현재 정보 그대로 확인하고 학년은 바뀌지 않는다")
    void seniorConfirmsWithoutChange() {
        turnOn();
        User senior = saveStudent(Grade.SENIOR);

        status(senior).body("data.suggestedGrade", nullValue());
        confirm(senior, 2026, 1, null).statusCode(HttpStatus.NO_CONTENT.value());

        assertThat(gradeOf(senior)).isEqualTo(Grade.SENIOR);
        assertThat(isRecorded(senior, 2026, 1)).isTrue();
    }

    @Test
    @DisplayName("팝업을 꺼도 확인 기록은 남고, 다시 켜도 이미 확인한 사용자에게는 노출되지 않는다")
    void turningOffKeepsRecordsAndReEnableHonorsThem() {
        turnOn();
        User sophomore = saveStudent(Grade.SOPHOMORE);
        confirm(sophomore, 2026, 1, "JUNIOR").statusCode(HttpStatus.NO_CONTENT.value());

        turnOff();
        assertThat(isRecorded(sophomore, 2026, 1)).isTrue();
        turnOn();

        status(sophomore).body("data.pending", equalTo(false));
    }

    @Test
    @DisplayName("학기가 빠졌거나 1·2 가 아니거나 없는 학년 값이면 400 이고 아무 것도 바뀌지 않는다")
    void invalidSemesterIsRejected() {
        turnOn();
        User sophomore = saveStudent(Grade.SOPHOMORE);
        Map<String, Object> withoutTerm = new HashMap<>();
        withoutTerm.put("semesterYear", 2026);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, bearer(sophomore))
                .contentType(ContentType.JSON)
                .body(withoutTerm)
                .when().put(PATH)
                .then()
                .statusCode(HttpStatus.BAD_REQUEST.value());
        confirm(sophomore, 2026, 3, null).statusCode(HttpStatus.BAD_REQUEST.value());
        confirm(sophomore, 2026, 1, "FIFTH").statusCode(HttpStatus.BAD_REQUEST.value());

        assertThat(confirmationRepository.count()).isZero();
        assertThat(gradeOf(sophomore)).isEqualTo(Grade.SOPHOMORE);
    }

    @Test
    @DisplayName("로그인하지 않으면 조회할 수 없다(401)")
    void requiresLogin() {
        RestAssured.given()
                .when().get(PATH)
                .then()
                .statusCode(HttpStatus.UNAUTHORIZED.value());
    }

    private User saveStudent(Grade grade) {
        return saveStudentSignedUpAt(grade, AUTUMN_SIGNUP);
    }

    private User saveStudentSignedUpAt(Grade grade, LocalDateTime signedUpAt) {
        User student = UserFixture.unique();
        student.changeGrade(grade);
        User saved = userRepository.save(student);
        jdbcTemplate.update("UPDATE users SET created_at = ? WHERE id = ?", Timestamp.valueOf(signedUpAt), saved.getId());
        return saved;
    }

    private void turnOn() {
        saveSetting(true);
    }

    private void turnOff() {
        saveSetting(false);
    }

    private void saveSetting(boolean enabled) {
        Map<String, Object> settingBody = new HashMap<>();
        settingBody.put("title", "새 학기 안내");
        settingBody.put("message", "학년을 확인해 주세요.");
        settingBody.put("enabled", enabled);
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, bearer(admin))
                .contentType(ContentType.JSON)
                .body(settingBody)
                .when().put(ADMIN_PATH)
                .then()
                .statusCode(HttpStatus.NO_CONTENT.value());
    }

    private ValidatableResponse status(User user) {
        return RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, bearer(user))
                .when().get(PATH)
                .then();
    }

    private ValidatableResponse confirm(User user, int semesterYear, int semesterTerm, String grade) {
        return RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, bearer(user))
                .contentType(ContentType.JSON)
                .body(confirmBody(semesterYear, semesterTerm, grade))
                .when().put(PATH)
                .then();
    }

    private Map<String, Object> confirmBody(int semesterYear, int semesterTerm, String grade) {
        Map<String, Object> confirmBody = new HashMap<>();
        confirmBody.put("semesterYear", semesterYear);
        confirmBody.put("semesterTerm", semesterTerm);
        confirmBody.put("grade", grade);
        return confirmBody;
    }

    private Grade gradeOf(User user) {
        return userRepository.findById(user.getId()).orElseThrow().getGrade();
    }

    private boolean isRecorded(User user, int semesterYear, int semesterTerm) {
        return confirmationRepository.existsByUserIdAndSemesterYearAndSemesterTerm(user.getId(), semesterYear, semesterTerm);
    }

    private String bearer(User user) {
        return "Bearer " + jwtTokenProvider.createToken(user.getId(), user.getRole().name());
    }
}
