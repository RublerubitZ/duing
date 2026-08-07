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
import com.duing.domain.joincode.entity.ClubJoinCode;
import com.duing.domain.joincode.repository.ClubJoinCodeRepository;
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
import java.lang.reflect.Field;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
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
    @Autowired ClubJoinCodeRepository clubJoinCodeRepository;
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
    @DisplayName("ADMIN 이 거절(REJECTED) 동아리를 폐쇄하면 204 가 반환되고 soft-delete 되며 멤버십이 제거된다")
    void adminClosesRejectedClub() throws Exception {
        Club rejectedClub = saveClubWithLeader("거절폐쇄클럽", ClubStatus.REJECTED);

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                    .contentType(ContentType.JSON)
                .when()
                    .post("/api/v1/admin/clubs/{clubId}/close", rejectedClub.getId())
                .then()
                    .statusCode(HttpStatus.NO_CONTENT.value());

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when()
                    .get("/api/v1/admin/clubs?size=100&keyword=거절폐쇄클럽")
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.content.size()", equalTo(0));

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when()
                    .get("/api/v1/admin/clubs/{clubId}", rejectedClub.getId())
                .then()
                    .statusCode(HttpStatus.NOT_FOUND.value());

        Assertions.assertTrue(
                clubMemberRepository.findByClubIdAndUserId(rejectedClub.getId(), leaderUser.getId()).isEmpty());

        LocalDateTime clubDeletedAt = jdbcTemplate.queryForObject(
                "SELECT deleted_at FROM club WHERE id = ?", LocalDateTime.class, rejectedClub.getId());
        Assertions.assertNotNull(clubDeletedAt);
    }

    @Test
    @DisplayName("승인 대기(PENDING_APPROVAL) 동아리를 폐쇄하려 하면 400 이 반환된다")
    void closingPendingClubIsRejected() throws Exception {
        Club pendingClub = saveClubWithLeader("승인대기폐쇄거부클럽", ClubStatus.PENDING_APPROVAL);

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                    .contentType(ContentType.JSON)
                .when()
                    .post("/api/v1/admin/clubs/{clubId}/close", pendingClub.getId())
                .then()
                    .statusCode(HttpStatus.BAD_REQUEST.value())
                    .body("ok", equalTo(false));
    }

    @Test
    @DisplayName("재심사 전환과 폐쇄가 동시에 요청되어도 재심사 상태 동아리가 삭제되지 않는다")
    void concurrentReopenAndCloseNeverDeletesPendingClub() throws Exception {
        Club rejectedClub = saveClubWithLeader("경합폐쇄클럽", ClubStatus.REJECTED);
        long clubId = rejectedClub.getId();

        // 트랜잭션 밖에서 실제 HTTP 요청 2개를 동시에 출발시켜, 폐쇄와 상태변경이 같은 행 잠금으로
        // 직렬화되는지 검증한다 (팀 전례: ExecutorService + CountDownLatch 실스레드 경합).
        ExecutorService executor = Executors.newFixedThreadPool(2);
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        List<Integer> statusCodes;
        try {
            Future<Integer> closeStatusCode = executor.submit(() -> {
                ready.countDown();
                start.await(5, TimeUnit.SECONDS);
                return RestAssured.given()
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                        .contentType(ContentType.JSON)
                        .when().post("/api/v1/admin/clubs/{clubId}/close", clubId)
                        .then().extract().statusCode();
            });
            Future<Integer> reopenStatusCode = executor.submit(() -> {
                ready.countDown();
                start.await(5, TimeUnit.SECONDS);
                return RestAssured.given()
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                        .contentType(ContentType.JSON)
                        .body(Map.of("status", ClubStatus.PENDING_APPROVAL.name()))
                        .when().patch("/api/v1/admin/clubs/{clubId}/status", clubId)
                        .then().extract().statusCode();
            });
            ready.await(5, TimeUnit.SECONDS);
            start.countDown();
            statusCodes = List.of(
                    closeStatusCode.get(30, TimeUnit.SECONDS),
                    reopenStatusCode.get(30, TimeUnit.SECONDS));
        } finally {
            executor.shutdownNow();
        }

        // 한쪽은 반드시 성공(204)하고, 어느 쪽도 서버 오류(5xx)로 끝나지 않는다
        Assertions.assertTrue(statusCodes.contains(HttpStatus.NO_CONTENT.value()),
                "응답 코드: " + statusCodes);
        Assertions.assertTrue(statusCodes.stream().allMatch(statusCode -> statusCode < 500),
                "응답 코드: " + statusCodes);

        // 불변식: 삭제됐다면 status 는 여전히 REJECTED 여야 한다 — 재심사 대기(PENDING_APPROVAL)
        // 로 전환된 동아리가 soft-delete 되는 조합은 어떤 직렬화 순서에서도 나올 수 없다.
        // (@SQLRestriction 우회를 위해 raw SQL 로 조회)
        Map<String, Object> clubRow = jdbcTemplate.queryForMap(
                "SELECT status, deleted_at FROM club WHERE id = ?", clubId);
        boolean softDeleted = clubRow.get("deleted_at") != null;
        String finalStatus = (String) clubRow.get("status");
        Assertions.assertFalse(softDeleted && "PENDING_APPROVAL".equals(finalStatus),
                "재심사 대기 상태 동아리가 soft-delete 되었습니다: " + clubRow);
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
    @DisplayName("INACTIVE 동아리 폐쇄 시 모집은 soft-delete 되고 SUBMITTED 지원서는 REJECTED 로 cascade 전환된다")
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

        // 폐쇄 후 — 모집은 soft-delete 되어 @SQLRestriction 으로 조회에서 제외되고, 지원서는 REJECTED
        Assertions.assertTrue(recruitmentRepository.findById(recruitmentId).isEmpty());
        LocalDateTime recruitmentDeletedAt = jdbcTemplate.queryForObject(
                "SELECT deleted_at FROM recruitment WHERE id = ?", LocalDateTime.class, recruitmentId);
        Assertions.assertNotNull(recruitmentDeletedAt);

        Application rejectedApplication = applicationRepository.findById(applicationId).orElseThrow();
        Assertions.assertEquals(ApplicationStatus.REJECTED, rejectedApplication.getStatus());
    }

    @Test
    @DisplayName("동아리 폐쇄 후 공개 모집 캘린더는 500 이 아니라 200 을, 상세는 404 를 반환한다 (소프트삭제 정합성)")
    void closedClubRecruitmentNotServedByPublicEndpoints() throws Exception {
        Club club = saveClubWithLeader("캘린더회귀클럽", ClubStatus.ACTIVE);
        Recruitment recruitment = recruitmentRepository.save(
                Recruitment.create(club, "폐쇄될모집", "내용",
                        LocalDate.of(2030, 6, 1), LocalDate.of(2030, 6, 30), 5));
        long recruitmentId = recruitment.getId();
        jdbcTemplate.update("UPDATE club SET status = 'INACTIVE' WHERE id = ?", club.getId());

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                    .contentType(ContentType.JSON)
                .when()
                    .post("/api/v1/admin/clubs/{clubId}/close", club.getId())
                .then()
                    .statusCode(HttpStatus.NO_CONTENT.value());

        // 폐쇄된 동아리의 모집이 deleted_at NULL 로 남으면 club 프록시 로딩에서 터져 공개 캘린더가
        // 500 이 된다(회귀 방지). soft-delete 후에는 조회에서 제외되어 200 이어야 한다.
        RestAssured
                .given()
                .when()
                    .get("/api/v1/recruitments?yearMonth=2030-06")
                .then()
                    .statusCode(HttpStatus.OK.value());

        RestAssured
                .given()
                .when()
                    .get("/api/v1/recruitments/{recruitmentId}", recruitmentId)
                .then()
                    .statusCode(HttpStatus.NOT_FOUND.value());
    }

    @Test
    @DisplayName("동아리 폐쇄 시 활성 가입 링크가 폐기되고 학생의 링크 랜딩은 500 이 아니라 404 로 안내된다")
    void closureRevokesJoinCodesAndLandingFailsClosed() throws Exception {
        Club club = saveClubWithLeader("가입링크폐쇄클럽", ClubStatus.ACTIVE);
        Recruitment externalRecruitment = recruitmentRepository.save(Recruitment.createWithOptions(
                club, "외부폼모집", "내용",
                LocalDate.now().minusDays(1), LocalDate.now().plusDays(14), 10,
                ApplicationMode.EXTERNAL, "https://forms.example.com/duing", false,
                TargetRole.MEMBER, null, null, false));
        ClubJoinCode joinCode = clubJoinCodeRepository.save(ClubJoinCode.issue(
                club, externalRecruitment, "CLOSD1", 12, 30, 7, leaderUser.getId()));
        jdbcTemplate.update("UPDATE club SET status = 'INACTIVE' WHERE id = ?", club.getId());

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                    .contentType(ContentType.JSON)
                .when()
                    .post("/api/v1/admin/clubs/{clubId}/close", club.getId())
                .then()
                    .statusCode(HttpStatus.NO_CONTENT.value());

        // 이미 배포된 링크는 회수할 수 없으므로 서버가 끊어야 한다 — 폐기 시각과 폐기 주체가 남는다.
        Map<String, Object> joinCodeRow = jdbcTemplate.queryForMap(
                "SELECT revoked_at, revoked_by FROM club_join_code WHERE id = ?", joinCode.getId());
        Assertions.assertNotNull(joinCodeRow.get("revoked_at"));
        Assertions.assertEquals(adminUser.getId(), ((Number) joinCodeRow.get("revoked_by")).longValue());

        // 회귀 방지: 링크 랜딩이 soft-delete 된 동아리·모집 프록시를 초기화하며 5xx 로 터지면 안 된다.
        RestAssured
                .given()
                .when()
                    .get("/api/v1/join-codes/{code}", joinCode.getCode())
                .then()
                    .statusCode(HttpStatus.NOT_FOUND.value())
                    .body("message", equalTo("유효하지 않은 가입 링크입니다."));
    }

    private User saveUser(String name, UserRole role) {
        long unique = sequence.getAndIncrement();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                name,
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
