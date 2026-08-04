package com.duing.domain.joincode.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubaudit.entity.ClubAuditEvent;
import com.duing.domain.clubaudit.entity.ClubAuditEventType;
import com.duing.domain.clubaudit.repository.ClubAuditEventRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
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
import java.lang.reflect.Field;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
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
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ClubJoinRequestControllerTest extends IntegrationTestBase {

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired RecruitmentRepository recruitmentRepository;
    @Autowired ClubJoinCodeRepository clubJoinCodeRepository;
    @Autowired ClubJoinRequestRepository clubJoinRequestRepository;
    @Autowired ClubAuditEventRepository clubAuditEventRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;
    /** closed_at·revoked_at 은 프로덕션과 같은 seoulClock 으로 만든다 — 시스템 존(UTC CI)으로 찍으면 KST 로 해석돼 −9h 가 된다. */
    @Autowired Clock clock;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private Club club;
    private Club otherClub;
    private User leaderUser;
    private String leaderToken;
    private String memberToken;
    private String otherClubLeaderToken;
    private Recruitment recruitment;
    private ClubJoinCode joinCode;

    @BeforeEach
    void setUp() throws Exception {
        RestAssured.port = port;

        leaderUser = saveUser();
        User memberUser = saveUser();
        User otherClubLeaderUser = saveUser();

        club = saveActiveClub("가입요청동아리");
        otherClub = saveActiveClub("타동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leaderUser));
        clubMemberRepository.save(ClubMember.asMember(club, memberUser));
        clubMemberRepository.save(ClubMember.asLeader(otherClub, otherClubLeaderUser));

        leaderToken = tokenOf(leaderUser);
        memberToken = tokenOf(memberUser);
        otherClubLeaderToken = tokenOf(otherClubLeaderUser);

        recruitment = saveOpenExternalRecruitment(club);
        joinCode = saveJoinCode(club, recruitment, 30);
    }

    @Test
    @DisplayName("운영진 목록 조회는 기본으로 대기 중 요청만 최신순으로 반환하고 상태 필터로 처리 이력도 볼 수 있다")
    void listReturnsPendingByDefaultAndFiltersByStatus() {
        ClubJoinRequest firstPending = savePendingRequest(saveUser());
        ClubJoinRequest secondPending = savePendingRequest(saveUser());
        ClubJoinRequest rejected = saveRejectedRequest(saveUser());

        Response pendingList = listRequests(leaderToken, null);
        pendingList.then()
                .statusCode(HttpStatus.OK.value())
                .body("data", hasSize(2))
                .body("data[0].joinRequestId", equalTo(secondPending.getId().intValue()))
                .body("data[1].joinRequestId", equalTo(firstPending.getId().intValue()))
                .body("data[0].status", equalTo("PENDING"))
                .body("data[0].code", equalTo(joinCode.getCode()))
                .body("data[0].generation", equalTo(joinCode.getGeneration()));

        assertThat(pendingList.jsonPath().getList("data.joinRequestId", Long.class))
                .as("대기 목록에 처리된 요청은 섞이지 않는다")
                .doesNotContain(rejected.getId());

        listRequests(leaderToken, "REJECTED").then()
                .statusCode(HttpStatus.OK.value())
                .body("data", hasSize(1))
                .body("data[0].joinRequestId", equalTo(rejected.getId().intValue()))
                .body("data[0].status", equalTo("REJECTED"));
    }

    @Test
    @DisplayName("목록 항목은 명단 대조에 필요한 학생 정보를 담되 전화번호는 노출하지 않는다")
    void listExposesRosterFieldsWithoutPhone() {
        User student = saveUser();
        ClubJoinRequest pending = savePendingRequest(student);
        Instant beforeAssertion = Instant.now();

        Response pendingList = listRequests(leaderToken, null);
        Map<String, Object> firstItem = pendingList.jsonPath().getMap("data[0]");

        assertThat(firstItem).as("전화번호는 목록에서 절대 내려가지 않는다").doesNotContainKey("phone");
        assertThat(firstItem)
                .containsEntry("joinRequestId", pending.getId().intValue())
                .containsEntry("userName", student.getName())
                .containsEntry("studentId", student.getStudentId())
                .containsEntry("major", student.getMajor());

        String requestedAt = pendingList.jsonPath().getString("data[0].requestedAt");
        assertThat(requestedAt).as("요청 시각은 오프셋 있는 절대시각(…Z)").endsWith("Z");
        assertThat(Duration.between(Instant.parse(requestedAt), beforeAssertion))
                .as("요청 시각은 방금 생성된 시점 — 존 오변환(±9h)이면 벗어난다")
                .isBetween(Duration.ofMinutes(-5), Duration.ofMinutes(5));
    }

    @Test
    @DisplayName("상세 조회에서만 전화번호를 확인할 수 있고 미처리 요청은 처리 정보가 비어 있다")
    void detailExposesPhoneAndEmptyReviewFieldsWhilePending() {
        User student = saveUser();
        ClubJoinRequest pending = savePendingRequest(student);

        getRequestDetail(leaderToken, club.getId(), pending.getId()).then()
                .statusCode(HttpStatus.OK.value())
                .body("data.joinRequestId", equalTo(pending.getId().intValue()))
                .body("data.userName", equalTo(student.getName()))
                .body("data.studentId", equalTo(student.getStudentId()))
                .body("data.major", equalTo(student.getMajor()))
                .body("data.phone", equalTo(student.getPhone()))
                .body("data.code", equalTo(joinCode.getCode()))
                .body("data.status", equalTo("PENDING"))
                .body("data.rejectReason", nullValue())
                .body("data.reviewedAt", nullValue());
    }

    @Test
    @DisplayName("비로그인 상태에서는 가입 요청 목록·상세가 401 로 막힌다")
    void anonymousAccessReturns401() {
        ClubJoinRequest pending = savePendingRequest(saveUser());

        RestAssured.given()
                .when().get("/api/v1/clubs/{clubId}/join-requests", club.getId())
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());

        RestAssured.given()
                .when().get("/api/v1/clubs/{clubId}/join-requests/{joinRequestId}",
                        club.getId(), pending.getId())
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());
    }

    @Test
    @DisplayName("일반 회원과 타 동아리 운영진은 가입 요청을 조회할 수 없다")
    void nonManagerAccessReturns403() {
        ClubJoinRequest pending = savePendingRequest(saveUser());

        listRequests(memberToken, null).then().statusCode(HttpStatus.FORBIDDEN.value());
        listRequests(otherClubLeaderToken, null).then().statusCode(HttpStatus.FORBIDDEN.value());
        getRequestDetail(memberToken, club.getId(), pending.getId())
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("다른 동아리의 가입 요청을 자기 동아리 경로로 조회하면 존재를 알리지 않고 404 를 반환한다")
    void otherClubRequestDetailReturns404() {
        ClubJoinRequest otherClubRequest = saveOtherClubPendingRequest();

        getRequestDetail(leaderToken, club.getId(), otherClubRequest.getId())
                .then().statusCode(HttpStatus.NOT_FOUND.value());
    }

    @Test
    @DisplayName("승인하면 기수 스냅샷이 반영된 회원이 생성되고 신청 때 확보한 인원은 그대로 유지된다")
    void approveCreatesMemberWithoutConsumingAgain() {
        User student = saveUser();
        ClubJoinRequest pending = savePendingRequest(student);
        Instant beforeDecision = Instant.now();

        decide(leaderToken, club.getId(), pending.getId(), "APPROVED").then()
                .statusCode(HttpStatus.OK.value())
                .body("data.result", equalTo("APPROVED"));

        ClubMember created = clubMemberRepository
                .findByClubIdAndUserId(club.getId(), student.getId()).orElseThrow();
        assertThat(created.getRole()).isEqualTo(ClubMemberRole.MEMBER);
        assertThat(created.getGeneration())
                .as("승인은 요청 생성 시점의 기수 스냅샷을 따른다").isEqualTo(joinCode.getGeneration());
        assertThat(usedCountOfCurrentCode())
                .as("승인은 신청 때 확보한 자리를 쓸 뿐 추가로 차감하지 않는다").isEqualTo(1);

        Response detail = getRequestDetail(leaderToken, club.getId(), pending.getId());
        detail.then()
                .body("data.status", equalTo("APPROVED"))
                .body("data.rejectReason", nullValue());
        assertThat(auditEvents())
                .as("승인은 처리한 운영진을 주체로 감사 이벤트에 남는다")
                .extracting(ClubAuditEvent::getEventType, ClubAuditEvent::getJoinRequestId,
                        ClubAuditEvent::getActorUserId, ClubAuditEvent::getRecruitmentId)
                .containsExactly(tuple(ClubAuditEventType.JOIN_REQUEST_APPROVED, pending.getId(),
                        leaderUser.getId(), recruitment.getId()));

        String reviewedAt = detail.jsonPath().getString("data.reviewedAt");
        assertThat(reviewedAt).as("처리 시각은 오프셋 있는 절대시각(…Z)").endsWith("Z");
        assertThat(Duration.between(Instant.parse(reviewedAt), beforeDecision))
                .as("처리 시각은 방금 — KST 벽시계를 다른 존으로 환산하면(±9h) 벗어난다")
                .isBetween(Duration.ofMinutes(-5), Duration.ofMinutes(5));
    }

    @Test
    @DisplayName("거절하면 회원이 생성되지 않고 신청 때 확보했던 인원이 환급된다")
    void rejectRefundsReservedUse() {
        User student = saveUser();
        ClubJoinRequest pending = savePendingRequest(student);
        assertThat(usedCountOfCurrentCode()).as("신청 시점에 자리가 확보돼 있다").isEqualTo(1);

        decide(leaderToken, club.getId(), pending.getId(), "REJECTED").then()
                .statusCode(HttpStatus.OK.value())
                .body("data.result", equalTo("REJECTED"));

        assertThat(clubMemberRepository.findByClubIdAndUserId(club.getId(), student.getId()))
                .as("거절은 회원을 만들지 않는다").isEmpty();
        // 불변식: used_count == 대기 + 승인 요청 수. 거절이 자리를 영구 소모하면 합격자가 못 들어온다.
        assertThat(usedCountOfCurrentCode())
                .as("거절은 자리를 환급한다").isEqualTo(pendingOrApprovedRequestCount());
        assertThat(usedCountOfCurrentCode()).isZero();
        getRequestDetail(leaderToken, club.getId(), pending.getId()).then()
                .body("data.status", equalTo("REJECTED"))
                .body("data.rejectReason", nullValue());
        assertThat(auditEvents())
                .as("거절도 처리한 운영진을 주체로 감사 이벤트에 남는다")
                .extracting(ClubAuditEvent::getEventType, ClubAuditEvent::getJoinRequestId,
                        ClubAuditEvent::getActorUserId)
                .containsExactly(tuple(ClubAuditEventType.JOIN_REQUEST_REJECTED, pending.getId(),
                        leaderUser.getId()));
    }

    @Test
    @DisplayName("승인 시점에 이미 다른 경로로 가입된 회원이면 자동 거절되고 확보했던 인원이 환급된다")
    void approveOnExistingMemberAutoRejectsAndRefunds() {
        User student = saveUser();
        clubMemberRepository.save(ClubMember.asMember(club, student));
        ClubJoinRequest pending = savePendingRequest(student);

        decide(leaderToken, club.getId(), pending.getId(), "APPROVED").then()
                .statusCode(HttpStatus.OK.value())
                .body("data.result", equalTo("AUTO_REJECTED"));

        getRequestDetail(leaderToken, club.getId(), pending.getId()).then()
                .body("data.status", equalTo("REJECTED"))
                .body("data.rejectReason", equalTo("이미 가입된 회원"));
        assertThat(usedCountOfCurrentCode()).as("자동 거절도 자리를 환급한다").isZero();
        assertThat(auditEvents())
                .as("자동 거절도 수동 거절과 같은 거절 이벤트로 남는다 — 사유는 요청 행이 갖고 있다")
                .extracting(ClubAuditEvent::getEventType, ClubAuditEvent::getJoinRequestId)
                .containsExactly(tuple(ClubAuditEventType.JOIN_REQUEST_REJECTED, pending.getId()));
    }

    @Test
    @DisplayName("이미 처리된 요청을 다시 처리하려 하면 409 로 막히고 인원도 그대로다")
    void processedRequestReturns409() {
        User student = saveUser();
        ClubJoinRequest processedRequest = savePendingRequest(student);

        decide(leaderToken, club.getId(), processedRequest.getId(), "APPROVED").then()
                .statusCode(HttpStatus.OK.value());
        decide(leaderToken, club.getId(), processedRequest.getId(), "REJECTED").then()
                .statusCode(HttpStatus.CONFLICT.value());

        assertThat(usedCountOfCurrentCode())
                .as("실패한 재처리는 환급을 일으키지 않는다").isEqualTo(1);
        assertThat(clubJoinRequestRepository.findById(processedRequest.getId()).orElseThrow().getStatus())
                .as("이미 처리된 요청의 상태는 덮어써지지 않는다").isEqualTo(JoinRequestStatus.APPROVED);
    }

    @Test
    @DisplayName("코드가 폐기되거나 가입 가능 기간이 지난 뒤에도 이미 접수된 요청은 승인·거절할 수 있다")
    void decideWorksAfterCodeRevokedOrRecruitmentClosed() {
        ClubJoinRequest requestApprovedAfterRevoke = savePendingRequest(saveUser());
        ClubJoinRequest requestApprovedAfterClose = savePendingRequest(saveUser());
        ClubJoinRequest requestRejectedAfterClose = savePendingRequest(saveUser());

        revokeCurrentJoinCode();
        decide(leaderToken, club.getId(), requestApprovedAfterRevoke.getId(), "APPROVED").then()
                .statusCode(HttpStatus.OK.value())
                .body("data.result", equalTo("APPROVED"));

        // 가입 가능 기간까지 지난 상태로 마감한다 — 자동 만료는 신규 요청만 막고 처리는 계속 가능해야 한다.
        closeRecruitment(LocalDateTime.now(clock).minusDays(30));
        decide(leaderToken, club.getId(), requestApprovedAfterClose.getId(), "APPROVED").then()
                .statusCode(HttpStatus.OK.value())
                .body("data.result", equalTo("APPROVED"));
        // 마감 뒤에도 거절 경로가 살아 있어야 한다 — 막히면 대기 요청이 영원히 남아 모집 삭제까지 막힌다.
        decide(leaderToken, club.getId(), requestRejectedAfterClose.getId(), "REJECTED").then()
                .statusCode(HttpStatus.OK.value())
                .body("data.result", equalTo("REJECTED"));

        assertThat(usedCountOfCurrentCode())
                .as("승인 2건은 신청 때 확보한 자리를 그대로 쓰고 거절 1건만 환급된다").isEqualTo(2);
    }

    @Test
    @DisplayName("탈퇴했던 학생의 요청을 승인하면 새 멤버십 행이 다시 생성된다")
    void approveRecreatesMembershipForFormerMember() {
        User student = saveUser();
        ClubMember previousMembership = clubMemberRepository.save(ClubMember.asMember(club, student));
        clubMemberRepository.delete(previousMembership);
        ClubJoinRequest pending = savePendingRequest(student);

        decide(leaderToken, club.getId(), pending.getId(), "APPROVED").then()
                .statusCode(HttpStatus.OK.value())
                .body("data.result", equalTo("APPROVED"));

        ClubMember recreated = clubMemberRepository
                .findByClubIdAndUserId(club.getId(), student.getId()).orElseThrow();
        assertThat(recreated.getId()).as("탈퇴 이력과 별개의 새 멤버십").isNotEqualTo(previousMembership.getId());
        assertThat(recreated.getGeneration()).isEqualTo(joinCode.getGeneration());
    }

    @Test
    @DisplayName("일괄 승인은 처리 가능한 요청만 승인하고 나머지는 사유와 함께 실패로 돌려준다")
    void bulkApproveReportsPerRequestFailures() {
        User existingMemberStudent = saveUser();
        clubMemberRepository.save(ClubMember.asMember(club, existingMemberStudent));

        ClubJoinRequest approvable = savePendingRequest(saveUser());
        ClubJoinRequest autoRejected = savePendingRequest(existingMemberStudent);
        ClubJoinRequest alreadyProcessed = saveRejectedRequest(saveUser());

        Response response = bulkApprove(leaderToken, club.getId(),
                List.of(approvable.getId(), autoRejected.getId(), alreadyProcessed.getId()));

        response.then()
                .statusCode(HttpStatus.OK.value())
                .body("data.approvedCount", equalTo(1))
                .body("data.failures", hasSize(2));
        assertThat(response.jsonPath().getList("data.failures.joinRequestId", Long.class))
                .containsExactly(autoRejected.getId(), alreadyProcessed.getId());
        assertThat(response.jsonPath().getList("data.failures.reason", String.class))
                .containsExactly("이미 가입된 회원이라 자동 거절 처리되었습니다.",
                        "이미 처리된 가입 요청입니다.");
        // 시드 3건이 자리 3개를 확보했고, 자동 거절만 환급된다(사전 거절 건은 서비스를 거치지 않아 그대로).
        assertThat(usedCountOfCurrentCode()).as("승인은 차감하지 않고 자동 거절만 환급한다").isEqualTo(2);
        assertThat(clubJoinRequestRepository.findById(autoRejected.getId()).orElseThrow().getStatus())
                .as("자동 거절은 PENDING 으로 방치되지 않는다").isEqualTo(JoinRequestStatus.REJECTED);
    }

    @Test
    @DisplayName("일괄 승인에 다른 동아리 요청이나 없는 ID 가 섞이면 존재를 알리지 않는 같은 사유로 실패한다")
    void bulkApproveHidesForeignRequestExistence() {
        ClubJoinRequest mine = savePendingRequest(saveUser());
        ClubJoinRequest foreign = saveOtherClubPendingRequest();
        long missingJoinRequestId = foreign.getId() + 1_000L;

        Response response = bulkApprove(leaderToken, club.getId(),
                List.of(mine.getId(), foreign.getId(), missingJoinRequestId));

        response.then()
                .statusCode(HttpStatus.OK.value())
                .body("data.approvedCount", equalTo(1))
                .body("data.failures", hasSize(2));
        assertThat(response.jsonPath().getList("data.failures.reason", String.class))
                .as("타 동아리 요청과 미존재 ID 는 한 문구로 합쳐 열거를 막는다")
                .containsOnly("해당 가입 요청을 처리할 권한이 없거나 존재하지 않습니다.");
        assertThat(clubJoinRequestRepository.findById(foreign.getId()).orElseThrow().getStatus())
                .as("타 동아리 요청은 건드리지 않는다").isEqualTo(JoinRequestStatus.PENDING);
    }

    @Test
    @DisplayName("비로그인·일반 회원은 가입 요청을 처리할 수 없다")
    void decideRequiresManager() {
        ClubJoinRequest pending = savePendingRequest(saveUser());

        RestAssured.given()
                    .contentType(ContentType.JSON)
                    .body(Map.of("status", "APPROVED"))
                .when().patch("/api/v1/clubs/{clubId}/join-requests/{joinRequestId}",
                        club.getId(), pending.getId())
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());
        RestAssured.given()
                    .contentType(ContentType.JSON)
                    .body(Map.of("joinRequestIds", List.of(pending.getId())))
                .when().patch("/api/v1/clubs/{clubId}/join-requests/bulk-approve", club.getId())
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());

        decide(memberToken, club.getId(), pending.getId(), "APPROVED")
                .then().statusCode(HttpStatus.FORBIDDEN.value());
        bulkApprove(memberToken, club.getId(), List.of(pending.getId()))
                .then().statusCode(HttpStatus.FORBIDDEN.value());
        bulkApprove(otherClubLeaderToken, club.getId(), List.of(pending.getId()))
                .then().statusCode(HttpStatus.FORBIDDEN.value());

        assertThat(clubJoinRequestRepository.findById(pending.getId()).orElseThrow().getStatus())
                .isEqualTo(JoinRequestStatus.PENDING);
    }

    @Test
    @DisplayName("처리 결과가 아닌 상태나 빈 ID 목록으로는 요청을 처리할 수 없다")
    void invalidDecideInputReturns400() {
        ClubJoinRequest pending = savePendingRequest(saveUser());

        decide(leaderToken, club.getId(), pending.getId(), "PENDING")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
        bulkApprove(leaderToken, club.getId(), List.of())
                .then().statusCode(HttpStatus.BAD_REQUEST.value());

        assertThat(clubJoinRequestRepository.findById(pending.getId()).orElseThrow().getStatus())
                .isEqualTo(JoinRequestStatus.PENDING);
    }

    /** 감사 이벤트는 기록 순서가 곧 이야기라 id 오름차순으로 본다. */
    private List<ClubAuditEvent> auditEvents() {
        return clubAuditEventRepository.findAll(Sort.by(Sort.Direction.ASC, "id"));
    }

    private Response listRequests(String token, String status) {
        var request = RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token);
        if (status != null) {
            request = request.queryParam("status", status);
        }
        return request.when().get("/api/v1/clubs/{clubId}/join-requests", club.getId());
    }

    private Response getRequestDetail(String token, Long targetClubId, Long joinRequestId) {
        return RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .when()
                .get("/api/v1/clubs/{clubId}/join-requests/{joinRequestId}", targetClubId, joinRequestId);
    }

    private Response decide(String token, Long targetClubId, Long joinRequestId, String status) {
        return RestAssured.given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                    .contentType(ContentType.JSON)
                    .body(Map.of("status", status))
                .when()
                    .patch("/api/v1/clubs/{clubId}/join-requests/{joinRequestId}",
                            targetClubId, joinRequestId);
    }

    private Response bulkApprove(String token, Long targetClubId, List<Long> joinRequestIds) {
        return RestAssured.given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                    .contentType(ContentType.JSON)
                    .body(Map.of("joinRequestIds", joinRequestIds))
                .when()
                    .patch("/api/v1/clubs/{clubId}/join-requests/bulk-approve", targetClubId);
    }

    /**
     * 대기 요청은 실제 흐름과 같은 상태로 만든다 — 신청 시점에 코드 자리 하나를 확보하므로
     * (스펙 4.2) 시드도 함께 차감해야 승인·거절의 유지·환급을 그대로 검증할 수 있다.
     */
    private ClubJoinRequest savePendingRequest(User student) {
        ClubJoinCode stored = clubJoinCodeRepository.findById(joinCode.getId()).orElseThrow();
        stored.tryConsume();
        clubJoinCodeRepository.save(stored);
        return clubJoinRequestRepository.save(ClubJoinRequest.pending(club, student, joinCode));
    }

    private ClubJoinRequest saveOtherClubPendingRequest() {
        ClubJoinCode otherClubJoinCode =
                saveJoinCode(otherClub, saveOpenExternalRecruitment(otherClub), 30);
        return clubJoinRequestRepository.save(
                ClubJoinRequest.pending(otherClub, saveUser(), otherClubJoinCode));
    }

    private ClubJoinRequest saveRejectedRequest(User student) {
        ClubJoinRequest pending = savePendingRequest(student);
        pending.reject(leaderUser, LocalDateTime.now(clock));
        return clubJoinRequestRepository.save(pending);
    }

    private ClubJoinCode saveJoinCode(Club targetClub, Recruitment targetRecruitment, int maxUses) {
        return clubJoinCodeRepository.save(ClubJoinCode.issue(
                targetClub, targetRecruitment, randomCode(), 12, maxUses, 7, null));
    }

    private void revokeCurrentJoinCode() {
        ClubJoinCode stored = clubJoinCodeRepository.findById(joinCode.getId()).orElseThrow();
        stored.revoke(LocalDateTime.now(clock), null);
        clubJoinCodeRepository.save(stored);
    }

    private void closeRecruitment(LocalDateTime closedAt) {
        Recruitment stored = recruitmentRepository.findById(recruitment.getId()).orElseThrow();
        stored.close(closedAt);
        recruitmentRepository.save(stored);
    }

    private int usedCountOfCurrentCode() {
        return clubJoinCodeRepository.findById(joinCode.getId()).orElseThrow().getUsedCount();
    }

    /** used_count 불변식(= 대기 + 승인 요청 수)의 우변. */
    private int pendingOrApprovedRequestCount() {
        return clubJoinRequestRepository
                .findAllByClubIdAndStatusOrderByIdDesc(club.getId(), JoinRequestStatus.PENDING).size()
                + clubJoinRequestRepository
                .findAllByClubIdAndStatusOrderByIdDesc(club.getId(), JoinRequestStatus.APPROVED).size();
    }

    /** 코드 문자열은 전역 unique 이므로 테스트마다 겹치지 않게 시퀀스로 만든다. */
    private String randomCode() {
        String candidate = Long.toString(Math.abs(sequence.getAndIncrement()), 32).toUpperCase();
        return candidate.substring(candidate.length() - 6).replace('0', 'A').replace('1', 'B');
    }

    private String tokenOf(User user) {
        return jwtTokenProvider.createToken(user.getId(), user.getRole().name());
    }

    private User saveUser() {
        return userRepository.save(UserFixture.unique());
    }

    private Club saveActiveClub(String name) throws Exception {
        Club created = Club.create(name + "-" + sequence.getAndIncrement(),
                ClubCategory.ACADEMIC, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(created, ClubStatus.ACTIVE);
        return clubRepository.save(created);
    }

    /** 모집 기간은 하드코딩 절대일자 없이 오늘 기준 상대일로 만든다(시한폭탄 테스트 방지). */
    private Recruitment saveOpenExternalRecruitment(Club targetClub) {
        return recruitmentRepository.save(Recruitment.createWithOptions(targetClub,
                "모집-" + sequence.getAndIncrement(), "내용",
                LocalDate.now().minusDays(1), LocalDate.now().plusDays(14), 10,
                ApplicationMode.EXTERNAL, "https://forms.example.com/duing", false,
                TargetRole.MEMBER, null, null, false));
    }
}
