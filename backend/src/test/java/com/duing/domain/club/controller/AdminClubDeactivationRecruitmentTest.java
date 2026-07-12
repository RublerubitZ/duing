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
class AdminClubDeactivationRecruitmentTest extends IntegrationTestBase {

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired RecruitmentRepository recruitmentRepository;
    @Autowired ApplicationRepository applicationRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;
    @Autowired JdbcTemplate jdbcTemplate;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private User leaderUser;
    private String adminToken;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        User adminUser = saveUser("총동연관리자", UserRole.ADMIN);
        leaderUser = saveUser("동아리장", UserRole.STUDENT);
        adminToken = jwtTokenProvider.createToken(adminUser.getId(), adminUser.getRole().name());
    }

    @Test
    @DisplayName("운영 중단 전환 시 OPEN 모집은 CLOSED 로 일괄 마감되고 기존 CLOSED 모집과 지원서 상태는 변하지 않는다")
    void deactivationClosesOpenRecruitmentsWithoutTouchingApplications() throws Exception {
        Club club = saveClubWithLeader("중단전환클럽", ClubStatus.ACTIVE);
        Recruitment openRecruitment = recruitmentRepository.save(Recruitment.create(
                club, "진행중모집", "내용", LocalDate.now().minusDays(1), LocalDate.now().plusDays(7), 5));
        Recruitment closedRecruitment = saveClosedRecruitment(club, "지난모집");
        User applicant = saveUser("지원자", UserRole.STUDENT);
        Application application = applicationRepository.save(
                Application.submit(openRecruitment, applicant, List.of()));

        patchStatus(club.getId(), ClubStatus.INACTIVE);

        Assertions.assertEquals(RecruitmentStatus.CLOSED,
                recruitmentRepository.findById(openRecruitment.getId()).orElseThrow().getStatus());
        Assertions.assertEquals(RecruitmentStatus.CLOSED,
                recruitmentRepository.findById(closedRecruitment.getId()).orElseThrow().getStatus());
        Assertions.assertEquals(ApplicationStatus.SUBMITTED,
                applicationRepository.findById(application.getId()).orElseThrow().getStatus());
    }

    @Test
    @DisplayName("운영 중단 후 재활성해도 마감된 모집은 자동 복구되지 않는다")
    void reactivationDoesNotReopenRecruitments() throws Exception {
        Club club = saveClubWithLeader("재활성클럽", ClubStatus.ACTIVE);
        Recruitment recruitment = recruitmentRepository.save(Recruitment.create(
                club, "재활성모집", "내용", LocalDate.now().minusDays(1), LocalDate.now().plusDays(7), 5));

        patchStatus(club.getId(), ClubStatus.INACTIVE);
        patchStatus(club.getId(), ClubStatus.ACTIVE);

        Assertions.assertEquals(RecruitmentStatus.CLOSED,
                recruitmentRepository.findById(recruitment.getId()).orElseThrow().getStatus());
    }

    @Test
    @DisplayName("soft delete 된 모집은 운영 중단 벌크 마감의 대상이 아니다")
    void softDeletedRecruitmentIsNotTouchedByBulkClose() throws Exception {
        Club club = saveClubWithLeader("소프트삭제클럽", ClubStatus.ACTIVE);
        Recruitment recruitment = recruitmentRepository.save(Recruitment.create(
                club, "삭제된모집", "내용", LocalDate.now().minusDays(1), LocalDate.now().plusDays(7), 5));
        jdbcTemplate.update("UPDATE recruitment SET deleted_at = NOW() WHERE id = ?", recruitment.getId());

        patchStatus(club.getId(), ClubStatus.INACTIVE);

        String status = jdbcTemplate.queryForObject(
                "SELECT status FROM recruitment WHERE id = ?", String.class, recruitment.getId());
        Assertions.assertEquals("OPEN", status);
    }

    @Test
    @DisplayName("운영 중단 동아리의 리더는 새 모집을 열 수 없다")
    void deactivatedClubLeaderCannotOpenNewRecruitment() throws Exception {
        Club club = saveClubWithLeader("모집개설차단클럽", ClubStatus.ACTIVE);
        patchStatus(club.getId(), ClubStatus.INACTIVE);

        String leaderToken = jwtTokenProvider.createToken(leaderUser.getId(), leaderUser.getRole().name());
        String createRecruitmentBody = """
                {"title":"중단후모집","content":"내용","startDate":"%s","endDate":"%s",
                 "capacity":5,"applicationMode":"EXTERNAL","externalFormUrl":"https://example.com/form"}
                """.formatted(LocalDate.now(), LocalDate.now().plusDays(7));

        // 벌크 마감(Task 1) 이후에도 생성·교체 경로로 새 OPEN 모집을 만들 수 있으면
        // "운영 중단 = 모집 활동 정지" 불변식이 우회된다 — 두 경로 모두 403 으로 차단돼야 한다.
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(createRecruitmentBody)
                .when().post("/api/v1/leader/clubs/{clubId}/recruitments", club.getId())
                .then().statusCode(HttpStatus.FORBIDDEN.value())
                .body("ok", equalTo(false));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(createRecruitmentBody)
                .when().post("/api/v1/leader/clubs/{clubId}/recruitments/replace-active", club.getId())
                .then().statusCode(HttpStatus.FORBIDDEN.value())
                .body("ok", equalTo(false));

        Assertions.assertEquals(0, jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM recruitment WHERE club_id = ?", Integer.class, club.getId()));
    }

    @Test
    @DisplayName("운영 중단 동아리의 모집은 공개 달력과 공개 상세에서 노출되지 않는다")
    void deactivatedClubRecruitmentIsHiddenFromPublicSurfaces() throws Exception {
        Club club = saveClubWithLeader("공개차단클럽", ClubStatus.ACTIVE);
        Recruitment recruitment = recruitmentRepository.save(Recruitment.create(
                club, "차단대상모집", "내용", LocalDate.of(2031, 3, 2), LocalDate.of(2031, 3, 20), 5));
        // 벌크 마감(Task 1)을 우회해 "OPEN 인 채 club 만 INACTIVE" 인 정합 깨진 상태를 직접 SQL 로 만든다 —
        // 조회 방어선이 벌크 마감과 독립적으로 동작하는지 검증 (이중 방어).
        jdbcTemplate.update("UPDATE club SET status = 'INACTIVE' WHERE id = ?", club.getId());

        RestAssured.given()
                .when().get("/api/v1/recruitments?yearMonth=2031-03")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.findAll { it.id == " + recruitment.getId() + " }.size()", equalTo(0));

        RestAssured.given()
                .when().get("/api/v1/recruitments/{recruitmentId}", recruitment.getId())
                .then().statusCode(HttpStatus.NOT_FOUND.value())
                .body("ok", equalTo(false));
    }

    @Test
    @DisplayName("운영 중단 전환과 모집 개설이 동시에 요청되어도 운영 중단 동아리에 OPEN 모집이 남지 않는다")
    void concurrentDeactivationAndRecruitmentCreateLeavesNoOpenRecruitment() throws Exception {
        Club club = saveClubWithLeader("경합모집개설클럽", ClubStatus.ACTIVE);
        long clubId = club.getId();
        String leaderToken = jwtTokenProvider.createToken(leaderUser.getId(), leaderUser.getRole().name());
        String createRecruitmentBody = """
                {"title":"경합모집","content":"내용","startDate":"%s","endDate":"%s",
                 "capacity":5,"applicationMode":"EXTERNAL","externalFormUrl":"https://example.com/form"}
                """.formatted(LocalDate.now(), LocalDate.now().plusDays(7));

        // 트랜잭션 밖에서 실제 HTTP 요청 2개를 동시에 출발시켜, 모집 생성이 운영 중단 전환과 같은
        // club 행 잠금으로 직렬화되는지 검증한다 (팀 전례: ExecutorService + CountDownLatch 실스레드 경합).
        ExecutorService executor = Executors.newFixedThreadPool(2);
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        int deactivateStatusCode;
        int createStatusCode;
        try {
            Future<Integer> deactivateFuture = executor.submit(() -> {
                ready.countDown();
                start.await(5, TimeUnit.SECONDS);
                return RestAssured.given()
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                        .contentType(ContentType.JSON)
                        .body("{\"status\":\"INACTIVE\"}")
                        .when().patch("/api/v1/admin/clubs/{clubId}/status", clubId)
                        .then().extract().statusCode();
            });
            Future<Integer> createFuture = executor.submit(() -> {
                ready.countDown();
                start.await(5, TimeUnit.SECONDS);
                return RestAssured.given()
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                        .contentType(ContentType.JSON)
                        .body(createRecruitmentBody)
                        .when().post("/api/v1/leader/clubs/{clubId}/recruitments", clubId)
                        .then().extract().statusCode();
            });
            ready.await(5, TimeUnit.SECONDS);
            start.countDown();
            deactivateStatusCode = deactivateFuture.get(30, TimeUnit.SECONDS);
            createStatusCode = createFuture.get(30, TimeUnit.SECONDS);
        } finally {
            executor.shutdownNow();
        }

        // 전환은 어느 순서에서도 성공(204)하고, 생성은 순서에 따라 201(먼저) 또는 403(나중) — 5xx 는 없다.
        Assertions.assertEquals(HttpStatus.NO_CONTENT.value(), deactivateStatusCode);
        Assertions.assertTrue(
                createStatusCode == HttpStatus.CREATED.value()
                        || createStatusCode == HttpStatus.FORBIDDEN.value(),
                "모집 생성 응답 코드: " + createStatusCode);

        // 불변식: 어떤 직렬화 순서에서도 "INACTIVE 동아리 + OPEN 모집" 조합은 남지 않는다.
        // (생성이 먼저면 벌크 마감이 새 모집까지 CLOSED, 전환이 먼저면 생성이 403)
        Integer orphanOpenCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM recruitment r JOIN club c ON c.id = r.club_id "
                        + "WHERE r.club_id = ? AND r.status = 'OPEN' AND c.status = 'INACTIVE' "
                        + "AND r.deleted_at IS NULL",
                Integer.class, clubId);
        Assertions.assertEquals(0, orphanOpenCount);
    }

    private void patchStatus(Long clubId, ClubStatus next) {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                    .contentType(ContentType.JSON)
                    .body("{\"status\":\"" + next.name() + "\"}")
                .when()
                    .patch("/api/v1/admin/clubs/{clubId}/status", clubId)
                .then()
                    .statusCode(HttpStatus.NO_CONTENT.value());
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

    private Recruitment saveClosedRecruitment(Club club, String title) {
        Recruitment created = Recruitment.create(club, title, "내용",
                LocalDate.now().minusDays(30), LocalDate.now().minusDays(10), 5);
        created.close();
        return recruitmentRepository.save(created);
    }
}
