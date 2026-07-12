package com.duing.domain.clubmember.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.everyItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.notNullValue;
import static org.hamcrest.Matchers.nullValue;

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
class ClubMemberExportControllerTest extends IntegrationTestBase {

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
    private String leaderToken;
    private String officerToken;
    private String memberToken;
    private String strangerToken;

    @BeforeEach
    void setUp() throws Exception {
        RestAssured.port = port;
        leaderUser = saveUser("운영진리더");
        officerUser = saveUser("운영진오피서");
        memberUser = saveUser("일반회원");
        strangerUser = saveUser("비멤버");
        club = saveActiveClub("두잉멤버export");
        clubMemberRepository.save(ClubMember.asLeader(club, leaderUser));
        clubMemberRepository.save(ClubMember.of(club, officerUser, ClubMemberRole.OFFICER));
        clubMemberRepository.save(ClubMember.asMember(club, memberUser));

        leaderToken = jwtTokenProvider.createToken(leaderUser.getId(), leaderUser.getRole().name());
        officerToken = jwtTokenProvider.createToken(officerUser.getId(), officerUser.getRole().name());
        memberToken = jwtTokenProvider.createToken(memberUser.getId(), memberUser.getRole().name());
        strangerToken = jwtTokenProvider.createToken(strangerUser.getId(), strangerUser.getRole().name());
    }

    @Test
    @DisplayName("회장이 export 를 호출하면 200 과 역할 정렬된 멤버 목록을 반환한다")
    void leaderExportsOrderedList() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when()
                    .get("/api/v1/clubs/{clubId}/members/export", club.getId())
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("ok", equalTo(true))
                    .body("data", hasSize(3))
                    .body("data.role", contains("LEADER", "OFFICER", "MEMBER"))
                    .body("data.name", contains("운영진리더", "운영진오피서", "일반회원"));
    }

    @Test
    @DisplayName("includePhone 기본값(false)이면 phone 이 전부 null 로 내려온다")
    void phoneOmittedByDefault() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when()
                    .get("/api/v1/clubs/{clubId}/members/export", club.getId())
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.phone", everyItem(nullValue()));
    }

    @Test
    @DisplayName("includePhone=true 면 phone 값이 포함된다")
    void phoneIncludedWhenRequested() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                    .queryParam("includePhone", true)
                .when()
                    .get("/api/v1/clubs/{clubId}/members/export", club.getId())
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data[0].phone", notNullValue());
    }

    @Test
    @DisplayName("운영진이 export 를 호출하면 403 을 받는다 — 명단 다운로드는 회장 전용")
    void officerIsForbidden() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + officerToken)
                .when()
                    .get("/api/v1/clubs/{clubId}/members/export", club.getId())
                .then()
                    .statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("일반 멤버가 export 를 호출하면 403 을 받는다")
    void memberIsForbidden() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + memberToken)
                .when()
                    .get("/api/v1/clubs/{clubId}/members/export", club.getId())
                .then()
                    .statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("비멤버가 export 를 호출하면 403 을 받는다")
    void strangerIsForbidden() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + strangerToken)
                .when()
                    .get("/api/v1/clubs/{clubId}/members/export", club.getId())
                .then()
                    .statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("인증 없이 export 를 호출하면 4xx 인증 오류를 반환한다")
    void anonymousIsRejected() {
        int status = RestAssured
                .given()
                .when()
                    .get("/api/v1/clubs/{clubId}/members/export", club.getId())
                .then()
                    .extract().statusCode();
        assertThat(status).isIn(401, 403);
    }

    @Test
    @DisplayName("export 성공 시 누가·전화포함여부·건수를 구조화 로그로 남긴다 (전화번호 값은 미포함)")
    void exportWritesStructuredLog() {
        Logger serviceLogger = (Logger) LoggerFactory.getLogger(GeneralClubMemberQueryService.class);
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        serviceLogger.addAppender(appender);

        try {
            RestAssured
                    .given()
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                        .queryParam("includePhone", true)
                    .when()
                        .get("/api/v1/clubs/{clubId}/members/export", club.getId())
                    .then()
                        .statusCode(HttpStatus.OK.value());

            assertThat(appender.list)
                    .anySatisfy(event -> {
                        String message = event.getFormattedMessage();
                        assertThat(message).contains("club member export");
                        assertThat(message).contains("includePhone=true");
                        assertThat(message).contains("count=3");
                        assertThat(message).doesNotContain(leaderUser.getPhone());
                        assertThat(message).doesNotContain(officerUser.getPhone());
                        assertThat(message).doesNotContain(memberUser.getPhone());
                    });
        } finally {
            serviceLogger.detachAppender(appender);
        }
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
