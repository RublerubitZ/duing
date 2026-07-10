package com.duing.domain.federation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.notNullValue;
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
import com.duing.global.file.FileStorageService;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import java.util.stream.Collectors;
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
 * 총동연 1:1 비밀문의 인수 테스트 (P1-PR3) — 스펙 2026-07-04-federation-qna-design.md
 * §4·§5 의 시나리오를 학생·관리자 API 전 구간(등록~답변~종료~삭제·도배 가드)에 걸쳐 고정한다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class FederationInquiryAcceptanceTest extends IntegrationTestBase {

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;
    @Autowired FederationInquiryRepository federationInquiryRepository;
    @Autowired NotificationRepository notificationRepository;
    @Autowired FileStorageService fileStorageService;

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
    @DisplayName("이미 답변중인 문의에 최신 버전으로 전이를 재요청하면 멱등하게 204를 받는다")
    void inProgressTransitionIsIdempotent() {
        Long inquiryId = createInquiry(studentToken, "제목", "내용");
        transitionToInProgress(inquiryId, adminDetailVersion(inquiryId));

        // 전이가 version 을 올리므로(v→v+1) 최신 version 을 재조회해 보낸다 — 최신 화면 검증 후의 멱등 no-op.
        Long latestVersion = adminDetailVersion(inquiryId);
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body("""
                    { "status": "IN_PROGRESS", "version": %d }
                    """.formatted(latestVersion))
            .when()
                .patch("/api/v1/admin/federation/inquiries/" + inquiryId + "/status")
            .then()
                .statusCode(HttpStatus.NO_CONTENT.value());
    }

    @Test
    @DisplayName("이미 답변중인 문의라도 옛 version으로 전환을 요청하면 409로 걸러진다")
    void staleViewCannotJoinInProgress() {
        Long inquiryId = createInquiry(studentToken, "제목", "내용");
        Long staleVersion = adminDetailVersion(inquiryId);

        // 학생이 내용을 수정해 버전을 올린다 — staleVersion 을 쥔 관리자 화면은 옛 내용.
        updateInquiry(inquiryId, "수정된 제목", "수정된 내용", HttpStatus.NO_CONTENT);

        // 다른 관리자가 최신 버전으로 전이에 성공한다(204).
        transitionToInProgress(inquiryId, adminDetailVersion(inquiryId));

        // stale 화면의 관리자가 옛 버전으로 재요청 — 멱등 204 가 아니라 409 로 걸러 refetch 를 유도한다.
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
    }

    @Test
    @DisplayName("IN_PROGRESS 문의를 최신 version으로 되돌리면 204이고 상세가 RECEIVED다")
    void revertToReceivedSucceedsWithFreshVersion() {
        Long inquiryId = createInquiry(studentToken, "제목", "내용");
        transitionToInProgress(inquiryId, adminDetailVersion(inquiryId));

        revertToReceived(inquiryId, adminDetailVersion(inquiryId), HttpStatus.NO_CONTENT);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
            .when()
                .get("/api/v1/admin/federation/inquiries/" + inquiryId)
            .then()
                .statusCode(HttpStatus.OK.value())
                .body("data.status", equalTo("RECEIVED"));
    }

    @Test
    @DisplayName("되돌린 문의는 학생 본인이 다시 수정할 수 있다")
    void authorCanEditAfterRevert() {
        Long inquiryId = createInquiry(studentToken, "제목", "내용");
        transitionToInProgress(inquiryId, adminDetailVersion(inquiryId));

        // IN_PROGRESS 인 동안은 기존 규칙대로 학생 수정이 잠긴다.
        updateInquiry(inquiryId, "잠금 중 수정 시도", "잠금 중 수정 시도 내용", HttpStatus.CONFLICT);

        revertToReceived(inquiryId, adminDetailVersion(inquiryId), HttpStatus.NO_CONTENT);

        // 되돌리기 후에는 영구 잠금이 아니라 다시 수정할 수 있다 — 이 태스크의 핵심 시나리오.
        updateInquiry(inquiryId, "되돌린 후 수정", "되돌린 후 수정된 내용", HttpStatus.NO_CONTENT);
    }

    @Test
    @DisplayName("stale version으로 되돌리면 409다")
    void revertWithStaleVersionReturns409() {
        Long inquiryId = createInquiry(studentToken, "제목", "내용");
        transitionToInProgress(inquiryId, adminDetailVersion(inquiryId));
        Long staleVersion = adminDetailVersion(inquiryId);

        // 다른 관리자가 먼저 되돌렸다가 재진입한다 — 여전히 IN_PROGRESS 이지만 version 은 두 번 올라
        // staleVersion 을 쥔 첫 관리자의 화면은 이제 옛 버전이다.
        revertToReceived(inquiryId, adminDetailVersion(inquiryId), HttpStatus.NO_CONTENT);
        transitionToInProgress(inquiryId, adminDetailVersion(inquiryId));

        revertToReceived(inquiryId, staleVersion, HttpStatus.CONFLICT);
    }

    @Test
    @DisplayName("이미 RECEIVED인 문의를 최신 version으로 되돌리면 204 멱등이다")
    void revertOnAlreadyReceivedIsIdempotent() {
        Long inquiryId = createInquiry(studentToken, "제목", "내용");

        // 관리자가 startProgress 를 거치지 않고도 최신 echo 로 RECEIVED 를 재요청 — 다른 관리자가
        // 먼저 되돌린 경우와 동등하게 멱등 204 로 수렴한다.
        revertToReceived(inquiryId, adminDetailVersion(inquiryId), HttpStatus.NO_CONTENT);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
            .when()
                .get("/api/v1/admin/federation/inquiries/" + inquiryId)
            .then()
                .statusCode(HttpStatus.OK.value())
                .body("data.status", equalTo("RECEIVED"));
    }

    @Test
    @DisplayName("ANSWERED 문의는 RECEIVED로 되돌릴 수 없다")
    void cannotRevertAnsweredInquiry() {
        Long inquiryId = createInquiry(studentToken, "제목", "내용");
        answerInquiry(inquiryId, "답변 내용"); // RECEIVED 직행 답변 — ANSWERED 로 전환

        revertToReceived(inquiryId, adminDetailVersion(inquiryId), HttpStatus.CONFLICT);
    }

    @Test
    @DisplayName("CLOSED 문의는 RECEIVED로 되돌릴 수 없다")
    void cannotRevertClosedInquiry() {
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

        revertToReceived(inquiryId, adminDetailVersion(inquiryId), HttpStatus.CONFLICT);
    }

    @Test
    @DisplayName("되돌리기 후 학생이 수정하면, 옛 version으로의 RECEIVED 직행 답변은 409다")
    void staleDirectAnswerAfterRevertReturns409() {
        Long inquiryId = createInquiry(studentToken, "제목", "내용");
        transitionToInProgress(inquiryId, adminDetailVersion(inquiryId));
        revertToReceived(inquiryId, adminDetailVersion(inquiryId), HttpStatus.NO_CONTENT);

        Long staleVersion = adminDetailVersion(inquiryId);
        updateInquiry(inquiryId, "수정된 제목", "수정된 내용", HttpStatus.NO_CONTENT);

        // 되돌리기 후 학생 수정으로 version 이 올라갔음에도 기존 echo 규칙(RECEIVED 직행은 echo 필수)이
        // 그대로 방어한다 — 역전이 도입이 기존 안전성을 깨지 않았는지 재확인.
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body("""
                    { "content": "답변 내용", "version": %d }
                    """.formatted(staleVersion))
            .when()
                .post("/api/v1/admin/federation/inquiries/" + inquiryId + "/answer")
            .then()
                .statusCode(HttpStatus.CONFLICT.value());
    }

    @Test
    @DisplayName("IN_PROGRESS 답변에 stale version을 제공하면 409다")
    void inProgressAnswerWithStaleVersionReturns409() {
        Long inquiryId = createInquiry(studentToken, "제목", "내용");
        transitionToInProgress(inquiryId, adminDetailVersion(inquiryId));
        Long staleVersion = adminDetailVersion(inquiryId);

        // 다른 관리자가 되돌렸다가 재진입 — 여전히 IN_PROGRESS 이지만 version 은 두 번 올라간다
        // (A 가 답변 작성 중 stale version 을 쥔 채로 남는 신규 조건부 echo 시나리오).
        revertToReceived(inquiryId, adminDetailVersion(inquiryId), HttpStatus.NO_CONTENT);
        transitionToInProgress(inquiryId, adminDetailVersion(inquiryId));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body("""
                    { "content": "답변 내용", "version": %d }
                    """.formatted(staleVersion))
            .when()
                .post("/api/v1/admin/federation/inquiries/" + inquiryId + "/answer")
            .then()
                .statusCode(HttpStatus.CONFLICT.value());
    }

    @Test
    @DisplayName("IN_PROGRESS 답변에 version을 제공하지 않으면 기존대로 성공한다")
    void inProgressAnswerWithoutVersionStillSucceeds() {
        Long inquiryId = createInquiry(studentToken, "제목", "내용");
        transitionToInProgress(inquiryId, adminDetailVersion(inquiryId));

        // 배포된 FE 가 아직 version 을 동봉하지 않는 하위호환 경로 — 미제공은 검증하지 않는다.
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body("""
                    { "content": "답변 내용" }
                    """)
            .when()
                .post("/api/v1/admin/federation/inquiries/" + inquiryId + "/answer")
            .then()
                .statusCode(HttpStatus.CREATED.value());
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
    @DisplayName("접수 상태에서 버전 없이 바로 답변하면 409를 받고, 숫자 버전이 있어도 그 사이 문의가 수정돼 stale 해지면 409를 받으며, 최신 버전을 담으면 성공한다")
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

        // 관리자가 쥔 버전이 숫자로 존재하더라도, 그 사이 학생이 수정해 버전을 올렸다면 stale 이라 409.
        Long staleVersion = adminDetailVersion(inquiryId);
        updateInquiry(inquiryId, "수정된 제목", "수정된 내용", HttpStatus.NO_CONTENT);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body("""
                    { "content": "답변 내용", "version": %d }
                    """.formatted(staleVersion))
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
    @DisplayName("되돌리기 후 학생이 수정한 문의를 옛 version을 제공해 종결하면 409다")
    void closeWithStaleVersionAfterRevertReturns409() {
        Long inquiryId = createInquiry(studentToken, "제목", "내용");
        transitionToInProgress(inquiryId, adminDetailVersion(inquiryId));
        Long staleVersion = adminDetailVersion(inquiryId); // IN_PROGRESS 화면의 관리자가 쥔 버전

        // 다른 관리자가 되돌리고 학생이 수정 — staleVersion 을 쥔 관리자 화면은 이제 옛 내용.
        revertToReceived(inquiryId, staleVersion, HttpStatus.NO_CONTENT);
        updateInquiry(inquiryId, "수정된 제목", "수정된 내용", HttpStatus.NO_CONTENT);

        // 옛 내용 기준의 종결은 조건부 echo 가 409 로 걸러 refetch 를 유도한다.
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body("""
                    { "status": "CLOSED", "closedReason": "처리 완료", "version": %d }
                    """.formatted(staleVersion))
            .when()
                .patch("/api/v1/admin/federation/inquiries/" + inquiryId + "/status")
            .then()
                .statusCode(HttpStatus.CONFLICT.value());
    }

    @Test
    @DisplayName("version을 제공하지 않은 종결은 기존대로 성공한다")
    void closeWithoutVersionStillSucceeds() {
        Long inquiryId = createInquiry(studentToken, "제목", "내용");

        // 배포된 FE 가 종결에 version 을 동봉하기 전까지의 하위호환 경로 — 미제공은 검증하지 않는다.
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
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
            .when()
                .get("/api/v1/admin/federation/inquiries/" + inquiryId)
            .then()
                .statusCode(HttpStatus.OK.value())
                .body("data.status", equalTo("CLOSED"));
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
    @DisplayName("삭제한 문의도 24시간 생성 한도에 포함되어 삭제 후 재작성 루프를 막는다")
    void deletedInquiriesStillCountTowardDailyLimit() {
        for (int i = 0; i < 10; i++) {
            FederationInquiry inquiry = federationInquiryRepository.save(
                    FederationInquiry.create(studentId, "도배 " + i, "내용"));
            federationInquiryRepository.delete(inquiry); // soft delete — native 카운트에는 남는다
        }

        // 열린 RECEIVED 0건이지만 24h 생성 10건 → 가드 (b)가 차단
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .contentType(ContentType.JSON)
                .body("""
                    { "title": "재작성 문의", "content": "재작성 문의 내용" }
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

    @Test
    @DisplayName("첨부 3개로 문의를 등록하면 상세 응답에 id·fileName만 노출되고 원본 URL·저장 키는 노출되지 않는다")
    void createWithAttachmentsExposesOnlyIdAndFileName() {
        String attachmentUrl1 = uploadAttachment(studentToken, "photo1.jpg");
        String attachmentUrl2 = uploadAttachment(studentToken, "photo2.jpg");
        String attachmentUrl3 = uploadAttachment(studentToken, "photo3.jpg");
        // 업로드 응답 URL 에서 실제 storageKey 3개를 모두 파생시켜, 상세 응답 body 어디에도 이 값이
        // 그대로 노출되지 않는지를 검증한다 — 테스트 스토리지 prefix 가 애초에 "http" 를 만들지 않아
        // 항상 통과하던 장식용 not(containsString("http")) 단언을 실질적인 값 기반 단언으로 교체.
        String storageKey1 = fileStorageService.toStorageKey(attachmentUrl1);
        String storageKey2 = fileStorageService.toStorageKey(attachmentUrl2);
        String storageKey3 = fileStorageService.toStorageKey(attachmentUrl3);

        Long inquiryId = createInquiryWithAttachments(studentToken, "첨부 문의", "사진 첨부합니다.",
                List.of(attachmentUrl1, attachmentUrl2, attachmentUrl3));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
            .when()
                .get("/api/v1/federation/inquiries/" + inquiryId)
            .then()
                .statusCode(HttpStatus.OK.value())
                .body("data.attachments.size()", equalTo(3))
                .body("data.attachments[0].id", notNullValue())
                .body("data.attachments[0].fileName", notNullValue())
                .body("data.attachments[0].contentType", equalTo("image/jpeg"))
                .body(not(Matchers.containsString(storageKey1)))
                .body(not(Matchers.containsString(storageKey2)))
                .body(not(Matchers.containsString(storageKey3)));
    }

    @Test
    @DisplayName("첨부가 5개를 초과하면 400을 받는다")
    void rejectsMoreThanFiveAttachments() {
        List<String> attachmentUrls = new ArrayList<>();
        for (int i = 0; i < 6; i++) {
            attachmentUrls.add(uploadAttachment(studentToken, "over" + i + ".jpg"));
        }

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .contentType(ContentType.JSON)
                .body("""
                    { "title": "제목", "content": "내용", "attachmentUrls": %s }
                    """.formatted(toJsonArray(attachmentUrls)))
            .when()
                .post("/api/v1/federation/inquiries")
            .then()
                .statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("총동연 문의 목적이 아닌 URL을 첨부로 보내면 400을 받는다")
    void rejectsAttachmentUrlFromOtherPurpose() {
        String clubLogoUrl = RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .multiPart("file", "logo.jpg", jpegBytesOfSize(1024), "image/jpeg")
                .queryParam("purpose", "LOGO")
            .when()
                .post("/api/v1/files")
            .then()
                .statusCode(HttpStatus.CREATED.value())
                .extract().jsonPath().getString("data.url");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .contentType(ContentType.JSON)
                .body("""
                    { "title": "제목", "content": "내용", "attachmentUrls": ["%s"] }
                    """.formatted(clubLogoUrl))
            .when()
                .post("/api/v1/federation/inquiries")
            .then()
                .statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("federation/inquiry 프리픽스이지만 스토리지에 실체가 없는 위조 키는 400을 받는다")
    void rejectsAttachmentUrlWhenStorageObjectDoesNotExist() {
        // 실제 업로드를 거치지 않고 prefix 만 맞춘 URL — StubFileStorageService.sizeOf 가 null 을
        // 반환하는 sentinel(__missing__)을 심어 "존재하지 않는 키" 분기를 검증한다.
        String forgedUrl = "/files/stub/federation/inquiry/__missing__.jpg";

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .contentType(ContentType.JSON)
                .body("""
                    { "title": "제목", "content": "내용", "attachmentUrls": ["%s"] }
                    """.formatted(forgedUrl))
            .when()
                .post("/api/v1/federation/inquiries")
            .then()
                .statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("첨부 URL에 \"..\" 경로 탈출 세그먼트가 섞여 있으면 400을 받는다")
    void rejectsAttachmentUrlWithPathTraversalSegment() {
        // prefix(federation/inquiry/)는 통과하지만 "../../" 로 다른 purpose 디렉터리를 가리키려는 위조 키.
        String traversalUrl = "/files/stub/federation/inquiry/../../club/logo/x.jpg";

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .contentType(ContentType.JSON)
                .body("""
                    { "title": "제목", "content": "내용", "attachmentUrls": ["%s"] }
                    """.formatted(traversalUrl))
            .when()
                .post("/api/v1/federation/inquiries")
            .then()
                .statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("접수 상태에서 첨부를 빈 배열로 수정하면 비워지고, 이후 새 배열로 수정하면 전체 교체된다")
    void receivedUpdateClearsThenReplacesAttachments() {
        String attachmentUrl1 = uploadAttachment(studentToken, "before1.jpg");
        String attachmentUrl2 = uploadAttachment(studentToken, "before2.jpg");
        Long inquiryId = createInquiryWithAttachments(
                studentToken, "제목", "내용", List.of(attachmentUrl1, attachmentUrl2));

        updateInquiryWithAttachments(inquiryId, "제목", "내용", List.of(), HttpStatus.NO_CONTENT);
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
            .when()
                .get("/api/v1/federation/inquiries/" + inquiryId)
            .then()
                .statusCode(HttpStatus.OK.value())
                .body("data.attachments.size()", equalTo(0));

        String attachmentUrl3 = uploadAttachment(studentToken, "after1.jpg");
        updateInquiryWithAttachments(inquiryId, "제목", "내용", List.of(attachmentUrl3), HttpStatus.NO_CONTENT);
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
            .when()
                .get("/api/v1/federation/inquiries/" + inquiryId)
            .then()
                .statusCode(HttpStatus.OK.value())
                .body("data.attachments.size()", equalTo(1));
    }

    @Test
    @DisplayName("첨부 [A,B]로 생성 후 [A,C]로 부분 겹침 교체하면 첨부가 2개로 유지되고, A는 교체 후에도 다운로드된다")
    void partialOverlapReplaceKeepsSharedAttachmentDownloadable() {
        String attachmentUrlA = uploadAttachment(studentToken, "a.jpg");
        String attachmentUrlB = uploadAttachment(studentToken, "b.jpg");
        Long inquiryId = createInquiryWithAttachments(
                studentToken, "제목", "내용", List.of(attachmentUrlA, attachmentUrlB));

        String attachmentUrlC = uploadAttachment(studentToken, "c.jpg");
        updateInquiryWithAttachments(
                inquiryId, "제목", "내용", List.of(attachmentUrlA, attachmentUrlC), HttpStatus.NO_CONTENT);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
            .when()
                .get("/api/v1/federation/inquiries/" + inquiryId)
            .then()
                .statusCode(HttpStatus.OK.value())
                .body("data.attachments.size()", equalTo(2))
                // sortOrder 는 교체 요청 배열 순서([A, C])를 그대로 반영한다(buildAttachments 의
                // index 기반 sortOrder·라벨 회귀 고정).
                .body("data.attachments[0].fileName", equalTo("첨부 이미지 1"))
                .body("data.attachments[1].fileName", equalTo("첨부 이미지 2"));

        // 교체 후 attachments[0]은 A를 가리키는 새 행(같은 storageKey, 새 id)이다 — 재사용된
        // storageKey 가 교체 후에도 정상 서빙되는지 회귀 고정(낙관락 충돌로 인한 롤백 시나리오까지는
        // 동시성 재현이 필요해 별도 — 이 테스트는 정상 경로에서 물리 삭제가 실행되지 않음을 확인한다).
        Long attachmentIdA = firstAttachmentId(studentToken, inquiryId);
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
            .when()
                .get("/api/v1/federation/inquiries/" + inquiryId + "/attachments/" + attachmentIdA)
            .then()
                .statusCode(HttpStatus.OK.value())
                .contentType("image/jpeg");
    }

    @Test
    @DisplayName("attachmentUrls 없이 수정하면 기존 첨부가 유지된다")
    void updateWithoutAttachmentUrlsKeepsExistingAttachments() {
        String attachmentUrl = uploadAttachment(studentToken, "keep1.jpg");
        Long inquiryId = createInquiryWithAttachments(studentToken, "제목", "내용", List.of(attachmentUrl));

        // 기존 updateInquiry 헬퍼는 attachmentUrls 필드 자체를 담지 않는다 — null=유지 검증.
        updateInquiry(inquiryId, "수정된 제목", "수정된 내용", HttpStatus.NO_CONTENT);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
            .when()
                .get("/api/v1/federation/inquiries/" + inquiryId)
            .then()
                .statusCode(HttpStatus.OK.value())
                .body("data.attachments.size()", equalTo(1));
    }

    @Test
    @DisplayName("작성자는 첨부를 다운로드할 수 있고 Content-Type·Content-Length·Cache-Control·nosniff·RFC 5987 파일명 헤더가 함께 내려온다")
    void authorDownloadsOwnAttachment() {
        String attachmentUrl = uploadAttachment(studentToken, "photo1.jpg");
        Long inquiryId = createInquiryWithAttachments(studentToken, "제목", "내용", List.of(attachmentUrl));
        Long attachmentId = firstAttachmentId(studentToken, inquiryId);
        // StubFileStorageService.download 는 "stub-file-content:" + storageKey 바이트를 흘려보낸다 —
        // 실제 Content-Length 를 이 값에서 파생시켜 하드코딩 없이 정확한 기대치로 고정한다.
        String storageKey = fileStorageService.toStorageKey(attachmentUrl);
        int expectedContentLength = ("stub-file-content:" + storageKey).getBytes(StandardCharsets.UTF_8).length;

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
            .when()
                .get("/api/v1/federation/inquiries/" + inquiryId + "/attachments/" + attachmentId)
            .then()
                .statusCode(HttpStatus.OK.value())
                .contentType("image/jpeg")
                .header(HttpHeaders.CONTENT_LENGTH, equalTo(String.valueOf(expectedContentLength)))
                .header(HttpHeaders.CACHE_CONTROL, equalTo("private, max-age=300"))
                .header("X-Content-Type-Options", equalTo("nosniff"))
                // 서버 생성 파일명("첨부 이미지 1")이 RFC 5987 percent-encoding 으로 실린다 —
                // 공백이 '+' 가 아닌 %20 으로 인코딩되는지까지 회귀 고정(URLEncoder 함정).
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        equalTo("inline; filename*=UTF-8''%EC%B2%A8%EB%B6%80%20%EC%9D%B4%EB%AF%B8%EC%A7%80%201"));
    }

    @Test
    @DisplayName("본인 문의의 URL에 다른 문의 소속 첨부 id를 끼워 넣으면 404를 받는다")
    void attachmentIdFromAnotherInquiryReturns404() {
        // 문의 A(첨부 없음)와 문의 B(첨부 1개) 모두 같은 학생 소유 — 소유권 검증은 통과하지만
        // 첨부가 문의 A 소속이 아니므로 inquiryId 매칭 실패로 404(IDOR 방어 회귀 고정).
        Long inquiryIdWithoutAttachment = createInquiry(studentToken, "문의 A", "첨부 없는 문의");
        String attachmentUrl = uploadAttachment(studentToken, "photo1.jpg");
        Long inquiryIdWithAttachment = createInquiryWithAttachments(
                studentToken, "문의 B", "첨부 있는 문의", List.of(attachmentUrl));
        Long otherInquiryAttachmentId = firstAttachmentId(studentToken, inquiryIdWithAttachment);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
            .when()
                .get("/api/v1/federation/inquiries/" + inquiryIdWithoutAttachment
                        + "/attachments/" + otherInquiryAttachmentId)
            .then()
                .statusCode(HttpStatus.NOT_FOUND.value());
    }

    @Test
    @DisplayName("ADMIN 은 학생이 작성한 문의의 첨부도 다운로드할 수 있다")
    void adminDownloadsOthersAttachment() {
        String attachmentUrl = uploadAttachment(studentToken, "photo1.jpg");
        Long inquiryId = createInquiryWithAttachments(studentToken, "제목", "내용", List.of(attachmentUrl));
        Long attachmentId = firstAttachmentId(studentToken, inquiryId);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
            .when()
                .get("/api/v1/federation/inquiries/" + inquiryId + "/attachments/" + attachmentId)
            .then()
                .statusCode(HttpStatus.OK.value())
                .contentType("image/jpeg");
    }

    @Test
    @DisplayName("다른 학생은 문의 첨부에 접근할 수 없고 404를 받는다")
    void otherStudentCannotDownloadAttachment() {
        String attachmentUrl = uploadAttachment(studentToken, "photo1.jpg");
        Long inquiryId = createInquiryWithAttachments(studentToken, "제목", "내용", List.of(attachmentUrl));
        Long attachmentId = firstAttachmentId(studentToken, inquiryId);
        User otherStudent = saveUser(UserRole.STUDENT);
        String otherStudentToken = jwtTokenProvider.createToken(otherStudent.getId(), otherStudent.getRole().name());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + otherStudentToken)
            .when()
                .get("/api/v1/federation/inquiries/" + inquiryId + "/attachments/" + attachmentId)
            .then()
                .statusCode(HttpStatus.NOT_FOUND.value());
    }

    @Test
    @DisplayName("비로그인 사용자는 문의 첨부를 다운로드할 수 없고 401을 받는다")
    void anonymousCannotDownloadAttachment() {
        String attachmentUrl = uploadAttachment(studentToken, "photo1.jpg");
        Long inquiryId = createInquiryWithAttachments(studentToken, "제목", "내용", List.of(attachmentUrl));
        Long attachmentId = firstAttachmentId(studentToken, inquiryId);

        RestAssured.given()
            .when()
                .get("/api/v1/federation/inquiries/" + inquiryId + "/attachments/" + attachmentId)
            .then()
                .statusCode(HttpStatus.UNAUTHORIZED.value());
    }

    @Test
    @DisplayName("문의를 삭제하면 작성자도 남아 있던 첨부를 더 이상 다운로드할 수 없고 404를 받는다")
    void deletedInquiryAttachmentDownloadReturns404() {
        String attachmentUrl = uploadAttachment(studentToken, "photo1.jpg");
        Long inquiryId = createInquiryWithAttachments(studentToken, "제목", "내용", List.of(attachmentUrl));
        Long attachmentId = firstAttachmentId(studentToken, inquiryId);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
            .when()
                .delete("/api/v1/federation/inquiries/" + inquiryId)
            .then()
                .statusCode(HttpStatus.NO_CONTENT.value());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
            .when()
                .get("/api/v1/federation/inquiries/" + inquiryId + "/attachments/" + attachmentId)
            .then()
                .statusCode(HttpStatus.NOT_FOUND.value());
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

    private Long createInquiryWithAttachments(String token, String title, String content, List<String> attachmentUrls) {
        return RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .contentType(ContentType.JSON)
                .body("""
                    { "title": "%s", "content": "%s", "attachmentUrls": %s }
                    """.formatted(title, content, toJsonArray(attachmentUrls)))
            .when()
                .post("/api/v1/federation/inquiries")
            .then()
                .statusCode(HttpStatus.CREATED.value())
                .extract().jsonPath().getLong("data");
    }

    private void updateInquiryWithAttachments(
            Long inquiryId, String title, String content, List<String> attachmentUrls, HttpStatus expectedStatus) {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .contentType(ContentType.JSON)
                .body("""
                    { "title": "%s", "content": "%s", "attachmentUrls": %s }
                    """.formatted(title, content, toJsonArray(attachmentUrls)))
            .when()
                .patch("/api/v1/federation/inquiries/" + inquiryId)
            .then()
                .statusCode(expectedStatus.value());
    }

    private String toJsonArray(List<String> values) {
        return values.stream().map(value -> "\"" + value + "\"").collect(Collectors.joining(",", "[", "]"));
    }

    // 파일 업로드 API(POST /api/v1/files)를 실제로 호출해 첨부 URL을 발급받는다 — FileApiTest 전례.
    private String uploadAttachment(String token, String filename) {
        return RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .multiPart("file", filename, jpegBytesOfSize(1024), "image/jpeg")
                .queryParam("purpose", "FEDERATION_INQUIRY")
            .when()
                .post("/api/v1/files")
            .then()
                .statusCode(HttpStatus.CREATED.value())
                .extract().jsonPath().getString("data.url");
    }

    // 유효한 JPEG 매직 바이트(FF D8 FF)로 시작하는 더미 이미지 — 매직 바이트 검증을 통과한다.
    private byte[] jpegBytesOfSize(int size) {
        byte[] bytes = new byte[size];
        bytes[0] = (byte) 0xFF;
        bytes[1] = (byte) 0xD8;
        bytes[2] = (byte) 0xFF;
        return bytes;
    }

    private Long firstAttachmentId(String token, Long inquiryId) {
        return RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
            .when()
                .get("/api/v1/federation/inquiries/" + inquiryId)
            .then()
                .statusCode(HttpStatus.OK.value())
                .extract().jsonPath().getLong("data.attachments[0].id");
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

    private void revertToReceived(Long inquiryId, Long version, HttpStatus expectedStatus) {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body("""
                    { "status": "RECEIVED", "version": %d }
                    """.formatted(version))
            .when()
                .patch("/api/v1/admin/federation/inquiries/" + inquiryId + "/status")
            .then()
                .statusCode(expectedStatus.value());
    }

    // RECEIVED 에서는 version echo 가 필수, IN_PROGRESS 에서는 제공 시에만 검증되므로(조건부 echo)
    // 항상 최신 버전을 함께 보내 두 상태 모두에서 안전하게 통과시킨다.
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
                "20" + seq, "테스터" + seq,
                "hashed", role, Grade.FRESHMAN, College.IT_ENGINEERING,
                "미설정", "010-0000-0000", LocalDateTime.now()));
    }
}
