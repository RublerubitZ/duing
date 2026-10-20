package com.duing.domain.user.profilecheck.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;

import com.duing.common.FixedClockConfig;
import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.profilecheck.entity.ProfileCheckConfirmation;
import com.duing.domain.user.profilecheck.entity.ProfileCheckSetting;
import com.duing.domain.user.profilecheck.entity.Semester;
import com.duing.domain.user.profilecheck.repository.ProfileCheckConfirmationRepository;
import com.duing.domain.user.profilecheck.repository.ProfileCheckSettingRepository;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import io.restassured.response.ValidatableResponse;
import java.time.Instant;
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

/** 고정 오늘 2026-06-15(FixedClockConfig) = 2026학년도 1학기. */
@Import({TestcontainersConfiguration.class, FixedClockConfig.class})
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AdminProfileCheckControllerTest extends IntegrationTestBase {

    private static final String PATH = "/api/v1/admin/profile-check";
    private static final Semester THIS_SEMESTER = new Semester(2026, Semester.FIRST_TERM);
    private static final Semester LAST_SEMESTER = new Semester(2025, Semester.SECOND_TERM);

    @LocalServerPort
    private int port;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private ProfileCheckSettingRepository settingRepository;

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
    @DisplayName("한 번도 저장하지 않았으면 기본 문구·꺼짐·오늘 학기 기준 통계를 돌려준다")
    void getReturnsDefaultsBeforeFirstSave() {
        saveStudent(Grade.SOPHOMORE);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, bearer(admin))
                .when().get(PATH)
                .then()
                .statusCode(HttpStatus.OK.value())
                .body("data.enabled", equalTo(false))
                .body("data.semesterYear", equalTo(2026))
                .body("data.semesterTerm", equalTo(1))
                .body("data.currentSemesterYear", equalTo(2026))
                .body("data.currentSemesterTerm", equalTo(1))
                .body("data.title", equalTo(ProfileCheckSetting.DEFAULT_TITLE))
                .body("data.message", equalTo(ProfileCheckSetting.DEFAULT_MESSAGE))
                .body("data.targetCount", equalTo(1))
                .body("data.confirmedCount", equalTo(0))
                .body("data.unconfirmedCount", equalTo(1));
        assertThat(settingRepository.count()).isZero();
    }

    @Test
    @DisplayName("켜서 저장하면 오늘 학기와 저장한 운영진이 기록되고, 조회는 노출 중으로 보인다")
    void turningOnRecordsTodaySemesterAndAuthor() {
        saveSetting(admin, body("학기 시작 안내", "학년을 확인해 주세요.", true))
                .statusCode(HttpStatus.NO_CONTENT.value());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, bearer(admin))
                .when().get(PATH)
                .then()
                .statusCode(HttpStatus.OK.value())
                .body("data.enabled", equalTo(true))
                .body("data.semesterYear", equalTo(2026))
                .body("data.semesterTerm", equalTo(1))
                .body("data.title", equalTo("학기 시작 안내"))
                .body("data.message", equalTo("학년을 확인해 주세요."));

        ProfileCheckSetting setting = settingRepository.findById(ProfileCheckSetting.SINGLETON_ID).orElseThrow();
        assertThat(setting.recordedSemester()).contains(THIS_SEMESTER);
        assertThat(setting.getCreatedBy()).isEqualTo(admin.getId());
        assertThat(setting.getUpdatedBy()).isEqualTo(admin.getId());
    }

    @Test
    @DisplayName("끄면 노출이 멈추지만 학기 기록과 사용자 확인 기록은 그대로 남는다")
    void turningOffKeepsSemesterAndConfirmations() {
        User confirmedStudent = saveStudent(Grade.SOPHOMORE);
        saveSetting(admin, body("안내", "문구", true)).statusCode(HttpStatus.NO_CONTENT.value());
        confirmationRepository.save(ProfileCheckConfirmation.of(confirmedStudent.getId(), THIS_SEMESTER, Instant.parse("2026-06-15T00:00:00Z")));

        saveSetting(admin, body("안내", "문구", false)).statusCode(HttpStatus.NO_CONTENT.value());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, bearer(admin))
                .when().get(PATH)
                .then()
                .statusCode(HttpStatus.OK.value())
                .body("data.enabled", equalTo(false))
                .body("data.semesterYear", equalTo(2026))
                .body("data.semesterTerm", equalTo(1))
                .body("data.confirmedCount", equalTo(1));
        assertThat(confirmationRepository.count()).isEqualTo(1);
        ProfileCheckSetting setting = settingRepository.findById(ProfileCheckSetting.SINGLETON_ID).orElseThrow();
        assertThat(setting.recordedSemester()).contains(THIS_SEMESTER);
    }

    @Test
    @DisplayName("켜 둔 학기가 지나면 노출 중이 아니고, 지난 학기 통계와 오늘 학기를 함께 돌려준다")
    void lapsedSettingShowsPreviousSemesterStats() {
        User confirmedLastSemester = saveStudent(Grade.JUNIOR);
        saveStudent(Grade.SOPHOMORE);
        insertSettingRecordedFor(LAST_SEMESTER);
        confirmationRepository.save(ProfileCheckConfirmation.of(confirmedLastSemester.getId(), LAST_SEMESTER, Instant.parse("2025-09-10T00:00:00Z")));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, bearer(admin))
                .when().get(PATH)
                .then()
                .statusCode(HttpStatus.OK.value())
                .body("data.enabled", equalTo(false))
                .body("data.semesterYear", equalTo(2025))
                .body("data.semesterTerm", equalTo(2))
                .body("data.currentSemesterYear", equalTo(2026))
                .body("data.currentSemesterTerm", equalTo(1))
                .body("data.targetCount", equalTo(2))
                .body("data.confirmedCount", equalTo(1))
                .body("data.unconfirmedCount", equalTo(1));
    }

    @Test
    @DisplayName("학기가 지난 설정을 다시 켜면 오늘 학기로 기록되고 노출 중이 된다")
    void turningOnAgainRecordsCurrentSemester() {
        insertSettingRecordedFor(LAST_SEMESTER);

        saveSetting(admin, body("다시 안내", "문구", true)).statusCode(HttpStatus.NO_CONTENT.value());

        ProfileCheckSetting setting = settingRepository.findById(ProfileCheckSetting.SINGLETON_ID).orElseThrow();
        assertThat(setting.recordedSemester()).contains(THIS_SEMESTER);
        assertThat(setting.isActiveIn(THIS_SEMESTER)).isTrue();
    }

    @Test
    @DisplayName("제목·문구의 앞뒤 공백은 저장 전에 제거된다")
    void titleAndMessageAreStripped() {
        saveSetting(admin, body("  안내 제목  ", "\n 안내 문구 \n", false)).statusCode(HttpStatus.NO_CONTENT.value());

        ProfileCheckSetting setting = settingRepository.findById(ProfileCheckSetting.SINGLETON_ID).orElseThrow();
        assertThat(setting.getTitle()).isEqualTo("안내 제목");
        assertThat(setting.getMessage()).isEqualTo("안내 문구");
    }

    @Test
    @DisplayName("노출 여부를 빠뜨린 저장은 400 이고 설정이 생기지 않는다")
    void missingEnabledIsRejected() {
        Map<String, Object> withoutEnabled = new HashMap<>();
        withoutEnabled.put("title", "안내");
        withoutEnabled.put("message", "문구");

        saveSetting(admin, withoutEnabled)
                .statusCode(HttpStatus.BAD_REQUEST.value())
                .body("message", equalTo("enabled: 노출 여부는 필수 입력값입니다."));

        assertThat(settingRepository.count()).isZero();
    }

    @Test
    @DisplayName("제목이 50자를 넘거나 비어 있으면 400 이다")
    void invalidTitleIsRejected() {
        saveSetting(admin, body("가".repeat(51), "문구", true)).statusCode(HttpStatus.BAD_REQUEST.value());
        saveSetting(admin, body("   ", "문구", true)).statusCode(HttpStatus.BAD_REQUEST.value());

        assertThat(settingRepository.count()).isZero();
    }

    @Test
    @DisplayName("안내 문구가 300자를 넘거나 비어 있으면 400 이다")
    void invalidMessageIsRejected() {
        saveSetting(admin, body("안내", "가".repeat(301), true)).statusCode(HttpStatus.BAD_REQUEST.value());
        saveSetting(admin, body("안내", "", true)).statusCode(HttpStatus.BAD_REQUEST.value());

        assertThat(settingRepository.count()).isZero();
    }

    @Test
    @DisplayName("다른 운영진이 다시 저장하면 수정자만 바뀌고 처음 만든 운영진은 그대로 남는다")
    void updatedByRecordsLastAdmin() {
        User secondAdmin = userRepository.save(UserFixture.admin());
        saveSetting(admin, body("안내", "문구", false)).statusCode(HttpStatus.NO_CONTENT.value());

        saveSetting(secondAdmin, body("안내 2", "문구 2", false)).statusCode(HttpStatus.NO_CONTENT.value());

        ProfileCheckSetting setting = settingRepository.findById(ProfileCheckSetting.SINGLETON_ID).orElseThrow();
        assertThat(setting.getCreatedBy()).isEqualTo(admin.getId());
        assertThat(setting.getUpdatedBy()).isEqualTo(secondAdmin.getId());
        assertThat(setting.getTitle()).isEqualTo("안내 2");
    }

    @Test
    @DisplayName("켜는 저장인데 화면이 본 학기가 오늘 학기와 다르면 409 PROFILE_CHECK_SEMESTER_CHANGED 이고 설정은 그대로다")
    void turningOnFromAnotherSemesterScreenIsRejected() {
        saveSetting(admin, body("A", "문구", false)).statusCode(HttpStatus.NO_CONTENT.value());

        // 학기만 다른 화면과 연도만 다른 화면 — 오늘은 2026학년도 1학기다.
        saveSetting(admin, body("B", "문구", true, 2026, Semester.SECOND_TERM))
                .statusCode(HttpStatus.CONFLICT.value())
                .body("code", equalTo("PROFILE_CHECK_SEMESTER_CHANGED"))
                .body("message", equalTo("학기가 바뀌었습니다. 최신 설정을 확인한 뒤 다시 저장해 주세요."));
        saveSetting(admin, body("B", "문구", true, 2025, Semester.FIRST_TERM))
                .statusCode(HttpStatus.CONFLICT.value())
                .body("code", equalTo("PROFILE_CHECK_SEMESTER_CHANGED"));

        ProfileCheckSetting setting = settingRepository.findById(ProfileCheckSetting.SINGLETON_ID).orElseThrow();
        assertThat(setting.isEnabled()).isFalse();
        assertThat(setting.recordedSemester()).isEmpty();
        assertThat(setting.getTitle()).isEqualTo("A");
    }

    @Test
    @DisplayName("설정을 저장한 적이 없을 때 첫 저장이 학기 대조에 걸리면 행이 남지 않는다")
    void rejectedFirstSaveLeavesNoRow() {
        saveSetting(admin, body("B", "문구", true, 2026, Semester.SECOND_TERM))
                .statusCode(HttpStatus.CONFLICT.value())
                .body("code", equalTo("PROFILE_CHECK_SEMESTER_CHANGED"));

        assertThat(settingRepository.count()).isZero();
    }

    @Test
    @DisplayName("켜는 저장이 오늘 학기를 보내면 저장된다")
    void turningOnFromTodaySemesterScreenIsSaved() {
        saveSetting(admin, body("안내", "문구", true, 2026, Semester.FIRST_TERM))
                .statusCode(HttpStatus.NO_CONTENT.value());

        ProfileCheckSetting setting = settingRepository.findById(ProfileCheckSetting.SINGLETON_ID).orElseThrow();
        assertThat(setting.isEnabled()).isTrue();
        assertThat(setting.recordedSemester()).contains(THIS_SEMESTER);
    }

    @Test
    @DisplayName("끄는 저장은 학기를 대조하지 않는다")
    void turningOffSkipsSemesterCheck() {
        saveSetting(admin, body("안내", "문구", false, 2026, Semester.SECOND_TERM))
                .statusCode(HttpStatus.NO_CONTENT.value());
    }

    @Test
    @DisplayName("학기 필드를 보내지 않는 옛 콘솔의 저장도 그대로 된다")
    void saveWithoutSemesterFieldsIsNotChecked() {
        saveSetting(admin, body("안내", "문구", true)).statusCode(HttpStatus.NO_CONTENT.value());

        ProfileCheckSetting setting = settingRepository.findById(ProfileCheckSetting.SINGLETON_ID).orElseThrow();
        assertThat(setting.isEnabled()).isTrue();
        assertThat(setting.recordedSemester()).contains(THIS_SEMESTER);
    }

    @Test
    @DisplayName("학기 값이 1·2 가 아니면 400 이다")
    void invalidCurrentSemesterTermIsRejected() {
        saveSetting(admin, body("안내", "문구", true, 2026, 3))
                .statusCode(HttpStatus.BAD_REQUEST.value())
                .body("message", equalTo("currentSemesterTerm: 학기는 1 또는 2 여야 합니다."));

        assertThat(settingRepository.count()).isZero();
    }

    @Test
    @DisplayName("일반 학생은 설정을 조회하거나 바꿀 수 없다(403)")
    void studentCannotReadOrChange() {
        User student = saveStudent(Grade.SOPHOMORE);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, bearer(student))
                .when().get(PATH)
                .then()
                .statusCode(HttpStatus.FORBIDDEN.value());
        saveSetting(student, body("안내", "문구", true)).statusCode(HttpStatus.FORBIDDEN.value());

        assertThat(settingRepository.count()).isZero();
    }

    private User saveStudent(Grade grade) {
        User student = UserFixture.unique();
        student.updateProfile(student.getName(), grade, null, null);
        return userRepository.save(student);
    }

    /** 켜 둔 채 학기가 지난 상태 — 기록 학기가 오늘(2026-1)과 다르다. */
    private void insertSettingRecordedFor(Semester semester) {
        jdbcTemplate.update("""
                INSERT INTO profile_check_setting
                    (id, enabled, semester_year, semester_term, title, message,
                     created_by, updated_by, created_at, updated_at)
                VALUES (1, TRUE, ?, ?, '지난 안내', '지난 문구', ?, ?, now(), now())
                """, semester.year(), semester.term(), admin.getId(), admin.getId());
    }

    private Map<String, Object> body(String title, String message, boolean enabled) {
        Map<String, Object> requestBody = new HashMap<>();
        requestBody.put("title", title);
        requestBody.put("message", message);
        requestBody.put("enabled", enabled);
        return requestBody;
    }

    /** 화면이 GET 에서 받은 오늘 학기를 함께 보내는 콘솔의 저장. */
    private Map<String, Object> body(String title, String message, boolean enabled,
                                     int currentSemesterYear, int currentSemesterTerm) {
        Map<String, Object> requestBody = body(title, message, enabled);
        requestBody.put("currentSemesterYear", currentSemesterYear);
        requestBody.put("currentSemesterTerm", currentSemesterTerm);
        return requestBody;
    }

    private ValidatableResponse saveSetting(User actor, Map<String, Object> requestBody) {
        return RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, bearer(actor))
                .contentType(ContentType.JSON)
                .body(requestBody)
                .when().put(PATH)
                .then();
    }

    private String bearer(User actor) {
        return "Bearer " + jwtTokenProvider.createToken(actor.getId(), actor.getRole().name());
    }
}
