package com.duing.domain.federation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.nullValue;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.federation.entity.FederationInquiry;
import com.duing.domain.federation.repository.FederationInquiryRepository;
import com.duing.domain.notification.entity.NotificationType;
import com.duing.domain.notification.repository.NotificationRepository;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
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
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;

/**
 * 총동연 1:1 비밀문의 인수 테스트 (P1-PR3). 컨트롤러 도입 전 RED 단계 — 스펙
 * 2026-07-04-federation-qna-design.md §4·§5 의 15개 시나리오를 고정한다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class FederationInquiryAcceptanceTest extends IntegrationTestBase {

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;
    @Autowired FederationInquiryRepository federationInquiryRepository;
    @Autowired NotificationRepository notificationRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private Long adminId;
    private Long studentId;
    private String adminToken;
    private String studentToken;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        User admin = saveUser(UserRole.ADMIN);
        User student = saveUser(UserRole.STUDENT);
        adminId = admin.getId();
        studentId = student.getId();
        adminToken = jwtTokenProvider.createToken(admin.getId(), admin.getRole().name());
        studentToken = jwtTokenProvider.createToken(student.getId(), student.getRole().name());
    }

    @Test
    @DisplayName("학생이 문의를 등록하면 내 문의 목록에서 접수 상태로 조회된다")
    void studentCreatesAndListsOwnInquiries() {
        Long inquiryId = createInquiry(studentToken, "동아리방 배정 문의", "동아리방 재배정 일정이 궁금합니다.");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
            .when()
                .get("/api/v1/me/federation-inquiries")
            .then()
                .statusCode(HttpStatus.OK.value())
                .body("data.content.find { it.id == %d }.status".formatted(inquiryId), equalTo("RECEIVED"));
    }

    @Test
    @DisplayName("익명 사용자는 문의를 등록할 수 없다")
    void anonymousBlockedOnCreate() {
        RestAssured.given()
                .contentType(ContentType.JSON)
                .body("""
                    { "title": "제목", "content": "내용" }
                    """)
            .when()
                .post("/api/v1/federation/inquiries")
            .then()
                .statusCode(HttpStatus.UNAUTHORIZED.value());
    }

    @Test
    @DisplayName("다른 학생이 작성한 문의를 조회하면 404를 받는다")
    void otherStudentCannotReadInquiry() {
        Long inquiryId = createInquiry(studentToken, "학생A 문의", "학생A 문의 내용입니다.");
        User otherStudent = saveUser(UserRole.STUDENT);
        String otherStudentToken = jwtTokenProvider.createToken(otherStudent.getId(), otherStudent.getRole().name());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + otherStudentToken)
            .when()
                .get("/api/v1/federation/inquiries/" + inquiryId)
            .then()
                .statusCode(HttpStatus.NOT_FOUND.value());
    }

    @Test
    @DisplayName("문의가 접수되면 총동연 관리자에게 접수 알림이 발송된다")
    void adminReceivesNotificationOnCreate() {
        createInquiry(studentToken, "회계 문의", "지원금 정산 방법이 궁금합니다.");

        boolean adminNotified = notificationRepository.findAll().stream()
                .anyMatch(notification -> notification.getUserId().equals(adminId)
                        && notification.getType() == NotificationType.FEDERATION_INQUIRY_RECEIVED);

        assertThat(adminNotified).isTrue();
    }

    @Test
    @DisplayName("작성자는 접수 상태에서만 문의를 수정할 수 있고, 답변중으로 전환되면 수정 시 409를 받는다")
    void authorUpdatesOnlyWhileReceived() {
        Long inquiryId = createInquiry(studentToken, "원래 제목", "원래 내용");

        updateInquiry(inquiryId, "수정된 제목", "수정된 내용", HttpStatus.NO_CONTENT);

        Long version = adminDetailVersion(inquiryId);
        transitionToInProgress(inquiryId, version);

        updateInquiry(inquiryId, "다시 수정", "다시 수정된 내용", HttpStatus.CONFLICT);
    }

    @Test
    @DisplayName("상태 전이는 최신 버전을 담아야 하며, 옛 버전으로 시도하면 409를 받고 최신 버전이면 성공한다")
    void statusTransitionRequiresVersionEcho() {
        Long inquiryId = createInquiry(studentToken, "제목", "내용");
        Long staleVersion = adminDetailVersion(inquiryId);

        // 학생이 내용을 수정해 버전을 증가시킨다 — 관리자가 쥔 버전은 이제 stale.
        updateInquiry(inquiryId, "수정된 제목", "수정된 내용", HttpStatus.NO_CONTENT);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body("""
                    { "status": "IN_PROGRESS", "version": %d }
                    """.formatted(staleVersion))
            .when()
                .patch("/api/v1/admin/federation/inquiries/" + inquiryId + "/status")
            .then()
                .statusCode(HttpStatus.CONFLICT.value());

        Long freshVersion = adminDetailVersion(inquiryId);
        transitionToInProgress(inquiryId, freshVersion);
    }

    @Test
    @DisplayName("답변중 상태로의 전이를 다시 요청해도 멱등하게 204를 받는다")
    void inProgressTransitionIsIdempotent() {
        Long inquiryId = createInquiry(studentToken, "제목", "내용");
        Long version = adminDetailVersion(inquiryId);
        transitionToInProgress(inquiryId, version);

        // 이미 IN_PROGRESS 인 상태에서 재요청 — 버전이 stale 해도 쓰기 전 조기 반환이라 통과한다.
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body("""
                    { "status": "IN_PROGRESS", "version": %d }
                    """.formatted(version))
            .when()
                .patch("/api/v1/admin/federation/inquiries/" + inquiryId + "/status")
            .then()
                .statusCode(HttpStatus.NO_CONTENT.value());
    }

    @Test
    @DisplayName("답변이 등록되면 문의가 답변완료로 전환되고 작성자에게 답변 알림이 발송된다")
    void answerFlowMarksAnsweredAndNotifies() {
        Long inquiryId = createInquiry(studentToken, "제목", "내용");
        Long version = adminDetailVersion(inquiryId);
        transitionToInProgress(inquiryId, version);

        answerInquiry(inquiryId, "정산은 다음 주까지 완료됩니다.");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
            .when()
                .get("/api/v1/federation/inquiries/" + inquiryId)
            .then()
                .statusCode(HttpStatus.OK.value())
                .body("data.status", equalTo("ANSWERED"))
                .body("data.answer.content", equalTo("정산은 다음 주까지 완료됩니다."));

        boolean studentNotified = notificationRepository.findAll().stream()
                .anyMatch(notification -> notification.getUserId().equals(studentId)
                        && notification.getType() == NotificationType.FEDERATION_INQUIRY_ANSWERED);
        assertThat(studentNotified).isTrue();
    }

    @Test
    @DisplayName("접수 상태에서 버전 없이 바로 답변하면 409를 받고, 최신 버전을 담으면 성공한다")
    void directAnswerFromReceivedRequiresVersionEcho() {
        Long inquiryId = createInquiry(studentToken, "제목", "내용");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body("""
                    { "content": "답변 내용" }
                    """)
            .when()
                .post("/api/v1/admin/federation/inquiries/" + inquiryId + "/answer")
            .then()
                .statusCode(HttpStatus.CONFLICT.value());

        answerInquiry(inquiryId, "답변 내용");
    }

    @Test
    @DisplayName("이미 답변이 등록된 문의에 다시 답변하면 409를 받는다")
    void secondAnswerRejected() {
        Long inquiryId = createInquiry(studentToken, "제목", "내용");
        answerInquiry(inquiryId, "첫 답변");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body("""
                    { "content": "두 번째 답변" }
                    """)
            .when()
                .post("/api/v1/admin/federation/inquiries/" + inquiryId + "/answer")
            .then()
                .statusCode(HttpStatus.CONFLICT.value());
    }

    @Test
    @DisplayName("답변 수정은 답변완료 상태에서만 가능하며, 종료 후에는 409를 받는다")
    void answerUpdateOnlyWhenAnswered() {
        Long inquiryId = createInquiry(studentToken, "제목", "내용");
        answerInquiry(inquiryId, "원래 답변");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body("""
                    { "content": "수정된 답변" }
                    """)
            .when()
                .patch("/api/v1/admin/federation/inquiries/" + inquiryId + "/answer")
            .then()
                .statusCode(HttpStatus.NO_CONTENT.value());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body("""
                    { "status": "CLOSED" }
                    """)
            .when()
                .patch("/api/v1/admin/federation/inquiries/" + inquiryId + "/status")
            .then()
                .statusCode(HttpStatus.NO_CONTENT.value());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body("""
                    { "content": "종료 후 수정 시도" }
                    """)
            .when()
                .patch("/api/v1/admin/federation/inquiries/" + inquiryId + "/answer")
            .then()
                .statusCode(HttpStatus.CONFLICT.value());
    }

    @Test
    @DisplayName("답변 없이 문의를 종료하면 종료 사유가 기록되고 작성자에게 종료 알림이 발송된다")
    void closeWithoutAnswerNotifiesAuthor() {
        Long inquiryId = createInquiry(studentToken, "제목", "내용");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body("""
                    { "status": "CLOSED", "closedReason": "중복 문의" }
                    """)
            .when()
                .patch("/api/v1/admin/federation/inquiries/" + inquiryId + "/status")
            .then()
                .statusCode(HttpStatus.NO_CONTENT.value());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
            .when()
                .get("/api/v1/federation/inquiries/" + inquiryId)
            .then()
                .statusCode(HttpStatus.OK.value())
                .body("data.closedReason", equalTo("중복 문의"));

        boolean studentNotified = notificationRepository.findAll().stream()
                .anyMatch(notification -> notification.getUserId().equals(studentId)
                        && notification.getType() == NotificationType.FEDERATION_INQUIRY_CLOSED);
        assertThat(studentNotified).isTrue();
    }

    @Test
    @DisplayName("작성자는 언제든 문의를 삭제할 수 있고, 삭제 후 관리자 상세 조회는 410을 받는다")
    void authorDeletesAnytimeAndAdminSees410() {
        Long inquiryId = createInquiry(studentToken, "제목", "내용");
        answerInquiry(inquiryId, "답변 내용");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
            .when()
                .delete("/api/v1/federation/inquiries/" + inquiryId)
            .then()
                .statusCode(HttpStatus.NO_CONTENT.value());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
            .when()
                .get("/api/v1/federation/inquiries/" + inquiryId)
            .then()
                .statusCode(HttpStatus.NOT_FOUND.value());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
            .when()
                .get("/api/v1/admin/federation/inquiries/" + inquiryId)
            .then()
                .statusCode(HttpStatus.GONE.value());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
            .when()
                .get("/api/v1/admin/federation/inquiries")
            .then()
                .statusCode(HttpStatus.OK.value())
                .body("data.content.find { it.id == %d }".formatted(inquiryId), nullValue());
    }

    @Test
    @DisplayName("접수 상태 문의가 5건이면 6번째 문의 등록은 409를 받는다")
    void openInquiryFloodGuard() {
        // 도배 가드 (a) 검증이 목적이라 알림 발행 없는 리포지토리 직접 시딩을 사용한다(24h 가드는 별개 (b)).
        for (int i = 0; i < 5; i++) {
            federationInquiryRepository.save(FederationInquiry.create(studentId, "문의 " + i, "내용 " + i));
        }

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .contentType(ContentType.JSON)
                .body("""
                    { "title": "여섯 번째 문의", "content": "여섯 번째 문의 내용" }
                    """)
            .when()
                .post("/api/v1/federation/inquiries")
            .then()
                .statusCode(HttpStatus.CONFLICT.value());
    }

    @Test
    @DisplayName("STUDENT가 관리자용 문의 API에 접근하면 403을 받는다")
    void studentBlockedOnAdminEndpoints() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
            .when()
                .get("/api/v1/admin/federation/inquiries")
            .then()
                .statusCode(HttpStatus.FORBIDDEN.value());
    }

    // ---- helpers ----

    private Long createInquiry(String token, String title, String content) {
        return RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .contentType(ContentType.JSON)
                .body("""
                    { "title": "%s", "content": "%s" }
                    """.formatted(title, content))
            .when()
                .post("/api/v1/federation/inquiries")
            .then()
                .statusCode(HttpStatus.CREATED.value())
                .extract().jsonPath().getLong("data");
    }

    private void updateInquiry(Long inquiryId, String title, String content, HttpStatus expectedStatus) {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .contentType(ContentType.JSON)
                .body("""
                    { "title": "%s", "content": "%s" }
                    """.formatted(title, content))
            .when()
                .patch("/api/v1/federation/inquiries/" + inquiryId)
            .then()
                .statusCode(expectedStatus.value());
    }

    private Long adminDetailVersion(Long inquiryId) {
        return RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
            .when()
                .get("/api/v1/admin/federation/inquiries/" + inquiryId)
            .then()
                .statusCode(HttpStatus.OK.value())
                .extract().jsonPath().getLong("data.version");
    }

    private void transitionToInProgress(Long inquiryId, Long version) {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body("""
                    { "status": "IN_PROGRESS", "version": %d }
                    """.formatted(version))
            .when()
                .patch("/api/v1/admin/federation/inquiries/" + inquiryId + "/status")
            .then()
                .statusCode(HttpStatus.NO_CONTENT.value());
    }

    // RECEIVED 에서는 version echo 가 필수, IN_PROGRESS 에서는 무시되므로 매번 최신 버전을 함께 보낸다.
    private Long answerInquiry(Long inquiryId, String content) {
        Long version = adminDetailVersion(inquiryId);
        return RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body("""
                    { "content": "%s", "version": %d }
                    """.formatted(content, version))
            .when()
                .post("/api/v1/admin/federation/inquiries/" + inquiryId + "/answer")
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
