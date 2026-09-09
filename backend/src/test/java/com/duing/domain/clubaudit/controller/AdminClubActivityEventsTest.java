package com.duing.domain.clubaudit.controller;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.ClubFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubaudit.entity.ClubAuditEvent;
import com.duing.domain.clubaudit.entity.ClubAuditEventType;
import com.duing.domain.clubaudit.repository.ClubAuditEventRepository;
import com.duing.domain.clubaudit.support.AuditDetailJson;
import com.duing.domain.joincode.entity.ClubJoinCode;
import com.duing.domain.joincode.repository.ClubJoinCodeRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import io.restassured.path.json.JsonPath;
import java.time.Clock;
import java.time.LocalDateTime;
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

/**
 * 총동연 동아리 활동 이력 조회(활동 이력 스펙 §2.3). 이벤트는 계측 팩토리로 직접 시드한다 —
 * 계측이 남기는지는 각 계측 테스트 소관이고, 여기서 볼 것은 허용 5종만 잘라 내려주느냐다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AdminClubActivityEventsTest extends IntegrationTestBase {

    private static final String EVENTS_PATH = "/api/v1/admin/clubs/{clubId}/activity-events";

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubAuditEventRepository clubAuditEventRepository;
    @Autowired ClubJoinCodeRepository clubJoinCodeRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;
    /** 초대 링크 만료 시각은 프로덕션과 같은 seoulClock 으로 만든다(시스템 존으로 찍으면 KST 로 해석돼 −9h). */
    @Autowired Clock clock;

    private String adminToken;
    private String studentToken;
    private Long clubId;
    private Long adminId;
    private Long statusEventId;
    private Long inviteCreatedEventId;
    private Long revokedInviteLinkEventId;
    private Long forceRevokedEventId;
    private Long forceRevokedJoinCodeId;
    private Long closedEventId;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        User admin = userRepository.save(UserFixture.admin());
        User student = userRepository.save(UserFixture.unique());
        adminToken = jwtTokenProvider.createToken(admin.getId(), admin.getRole().name());
        studentToken = jwtTokenProvider.createToken(student.getId(), student.getRole().name());
        adminId = admin.getId();

        Club club = clubRepository.save(ClubFixture.academic("활동이력동아리"));
        Club otherClub = clubRepository.save(ClubFixture.academic("다른동아리"));
        clubId = club.getId();
        User leader = userRepository.save(UserFixture.withName("이운영"));
        User withdrawnLeader = userRepository.save(UserFixture.withName("탈퇴운영진"));

        statusEventId = save(ClubAuditEvent.clubStatusChanged(clubId, adminId, "서류 미비",
                AuditDetailJson.of(Map.of("from", "PENDING_APPROVAL", "to", "REJECTED"))));
        inviteCreatedEventId = save(ClubAuditEvent.joinLink(ClubAuditEventType.JOIN_LINK_CREATED, clubId,
                null, null, leader.getId(), AuditDetailJson.of(Map.of(
                        "linkType", "CLUB_INVITE", "autoApprove", true, "maxUses", 30,
                        "expiresAt", "2026-09-11T05:00:00Z"))));
        revokedInviteLinkEventId = save(ClubAuditEvent.joinLink(ClubAuditEventType.JOIN_LINK_REVOKED, clubId,
                null, null, withdrawnLeader.getId()));
        userRepository.delete(withdrawnLeader);
        // 감사 행의 join_code_id 는 실제 링크를 가리키는 FK 라 링크를 먼저 만든다(초대 링크는 모집이 필요 없다).
        forceRevokedJoinCodeId = clubJoinCodeRepository.save(ClubJoinCode.issueClubInvite(
                club, "TQ%04d".formatted(System.nanoTime() % 10_000), null, 10,
                LocalDateTime.now(clock).plusHours(24), false, leader.getId())).getId();
        forceRevokedEventId = save(ClubAuditEvent.adminJoinLinkForceRevoke(
                clubId, null, forceRevokedJoinCodeId, adminId, "링크 유출 신고"));
        closedEventId = save(ClubAuditEvent.clubClosed(clubId, adminId, "활동 중단 장기화"));

        // 허용 밖 종류(회비·가입 요청)와 다른 동아리의 허용 종류 — 어느 것도 응답에 섞이면 안 된다.
        save(ClubAuditEvent.feeAccount(ClubAuditEventType.FEE_ACCOUNT_REGISTERED, clubId, leader.getId(), null));
        save(ClubAuditEvent.joinRequest(ClubAuditEventType.JOIN_REQUEST_CREATED, clubId, null, null, null, leader.getId()));
        save(ClubAuditEvent.clubClosed(otherClub.getId(), adminId, "다른 동아리"));
    }

    @Test
    @DisplayName("학생 토큰은 403 이다")
    void studentIsForbidden() {
        RestAssured.given().header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when().get(EVENTS_PATH, clubId)
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("types 미지정이면 허용 6종만 최신순으로, 행위자 이름·사유·detail 원문을 붙여 내려주고 탈퇴자는 이름만 비운다")
    void listsAllowedTypesLatestFirst() {
        JsonPath response = search();

        assertThat(response.getList("data.content.eventId", Long.class))
                .containsExactly(closedEventId, forceRevokedEventId, revokedInviteLinkEventId,
                        inviteCreatedEventId, statusEventId);
        assertThat(response.getLong("data.totalElements")).isEqualTo(5L);

        assertThat(response.getString(path(statusEventId) + ".eventType")).isEqualTo("CLUB_STATUS_CHANGED");
        assertThat(response.getString(path(statusEventId) + ".reason")).isEqualTo("서류 미비");
        assertThat(response.getString(path(statusEventId) + ".detail.from")).isEqualTo("PENDING_APPROVAL");
        assertThat(response.getString(path(statusEventId) + ".detail.to")).isEqualTo("REJECTED");
        assertThat(response.getLong(path(statusEventId) + ".actorUserId")).isEqualTo(adminId);
        assertThat(response.getString(path(statusEventId) + ".createdAt")).isNotNull();

        assertThat(response.getString(path(inviteCreatedEventId) + ".actorName")).isEqualTo("이운영");
        assertThat(response.getBoolean(path(inviteCreatedEventId) + ".detail.autoApprove")).isTrue();
        assertThat(response.getInt(path(inviteCreatedEventId) + ".detail.maxUses")).isEqualTo(30);
        assertThat(response.getString(path(inviteCreatedEventId) + ".recruitmentId")).isNull();

        assertThat(response.getString(path(revokedInviteLinkEventId) + ".actorName"))
                .as("탈퇴한 행위자는 이름만 비운다").isNull();
        assertThat(response.getString(path(revokedInviteLinkEventId) + ".detail")).isNull();

        assertThat(response.getString(path(closedEventId) + ".reason")).isEqualTo("활동 중단 장기화");
    }

    @Test
    @DisplayName("총동연 가입 링크 강제 폐기는 사유와 함께 실리고, 링크 목록의 해당 행을 찾을 joinCodeId 를 함께 내려준다")
    void forceRevokedJoinLinkCarriesReasonAndJoinCodeId() {
        JsonPath response = search("types", "JOIN_LINK_FORCE_REVOKED");

        assertThat(response.getList("data.content.eventId", Long.class))
                .containsExactly(forceRevokedEventId);
        assertThat(response.getString(path(forceRevokedEventId) + ".eventType"))
                .isEqualTo("JOIN_LINK_FORCE_REVOKED");
        assertThat(response.getString(path(forceRevokedEventId) + ".reason")).isEqualTo("링크 유출 신고");
        assertThat(response.getLong(path(forceRevokedEventId) + ".joinCodeId"))
                .as("화면이 이 값으로 가입 링크 목록의 해당 행을 찾는다").isEqualTo(forceRevokedJoinCodeId);
        assertThat(response.getString(path(forceRevokedEventId) + ".recruitmentId"))
                .as("부원 초대 링크는 귀속 모집이 없다").isNull();
        assertThat(response.getLong(path(forceRevokedEventId) + ".actorUserId")).isEqualTo(adminId);
    }

    @Test
    @DisplayName("types 는 허용 집합과 교집합만 조회하고, 전부 허용 밖이면 빈 결과다")
    void typesIntersectWithAllowedSet() {
        JsonPath mixed = search("types", "CLUB_CLOSED", "types", "FEE_POLICY_CREATED");
        assertThat(mixed.getList("data.content.eventId", Long.class)).containsExactly(closedEventId);

        JsonPath statusOnly = search("types", "CLUB_STATUS_CHANGED", "types", "CLUB_CLOSED");
        assertThat(statusOnly.getList("data.content.eventId", Long.class))
                .containsExactly(closedEventId, statusEventId);

        JsonPath outsideOnly = search("types", "FEE_POLICY_CREATED", "types", "JOIN_REQUEST_CREATED");
        assertThat(outsideOnly.getList("data.content")).isEmpty();
        assertThat(outsideOnly.getLong("data.totalElements")).isZero();
    }

    @Test
    @DisplayName("폐쇄(soft-delete)된 동아리도 이력은 조회된다 — 존재 검사를 하지 않는다")
    void closedClubHistoryStaysReadable() {
        clubRepository.delete(clubRepository.findById(clubId).orElseThrow());

        JsonPath response = search();

        assertThat(response.getLong("data.totalElements")).isEqualTo(5L);
    }

    private JsonPath search(String... queryParams) {
        var request = RestAssured.given().header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken);
        for (int index = 0; index < queryParams.length; index += 2) {
            request = request.queryParam(queryParams[index], queryParams[index + 1]);
        }
        return request.when().get(EVENTS_PATH, clubId)
                .then().statusCode(HttpStatus.OK.value())
                .extract().jsonPath();
    }

    private static String path(Long eventId) {
        return "data.content.find { it.eventId == " + eventId + " }";
    }

    private Long save(ClubAuditEvent event) {
        return clubAuditEventRepository.save(event).getId();
    }
}
