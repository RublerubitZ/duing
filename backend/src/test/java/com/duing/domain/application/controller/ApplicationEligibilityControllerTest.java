package com.duing.domain.application.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.application.entity.Application;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
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
import io.restassured.http.ContentType;
import io.restassured.response.Response;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
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

// 지원서 작성 화면 진입 전 사전 확인 GET 엔드포인트 — submit 과 동일한 validateEligibility 가드 체인을
// 공유하므로(Task 1), 부적격 사유별 상태코드·메시지가 submit 실패와 동일한지 검증한다.
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ApplicationEligibilityControllerTest extends IntegrationTestBase {

    @LocalServerPort
    private int port;

    @Autowired private UserRepository userRepository;
    @Autowired private ClubRepository clubRepository;
    @Autowired private ClubMemberRepository clubMemberRepository;
    @Autowired private RecruitmentRepository recruitmentRepository;
    @Autowired private ApplicationRepository applicationRepository;
    @Autowired private JwtTokenProvider jwtTokenProvider;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
    }

    @Test
    @DisplayName("지원 가능한 모집이면 200 을 반환한다")
    void eligibleRecruitmentReturnsOk() {
        Club club = saveActiveClub("가능동아리");
        Recruitment recruitment = saveOpenRecruitment(club, "가능모집");
        User applicant = saveUser("무관학생");
        String applicantToken = jwtTokenProvider.createToken(applicant.getId(), applicant.getRole().name());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + applicantToken)
                .when().get("/api/v1/recruitments/{recruitmentId}/applications/eligibility", recruitment.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("ok", equalTo(true));
    }

    @Test
    @DisplayName("이미 지원한 모집의 사전 확인은 409 와 중복 지원 안내를 반환한다")
    void alreadyAppliedRecruitmentReturnsConflict() {
        Club club = saveActiveClub("중복동아리");
        Recruitment recruitment = saveOpenRecruitment(club, "중복모집");
        User applicant = saveUser("중복지원자");
        applicationRepository.save(Application.submit(recruitment, applicant, List.of()));
        String applicantToken = jwtTokenProvider.createToken(applicant.getId(), applicant.getRole().name());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + applicantToken)
                .when().get("/api/v1/recruitments/{recruitmentId}/applications/eligibility", recruitment.getId())
                .then().statusCode(HttpStatus.CONFLICT.value())
                .body("message", equalTo("이미 지원한 모집 공고입니다."));
    }

    @Test
    @DisplayName("마감된 모집의 사전 확인은 400 을 반환한다")
    void closedRecruitmentReturnsBadRequest() {
        Club club = saveActiveClub("마감동아리");
        Recruitment recruitment = saveOpenRecruitment(club, "마감모집");
        recruitment.close(LocalDateTime.now());
        recruitmentRepository.save(recruitment);
        User applicant = saveUser("마감지원희망자");
        String applicantToken = jwtTokenProvider.createToken(applicant.getId(), applicant.getRole().name());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + applicantToken)
                .when().get("/api/v1/recruitments/{recruitmentId}/applications/eligibility", recruitment.getId())
                .then().statusCode(HttpStatus.BAD_REQUEST.value())
                .body("message", equalTo("마감된 모집 공고에는 지원할 수 없습니다."));
    }

    @Test
    @DisplayName("이미 동아리 소속이면 사전 확인이 409 를 반환한다")
    void alreadyClubMemberReturnsConflict() {
        Club club = saveActiveClub("소속동아리");
        Recruitment recruitment = saveOpenRecruitment(club, "소속모집");
        User existingMember = saveUser("기존회원");
        clubMemberRepository.save(ClubMember.asMember(club, existingMember));
        String memberToken = jwtTokenProvider.createToken(existingMember.getId(), existingMember.getRole().name());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + memberToken)
                .when().get("/api/v1/recruitments/{recruitmentId}/applications/eligibility", recruitment.getId())
                .then().statusCode(HttpStatus.CONFLICT.value())
                .body("message", equalTo("이미 해당 동아리 소속이라 일반 모집에는 지원할 수 없습니다."));
    }

    @Test
    @DisplayName("존재하지 않는 모집의 사전 확인은 404 를 반환한다")
    void nonExistentRecruitmentReturnsNotFound() {
        User applicant = saveUser("아무개");
        String applicantToken = jwtTokenProvider.createToken(applicant.getId(), applicant.getRole().name());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + applicantToken)
                .when().get("/api/v1/recruitments/{recruitmentId}/applications/eligibility", 999_999L)
                .then().statusCode(HttpStatus.NOT_FOUND.value())
                .body("message", equalTo("모집 공고를 찾을 수 없습니다."));
    }

    @Test
    @DisplayName("외부 폼 모집의 사전 확인은 400 을 반환한다")
    void externalFormRecruitmentReturnsBadRequest() {
        Club club = saveActiveClub("외부폼동아리");
        Recruitment recruitment = saveExternalFormRecruitment(club, "외부폼모집");
        User applicant = saveUser("외부폼지원자");
        String applicantToken = jwtTokenProvider.createToken(applicant.getId(), applicant.getRole().name());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + applicantToken)
                .when().get("/api/v1/recruitments/{recruitmentId}/applications/eligibility", recruitment.getId())
                .then().statusCode(HttpStatus.BAD_REQUEST.value())
                .body("message", equalTo("외부 폼 모집은 du-ing 에서 직접 지원할 수 없습니다."));
    }

    @Test
    @DisplayName("미인증 요청은 인증 오류를 반환한다")
    void unauthenticatedRequestReturnsAuthError() {
        // eligibility GET 은 SecurityConfig 에서 recruitments/** permitAll 보다 앞선
        // .requestMatchers(GET, "/api/v1/recruitments/*/applications/eligibility").authenticated() 로
        // URL 레이어에서부터 인증을 요구한다. 따라서 익명 요청은 컨트롤러에 도달하지 못하고
        // Security 필터 체인의 ExceptionTranslationFilter → JwtAuthenticationEntryPoint 가 401 로 응답한다
        // (컨트롤러 레이어의 @PreAuthorize 거부와 달리 403 이 아니다). 프론트는 401 에서만 세션 만료
        // 재로그인 흐름을 타므로, 만료 토큰 사용자가 "권한 없음" 으로 잘못 안내받지 않도록 하는 것이 목적이다.
        // recruitmentId 가 실제로 존재할 필요는 없다 — URL 레이어에서 이미 막힌다.
        RestAssured.given()
                .when().get("/api/v1/recruitments/{recruitmentId}/applications/eligibility", 1L)
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());
    }

    @Test
    @DisplayName("중복 지원 사유는 사전 확인 GET 과 제출 POST 가 동일한 상태코드와 메시지를 반환한다")
    void duplicateApplicationEligibilityMatchesSubmitFailure() {
        Club club = saveActiveClub("정책동등동아리1");
        Recruitment recruitment = saveOpenRecruitment(club, "정책동등모집1");
        User applicant = saveUser("정책동등지원자1");
        applicationRepository.save(Application.submit(recruitment, applicant, List.of()));
        String applicantToken = jwtTokenProvider.createToken(applicant.getId(), applicant.getRole().name());

        Response eligibilityResponse = RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + applicantToken)
                .when().get("/api/v1/recruitments/{recruitmentId}/applications/eligibility", recruitment.getId());
        Response submitResponse = RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + applicantToken)
                .contentType(ContentType.JSON)
                .body(Map.of("answers", List.of()))
                .when().post("/api/v1/recruitments/{recruitmentId}/applications", recruitment.getId());

        assertThat(eligibilityResponse.statusCode()).isEqualTo(HttpStatus.CONFLICT.value());
        assertThat(eligibilityResponse.statusCode()).isEqualTo(submitResponse.statusCode());
        assertThat(eligibilityResponse.jsonPath().getString("message"))
                .isEqualTo(submitResponse.jsonPath().getString("message"));
    }

    @Test
    @DisplayName("마감된 모집 사유는 사전 확인 GET 과 제출 POST 가 동일한 상태코드와 메시지를 반환한다")
    void closedRecruitmentEligibilityMatchesSubmitFailure() {
        Club club = saveActiveClub("정책동등동아리2");
        Recruitment recruitment = saveOpenRecruitment(club, "정책동등모집2");
        recruitment.close(LocalDateTime.now());
        recruitmentRepository.save(recruitment);
        User applicant = saveUser("정책동등지원자2");
        String applicantToken = jwtTokenProvider.createToken(applicant.getId(), applicant.getRole().name());

        Response eligibilityResponse = RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + applicantToken)
                .when().get("/api/v1/recruitments/{recruitmentId}/applications/eligibility", recruitment.getId());
        Response submitResponse = RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + applicantToken)
                .contentType(ContentType.JSON)
                .body(Map.of("answers", List.of()))
                .when().post("/api/v1/recruitments/{recruitmentId}/applications", recruitment.getId());

        assertThat(eligibilityResponse.statusCode()).isEqualTo(HttpStatus.BAD_REQUEST.value());
        assertThat(eligibilityResponse.statusCode()).isEqualTo(submitResponse.statusCode());
        assertThat(eligibilityResponse.jsonPath().getString("message"))
                .isEqualTo(submitResponse.jsonPath().getString("message"));
    }

    private User saveUser(String nameSuffix) {
        long unique = sequence.incrementAndGet();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                nameSuffix + unique,
                "hashed",
                UserRole.STUDENT,
                Grade.FRESHMAN,
                College.IT_ENGINEERING,
                "컴퓨터공학",
                "010-0000-0000",
                LocalDateTime.now()));
    }

    private Club saveActiveClub(String name) {
        Club club = Club.create(name + "-" + sequence.incrementAndGet(), ClubCategory.ACADEMIC, "분과", "설명", null);
        ReflectionTestUtils.setField(club, "status", ClubStatus.ACTIVE);
        return clubRepository.save(club);
    }

    private Recruitment saveOpenRecruitment(Club club, String title) {
        LocalDate today = LocalDate.now();
        Recruitment recruitment = Recruitment.create(club, title + "-" + sequence.incrementAndGet(),
                null, today.minusDays(1), today.plusDays(7), 10);
        return recruitmentRepository.save(recruitment);
    }

    private Recruitment saveExternalFormRecruitment(Club club, String title) {
        LocalDate today = LocalDate.now();
        Recruitment recruitment = Recruitment.createWithOptions(club, title + "-" + sequence.incrementAndGet(), null,
                today.minusDays(1), today.plusDays(7), 10,
                ApplicationMode.EXTERNAL, "https://forms.example.com/apply",
                false, TargetRole.MEMBER, null, null, false);
        return recruitmentRepository.save(recruitment);
    }
}
