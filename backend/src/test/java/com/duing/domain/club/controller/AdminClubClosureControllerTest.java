package com.duing.domain.club.controller;

import static org.hamcrest.Matchers.equalTo;

import com.duing.common.IntegrationTestBase;
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
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import java.lang.reflect.Field;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Assertions;
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

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AdminClubClosureControllerTest extends IntegrationTestBase {

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired RecruitmentRepository recruitmentRepository;
    @Autowired ApplicationRepository applicationRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;
    @Autowired JdbcTemplate jdbcTemplate;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private User adminUser;
    private User studentUser;
    private User leaderUser;
    private String adminToken;
    private String studentToken;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        adminUser = saveUser("총동연관리자", UserRole.ADMIN);
        studentUser = saveUser("학생사용자", UserRole.STUDENT);
        leaderUser = saveUser("동아리장후보", UserRole.STUDENT);
        adminToken = jwtTokenProvider.createToken(adminUser.getId(), adminUser.getRole().name());
        studentToken = jwtTokenProvider.createToken(studentUser.getId(), studentUser.getRole().name());
    }

    @Test
    @DisplayName("ADMIN 이 운영 중단(INACTIVE) 동아리를 폐쇄하면 204 가 반환되고 목록에서 사라지며 멤버십이 제거된다")
    void adminClosesInactiveClub() throws Exception {
        Club inactiveClub = saveClubWithLeader("폐쇄대상클럽", ClubStatus.INACTIVE);

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                    .contentType(ContentType.JSON)
                .when()
                    .post("/api/v1/admin/clubs/{clubId}/close", inactiveClub.getId())
                .then()
                    .statusCode(HttpStatus.NO_CONTENT.value());

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when()
                    .get("/api/v1/admin/clubs?size=100&keyword=폐쇄대상클럽")
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.content.size()", equalTo(0));

        Assertions.assertTrue(
                clubMemberRepository.findByClubIdAndUserId(inactiveClub.getId(), leaderUser.getId()).isEmpty());

        // 물리 삭제가 아니라 soft-delete 임을 보장 — 행은 남고 deleted_at 만 설정된다.
        LocalDateTime clubDeletedAt = jdbcTemplate.queryForObject(
                "SELECT deleted_at FROM club WHERE id = ?", LocalDateTime.class, inactiveClub.getId());
        Assertions.assertNotNull(clubDeletedAt);
    }

    @Test
    @DisplayName("ACTIVE 동아리를 폐쇄하려 하면 400 이 반환된다")
    void closingActiveClubIsRejected() throws Exception {
        Club activeClub = saveClubWithLeader("운영중클럽", ClubStatus.ACTIVE);

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                    .contentType(ContentType.JSON)
                .when()
                    .post("/api/v1/admin/clubs/{clubId}/close", activeClub.getId())
                .then()
                    .statusCode(HttpStatus.BAD_REQUEST.value())
                    .body("ok", equalTo(false));
    }

    @Test
    @DisplayName("STUDENT 가 폐쇄 엔드포인트를 호출하면 403 이 반환된다")
    void studentCannotCloseClub() throws Exception {
        Club inactiveClub = saveClubWithLeader("학생폐쇄거부클럽", ClubStatus.INACTIVE);

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                    .contentType(ContentType.JSON)
                .when()
                    .post("/api/v1/admin/clubs/{clubId}/close", inactiveClub.getId())
                .then()
                    .statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("존재하지 않는 동아리 ID 로 폐쇄를 요청하면 404 가 반환된다")
    void closingMissingClubReturns404() throws Exception {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                    .contentType(ContentType.JSON)
                .when()
                    .post("/api/v1/admin/clubs/{clubId}/close", 999999L)
                .then()
                    .statusCode(HttpStatus.NOT_FOUND.value());
    }

    @Test
    @DisplayName("INACTIVE 동아리 폐쇄 시 OPEN 모집은 CLOSED 로, SUBMITTED 지원서는 REJECTED 로 cascade 전환된다")
    void closureRecruitmentAndApplicationCascade() throws Exception {
        // ACTIVE 상태에서 모집·지원서 생성 후 INACTIVE 로 전환
        Club club = saveClubWithLeader("cascade테스트클럽", ClubStatus.ACTIVE);
        Recruitment recruitment = recruitmentRepository.save(
                Recruitment.create(club, "모집공고", "내용",
                        LocalDate.now().minusDays(1), LocalDate.now().plusDays(7), 5));

        User applicant = saveUser("지원자", UserRole.STUDENT);
        Application application = applicationRepository.save(
                Application.submit(recruitment, applicant, List.of()));

        // 모집·지원서는 운영 중(ACTIVE) 동아리에서만 생성되므로, 생성 후 직접 SQL 로 동아리 상태만
        // INACTIVE 로 전환해 폐쇄 가능 상태(2단계 안전장치)를 만든다.
        jdbcTemplate.update("UPDATE club SET status = 'INACTIVE' WHERE id = ?", club.getId());

        long recruitmentId = recruitment.getId();
        long applicationId = application.getId();

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                    .contentType(ContentType.JSON)
                .when()
                    .post("/api/v1/admin/clubs/{clubId}/close", club.getId())
                .then()
                    .statusCode(HttpStatus.NO_CONTENT.value());

        // 폐쇄 후 — 모집은 CLOSED, 지원서는 REJECTED
        Recruitment closedRecruitment = recruitmentRepository.findById(recruitmentId).orElseThrow();
        Assertions.assertEquals(RecruitmentStatus.CLOSED, closedRecruitment.getStatus());

        Application rejectedApplication = applicationRepository.findById(applicationId).orElseThrow();
        Assertions.assertEquals(ApplicationStatus.REJECTED, rejectedApplication.getStatus());
    }

    private User saveUser(String name, UserRole role) {
        long unique = sequence.getAndIncrement();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                name,
                "u" + unique + "@daegu.ac.kr",
                "hashed",
                role,
                Grade.FRESHMAN,
                College.IT_ENGINEERING,
                "미설정",
                "010-0000-0000",
                LocalDateTime.now()
        ));
    }

    private Club saveClubWithLeader(String name, ClubStatus status) throws Exception {
        String uniqueName = name + "-" + sequence.getAndIncrement();
        Club created = Club.create(uniqueName, ClubCategory.ACADEMIC, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(created, status);
        Club saved = clubRepository.save(created);
        clubMemberRepository.save(ClubMember.asLeader(saved, leaderUser));
        return saved;
    }
}
