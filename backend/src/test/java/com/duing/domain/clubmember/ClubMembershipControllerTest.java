package com.duing.domain.clubmember;

import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasKey;
import static org.hamcrest.Matchers.nullValue;

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
import java.time.LocalDateTime;
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
class ClubMembershipControllerTest extends IntegrationTestBase {

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;
    @Autowired JdbcTemplate jdbcTemplate;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());
    private Long clubId;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        Club club = clubRepository.save(Club.create("테스트동아리",
                ClubCategory.ACADEMIC, null, "설명", null));
        clubId = club.getId();
        // Club.create 기본 상태는 PENDING_APPROVAL — 멤버십 조회는 ACTIVE 동아리만 허용되므로,
        // 상태 차단 자체를 검증하는 테스트가 아닌 한 ACTIVE 로 둔다.
        jdbcTemplate.update("UPDATE club SET status = 'ACTIVE' WHERE id = ?", clubId);
    }

    private User saveUser() {
        long seq = sequence.incrementAndGet();
        return userRepository.save(User.create("20" + seq, "U" + seq, "h", UserRole.STUDENT,
                Grade.FRESHMAN, College.IT_ENGINEERING, "미설정", "010-0000-0000", LocalDateTime.now()));
    }

    private String tokenFor(User user) {
        return jwtTokenProvider.createToken(user.getId(), user.getRole().name());
    }

    private void saveMembership(User user, ClubMemberRole role) {
        Club club = clubRepository.findById(clubId).orElseThrow();
        ClubMember member = role == ClubMemberRole.LEADER
                ? ClubMember.asLeader(club, user)
                : ClubMember.of(club, user, role);
        clubMemberRepository.save(member);
    }

    @Test
    @DisplayName("LEADER 가 호출하면 모든 권한이 true 로 응답된다")
    void leader() {
        User user = saveUser();
        saveMembership(user, ClubMemberRole.LEADER);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenFor(user))
                .when().get("/api/v1/clubs/" + clubId + "/membership")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.role", equalTo("LEADER"))
                .body("data.permissions.canPostNotice", equalTo(true))
                .body("data.permissions.canEditNotice", equalTo(true))
                .body("data.permissions.canDeleteNotice", equalTo(true))
                .body("data.permissions.canPostEvent", equalTo(true))
                .body("data.permissions.canEditEvent", equalTo(true))
                .body("data.permissions.canDeleteEvent", equalTo(true));
    }

    @Test
    @DisplayName("OFFICER 는 공지·일정의 작성·수정·삭제가 모두 true 로 응답된다")
    void officer() {
        User user = saveUser();
        saveMembership(user, ClubMemberRole.OFFICER);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenFor(user))
                .when().get("/api/v1/clubs/" + clubId + "/membership")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.role", equalTo("OFFICER"))
                .body("data.permissions.canPostNotice", equalTo(true))
                .body("data.permissions.canEditNotice", equalTo(true))
                .body("data.permissions.canDeleteNotice", equalTo(true))
                .body("data.permissions.canPostEvent", equalTo(true))
                .body("data.permissions.canEditEvent", equalTo(true))
                .body("data.permissions.canDeleteEvent", equalTo(true));
    }

    @Test
    @DisplayName("MEMBER 는 모든 작성·수정·삭제가 false 로 응답된다")
    void member() {
        User user = saveUser();
        saveMembership(user, ClubMemberRole.MEMBER);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenFor(user))
                .when().get("/api/v1/clubs/" + clubId + "/membership")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.role", equalTo("MEMBER"))
                .body("data.permissions.canPostNotice", equalTo(false))
                .body("data.permissions.canEditNotice", equalTo(false))
                .body("data.permissions.canDeleteNotice", equalTo(false));
    }

    @Test
    @DisplayName("운영 중단된 동아리의 멤버는 멤버십 정보를 조회할 수 없다")
    void inactiveClubMemberCannotGetMembership() {
        User user = saveUser();
        saveMembership(user, ClubMemberRole.MEMBER);
        jdbcTemplate.update("UPDATE club SET status = 'INACTIVE' WHERE id = ?", clubId);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenFor(user))
                .when().get("/api/v1/clubs/" + clubId + "/membership")
                .then().statusCode(HttpStatus.FORBIDDEN.value())
                .body("ok", equalTo(false))
                .body("message", equalTo("운영 종료된 동아리입니다."));
    }

    @Test
    @DisplayName("비-멤버가 호출하면 200 과 함께 빈 멤버십(data:null)이 반환된다")
    void nonMember() {
        // 멤버가 아닌 것은 접근 거부가 아니라 조회 결과 없음이다 — 403 은 실제 거부(비 ACTIVE 동아리)에만 쓴다.
        User outsider = saveUser();

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenFor(outsider))
                .when().get("/api/v1/clubs/" + clubId + "/membership")
                .then().statusCode(HttpStatus.OK.value())
                .body("ok", equalTo(true))
                // hasKey 까지 단언해야 "data:null" 계약이 고정된다 — nullValue 만으로는 키 자체가
                // 빠진 응답(직렬화 설정이 바뀌어 NON_NULL 이 전역 적용되는 경우)도 통과한다.
                .body("$", hasKey("data"))
                .body("data", nullValue());
    }

    @Test
    @DisplayName("비-멤버는 동아리가 운영 종료 상태여도 403 이 아닌 200 + data:null 을 받는다")
    void nonMemberOfInactiveClub() {
        // 판정 순서(멤버십 확인 → 상태 검사) 고정. 순서가 뒤집히면 비멤버가 동아리 상태별 안내 문구를
        // 403 으로 받아, 소속된 적 없는 동아리의 운영 상태가 새어나간다.
        User outsider = saveUser();
        jdbcTemplate.update("UPDATE club SET status = 'INACTIVE' WHERE id = ?", clubId);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenFor(outsider))
                .when().get("/api/v1/clubs/" + clubId + "/membership")
                .then().statusCode(HttpStatus.OK.value())
                .body("data", nullValue());
    }

    @Test
    @DisplayName("존재하지 않는 동아리를 조회해도 비-멤버와 같은 200 + data:null 이 반환된다")
    void unknownClub() {
        // 존재 은닉 — 비멤버와 응답이 갈리면 동아리 id 존재 여부를 훑어볼 수 있는 오라클이 된다.
        User outsider = saveUser();

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenFor(outsider))
                .when().get("/api/v1/clubs/" + (clubId + 999_999) + "/membership")
                .then().statusCode(HttpStatus.OK.value())
                .body("data", nullValue());
    }

    @Test
    @DisplayName("미인증 호출은 URL 레이어에서 401 로 차단된다 — clubs/** GET permitAll 보다 앞선 규칙 잠금")
    void unauthenticated() {
        RestAssured.given()
                .when().get("/api/v1/clubs/" + clubId + "/membership")
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());
    }
}
