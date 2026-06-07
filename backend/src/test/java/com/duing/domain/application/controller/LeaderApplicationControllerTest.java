package com.duing.domain.application.controller;

import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.everyItem;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.containsString;

import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
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
import java.lang.reflect.Field;
import java.time.LocalDate;
import java.time.LocalDateTime;
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
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class LeaderApplicationControllerTest {

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
    private JwtTokenProvider jwtTokenProvider;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private String leaderToken;
    private User leader;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        leader = saveUser("리더", UserRole.STUDENT, College.IT_ENGINEERING, "컴퓨터공학");
        leaderToken = jwtTokenProvider.createToken(leader.getId(), leader.getRole().name());
    }

    @Test
    @DisplayName("status 필터를 적용하면 해당 상태의 지원자만 반환된다")
    void statusFilterReturnsMatching() throws Exception {
        Club club = saveActiveClub("상태필터동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = saveOpenRecruitment(club, "상태필터모집");

        User applicantSubmitted = saveUser("제출자", UserRole.STUDENT, College.EDUCATION, "교육학");
        User applicantUnderReview = saveUser("검토중자", UserRole.STUDENT, College.EDUCATION, "교육학");
        User applicantAccepted = saveUser("합격자", UserRole.STUDENT, College.EDUCATION, "교육학");

        saveApplicationWithStatus(recruitment, applicantSubmitted, ApplicationStatus.SUBMITTED);
        saveApplicationWithStatus(recruitment, applicantUnderReview, ApplicationStatus.UNDER_REVIEW);
        saveApplicationWithStatus(recruitment, applicantAccepted, ApplicationStatus.ACCEPTED);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .queryParam("status", "UNDER_REVIEW")
                .when().get("/api/v1/leader/recruitments/{recruitmentId}/applications", recruitment.getId())
                .then().statusCode(200)
                .body("data.size()", is(1))
                .body("data[0].status", equalTo("UNDER_REVIEW"));
    }

    @Test
    @DisplayName("college 필터를 적용하면 해당 단과대 지원자만 반환된다")
    void collegeFilterReturnsMatching() throws Exception {
        Club club = saveActiveClub("단과대필터동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = saveOpenRecruitment(club, "단과대필터모집");

        User engineeringApplicant1 = saveUser("공대생1", UserRole.STUDENT, College.IT_ENGINEERING, "전자공학");
        User engineeringApplicant2 = saveUser("공대생2", UserRole.STUDENT, College.IT_ENGINEERING, "소프트웨어공학");
        User artsApplicant = saveUser("예대생", UserRole.STUDENT, College.DESIGN_ART, "디자인학");

        saveApplicationWithStatus(recruitment, engineeringApplicant1, ApplicationStatus.SUBMITTED);
        saveApplicationWithStatus(recruitment, engineeringApplicant2, ApplicationStatus.SUBMITTED);
        saveApplicationWithStatus(recruitment, artsApplicant, ApplicationStatus.SUBMITTED);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .queryParam("college", "IT_ENGINEERING")
                .when().get("/api/v1/leader/recruitments/{recruitmentId}/applications", recruitment.getId())
                .then().statusCode(200)
                .body("data.size()", is(2))
                .body("data.college", everyItem(equalTo("IT_ENGINEERING")));
    }

    @Test
    @DisplayName("q 파라미터는 이름·학번·major 어느 하나만 일치해도 대소문자 무시로 매칭된다")
    void searchKeywordMatchesNameOrStudentIdOrMajor() throws Exception {
        Club club = saveActiveClub("검색필터동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = saveOpenRecruitment(club, "검색필터모집");

        User applicantHong = saveUserWithStudentId("홍길동", "20200001", College.IT_ENGINEERING, "컴퓨터공학");
        User applicantKim = saveUserWithStudentId("김민수", "20210042", College.IT_ENGINEERING, "ComputerScience");
        User applicantPark = saveUserWithStudentId("박지호", "20220099", College.IT_ENGINEERING, "전자공학");

        saveApplicationWithStatus(recruitment, applicantHong, ApplicationStatus.SUBMITTED);
        saveApplicationWithStatus(recruitment, applicantKim, ApplicationStatus.SUBMITTED);
        saveApplicationWithStatus(recruitment, applicantPark, ApplicationStatus.SUBMITTED);

        // 이름으로 검색
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .queryParam("q", "홍길동")
                .when().get("/api/v1/leader/recruitments/{recruitmentId}/applications", recruitment.getId())
                .then().statusCode(200)
                .body("data.size()", is(1));

        // 학번으로 검색
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .queryParam("q", "20210042")
                .when().get("/api/v1/leader/recruitments/{recruitmentId}/applications", recruitment.getId())
                .then().statusCode(200)
                .body("data.size()", is(1));

        // major 대소문자 무시 검색 — "computer" 는 "ComputerScience" 에 매칭
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .queryParam("q", "computer")
                .when().get("/api/v1/leader/recruitments/{recruitmentId}/applications", recruitment.getId())
                .then().statusCode(200)
                .body("data.size()", is(1));
    }

    @Test
    @DisplayName("submittedTo 당일 23:59 에 제출된 지원자도 포함된다")
    void submittedToInclusiveBoundary() throws Exception {
        Club club = saveActiveClub("경계테스트동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = saveOpenRecruitment(club, "경계테스트모집");

        User applicant = saveUser("경계지원자", UserRole.STUDENT, College.EDUCATION, "교육학");
        Application savedApplication = applicationRepository.save(
                Application.submit(recruitment, applicant, List.of()));
        // @CreatedDate 가 save() 시점에 채워지므로 저장 이후 직접 UPDATE 로 원하는 시각을 주입한다.
        jdbcTemplate.update(
                "UPDATE application SET created_at = ? WHERE id = ?",
                java.sql.Timestamp.valueOf(LocalDateTime.of(2026, 5, 31, 23, 59, 30)),
                savedApplication.getId());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .queryParam("submittedFrom", "2026-05-31")
                .queryParam("submittedTo", "2026-05-31")
                .when().get("/api/v1/leader/recruitments/{recruitmentId}/applications", recruitment.getId())
                .then().statusCode(200)
                .body("data.size()", is(1));
    }

    @Test
    @DisplayName("submittedFrom 이 submittedTo 보다 늦으면 400 을 반환한다")
    void invalidDateRange() throws Exception {
        Club club = saveActiveClub("날짜오류동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = saveOpenRecruitment(club, "날짜오류모집");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .queryParam("submittedFrom", "2026-06-10")
                .queryParam("submittedTo", "2026-06-01")
                .when().get("/api/v1/leader/recruitments/{recruitmentId}/applications", recruitment.getId())
                .then().statusCode(400)
                .body("message", containsString("submittedFrom"));
    }

    private User saveUser(String name, UserRole role, College college, String major) {
        long unique = sequence.incrementAndGet();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                name + unique,
                "lact" + unique + "@daegu.ac.kr",
                "hashed",
                role,
                Grade.FRESHMAN,
                college,
                major,
                "010-0000-0000",
                LocalDateTime.now()
        ));
    }

    private User saveUserWithStudentId(String name, String studentId, College college, String major) {
        long unique = sequence.incrementAndGet();
        return userRepository.save(User.create(
                studentId,
                name,
                "lact" + unique + "@daegu.ac.kr",
                "hashed",
                UserRole.STUDENT,
                Grade.FRESHMAN,
                college,
                major,
                "010-0000-0000",
                LocalDateTime.now()
        ));
    }

    private Club saveActiveClub(String name) throws Exception {
        String uniqueName = name + "-" + sequence.incrementAndGet();
        Club club = Club.create(uniqueName, ClubCategory.ACADEMIC, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(club, ClubStatus.ACTIVE);
        return clubRepository.save(club);
    }

    private Recruitment saveOpenRecruitment(Club club, String title) {
        LocalDate today = LocalDate.now();
        Recruitment recruitment = Recruitment.create(club, title + "-" + sequence.incrementAndGet(),
                null, today.minusDays(1), today.plusDays(7), 10);
        return recruitmentRepository.save(recruitment);
    }

    private Application saveApplicationWithStatus(Recruitment recruitment, User applicant,
            ApplicationStatus status) throws Exception {
        Application application = Application.submit(recruitment, applicant, List.of());
        Field statusField = Application.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(application, status);
        return applicationRepository.save(application);
    }

}
