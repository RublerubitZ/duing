package com.duing.domain.notification.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.nullValue;

import com.duing.domain.notification.entity.NotificationType;
import com.duing.domain.notification.service.NotificationService;
import com.duing.domain.notification.service.dto.command.CreateNotificationCommand;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import com.duing.common.TestcontainersConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.test.annotation.DirtiesContext;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class NotificationControllerTest {

    @LocalServerPort
    private int port;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private NotificationService notificationService;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private User student;
    private String studentToken;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        student = saveUser("알림컨트롤러테스트유저");
        studentToken = jwtTokenProvider.createToken(student.getId(), student.getRole().name());
    }

    @Test
    @DisplayName("GET /api/v1/me/notifications 는 200 과 페이징 응답 형태를 반환한다")
    void listNotificationsReturns200WithPagedResponse() {
        saveNotification(student.getId(), "RECRUITMENT_OPENED:ctrl:1", "모집 시작 알림");
        saveNotification(student.getId(), "RECRUITMENT_OPENED:ctrl:2", "마감 임박 알림");

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when()
                    .get("/api/v1/me/notifications?page=0&size=10")
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("ok", equalTo(true))
                    .body("data.totalElements", equalTo(2))
                    .body("data.page", equalTo(0));
    }

    @Test
    @DisplayName("GET /api/v1/me/notifications/unread-count 는 200 과 count 를 반환한다")
    void unreadCountReturns200WithCount() {
        saveNotification(student.getId(), "RECRUITMENT_OPENED:ctrl:3", "읽지않은알림1");
        saveNotification(student.getId(), "RECRUITMENT_OPENED:ctrl:4", "읽지않은알림2");

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when()
                    .get("/api/v1/me/notifications/unread-count")
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("ok", equalTo(true))
                    .body("data.count", equalTo(2));
    }

    @Test
    @DisplayName("GET /api/v1/me/notifications?unreadOnly=true 는 읽지 않은 알림만 반환한다")
    void listWithUnreadOnlyFilterReturnsOnlyUnreadNotifications() {
        saveNotification(student.getId(), "RECRUITMENT_OPENED:ctrl:5", "읽지않은알림");
        saveNotification(student.getId(), "RECRUITMENT_OPENED:ctrl:6", "읽을알림");

        long readableId = notificationService.listMine(student.getId(), false, org.springframework.data.domain.PageRequest.of(0, 10))
                .getContent()
                .stream()
                .filter(q -> q.title().equals("읽을알림"))
                .findFirst()
                .orElseThrow()
                .id();

        notificationService.markRead(student.getId(), readableId);

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when()
                    .get("/api/v1/me/notifications?unreadOnly=true")
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("ok", equalTo(true))
                    .body("data.totalElements", equalTo(1));
    }

    @Test
    @DisplayName("PATCH /api/v1/me/notifications/{id}/read 는 204 를 반환한다")
    void readNotificationReturns204() {
        saveNotification(student.getId(), "RECRUITMENT_OPENED:ctrl:7", "읽음처리알림");

        long notificationId = notificationService.listMine(student.getId(), false, org.springframework.data.domain.PageRequest.of(0, 10))
                .getContent()
                .get(0)
                .id();

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when()
                    .patch("/api/v1/me/notifications/{id}/read", notificationId)
                .then()
                    .statusCode(HttpStatus.NO_CONTENT.value());
    }

    @Test
    @DisplayName("PATCH /api/v1/me/notifications/{id}/read 는 같은 id 두 번 호출해도 204 를 반환한다")
    void readNotificationTwiceIsIdempotent() {
        saveNotification(student.getId(), "RECRUITMENT_OPENED:ctrl:8", "멱등읽음알림");

        long notificationId = notificationService.listMine(student.getId(), false, org.springframework.data.domain.PageRequest.of(0, 10))
                .getContent()
                .get(0)
                .id();

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when()
                    .patch("/api/v1/me/notifications/{id}/read", notificationId)
                .then()
                    .statusCode(HttpStatus.NO_CONTENT.value());

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when()
                    .patch("/api/v1/me/notifications/{id}/read", notificationId)
                .then()
                    .statusCode(HttpStatus.NO_CONTENT.value());
    }

    @Test
    @DisplayName("PATCH /api/v1/me/notifications/read-all 는 204 를 반환한다")
    void readAllNotificationsReturns204() {
        saveNotification(student.getId(), "RECRUITMENT_OPENED:ctrl:9", "전체읽음알림1");
        saveNotification(student.getId(), "RECRUITMENT_OPENED:ctrl:10", "전체읽음알림2");

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when()
                    .patch("/api/v1/me/notifications/read-all")
                .then()
                    .statusCode(HttpStatus.NO_CONTENT.value());
    }

    @Test
    @DisplayName("비로그인 상태에서 알림 목록 조회를 호출하면 인증 오류(4xx)를 반환한다")
    void listNotificationsWithoutAuthIsRejected() {
        int statusCode = RestAssured
                .given()
                .when()
                    .get("/api/v1/me/notifications")
                .then()
                    .extract().statusCode();

        assertThat(statusCode).isIn(401, 403);
    }

    @Test
    @DisplayName("비로그인 상태에서 읽지 않은 알림 수 조회를 호출하면 인증 오류(4xx)를 반환한다")
    void unreadCountWithoutAuthIsRejected() {
        int statusCode = RestAssured
                .given()
                .when()
                    .get("/api/v1/me/notifications/unread-count")
                .then()
                    .extract().statusCode();

        assertThat(statusCode).isIn(401, 403);
    }

    @Test
    @DisplayName("비로그인 상태에서 알림 읽음 처리를 호출하면 인증 오류(4xx)를 반환한다")
    void readNotificationWithoutAuthIsRejected() {
        int statusCode = RestAssured
                .given()
                .when()
                    .patch("/api/v1/me/notifications/{id}/read", 1L)
                .then()
                    .extract().statusCode();

        assertThat(statusCode).isIn(401, 403);
    }

    @Test
    @DisplayName("비로그인 상태에서 전체 읽음 처리를 호출하면 인증 오류(4xx)를 반환한다")
    void readAllWithoutAuthIsRejected() {
        int statusCode = RestAssured
                .given()
                .when()
                    .patch("/api/v1/me/notifications/read-all")
                .then()
                    .extract().statusCode();

        assertThat(statusCode).isIn(401, 403);
    }

    @Test
    @DisplayName("알림 목록 응답에 payload 필드가 노출되지 않는다")
    void notificationResponseDoesNotExposePayloadField() {
        saveNotification(student.getId(), "RECRUITMENT_OPENED:ctrl:11", "페이로드노출테스트");

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when()
                    .get("/api/v1/me/notifications?page=0&size=10")
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.content[0].payload", nullValue());
    }

    private User saveUser(String name) {
        long unique = sequence.getAndIncrement();
        User user = User.create(
                String.format("%010d", unique % 10_000_000_000L),
                name,
                "nctrl" + unique + "@daegu.ac.kr",
                "hashed",
                UserRole.STUDENT,
                Grade.FRESHMAN,
                College.IT_ENGINEERING,
                "미설정",
                "010-0000-0000",
                java.time.LocalDateTime.now()
        );
        return userRepository.save(user);
    }

    private void saveNotification(Long userId, String dedupKey, String title) {
        notificationService.createIfAbsent(new CreateNotificationCommand(
                userId,
                NotificationType.RECRUITMENT_OPENED,
                title,
                "알림 본문",
                "/clubs/1",
                Map.of(),
                dedupKey
        ));
    }
}