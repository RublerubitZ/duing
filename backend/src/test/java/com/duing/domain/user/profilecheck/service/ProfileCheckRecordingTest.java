package com.duing.domain.user.profilecheck.service;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.FixedClockConfig;
import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.PhoneVerification;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.VerificationPurpose;
import com.duing.domain.user.profilecheck.repository.ProfileCheckConfirmationRepository;
import com.duing.domain.user.repository.PhoneVerificationRepository;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import io.restassured.response.ValidatableResponse;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;

/** 고정 오늘 2026-06-15(FixedClockConfig) = 2026학년도 1학기. 팝업 설정은 만들지 않는다(꺼짐 상태). */
@Import({TestcontainersConfiguration.class, FixedClockConfig.class})
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ProfileCheckRecordingTest extends IntegrationTestBase {

    @LocalServerPort
    private int port;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private ProfileCheckConfirmationRepository confirmationRepository;

    @Autowired
    private PhoneVerificationRepository phoneVerificationRepository;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    // MO 세션 시각은 서버와 같은 시계로 시드한다(AuthControllerSignupTest 전례) — 여기선 FixedClockConfig 의 고정 시계.
    @Autowired
    private Clock clock;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
    }

    @Test
    @DisplayName("프로필을 저장하면 팝업이 꺼져 있어도 그 학기 정보 확인으로 기록된다")
    void savingProfileRecordsThisSemesterEvenWhenOff() {
        User student = saveStudent(Grade.SOPHOMORE);

        patchProfile(student, "{\"name\":\"수정이름\",\"grade\":\"JUNIOR\"}")
                .statusCode(HttpStatus.NO_CONTENT.value());

        assertThat(confirmationRepository.existsByUserIdAndSemesterYearAndSemesterTerm(student.getId(), 2026, 1))
                .isTrue();
    }

    @Test
    @DisplayName("같은 학기에 프로필을 두 번 저장해도 확인 기록은 하나다")
    void savingTwiceKeepsOneRecord() {
        User student = saveStudent(Grade.SOPHOMORE);

        patchProfile(student, "{\"name\":\"수정이름\"}").statusCode(HttpStatus.NO_CONTENT.value());
        patchProfile(student, "{\"name\":\"다시수정\"}").statusCode(HttpStatus.NO_CONTENT.value());

        assertThat(confirmationRepository.count()).isEqualTo(1);
    }

    @Test
    @DisplayName("금칙어 이름·공백 전공으로 저장이 실패하면 프로필도 확인 기록도 남지 않는다")
    void failedSaveLeavesNoRecord() {
        User student = saveStudent(Grade.SOPHOMORE);

        patchProfile(student, "{\"name\":\"관리자\",\"grade\":\"JUNIOR\"}")
                .statusCode(HttpStatus.BAD_REQUEST.value());
        patchProfile(student, "{\"name\":\"수정이름\",\"grade\":\"JUNIOR\",\"major\":\"   \"}")
                .statusCode(HttpStatus.BAD_REQUEST.value());

        assertThat(confirmationRepository.count()).isZero();
        assertThat(userRepository.findById(student.getId()).orElseThrow().getGrade()).isEqualTo(Grade.SOPHOMORE);
    }

    @Test
    @DisplayName("가입하면 가입한 학기의 정보 확인으로 기록된다 — 막 입력한 정보에 확인 팝업을 띄우지 않는다")
    void signupRecordsThisSemester() {
        String verificationToken = prepareVerifiedPhone("010-2345-6789");

        Long userId = given().contentType(ContentType.JSON).body(Map.of(
                        "studentId", "20240001",
                        "name", "홍길동",
                        "password", "Abcd1234!",
                        "grade", "JUNIOR",
                        "college", "IT_ENGINEERING",
                        "major", "컴퓨터정보공학부",
                        "verificationToken", verificationToken,
                        "termsOfServiceAgreed", true,
                        "privacyPolicyAgreed", true))
                .when().post("/api/v1/auth/signup")
                .then().statusCode(HttpStatus.CREATED.value())
                .extract().jsonPath().getLong("data");

        assertThat(confirmationRepository.existsByUserIdAndSemesterYearAndSemesterTerm(userId, 2026, 1)).isTrue();
    }

    private User saveStudent(Grade grade) {
        User student = UserFixture.unique();
        student.changeGrade(grade);
        return userRepository.save(student);
    }

    private ValidatableResponse patchProfile(User student, String jsonBody) {
        return RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION,
                        "Bearer " + jwtTokenProvider.createToken(student.getId(), student.getRole().name()))
                .contentType(ContentType.JSON)
                .body(jsonBody)
                .when().patch("/api/v1/users/me")
                .then();
    }

    private String prepareVerifiedPhone(String phone) {
        LocalDateTime now = LocalDateTime.now(clock);
        PhoneVerification verification = PhoneVerification.issue(
                phone, UUID.randomUUID().toString(), VerificationPurpose.SIGNUP, null, now);
        verification.markVerified(now);
        return phoneVerificationRepository.save(verification).getToken();
    }
}
