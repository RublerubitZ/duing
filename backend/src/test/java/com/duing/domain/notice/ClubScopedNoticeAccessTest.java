package com.duing.domain.notice;

import static org.hamcrest.Matchers.equalTo;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import java.time.LocalDateTime;
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
import org.springframework.jdbc.core.JdbcTemplate;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ClubScopedNoticeAccessTest extends IntegrationTestBase {

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;
    @Autowired JdbcTemplate jdbcTemplate;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private Long clubAId;
    private String clubAMemberToken;
    private String clubBMemberToken;
    private Long noticeOfClubA;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        Club a = clubRepository.save(Club.create("동아리A", ClubCategory.ACADEMIC, null, "A", null));
        Club b = clubRepository.save(Club.create("동아리B", ClubCategory.ACADEMIC, null, "B", null));
        clubAId = a.getId();
        // Club.create 기본 상태는 PENDING_APPROVAL — 내부 공지 가시성은 ACTIVE 동아리만 인정되므로,
        // 상태 차단 자체를 검증하는 테스트가 아닌 한 두 동아리 모두 ACTIVE 로 둔다.
        jdbcTemplate.update("UPDATE club SET status = 'ACTIVE' WHERE id IN (?, ?)", a.getId(), b.getId());

        User leaderA = saveUser();
        User memberA = saveUser();
        User memberB = saveUser();
        clubMemberRepository.save(ClubMember.asLeader(a, leaderA));
        clubMemberRepository.save(ClubMember.of(a, memberA, ClubMemberRole.MEMBER));
        clubMemberRepository.save(ClubMember.of(b, memberB, ClubMemberRole.MEMBER));

        String leaderAToken = jwtTokenProvider.createToken(leaderA.getId(), leaderA.getRole().name());
        clubAMemberToken = jwtTokenProvider.createToken(memberA.getId(), memberA.getRole().name());
        clubBMemberToken = jwtTokenProvider.createToken(memberB.getId(), memberB.getRole().name());

        noticeOfClubA = RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderAToken)
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "title", "A 회원만",
                        "summary", "요약",
                        "content", "본문",
                        "coverImageUrl", "https://example.com/cover.png"
                ))
                .when().post("/api/v1/clubs/" + clubAId + "/notices")
                .then().statusCode(HttpStatus.CREATED.value())
                .extract().jsonPath().getLong("data");
    }

    private User saveUser() {
        long seq = sequence.incrementAndGet();
        return userRepository.save(User.create("20" + seq, "U" + seq, "h", UserRole.STUDENT,
                Grade.FRESHMAN, College.IT_ENGINEERING, "미설정", "010-0000-0000", LocalDateTime.now()));
    }

    @Test
    // 공개 경로(GET /notices/{id})는 비로그인도 호출할 수 있어, 볼 수 없는 공지를 403 으로 답하면
    // id 를 훑는 것만으로 비공개 공지의 존재가 드러난다. 미존재와 동일한 404 로 수렴시킨다.
    @DisplayName("B동아리 회원이 A동아리 CLUB_SCOPED 공지 상세를 호출하면 미존재와 같은 404 를 반환한다")
    void crossClubBlocked() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + clubBMemberToken)
                .when().get("/api/v1/notices/" + noticeOfClubA)
                .then().statusCode(HttpStatus.NOT_FOUND.value());
    }

    @Test
    @DisplayName("A동아리 회원이 본인 동아리 CLUB_SCOPED 공지 상세를 호출하면 200 을 반환한다")
    void ownClubAllowed() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + clubAMemberToken)
                .when().get("/api/v1/notices/" + noticeOfClubA)
                .then().statusCode(HttpStatus.OK.value());
    }

    @Test
    @DisplayName("운영 중단된 동아리의 내부 공지는 공용 공지 피드에서 보이지 않는다")
    void inactiveClubScopedNoticeHiddenFromPublicFeed() {
        seedPublicNoticeAsAdmin("전체 공개 공지");
        jdbcTemplate.update("UPDATE club SET status = 'INACTIVE' WHERE id = ?", clubAId);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + clubAMemberToken)
                .when().get("/api/v1/notices")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content.findAll { it.title == 'A 회원만' }.size()", equalTo(0))
                // PUBLIC 공지는 뷰어 스코프와 무관하므로 대조군으로 계속 보인다.
                .body("data.content.findAll { it.title == '전체 공개 공지' }.size()", equalTo(1));
    }

    @Test
    @DisplayName("운영 중단된 동아리의 내부 공지 상세는 공용 경로로도 조회할 수 없다 (미존재와 같은 404)")
    void inactiveClubScopedNoticeDetailHiddenViaPublicPath() {
        jdbcTemplate.update("UPDATE club SET status = 'INACTIVE' WHERE id = ?", clubAId);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + clubAMemberToken)
                .when().get("/api/v1/notices/" + noticeOfClubA)
                .then().statusCode(HttpStatus.NOT_FOUND.value());
    }

    private void seedPublicNoticeAsAdmin(String title) {
        User admin = saveAdmin();
        String adminToken = jwtTokenProvider.createToken(admin.getId(), admin.getRole().name());
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body("""
                    { "title":"%s", "summary":"요약", "content":"본문",
                      "coverImageUrl":"https://example.com/c.png",
                      "category":"GENERAL", "visibility":"PUBLIC",
                      "pinned":false, "notifyOnPublish":false }
                    """.formatted(title))
                .when().post("/api/v1/admin/notices")
                .then().statusCode(HttpStatus.CREATED.value());
    }

    private User saveAdmin() {
        long seq = sequence.incrementAndGet();
        return userRepository.save(User.create("20" + seq, "관리자" + seq, "h", UserRole.ADMIN,
                Grade.FRESHMAN, College.IT_ENGINEERING, "미설정", "010-0000-0000", LocalDateTime.now()));
    }
}
