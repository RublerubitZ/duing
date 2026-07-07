package com.duing.domain.notice;

import static org.hamcrest.Matchers.equalTo;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import java.time.LocalDateTime;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class NoticePublicAcceptanceTest extends IntegrationTestBase {

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired JdbcTemplate jdbcTemplate;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private String adminToken;
    private String studentToken;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        User admin = saveUser(UserRole.ADMIN);
        User student = saveUser(UserRole.STUDENT);
        adminToken = jwtTokenProvider.createToken(admin.getId(), admin.getRole().name());
        studentToken = jwtTokenProvider.createToken(student.getId(), student.getRole().name());
    }

    @Test
    @DisplayName("비로그인 사용자도 PUBLIC 공지 피드를 200 으로 조회할 수 있다")
    void anonymousCanFetchPublicFeed() {
        seedPublicNotice("Public 1");
        seedPublicNotice("Public 2");

        RestAssured.given()
            .when()
                .get("/api/v1/notices")
            .then()
                .statusCode(HttpStatus.OK.value())
                .body("ok", equalTo(true));
    }

    @Test
    @DisplayName("OFFICERS_ALL 공지에 일반 STUDENT 가 직접 진입하면 403 을 받는다")
    void studentForbiddenOnOfficersOnlyDetail() {
        Long noticeId = seedOfficersAllNotice();

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
            .when()
                .get("/api/v1/notices/" + noticeId)
            .then()
                .statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("가입 동아리 공지는 피드에 동아리명·owningClubId 와 함께 노출되고 source 로 학교/동아리를 가른다")
    void clubNoticeAppearsInFeedWithClubNameAndSource() {
        seedPublicNotice("학교 공지");

        Club club = clubRepository.save(Club.create("알고리즘 동아리", ClubCategory.ACADEMIC, null, "설명", null));
        // Club.create 기본 상태는 PENDING_APPROVAL — 내부 공지 가시성은 ACTIVE 동아리만 인정된다.
        jdbcTemplate.update("UPDATE club SET status = 'ACTIVE' WHERE id = ?", club.getId());
        User leaderUser = saveUser(UserRole.STUDENT);
        clubMemberRepository.save(ClubMember.asLeader(club, leaderUser));
        String leaderToken = jwtTokenProvider.createToken(leaderUser.getId(), leaderUser.getRole().name());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body("""
                    { "title":"MT 안내", "summary":"요약", "content":"본문",
                      "coverImageUrl":"https://example.com/c.png" }
                    """)
            .when()
                .post("/api/v1/clubs/" + club.getId() + "/notices")
            .then()
                .statusCode(HttpStatus.CREATED.value());

        // source=CLUB: 가입 동아리 공지만, 동아리명·owningClubId 포함
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
            .when()
                .get("/api/v1/notices?source=CLUB")
            .then()
                .statusCode(HttpStatus.OK.value())
                .body("data.content.find { it.title == 'MT 안내' }.clubName", equalTo("알고리즘 동아리"))
                .body("data.content.find { it.title == 'MT 안내' }.owningClubId", equalTo(club.getId().intValue()))
                .body("data.content.findAll { it.title == '학교 공지' }.size()", equalTo(0));

        // source=SCHOOL: 학교 공지만, clubName 없음
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
            .when()
                .get("/api/v1/notices?source=SCHOOL")
            .then()
                .statusCode(HttpStatus.OK.value())
                .body("data.content.find { it.title == '학교 공지' }.clubName", equalTo(null))
                .body("data.content.findAll { it.title == 'MT 안내' }.size()", equalTo(0));
    }

    // ---- seeders via admin POST ----

    private void seedPublicNotice(String title) {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body("""
                    { "title":"%s", "summary":"요약", "content":"본문",
                      "coverImageUrl":"https://example.com/c.png",
                      "category":"GENERAL", "visibility":"PUBLIC",
                      "pinned":false, "notifyOnPublish":false }
                    """.formatted(title))
            .when()
                .post("/api/v1/admin/notices")
            .then()
                .statusCode(HttpStatus.CREATED.value());
    }

    private Long seedOfficersAllNotice() {
        return RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body("""
                    { "title":"운영진 공지", "summary":"요약", "content":"본문",
                      "coverImageUrl":"https://example.com/c.png",
                      "category":"GENERAL", "visibility":"OFFICERS_ALL",
                      "pinned":false, "notifyOnPublish":true }
                    """)
            .when()
                .post("/api/v1/admin/notices")
            .then()
                .statusCode(HttpStatus.CREATED.value())
                .extract().jsonPath().getLong("data");
    }

    private User saveUser(UserRole role) {
        long seq = sequence.incrementAndGet();
        return userRepository.save(User.create(
                "20" + seq, "테스터" + seq, "test" + seq + "@duing.ac.kr",
                "hashed", role, Grade.FRESHMAN, College.IT_ENGINEERING,
                "미설정", "010-0000-0000", LocalDateTime.now()));
    }
}
