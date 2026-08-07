package com.duing.domain.fee.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.ClubFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubaudit.entity.ClubAuditEvent;
import com.duing.domain.clubaudit.entity.ClubAuditEventType;
import com.duing.domain.clubaudit.repository.ClubAuditEventRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import io.restassured.path.json.JsonPath;
import io.restassured.response.Response;
import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * 총동연 감사 의견·운영 메모 검증(스펙 §7.10)과 대시보드 활동 요약(스펙 §7.2).
 *
 * <p>의견·메모는 ADMIN 전용 데이터라 동아리 측 진입점이 없고, 상태는 의견에만 있다.
 * 대시보드의 최근 변경 요약은 KST 오늘 자정 이후만 보므로 시드는 전부 "지금" 기준 상대값이다 —
 * 절대 날짜를 박으면 그 날이 지나는 순간 CI 가 깨진다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AdminFeeAuditCommentTest extends IntegrationTestBase {

    private static final String COMMENTS_PATH = "/api/v1/admin/fees/{clubId}/audit-comments";
    private static final String COMMENT_PATH = "/api/v1/admin/fees/{clubId}/audit-comments/{commentId}";
    private static final String DASHBOARD_PATH = "/api/v1/admin/fees/dashboard";

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubAuditEventRepository clubAuditEventRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;
    @Autowired JdbcTemplate jdbcTemplate;

    private String adminToken;
    private Long adminUserId;
    private String adminName;
    private Long auditClubId;
    private Long otherClubId;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;

        User adminUser = userRepository.save(UserFixture.admin());
        adminUserId = adminUser.getId();
        adminName = adminUser.getName();
        adminToken = jwtTokenProvider.createToken(adminUser.getId(), adminUser.getRole().name());

        auditClubId = activeClub("감사의견동아리").getId();
        otherClubId = activeClub("감사비교동아리").getId();
    }

    @Test
    @DisplayName("감사 의견은 상태를 생략하면 진행중(OPEN)으로 시작하고 종류 필터로 메모와 갈라 볼 수 있다")
    void opinionStartsAsOpenWhenStatusOmitted() {
        Long opinionId = createComment(auditClubId, opinion("3월 납부 취소 5건 사유 확인 필요"));
        Long memoId = createComment(auditClubId, memo("작년에도 유사 민원 1건 있었음"));

        JsonPath allComments = getComments(auditClubId);
        assertThat(allComments.getString(commentPath(opinionId) + ".status"))
                .as("의견은 status 를 보내지 않아도 OPEN 이 부여된다")
                .isEqualTo("OPEN");
        assertThat(allComments.getString(commentPath(opinionId) + ".authorName")).isEqualTo(adminName);
        assertThat(allComments.getString(commentPath(opinionId) + ".createdAt")).isNotNull();
        assertThat(allComments.getString(commentPath(memoId) + ".status"))
                .as("운영 메모는 상태를 갖지 않는다")
                .isNull();

        JsonPath onlyOpinions = getComments(auditClubId, "kind", "AUDIT_OPINION");
        assertThat(onlyOpinions.getList("data.commentId", Long.class)).containsExactly(opinionId);
    }

    @Test
    @DisplayName("운영 메모에 처리 상태를 실어 보내면 400 으로 거부된다")
    void memoRejectsStatusOnCreate() {
        Map<String, Object> memoWithStatus = memo("상태를 가질 수 없는 메모");
        memoWithStatus.put("status", "OPEN");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON).body(memoWithStatus)
                .when().post(COMMENTS_PATH, auditClubId)
                .then().statusCode(HttpStatus.BAD_REQUEST.value())
                .body("code", equalTo("FEE_AUDIT_COMMENT_STATUS_NOT_ALLOWED"));

        assertThat(getComments(auditClubId).getList("data")).isEmpty();
    }

    @Test
    @DisplayName("의견은 내용과 상태를 부분 수정할 수 있지만 메모의 상태 수정은 400 이다")
    void patchUpdatesOpinionAndRejectsMemoStatus() {
        Long opinionId = createComment(auditClubId, opinion("확인 필요"));
        Long memoId = createComment(auditClubId, memo("참고 메모"));

        patchComment(auditClubId, opinionId, Map.of("status", "RESOLVED"))
                .then().statusCode(HttpStatus.NO_CONTENT.value());
        patchComment(auditClubId, opinionId, Map.of("content", "회장 유선 확인 완료"))
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        JsonPath comments = getComments(auditClubId);
        assertThat(comments.getString(commentPath(opinionId) + ".status")).isEqualTo("RESOLVED");
        assertThat(comments.getString(commentPath(opinionId) + ".content"))
                .as("상태만 바꾼 요청이 내용을 지우지 않는다")
                .isEqualTo("회장 유선 확인 완료");

        patchComment(auditClubId, memoId, Map.of("status", "IN_REVIEW"))
                .then().statusCode(HttpStatus.BAD_REQUEST.value())
                .body("code", equalTo("FEE_AUDIT_COMMENT_STATUS_NOT_ALLOWED"));
    }

    @Test
    @DisplayName("다른 동아리 경로로 남의 의견을 수정·삭제하려 하면 404 다")
    void commentOfAnotherClubIsNotReachable() {
        Long opinionId = createComment(auditClubId, opinion("남의 동아리 의견"));

        patchComment(otherClubId, opinionId, Map.of("status", "RESOLVED"))
                .then().statusCode(HttpStatus.NOT_FOUND.value())
                .body("code", equalTo("FEE_AUDIT_COMMENT_NOT_FOUND"));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().delete(COMMENT_PATH, otherClubId, opinionId)
                .then().statusCode(HttpStatus.NOT_FOUND.value())
                .body("code", equalTo("FEE_AUDIT_COMMENT_NOT_FOUND"));

        assertThat(getComments(auditClubId).getString(commentPath(opinionId) + ".status"))
                .as("남의 경로로 들어온 수정은 원본을 건드리지 못한다")
                .isEqualTo("OPEN");
    }

    @Test
    @DisplayName("삭제한 의견은 목록에서 사라지고 나머지 의견은 그대로 남는다")
    void deletedCommentDisappearsFromList() {
        Long deletedId = createComment(auditClubId, opinion("삭제할 의견"));
        Long keptId = createComment(auditClubId, opinion("남길 의견"));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().delete(COMMENT_PATH, auditClubId, deletedId)
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        assertThat(getComments(auditClubId).getList("data.commentId", Long.class))
                .containsExactly(keptId);
    }

    @Test
    @DisplayName("대시보드는 열려 있는 의견 수와 오늘의 회비 변경·신규 의견 건수를 함께 내려준다")
    void dashboardSummarizesOpinionsAndTodaysActivity() {
        createComment(auditClubId, opinion("열린 의견"));
        Long resolvedOpinionId = createComment(auditClubId, opinion("처리된 의견"));
        patchComment(auditClubId, resolvedOpinionId, Map.of("status", "RESOLVED"))
                .then().statusCode(HttpStatus.NO_CONTENT.value());
        createComment(auditClubId, memo("메모는 의견이 아니다"));

        clubAuditEventRepository.save(ClubAuditEvent.feePolicy(
                ClubAuditEventType.FEE_POLICY_UPDATED, auditClubId, null, adminUserId, null));
        // 총동연 열람은 아무것도 바꾸지 않는다 — 변경 요약에 섞이면 안 된다.
        clubAuditEventRepository.save(ClubAuditEvent.feeAdminView(auditClubId, adminUserId));

        JsonPath dashboard = RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get(DASHBOARD_PATH)
                .then().statusCode(HttpStatus.OK.value())
                .extract().jsonPath();

        assertThat(dashboard.getLong("data.openOpinionCount"))
                .as("완료된 의견과 메모는 열린 의견에 들지 않는다")
                .isEqualTo(1L);
        assertThat(dashboard.getString("data.recentActivity.since")).isNotNull();
        assertThat(dashboard.getLong("data.recentActivity.eventCounts.FEE_POLICY_UPDATED")).isEqualTo(1L);
        Map<String, Object> eventCounts = dashboard.getMap("data.recentActivity.eventCounts");
        assertThat(eventCounts)
                .as("열람 이벤트는 변경 요약에 실리지 않고, 0 건인 종류는 키 자체가 없다")
                .containsOnlyKeys("FEE_POLICY_UPDATED");
        assertThat(dashboard.getLong("data.recentActivity.newOpinionCount"))
                .as("오늘 생성된 의견만 센다 — 메모는 제외")
                .isEqualTo(2L);
    }

    private Map<String, Object> opinion(String content) {
        Map<String, Object> body = new HashMap<>();
        body.put("kind", "AUDIT_OPINION");
        body.put("content", content);
        return body;
    }

    private Map<String, Object> memo(String content) {
        Map<String, Object> body = new HashMap<>();
        body.put("kind", "OPERATION_MEMO");
        body.put("content", content);
        return body;
    }

    private Long createComment(Long clubId, Map<String, Object> body) {
        return RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON).body(body)
                .when().post(COMMENTS_PATH, clubId)
                .then().statusCode(HttpStatus.CREATED.value())
                .extract().jsonPath().getLong("data");
    }

    private Response patchComment(Long clubId, Long commentId, Map<String, Object> body) {
        return RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON).body(body)
                .when().patch(COMMENT_PATH, clubId, commentId);
    }

    private JsonPath getComments(Long clubId, String... queryParams) {
        var request = RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken);
        for (int index = 0; index < queryParams.length; index += 2) {
            request = request.queryParam(queryParams[index], queryParams[index + 1]);
        }
        return request.when().get(COMMENTS_PATH, clubId)
                .then().statusCode(HttpStatus.OK.value())
                .extract().jsonPath();
    }

    private String commentPath(Long commentId) {
        return "data.find { it.commentId == " + commentId + " }";
    }

    /** ClubFixture 의 기본 상태는 승인 대기라, 감사 대상 스코프(ACTIVE)에 들도록 승격한다. */
    private Club activeClub(String name) {
        Club savedClub = clubRepository.save(ClubFixture.academic(name));
        jdbcTemplate.update("UPDATE club SET status = 'ACTIVE' WHERE id = ?", savedClub.getId());
        return savedClub;
    }
}
