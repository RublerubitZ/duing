package com.duing.domain.user.controller;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.user.entity.AdminUserAction;
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
class AdminUserNoteControllerTest extends IntegrationTestBase {

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired AdminUserActionLogRepository actionLogRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private String adminToken;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        adminToken = tokenFor(saveUser("총동연관리자", UserRole.ADMIN));
    }

    @Test
    @DisplayName("관리자 메모를 저장하면 204 가 반환되고 상세 조회에서 다시 읽을 수 있다")
    void saveAndReadBackNote() {
        User target = saveUser("메모대상", UserRole.STUDENT);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType("application/json")
                .body("""
                        {"note":"테스트 계정. 운영 확인 필요."}
                        """)
                .when().put("/api/v1/admin/users/{userId}/admin-note", target.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get("/api/v1/admin/users/{userId}", target.getId())
                .then()
                .body("data.adminNote", Matchers.equalTo("테스트 계정. 운영 확인 필요."))
                // 최종 수정 시각·작업자는 users 컬럼이 아니라 감사 로그에서 파생된다 —
                // 저장이 로그를 남기지 않으면 메모만 남고 이 둘이 영원히 null 이 된다.
                .body("data.adminNoteUpdatedAt", Matchers.notNullValue())
                .body("data.adminNoteUpdatedBy", Matchers.equalTo("총동연관리자"));
    }

    @Test
    @DisplayName("메모를 빈 문자열로 저장하면 메모가 비워지고 그 사실도 감사 로그에 남는다")
    void clearingNoteIsAudited() {
        User target = saveUser("메모삭제", UserRole.STUDENT);
        saveNote(target, "지울 메모");

        saveNote(target, "");

        assertThat(userRepository.findById(target.getId()).orElseThrow().getAdminNote()).isEmpty();
        assertThat(actionLogRepository.findAll())
                .hasSize(2)
                .allMatch(log -> log.getAction() == AdminUserAction.ADMIN_NOTE_UPDATED);
    }

    @Test
    @DisplayName("메모 감사 로그에는 메모 본문을 저장하지 않는다")
    void noteBodyNotCopiedIntoAuditLog() {
        User target = saveUser("본문미복제", UserRole.STUDENT);

        saveNote(target, "민감한 내부 메모");

        assertThat(actionLogRepository.findAll())
                .singleElement()
                .satisfies(log -> assertThat(log.getReason()).isNull());
    }

    @Test
    @DisplayName("같은 내용의 메모를 다시 저장하면 아무 일도 일어나지 않아 감사 로그가 늘지 않는다")
    void unchangedNoteIsNoOp() {
        User target = saveUser("동일메모", UserRole.STUDENT);
        saveNote(target, "변경 없는 메모");

        saveNote(target, "변경 없는 메모");

        // 최종 수정 시각·작업자는 이 로그에서 파생되므로, 로그가 늘지 않는다는 것은
        // 아무것도 고치지 않은 사람이 "최종 수정자" 로 올라서지 않는다는 뜻이기도 하다.
        assertThat(actionLogRepository.findAll())
                .as("내용이 그대로면 감사 이력을 남기지 않아야 한다")
                .hasSize(1);
    }

    @Test
    @DisplayName("메모가 없던 회원에게 빈 문자열을 저장하면 실질 변화가 없어 감사 로그를 남기지 않는다")
    void emptyNoteOnNeverNotedUserIsNoOp() {
        User target = saveUser("메모없음", UserRole.STUDENT);

        saveNote(target, "");

        // 메모 없음(null)과 빈 문자열은 컬럼 값으로는 다르지만 화면에서도 정책에서도 "메모 없음" 하나다.
        // 같은 값으로 보므로 저장도 로그도 일어나지 않고, 컬럼은 NULL 그대로 남는다.
        assertThat(userRepository.findById(target.getId()).orElseThrow().getAdminNote()).isNull();
        assertThat(actionLogRepository.findAll()).isEmpty();
    }

    @Test
    @DisplayName("메모를 null 로 보내면 400 을 반환한다 — 비우려면 빈 문자열을 보내야 한다")
    void nullNoteRejected() {
        User target = saveUser("메모널", UserRole.STUDENT);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType("application/json")
                .body("""
                        {"note":null}
                        """)
                .when().put("/api/v1/admin/users/{userId}/admin-note", target.getId())
                .then().statusCode(HttpStatus.BAD_REQUEST.value());

        // null 을 통과시키면 메모 컬럼이 조용히 NULL 로 덮이고 "비우기" 와 구분할 수 없게 된다.
        assertThat(actionLogRepository.findAll()).isEmpty();
    }

    @Test
    @DisplayName("메모는 1000자까지 저장되고 1001자부터 400 을 반환한다")
    void noteLengthBoundary() {
        User target = saveUser("메모초과", UserRole.STUDENT);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType("application/json")
                .body("{\"note\":\"%s\"}".formatted("가".repeat(1001)))
                .when().put("/api/v1/admin/users/{userId}/admin-note", target.getId())
                .then().statusCode(HttpStatus.BAD_REQUEST.value());

        // 초과 쪽만 보면 상한을 999 로 조여도 1001 자는 여전히 400 이라 오프바이원이 드러나지 않는다.
        // 경계값 자체가 통과하는지를 함께 고정해야 상한이 실제로 1000 임을 붙잡을 수 있다.
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType("application/json")
                .body("{\"note\":\"%s\"}".formatted("가".repeat(1000)))
                .when().put("/api/v1/admin/users/{userId}/admin-note", target.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());
    }

    @Test
    @DisplayName("사용자 본인의 프로필 응답에는 관리자 메모가 담기지 않는다")
    void adminNoteNeverLeaksToUserFacingResponse() {
        User target = saveUser("유출확인", UserRole.STUDENT);
        saveNote(target, "내부 전용 메모");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenFor(target))
                .when().get("/api/v1/users/me")
                .then()
                .statusCode(HttpStatus.OK.value())
                // data 는 JSON 객체라 hasKey 로 봐야 한다 — 목록용 매처를 쓰면 항상 통과하는 공허한 단언이 된다.
                .body("data", Matchers.not(Matchers.hasKey("adminNote")));
    }

    private void saveNote(User target, String note) {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType("application/json")
                .body("{\"note\":\"%s\"}".formatted(note))
                .when().put("/api/v1/admin/users/{userId}/admin-note", target.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());
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
