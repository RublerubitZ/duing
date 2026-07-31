package com.duing.domain.clubmember.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.everyItem;
import static org.hamcrest.Matchers.not;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.clubmember.service.GeneralClubMemberQueryService;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import java.lang.reflect.Field;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ClubMemberPhoneControllerTest extends IntegrationTestBase {

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private User leaderUser;
    private User officerUser;
    private User memberUser;
    private User strangerUser;
    private Club club;
    private ClubMember memberMembership;
    private String leaderToken;
    private String officerToken;
    private String memberToken;
    private String strangerToken;

    @BeforeEach
    void setUp() throws Exception {
        RestAssured.port = port;
        leaderUser = saveUser("연락처리더");
        officerUser = saveUser("연락처임원");
        memberUser = saveUser("연락처부원");
        strangerUser = saveUser("연락처외부");
        club = saveActiveClub("연락처조회동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leaderUser));
        clubMemberRepository.save(ClubMember.of(club, officerUser, ClubMemberRole.OFFICER));
        memberMembership = clubMemberRepository.save(ClubMember.asMember(club, memberUser));

        leaderToken = jwtTokenProvider.createToken(leaderUser.getId(), leaderUser.getRole().name());
        officerToken = jwtTokenProvider.createToken(officerUser.getId(), officerUser.getRole().name());
        memberToken = jwtTokenProvider.createToken(memberUser.getId(), memberUser.getRole().name());
        strangerToken = jwtTokenProvider.createToken(strangerUser.getId(), strangerUser.getRole().name());
    }

    @Test
    @DisplayName("회장이 조회하면 마스킹되지 않은 원본 번호를 반환한다")
    void leaderGetsRawPhone() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when()
                    .get("/api/v1/clubs/{clubId}/members/{memberId}/phone",
                            club.getId(), memberMembership.getId())
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("ok", equalTo(true))
                    .body("data.phone", equalTo(memberUser.getPhone()));
    }

    @Test
    @DisplayName("원본 번호 응답은 캐시되지 않도록 no-store 를 지정한다")
    void responseIsNotCacheable() {
        // 정확 일치로 단언한다 — contains("no-store") 는 Spring Security 기본 헤더만으로도 통과해
        // 컨트롤러의 .cacheControl(noStore()) 가 사라져도 GREEN 이 된다(회귀 가드 공허화).
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when()
                    .get("/api/v1/clubs/{clubId}/members/{memberId}/phone",
                            club.getId(), memberMembership.getId())
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .header(HttpHeaders.CACHE_CONTROL, "no-store");
    }

    @Test
    @DisplayName("운영진도 마스킹되지 않은 원본 번호를 조회할 수 있다")
    void officerGetsRawPhone() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + officerToken)
                .when()
                    .get("/api/v1/clubs/{clubId}/members/{memberId}/phone",
                            club.getId(), memberMembership.getId())
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("ok", equalTo(true))
                    .body("data.phone", equalTo(memberUser.getPhone()));
    }

    @Test
    @DisplayName("부원은 원본 번호를 조회할 수 없다")
    void memberIsForbidden() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + memberToken)
                .when()
                    .get("/api/v1/clubs/{clubId}/members/{memberId}/phone",
                            club.getId(), memberMembership.getId())
                .then()
                    .statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("비멤버는 원본 번호를 조회할 수 없다")
    void strangerIsForbidden() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + strangerToken)
                .when()
                    .get("/api/v1/clubs/{clubId}/members/{memberId}/phone",
                            club.getId(), memberMembership.getId())
                .then()
                    .statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("다른 동아리의 멤버 번호를 조회하면 404 — 존재 여부를 구분해 알려주지 않는다")
    void foreignMemberIsNotFound() throws Exception {
        Club otherClub = saveActiveClub("연락처타동아리");
        ClubMember foreignMembership =
                clubMemberRepository.save(ClubMember.asLeader(otherClub, strangerUser));

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when()
                    .get("/api/v1/clubs/{clubId}/members/{memberId}/phone",
                            club.getId(), foreignMembership.getId())
                .then()
                    .statusCode(HttpStatus.NOT_FOUND.value());
    }

    @Test
    @DisplayName("존재하지 않는 멤버를 조회하면 404")
    void unknownMemberIsNotFound() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when()
                    .get("/api/v1/clubs/{clubId}/members/{memberId}/phone", club.getId(), 99_999_999L)
                .then()
                    .statusCode(HttpStatus.NOT_FOUND.value());
    }

    @Test
    @DisplayName("비활동 동아리에서는 회장도 원본 번호를 조회할 수 없다")
    void nonActiveClubIsBlocked() throws Exception {
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(club, ClubStatus.INACTIVE);
        clubRepository.save(club);

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when()
                    .get("/api/v1/clubs/{clubId}/members/{memberId}/phone",
                            club.getId(), memberMembership.getId())
                .then()
                    .statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("인증 없이 조회하면 4xx 인증 오류를 반환한다")
    void anonymousIsRejected() {
        int status = RestAssured
                .given()
                .when()
                    .get("/api/v1/clubs/{clubId}/members/{memberId}/phone",
                            club.getId(), memberMembership.getId())
                .then()
                    .extract().statusCode();
        assertThat(status).isIn(401, 403);
    }

    @Test
    @DisplayName("원본 조회 시 누가·누구를 봤는지 구조화 로그로 남긴다 (번호 값은 로그에 없다)")
    void phoneViewWritesStructuredLog() {
        Logger serviceLogger = (Logger) LoggerFactory.getLogger(GeneralClubMemberQueryService.class);
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        serviceLogger.addAppender(appender);

        try {
            RestAssured
                    .given()
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                    .when()
                        .get("/api/v1/clubs/{clubId}/members/{memberId}/phone",
                                club.getId(), memberMembership.getId())
                    .then()
                        .statusCode(HttpStatus.OK.value());

            assertThat(appender.list)
                    .anySatisfy(event -> {
                        String message = event.getFormattedMessage();
                        assertThat(message).contains("member phone view");
                        assertThat(message).contains("action=PHONE_VIEW");
                        assertThat(message).contains("actorUserId=" + leaderUser.getId());
                        assertThat(message).contains("targetMemberId=" + memberMembership.getId());
                        assertThat(message).contains("targetUserId=" + memberUser.getId());
                        assertThat(message).doesNotContain(memberUser.getPhone());
                    });
        } finally {
            serviceLogger.detachAppender(appender);
        }
    }

    @Test
    @DisplayName("멤버 목록 응답에는 여전히 원본 번호가 없다 — 원본은 전용 API 로만 나간다")
    void listStillMasksPhone() {
        // 필드명이 아니라 응답 본문 전체에 원본 번호가 없음을 단언한다 — 필드 리네임으로 공허해지지 않게.
        String responseBody = RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when()
                    .get("/api/v1/clubs/{clubId}/members", club.getId())
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.phoneMasked", everyItem(not(equalTo(memberUser.getPhone()))))
                    .extract().asString();

        assertThat(responseBody).doesNotContain(memberUser.getPhone());
    }

    @Test
    @DisplayName("탈퇴한 회원의 멤버 id 로 조회하면 404 — 잔존 멤버 행이 500 으로 새지 않는다")
    void withdrawnMemberIsNotFound() {
        // 탈퇴는 User 만 soft-delete 하고 비-LEADER club_member 행은 남긴다(GeneralUserService.withdraw).
        // 그 잔존 행을 findById 로 읽으면 user 프록시 초기화가 실패해 500 이 났다.
        userRepository.delete(memberUser);

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when()
                    .get("/api/v1/clubs/{clubId}/members/{memberId}/phone",
                            club.getId(), memberMembership.getId())
                .then()
                    .statusCode(HttpStatus.NOT_FOUND.value());
    }

    private User saveUser(String name) {
        long unique = sequence.getAndIncrement();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                name,
                "hashed",
                UserRole.STUDENT,
                Grade.FRESHMAN,
                College.IT_ENGINEERING,
                "컴퓨터정보공학부",
                String.format("010-%04d-%04d", unique % 10_000, (unique / 10_000) % 10_000),
                java.time.LocalDateTime.now()
        ));
    }

    private Club saveActiveClub(String name) throws Exception {
        String uniqueName = name + "-" + sequence.getAndIncrement();
        Club created = Club.create(uniqueName, ClubCategory.ACADEMIC, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(created, ClubStatus.ACTIVE);
        return clubRepository.save(created);
    }
}
