package com.duing.domain.club.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubaudit.entity.ClubAuditEvent;
import com.duing.domain.clubaudit.entity.ClubAuditEventType;
import com.duing.domain.clubaudit.repository.ClubAuditEventRepository;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import java.lang.reflect.Field;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
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
 * 기본 확보 시간 대상 토글 인수 테스트 — 권한(익명 401·STUDENT 403)·204·감사 기록·no-op 무기록·404.
 * 토큰 발급·헬퍼 패턴은 {@code AdminClubStatusAndCentralClubControllerTest} 를 그대로 따른다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AdminClubSecuredTargetAcceptanceTest extends IntegrationTestBase {

    private static final String PATH = "/api/v1/admin/clubs/{clubId}/facility-secured-time-target";

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubAuditEventRepository clubAuditEventRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private User adminUser;
    private String adminToken;
    private String studentToken;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        adminUser = saveUser("총동연관리자", UserRole.ADMIN);
        User studentUser = saveUser("학생사용자", UserRole.STUDENT);
        adminToken = jwtTokenProvider.createToken(adminUser.getId(), adminUser.getRole().name());
        studentToken = jwtTokenProvider.createToken(studentUser.getId(), studentUser.getRole().name());
    }

    @Test
    @DisplayName("익명은 401, 일반 사용자는 403 으로 거부된다 — 기본 확보 시간 대상 변경은 총동연 전용이다")
    void anonymousIs401AndStudentIs403() throws Exception {
        Club club = saveActiveClub("권한거부확보클럽");

        RestAssured.given()
                .contentType(ContentType.JSON)
                .body(Map.of("facilitySecuredTimeTarget", true))
                .when().patch(PATH, club.getId())
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .contentType(ContentType.JSON)
                .body(Map.of("facilitySecuredTimeTarget", true))
                .when().patch(PATH, club.getId())
                .then().statusCode(HttpStatus.FORBIDDEN.value());

        assertThat(clubRepository.findById(club.getId()).orElseThrow().isFacilitySecuredTimeTarget()).isFalse();
    }

    @Test
    @DisplayName("ADMIN 이 대상 여부를 변경하면 204 와 함께 플래그가 저장되고 before/after 감사 이벤트가 남는다")
    void adminTogglePersistsFlagAndWritesAudit() throws Exception {
        Club club = saveActiveClub("확보대상클럽");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body(Map.of("facilitySecuredTimeTarget", true))
                .when().patch(PATH, club.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        assertThat(clubRepository.findById(club.getId()).orElseThrow().isFacilitySecuredTimeTarget()).isTrue();
        List<ClubAuditEvent> auditEvents = securedTargetEvents(club.getId());
        assertThat(auditEvents).hasSize(1);
        assertThat(auditEvents.get(0).getActorUserId()).isEqualTo(adminUser.getId());
        // JSONB 는 재직렬화되며 키 정렬·공백이 붙는다 — 형식 무관하게 키·값 쌍만 단언한다.
        assertThat(auditEvents.get(0).getDetail().replace(" ", ""))
                .contains("\"before\":false").contains("\"after\":true");

        // 어드민 목록에도 플래그가 노출된다.
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get("/api/v1/admin/clubs?size=100&keyword=" + club.getName())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content[0].facilitySecuredTimeTarget", equalTo(true));
    }

    @Test
    @DisplayName("이미 같은 값이면 204 멱등 처리하되 감사 이벤트는 추가로 남기지 않는다")
    void noOpToggleDoesNotWriteAudit() throws Exception {
        Club club = saveActiveClub("멱등확보클럽");

        for (int attempt = 0; attempt < 2; attempt++) {
            RestAssured.given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("facilitySecuredTimeTarget", true))
                    .when().patch(PATH, club.getId())
                    .then().statusCode(HttpStatus.NO_CONTENT.value());
        }

        assertThat(securedTargetEvents(club.getId())).hasSize(1); // 두 번째 요청은 no-op — 감사 미기록
    }

    @Test
    @DisplayName("존재하지 않는 동아리는 404, 필드 누락 본문은 400 이다")
    void unknownClubIs404AndMissingFieldIs400() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body(Map.of("facilitySecuredTimeTarget", true))
                .when().patch(PATH, 999_999_999L)
                .then().statusCode(HttpStatus.NOT_FOUND.value());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body(Map.of())
                .when().patch(PATH, 999_999_999L)
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    private List<ClubAuditEvent> securedTargetEvents(Long clubId) {
        return clubAuditEventRepository.findAll().stream()
                .filter(event -> event.getClubId().equals(clubId)
                        && event.getEventType() == ClubAuditEventType.SECURED_TARGET_CHANGED)
                .toList();
    }

    private User saveUser(String name, UserRole role) {
        long unique = sequence.getAndIncrement();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L), name, "hashed", role,
                Grade.FRESHMAN, College.IT_ENGINEERING, "미설정", "010-0000-0000", LocalDateTime.now()));
    }

    private Club saveActiveClub(String name) throws Exception {
        Club created = Club.create(name + "-" + sequence.getAndIncrement(),
                ClubCategory.ACADEMIC, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(created, ClubStatus.ACTIVE);
        return clubRepository.save(created);
    }
}
