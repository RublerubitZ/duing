package com.duing.domain.notification;

import java.util.Map;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.notification.entity.Notification;
import com.duing.domain.notification.entity.NotificationType;
import com.duing.domain.notification.repository.NotificationRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
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

/**
 * 알림 목록은 개인·공지 알림을 over-fetch 해 메모리에서 병합·슬라이스한다. 매우 큰 page 번호를 주면
 * over-fetch 량 계산이 정수 오버플로를 일으켜 500 이 될 수 있었다 — long 계산·상한으로 이를 막고, 상한을
 * 넘는 깊은 페이지는 실제 총계는 유지한 채 빈 목록(200)으로 응답하는지 검증한다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class NotificationPageOverflowAcceptanceTest extends IntegrationTestBase {

    private static final int SEEDED_NOTIFICATIONS = 3;

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired NotificationRepository notificationRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;

    private String token;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        User user = userRepository.save(UserFixture.unique());
        token = jwtTokenProvider.createToken(user.getId(), user.getRole().name());
        for (int index = 0; index < SEEDED_NOTIFICATIONS; index++) {
            notificationRepository.save(Notification.create(
                    user.getId(), NotificationType.RECRUITMENT_OPENED,
                    "알림 " + index, "본문 " + index, "/link/" + index, Map.of(),
                    "RECRUITMENT_OPENED:seed=" + index));
        }
    }

    @Test
    @DisplayName("첫 페이지 요청은 시드된 알림을 정상(200) 반환한다 — 슬라이스 로직 회귀 방지")
    void firstPageReturnsSeededNotifications() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .queryParam("page", 0)
                .queryParam("size", 20)
                .when().get("/api/v1/me/notifications")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content.size()", Matchers.equalTo(SEEDED_NOTIFICATIONS))
                .body("data.totalElements", Matchers.equalTo(SEEDED_NOTIFICATIONS));
    }

    @Test
    @DisplayName("매우 큰 page 번호로 요청해도 정수 오버플로로 500 이 나지 않고, 200·빈 목록·실제 총계로 응답한다")
    void hugePageNumberDoesNotOverflowAndKeepsTotal() {
        // page=Integer.MAX_VALUE 는 (page+1)*size 를 int 로 계산하면 오버플로해 음수 size → 500 이 됐다.
        // long 계산으로 오버플로를 피하고, 상한 초과 깊은 페이지라 콘텐츠는 비지만 총계는 실제값을 유지한다.
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .queryParam("page", Integer.MAX_VALUE)
                .queryParam("size", 100)
                .when().get("/api/v1/me/notifications")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content.size()", Matchers.equalTo(0))
                .body("data.totalElements", Matchers.equalTo(SEEDED_NOTIFICATIONS));
    }
}
