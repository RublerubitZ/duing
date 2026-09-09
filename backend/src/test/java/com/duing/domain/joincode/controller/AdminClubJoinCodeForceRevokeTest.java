package com.duing.domain.joincode.controller;

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
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.joincode.entity.ClubJoinCode;
import com.duing.domain.joincode.entity.ClubJoinRequest;
import com.duing.domain.joincode.entity.JoinRequestStatus;
import com.duing.domain.joincode.repository.ClubJoinCodeRepository;
import com.duing.domain.joincode.repository.ClubJoinRequestRepository;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.TargetRole;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import io.restassured.response.Response;
import java.time.Clock;
import java.time.LocalDate;
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
 * 총동연(ADMIN) 가입 링크 강제 폐기 검증.
 *
 * <p>강제 폐기는 운영진 수동 폐기와 같은 도메인 전이({@code ClubJoinCode#revoke})를 타되, 감사에는
 * 별도 종류(JOIN_LINK_FORCE_REVOKED)와 사유를 남긴다 — 행위자 id 만으로는 화면이 "누가 끊었는지"를 구분할 수 없다.
 * 접수된 가입 요청은 건드리지 않는 것이 회장 폐기와 같은 규약이다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AdminClubJoinCodeForceRevokeTest extends IntegrationTestBase {

    private static final String REVOKE_PATH = "/api/v1/admin/clubs/{clubId}/join-codes/{joinCodeId}/revoke";
    private static final String EXTERNAL_FORM_URL = "https://forms.example.com/duing";

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired RecruitmentRepository recruitmentRepository;
    @Autowired ClubJoinCodeRepository clubJoinCodeRepository;
    @Autowired ClubJoinRequestRepository clubJoinRequestRepository;
    @Autowired ClubAuditEventRepository clubAuditEventRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;
    /** 폐기 시각은 프로덕션과 같은 seoulClock 으로 찍는다 — 시스템 존(UTC CI)으로 찍으면 KST 로 해석돼 어긋난다. */
    @Autowired Clock clock;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private String adminToken;
    private String studentToken;
    private String leaderToken;

    private Club club;
    private Club otherClub;
    private User adminUser;
    private User leaderUser;

    private Long inviteCodeId;
    private Long recruitmentCodeId;
    private Long recruitmentId;
    private Long pendingRequestId;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;

        adminUser = userRepository.save(UserFixture.admin());
        leaderUser = userRepository.save(UserFixture.withName("이운영"));
        User studentUser = userRepository.save(UserFixture.unique());
        adminToken = tokenOf(adminUser);
        leaderToken = tokenOf(leaderUser);
        studentToken = tokenOf(studentUser);

        club = clubRepository.save(ClubFixture.academic("링크동아리"));
        otherClub = clubRepository.save(ClubFixture.academic("다른동아리"));
        clubMemberRepository.save(ClubMember.asLeader(club, leaderUser));

        ClubJoinCode inviteCode = clubJoinCodeRepository.save(ClubJoinCode.issueClubInvite(
                club, nextCode(), null, 10, LocalDateTime.now(clock).plusHours(24), false,
                leaderUser.getId()));
        inviteCodeId = inviteCode.getId();
        pendingRequestId = clubJoinRequestRepository.save(ClubJoinRequest.pending(
                club, userRepository.save(UserFixture.unique()), inviteCode)).getId();

        Recruitment recruitment = recruitmentRepository.save(Recruitment.createWithOptions(
                club, "외부 폼 모집", "내용", LocalDate.now().minusDays(3), LocalDate.now().plusDays(7),
                10, ApplicationMode.EXTERNAL, EXTERNAL_FORM_URL, false, TargetRole.MEMBER, null, null, false));
        recruitmentId = recruitment.getId();
        recruitmentCodeId = clubJoinCodeRepository.save(ClubJoinCode.issue(
                club, recruitment, nextCode(), null, 10, 7, leaderUser.getId())).getId();
    }

    @Test
    @DisplayName("부원 초대 링크를 강제 폐기하면 폐기 시각·폐기자가 남고 사유가 감사 이벤트로 기록된다")
    void forceRevokeInviteStampsRevocationAndRecordsAuditEvent() {
        forceRevoke(adminToken, club.getId(), inviteCodeId, Map.of("reason", "  자동 승인 초대 오남용  "))
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        ClubJoinCode revoked = clubJoinCodeRepository.findById(inviteCodeId).orElseThrow();
        assertThat(revoked.getRevokedAt()).isNotNull();
        assertThat(revoked.getRevokedById())
                .as("폐기자는 조치를 실행한 관리자다").isEqualTo(adminUser.getId());

        List<ClubAuditEvent> auditEvents = clubAuditEventRepository.findAll();
        assertThat(auditEvents).hasSize(1);
        ClubAuditEvent forceRevokeEvent = auditEvents.getFirst();
        assertThat(forceRevokeEvent.getEventType()).isEqualTo(ClubAuditEventType.JOIN_LINK_FORCE_REVOKED);
        assertThat(forceRevokeEvent.getClubId()).isEqualTo(club.getId());
        assertThat(forceRevokeEvent.getJoinCodeId()).isEqualTo(inviteCodeId);
        assertThat(forceRevokeEvent.getRecruitmentId())
                .as("부원 초대 링크는 귀속 모집이 없다").isNull();
        assertThat(forceRevokeEvent.getActorUserId()).isEqualTo(adminUser.getId());
        assertThat(forceRevokeEvent.getReason())
                .as("앞뒤 공백은 다듬어 저장한다").isEqualTo("자동 승인 초대 오남용");
    }

    @Test
    @DisplayName("모집 가입 링크를 강제 폐기하면 감사 이벤트에 귀속 모집까지 함께 남는다")
    void forceRevokeRecruitmentLinkRecordsRecruitmentId() {
        forceRevoke(adminToken, club.getId(), recruitmentCodeId, Map.of("reason", "모집 요건 위반"))
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        assertThat(clubJoinCodeRepository.findById(recruitmentCodeId).orElseThrow().isRevoked()).isTrue();
        ClubAuditEvent forceRevokeEvent = clubAuditEventRepository.findAll().getFirst();
        assertThat(forceRevokeEvent.getRecruitmentId()).isEqualTo(recruitmentId);
        assertThat(forceRevokeEvent.getJoinCodeId()).isEqualTo(recruitmentCodeId);
    }

    @Test
    @DisplayName("강제 폐기해도 접수된 가입 요청은 그대로 남아 운영진이 계속 처리할 수 있다")
    void pendingJoinRequestsAreUntouched() {
        forceRevoke(adminToken, club.getId(), inviteCodeId, Map.of("reason", "링크 유출"))
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        assertThat(clubJoinRequestRepository.findById(pendingRequestId).orElseThrow().getStatus())
                .as("링크를 끊는 것과 이미 들어온 요청의 처리는 별개다").isEqualTo(JoinRequestStatus.PENDING);
    }

    @Test
    @DisplayName("이미 폐기된 링크를 다시 강제 폐기해도 최초 폐기 시각과 감사 이벤트가 그대로다")
    void repeatedForceRevokeIsIdempotent() {
        forceRevoke(adminToken, club.getId(), inviteCodeId, Map.of("reason", "첫 번째 폐기"))
                .then().statusCode(HttpStatus.NO_CONTENT.value());
        LocalDateTime firstRevokedAt = clubJoinCodeRepository.findById(inviteCodeId)
                .orElseThrow().getRevokedAt();

        forceRevoke(adminToken, club.getId(), inviteCodeId, Map.of("reason", "두 번째 폐기"))
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        assertThat(clubJoinCodeRepository.findById(inviteCodeId).orElseThrow().getRevokedAt())
                .isEqualTo(firstRevokedAt);
        assertThat(clubAuditEventRepository.findAll())
                .as("아무 일도 일어나지 않았으므로 이력도 늘지 않는다").hasSize(1);
        assertThat(clubAuditEventRepository.findAll().getFirst().getReason()).isEqualTo("첫 번째 폐기");
    }

    @Test
    @DisplayName("다른 동아리 경로로 링크를 강제 폐기하면 404 이고 링크는 그대로 살아 있다")
    void revokingThroughAnotherClubReturns404() {
        forceRevoke(adminToken, otherClub.getId(), inviteCodeId, Map.of("reason", "타 동아리 경로"))
                .then().statusCode(HttpStatus.NOT_FOUND.value());
        forceRevoke(adminToken, club.getId(), 999_999L, Map.of("reason", "없는 링크"))
                .then().statusCode(HttpStatus.NOT_FOUND.value());

        assertThat(clubJoinCodeRepository.findById(inviteCodeId).orElseThrow().isRevoked()).isFalse();
        assertThat(clubAuditEventRepository.findAll()).isEmpty();
    }

    @Test
    @DisplayName("사유가 비어 있으면 400 으로 거절되고 링크는 그대로 살아 있다")
    void blankReasonIsRejected() {
        forceRevoke(adminToken, club.getId(), inviteCodeId, Map.of("reason", "   "))
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
        forceRevoke(adminToken, club.getId(), inviteCodeId, Map.of("reason", "가".repeat(501)))
                .then().statusCode(HttpStatus.BAD_REQUEST.value());

        assertThat(clubJoinCodeRepository.findById(inviteCodeId).orElseThrow().isRevoked()).isFalse();
        assertThat(clubAuditEventRepository.findAll()).isEmpty();
    }

    @Test
    @DisplayName("관리자가 아니면 강제 폐기할 수 없다 — 동아리 회장도 전역 역할은 학생이라 막힌다")
    void nonAdminCannotForceRevoke() {
        forceRevoke(studentToken, club.getId(), inviteCodeId, Map.of("reason", "학생 시도"))
                .then().statusCode(HttpStatus.FORBIDDEN.value());
        forceRevoke(leaderToken, club.getId(), inviteCodeId, Map.of("reason", "회장 시도"))
                .then().statusCode(HttpStatus.FORBIDDEN.value());

        assertThat(clubJoinCodeRepository.findById(inviteCodeId).orElseThrow().isRevoked()).isFalse();
    }

    @Test
    @DisplayName("비로그인 상태에서는 강제 폐기가 401 로 막힌다")
    void anonymousForceRevokeReturns401() {
        RestAssured
                .given()
                    .contentType(ContentType.JSON)
                    .body(Map.of("reason", "비로그인 시도"))
                .when()
                    .patch(REVOKE_PATH, club.getId(), inviteCodeId)
                .then()
                    .statusCode(HttpStatus.UNAUTHORIZED.value());
    }

    private Response forceRevoke(String token, Long targetClubId, Long joinCodeId,
                                 Map<String, ?> requestBody) {
        return RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                    .contentType(ContentType.JSON)
                    .body(requestBody)
                .when()
                    .patch(REVOKE_PATH, targetClubId, joinCodeId);
    }

    private String nextCode() {
        return "T%05d".formatted(sequence.incrementAndGet() % 100_000);
    }

    private String tokenOf(User user) {
        return jwtTokenProvider.createToken(user.getId(), user.getRole().name());
    }
}
