package com.duing.domain.notification;

import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasItem;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
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
import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import java.lang.reflect.Field;
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

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class NotificationUnionAcceptanceTest extends IntegrationTestBase {

    @LocalServerPort int port;
    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private User admin;
    private User student;
    private String adminToken;
    private String studentToken;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        admin = saveUser(UserRole.ADMIN);
        student = saveUser(UserRole.STUDENT);
        adminToken = jwtTokenProvider.createToken(admin.getId(), admin.getRole().name());
        studentToken = jwtTokenProvider.createToken(student.getId(), student.getRole().name());
    }

    @Test
    @DisplayName("ADMIN 이 PUBLIC + notifyOnPublish=true 공지를 발행하면 다른 사용자의 GET /me/notifications 응답에 source=BROADCAST 항목이 포함된다")
    void broadcastAppearsInUserNotificationList() {
        publishPublicNoticeWithBroadcast();

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
            .when()
                .get("/api/v1/me/notifications")
            .then()
                .statusCode(HttpStatus.OK.value())
                .body("data.content.source", hasItem("BROADCAST"));
    }

    @Test
    @DisplayName("PATCH /me/notifications/broadcasts/{id}/read 호출 후 같은 broadcast 는 isRead=true 로 응답된다")
    void broadcastReadEndpointFlipsIsRead() {
        publishPublicNoticeWithBroadcast();

        Integer broadcastId = RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
            .when()
                .get("/api/v1/me/notifications")
            .then()
                .statusCode(HttpStatus.OK.value())
                .extract().jsonPath().get("data.content.find { it.source == 'BROADCAST' }.id");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
            .when()
                .patch("/api/v1/me/notifications/broadcasts/" + broadcastId + "/read")
            .then()
                .statusCode(HttpStatus.NO_CONTENT.value());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
            .when()
                .get("/api/v1/me/notifications")
            .then()
                .statusCode(HttpStatus.OK.value())
                .body("data.content.find { it.source == 'BROADCAST' && it.id == " + broadcastId + " }.isRead",
                        equalTo(true));
    }

    @Test
    @DisplayName("OFFICERS_ALL 공지 발행 시 운영진 사용자에게 source=PERSONAL 알림이 생성된다")
    void officersAllFansOutPersonalNotifications() {
        User officer = saveUser(UserRole.STUDENT);
        String officerToken = jwtTokenProvider.createToken(officer.getId(), officer.getRole().name());
        // 알림 수신자 스코프는 ACTIVE 동아리 소속만 대상이다(정책 2026-08-18) — 팬아웃 전제를 명시한다.
        Club club = Club.create("오피서클럽", ClubCategory.ACADEMIC, "분과", "설명", null);
        try {
            Field statusField = Club.class.getDeclaredField("status");
            statusField.setAccessible(true);
            statusField.set(club, ClubStatus.ACTIVE);
        } catch (ReflectiveOperationException reflectionFailure) {
            throw new IllegalStateException(reflectionFailure);
        }
        club = clubRepository.save(club);
        clubMemberRepository.save(ClubMember.of(club, officer, ClubMemberRole.OFFICER));

        String noticeTitle = "운영진 전용 공지";
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body("""
                    {
                      "title": "%s", "summary": "요약", "content": "본문",
                      "coverImageUrl": "https://example.com/c.png",
                      "category": "GENERAL", "visibility": "OFFICERS_ALL",
                      "pinned": false, "notifyOnPublish": true
                    }
                    """.formatted(noticeTitle))
            .when()
                .post("/api/v1/admin/notices")
            .then()
                .statusCode(HttpStatus.CREATED.value());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + officerToken)
            .when()
                .get("/api/v1/me/notifications")
            .then()
                .statusCode(HttpStatus.OK.value())
                .body("data.content.title", hasItem(noticeTitle))
                .body("data.content.find { it.title == '" + noticeTitle + "' }.source", equalTo("PERSONAL"));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
            .when()
                .get("/api/v1/me/notifications")
            .then()
                .statusCode(HttpStatus.OK.value())
                .body("data.content.findAll { it.title == '" + noticeTitle + "' }.size()", equalTo(0));
    }

    private Long publishPublicNoticeWithBroadcast() {
        Integer noticeId = RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body("""
                    {
                      "title": "축제 안내", "summary": "이번 주말 축제 안내드립니다",
                      "content": "본문", "coverImageUrl": "https://example.com/cover.png",
                      "category": "FESTIVAL", "visibility": "PUBLIC",
                      "pinned": false, "notifyOnPublish": true
                    }
                    """)
            .when()
                .post("/api/v1/admin/notices")
            .then()
                .statusCode(HttpStatus.CREATED.value())
                .extract().jsonPath().get("data");
        return noticeId.longValue();
    }

    private User saveUser(UserRole role) {
        long seq = sequence.incrementAndGet();
        return userRepository.save(User.create(
                "20" + seq, "테스터" + seq,
                "hashed", role, Grade.FRESHMAN, College.IT_ENGINEERING,
                "미설정", "010-0000-0000", LocalDateTime.now()));
    }
}
