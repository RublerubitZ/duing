package com.duing.domain.user.controller;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.ClubFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.user.entity.AdminUserAction;
import com.duing.domain.user.entity.AdminUserActionLog;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.AdminUserActionLogRepository;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import java.time.LocalDateTime;
import java.util.concurrent.atomic.AtomicLong;
import org.hamcrest.Matchers;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AdminUserDetailControllerTest extends IntegrationTestBase {

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired AdminUserActionLogRepository actionLogRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private User adminUser;
    private String adminToken;
    private String studentToken;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        adminUser = saveUser("총동연관리자", UserRole.ADMIN);
        adminToken = tokenFor(adminUser);
        studentToken = tokenFor(saveUser("일반학생", UserRole.STUDENT));
    }

    @Test
    @DisplayName("회원 상세에 가입 정보·마스킹된 휴대폰·인증 여부·계정 상태가 담긴다")
    void detailContainsAccountInfo() {
        User target = saveUser("김도윤", UserRole.STUDENT);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get("/api/v1/admin/users/{userId}", target.getId())
                .then()
                .statusCode(HttpStatus.OK.value())
                .body("data.name", Matchers.equalTo("김도윤"))
                .body("data.status", Matchers.equalTo("ACTIVE"))
                .body("data.maskedPhone", Matchers.containsString("****"))
                .body("data.phoneVerified", Matchers.equalTo(false))
                .body("data.lastLoginAt", Matchers.nullValue())
                .body("data.adminNote", Matchers.nullValue())
                .body("data.adminNoteUpdatedAt", Matchers.nullValue())
                .body("data.adminNoteUpdatedBy", Matchers.nullValue());
    }

    @Test
    @DisplayName("회원 상세에 원본 휴대폰 번호는 담기지 않는다")
    void detailDoesNotExposeRawPhone() {
        User target = saveUser("박서준", UserRole.STUDENT);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get("/api/v1/admin/users/{userId}", target.getId())
                .then()
                .statusCode(HttpStatus.OK.value())
                .body("data", Matchers.not(Matchers.hasKey("phone")))
                .body("data", Matchers.not(Matchers.hasKey("passwordHash")));
    }

    @Test
    @DisplayName("회원이 가입한 동아리가 역할·가입일과 함께 반환된다")
    void detailContainsJoinedClubs() {
        User target = saveUser("이하늘", UserRole.STUDENT);
        Club club = clubRepository.save(ClubFixture.academic("두잉코드"));
        clubMemberRepository.save(ClubMember.asLeader(club, target));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get("/api/v1/admin/users/{userId}", target.getId())
                .then()
                .statusCode(HttpStatus.OK.value())
                .body("data.clubs.size()", Matchers.equalTo(1))
                .body("data.clubs[0].clubId", Matchers.equalTo(club.getId().intValue()))
                .body("data.clubs[0].clubName", Matchers.equalTo("두잉코드"))
                .body("data.clubs[0].role", Matchers.equalTo("LEADER"))
                .body("data.clubs[0].joinedAt", Matchers.notNullValue());
    }

    @Test
    @DisplayName("최근 운영 기록에 개인정보 열람(PHONE_VIEW)은 포함되지 않는다")
    void recentActionsExcludePhoneView() {
        User target = saveUser("정우진", UserRole.STUDENT);
        actionLogRepository.save(AdminUserActionLog.of(
                adminUser.getId(), target.getId(), AdminUserAction.PHONE_VIEW, null));
        actionLogRepository.save(AdminUserActionLog.of(
                adminUser.getId(), target.getId(), AdminUserAction.FORCE_LOGOUT, "기기 분실 신고"));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get("/api/v1/admin/users/{userId}", target.getId())
                .then()
                .statusCode(HttpStatus.OK.value())
                .body("data.recentActions.size()", Matchers.equalTo(1))
                .body("data.recentActions[0].action", Matchers.equalTo("FORCE_LOGOUT"))
                // 작업자 이름과 사유는 타입이 같아 순서가 뒤바뀌어도 컴파일된다 — 둘 다 값을 넣어 자리를 고정한다.
                .body("data.recentActions[0].actorName", Matchers.equalTo("총동연관리자"))
                .body("data.recentActions[0].reason", Matchers.equalTo("기기 분실 신고"))
                .body("data.recentActions[0].at", Matchers.notNullValue());
    }

    @Test
    @DisplayName("메모 수정 시각·작업자는 최신 메모 수정 로그에서 파생된다")
    void adminNoteMetadataDerivedFromLog() {
        User target = saveUser("한지우", UserRole.STUDENT);
        actionLogRepository.save(AdminUserActionLog.of(
                adminUser.getId(), target.getId(), AdminUserAction.ADMIN_NOTE_UPDATED, null));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get("/api/v1/admin/users/{userId}", target.getId())
                .then()
                .statusCode(HttpStatus.OK.value())
                .body("data.adminNoteUpdatedAt", Matchers.notNullValue())
                .body("data.adminNoteUpdatedBy", Matchers.equalTo("총동연관리자"));
    }

    @Test
    @DisplayName("STUDENT 가 회원 상세를 조회하면 403 을 반환한다")
    void studentGetsForbidden() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when().get("/api/v1/admin/users/{userId}", adminUser.getId())
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("존재하지 않는 회원을 조회하면 404 를 반환한다")
    void unknownUserReturnsNotFound() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get("/api/v1/admin/users/{userId}", 999_999L)
                .then().statusCode(HttpStatus.NOT_FOUND.value());
    }

    private String tokenFor(User user) {
        return jwtTokenProvider.createToken(user.getId(), user.getRole().name(), user.getTokenVersion());
    }

    private User saveUser(String name, UserRole role) {
        long unique = sequence.getAndIncrement();
        return userRepository.saveAndFlush(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                name, "hashed", role, Grade.JUNIOR, College.IT_ENGINEERING, "컴퓨터공학",
                "010-" + String.format("%04d", unique % 10000) + "-0000",
                LocalDateTime.now()));
    }
}
