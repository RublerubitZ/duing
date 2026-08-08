package com.duing.domain.joincode.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;
import static org.hamcrest.Matchers.equalTo;
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
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.joincode.entity.ClubJoinCode;
import com.duing.domain.joincode.entity.ClubJoinRequest;
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
class ClubInviteJoinCodeControllerTest extends IntegrationTestBase {

    /** 유효기간은 생략 = 기본 프리셋(24시간). */
    private static final Map<String, Object> VALID_BODY = Map.of("maxUses", 10);

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired RecruitmentRepository recruitmentRepository;
    @Autowired ClubJoinCodeRepository clubJoinCodeRepository;
    @Autowired ClubJoinRequestRepository clubJoinRequestRepository;
    @Autowired ClubAuditEventRepository clubAuditEventRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;
    /** revoked_at 등은 프로덕션과 같은 seoulClock 으로 만든다 — 시스템 존(UTC CI)으로 찍으면 KST 로 해석돼 −9h 가 된다. */
    @Autowired Clock clock;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private Club club;
    private Club otherClub;
    private User leaderUser;
    private String leaderToken;
    private String memberToken;
    private String otherClubLeaderToken;

    /** 초대 링크는 모집과 무관하므로 셋업에서 모집을 만들지 않는다 — 필요한 테스트가 직접 만든다. */
    @BeforeEach
    void setUp() throws Exception {
        RestAssured.port = port;

        leaderUser = saveUser();
        User memberUser = saveUser();
        User otherClubLeaderUser = saveUser();

        club = saveActiveClub("초대링크동아리");
        otherClub = saveActiveClub("타동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leaderUser));
        clubMemberRepository.save(ClubMember.asMember(club, memberUser));
        clubMemberRepository.save(ClubMember.asLeader(otherClub, otherClubLeaderUser));

        leaderToken = tokenOf(leaderUser);
        memberToken = tokenOf(memberUser);
        otherClubLeaderToken = tokenOf(otherClubLeaderUser);
    }

    @Test
    @DisplayName("모집이 하나도 없는 동아리에서도 운영진이 부원 초대 링크를 만들고 만료 시각·자동 승인 설정을 함께 받는다")
    void leaderCreatesClubInviteWithoutAnyRecruitment() {
        Instant beforeIssue = Instant.now();

        Response created = createInviteCode(leaderToken, club.getId(), Map.of(
                "maxUses", 30, "expiresInHours", 24, "autoApprove", true, "generation", 12));

        created.then()
                .statusCode(HttpStatus.CREATED.value())
                .body("data.linkType", equalTo("CLUB_INVITE"))
                .body("data.autoApprove", equalTo(true))
                .body("data.maxUses", equalTo(30))
                .body("data.usedCount", equalTo(0))
                .body("data.generation", equalTo(12))
                .body("data.totalRequestCount", equalTo(0))
                .body("data.pendingCount", equalTo(0));

        String code = created.jsonPath().getString("data.code");
        assertThat(code).as("Crockford Base32 6자").hasSize(6).matches("[0-9A-HJKMNP-TV-Z]{6}");
        assertInviteExpiresAt(created, beforeIssue, 24);

        ClubJoinCode stored = clubJoinCodeRepository.findById(
                created.jsonPath().getLong("data.joinCodeId")).orElseThrow();
        assertThat(stored.getRecruitment()).as("초대 링크는 어떤 모집에도 귀속되지 않는다").isNull();
        assertThat(stored.getClub().getId())
                .as("동아리 단위 링크라 club_id 가 소유 주체다").isEqualTo(club.getId());
        assertThat(stored.getCreatedById()).as("발급 주체가 감사 컬럼에 기록된다")
                .isEqualTo(leaderUser.getId());
        assertThat(stored.isAutoApprove()).as("자동 승인 설정이 저장된다").isTrue();

        assertThat(auditEvents())
                .as("최초 발급은 생성 이벤트 1건 — 귀속 모집이 없으므로 recruitment_id 는 비어 있다")
                .extracting(ClubAuditEvent::getEventType, ClubAuditEvent::getClubId,
                        ClubAuditEvent::getRecruitmentId, ClubAuditEvent::getJoinCodeId,
                        ClubAuditEvent::getActorUserId)
                .containsExactly(tuple(ClubAuditEventType.JOIN_LINK_CREATED, club.getId(), null,
                        stored.getId(), leaderUser.getId()));
    }

    @Test
    @DisplayName("진행 중인 모집이 있어도 부원 초대 링크는 따로 발급돼 모집 링크와 나란히 활성으로 남는다")
    void clubInviteCoexistsWithRecruitmentJoinCode() {
        Recruitment externalRecruitment = saveExternalRecruitment(club);
        String recruitmentCode = createRecruitmentJoinCode(externalRecruitment)
                .then().statusCode(HttpStatus.CREATED.value())
                .body("data.linkType", equalTo("RECRUITMENT"))
                .body("data.autoApprove", equalTo(false))
                .body("data.inviteExpiresAt", nullValue())
                .extract().jsonPath().getString("data.code");

        String inviteCode = createInviteCode(leaderToken, club.getId(), VALID_BODY)
                .then().statusCode(HttpStatus.CREATED.value())
                .extract().jsonPath().getString("data.code");

        assertThat(inviteCode).as("두 링크는 서로 다른 코드").isNotEqualTo(recruitmentCode);
        getActiveInviteCode(leaderToken, club.getId()).then()
                .statusCode(HttpStatus.OK.value())
                .body("data.code", equalTo(inviteCode));
        getActiveRecruitmentJoinCode(externalRecruitment).then()
                .statusCode(HttpStatus.OK.value())
                .body("data.code", equalTo(recruitmentCode));
    }

    @Test
    @DisplayName("유효기간은 생략하면 24시간, 72 를 지정하면 72시간이며 그 외 값은 거절된다")
    void expiresInHoursPresetIsEnforced() {
        Instant beforeDefault = Instant.now();
        Response defaultCreated = createInviteCode(leaderToken, club.getId(), Map.of("maxUses", 10));
        defaultCreated.then().statusCode(HttpStatus.CREATED.value());
        assertInviteExpiresAt(defaultCreated, beforeDefault, 24);

        Instant beforeExtended = Instant.now();
        Response extendedCreated = createInviteCode(leaderToken, club.getId(),
                Map.of("maxUses", 10, "expiresInHours", 72));
        extendedCreated.then().statusCode(HttpStatus.CREATED.value());
        assertInviteExpiresAt(extendedCreated, beforeExtended, 72);

        createInviteCode(leaderToken, club.getId(), Map.of("maxUses", 10, "expiresInHours", 48))
                .then().statusCode(HttpStatus.BAD_REQUEST.value())
                .body("message", equalTo("초대 링크 유효기간은 24시간 또는 72시간이어야 합니다."));
        createInviteCode(leaderToken, club.getId(), Map.of("maxUses", 10, "expiresInHours", 0))
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("최대 사용 인원은 150명까지 허용되고 그 위이거나 미입력이면 거절된다")
    void maxUsesBoundsAreEnforced() {
        // 상한은 DB CHECK(1~150) 와 같은 값이어야 한다 — 느슨하면 INSERT 단계에서 409 로 새어 나간다.
        createInviteCode(leaderToken, club.getId(), Map.of("maxUses", 151))
                .then().statusCode(HttpStatus.BAD_REQUEST.value())
                .body("message", equalTo("maxUses: 최대 사용 인원은 150명 이하여야 합니다."));
        createInviteCode(leaderToken, club.getId(), Map.of("maxUses", 0))
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
        createInviteCode(leaderToken, club.getId(), Map.of("expiresInHours", 24))
                .then().statusCode(HttpStatus.BAD_REQUEST.value());

        createInviteCode(leaderToken, club.getId(), Map.of("maxUses", 150))
                .then().statusCode(HttpStatus.CREATED.value())
                .body("data.maxUses", equalTo(150));
    }

    @Test
    @DisplayName("활성 초대 링크가 있는 상태에서 다시 발급하면 이전 링크가 폐기되고 재생성 감사가 쌍으로 남는다")
    void recreateRevokesPreviousInvite() {
        Response firstCreated = createInviteCode(leaderToken, club.getId(), VALID_BODY);
        String firstCode = firstCreated.jsonPath().getString("data.code");
        Long firstJoinCodeId = firstCreated.jsonPath().getLong("data.joinCodeId");

        Response secondCreated = createInviteCode(leaderToken, club.getId(),
                        Map.of("maxUses", 20, "expiresInHours", 72, "generation", 13))
                .then().statusCode(HttpStatus.CREATED.value())
                .extract().response();
        String secondCode = secondCreated.jsonPath().getString("data.code");

        assertThat(secondCode).isNotEqualTo(firstCode);
        assertThat(auditEvents())
                .as("재생성 트랜잭션은 구 링크 폐기와 신규 링크 재생성을 각각 남긴다 — 최초 생성과 구분된다")
                .extracting(ClubAuditEvent::getEventType, ClubAuditEvent::getJoinCodeId,
                        ClubAuditEvent::getActorUserId)
                .containsExactly(
                        tuple(ClubAuditEventType.JOIN_LINK_CREATED, firstJoinCodeId, leaderUser.getId()),
                        tuple(ClubAuditEventType.JOIN_LINK_REVOKED, firstJoinCodeId, leaderUser.getId()),
                        tuple(ClubAuditEventType.JOIN_LINK_REGENERATED,
                                secondCreated.jsonPath().getLong("data.joinCodeId"), leaderUser.getId()));
        assertThat(auditEvents()).extracting(ClubAuditEvent::getRecruitmentId)
                .as("초대 링크 감사는 귀속 모집이 없어 recruitment_id 가 전부 비어 있다").containsOnlyNulls();

        getActiveInviteCode(leaderToken, club.getId()).then()
                .statusCode(HttpStatus.OK.value())
                .body("data.code", equalTo(secondCode))
                .body("data.generation", equalTo(13));
        assertThat(clubJoinCodeRepository.findByClubIdAndRecruitmentIsNullAndRevokedAtIsNull(club.getId()))
                .as("동아리의 활성 초대 링크는 정확히 1개").isPresent()
                .get().extracting(ClubJoinCode::getCode).isEqualTo(secondCode);
        assertThat(clubJoinCodeRepository.findById(firstJoinCodeId).orElseThrow().getRevokedById())
                .as("재생성으로 자동 폐기된 이전 링크에도 폐기 주체가 남는다").isEqualTo(leaderUser.getId());
    }

    @Test
    @DisplayName("활성 초대 링크가 없으면 빈 결과를, 있으면 사용 인원과 가입 신청 수치를 함께 내려준다")
    void activeInviteIsEmptyWhenAbsentAndCarriesCounts() {
        getActiveInviteCode(leaderToken, club.getId()).then()
                .statusCode(HttpStatus.OK.value())
                .body("ok", equalTo(true))
                .body("data", nullValue());

        Long joinCodeId = createInviteCode(leaderToken, club.getId(), VALID_BODY)
                .jsonPath().getLong("data.joinCodeId");
        ClubJoinCode joinCode = clubJoinCodeRepository.findById(joinCodeId).orElseThrow();

        ClubJoinRequest rejected = savePendingRequest(joinCode, saveUser());
        rejected.reject(leaderUser, LocalDateTime.now(clock));
        clubJoinRequestRepository.save(rejected);
        ClubJoinRequest approved = savePendingRequest(joinCode, saveUser());
        approved.approve(leaderUser, LocalDateTime.now(clock));
        clubJoinRequestRepository.save(approved);
        savePendingRequest(joinCode, saveUser());

        getActiveInviteCode(leaderToken, club.getId()).then()
                .statusCode(HttpStatus.OK.value())
                .body("data.linkType", equalTo("CLUB_INVITE"))
                .body("data.usedCount", equalTo(3))
                .body("data.totalRequestCount", equalTo(3))
                .body("data.pendingCount", equalTo(1));
    }

    @Test
    @DisplayName("이미 폐기된 초대 링크를 다시 폐기해도 성공하고 최초 폐기 시각·감사 이력은 그대로다")
    void revokeIsIdempotent() {
        Long joinCodeId = createInviteCode(leaderToken, club.getId(), VALID_BODY)
                .jsonPath().getLong("data.joinCodeId");

        revokeInviteCode(leaderToken, club.getId(), joinCodeId)
                .then().statusCode(HttpStatus.NO_CONTENT.value());
        ClubJoinCode revoked = clubJoinCodeRepository.findById(joinCodeId).orElseThrow();
        LocalDateTime firstRevokedAt = revoked.getRevokedAt();
        assertThat(revoked.getRevokedById()).as("수동 폐기 주체가 감사 컬럼에 기록된다")
                .isEqualTo(leaderUser.getId());

        revokeInviteCode(leaderToken, club.getId(), joinCodeId)
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        assertThat(clubJoinCodeRepository.findById(joinCodeId).orElseThrow().getRevokedAt())
                .as("멱등 폐기는 감사 시각을 덮어쓰지 않는다").isEqualTo(firstRevokedAt);
        assertThat(auditEvents()).extracting(ClubAuditEvent::getEventType)
                .as("아무것도 바뀌지 않은 멱등 호출은 감사 이벤트를 남기지 않는다")
                .containsExactly(ClubAuditEventType.JOIN_LINK_CREATED, ClubAuditEventType.JOIN_LINK_REVOKED);
        getActiveInviteCode(leaderToken, club.getId()).then()
                .statusCode(HttpStatus.OK.value())
                .body("data", nullValue());
    }

    @Test
    @DisplayName("모집 링크나 다른 동아리 링크의 id 를 초대 링크 폐기 경로에 끼워 넣으면 존재를 알리지 않고 404 를 반환한다")
    void revokeRejectsForeignJoinCodeIds() {
        Recruitment externalRecruitment = saveExternalRecruitment(club);
        Long recruitmentJoinCodeId = createRecruitmentJoinCode(externalRecruitment)
                .jsonPath().getLong("data.joinCodeId");
        Long otherClubInviteId = createInviteCode(otherClubLeaderToken, otherClub.getId(), VALID_BODY)
                .then().statusCode(HttpStatus.CREATED.value())
                .extract().jsonPath().getLong("data.joinCodeId");

        revokeInviteCode(leaderToken, club.getId(), recruitmentJoinCodeId)
                .then().statusCode(HttpStatus.NOT_FOUND.value());
        revokeInviteCode(leaderToken, club.getId(), otherClubInviteId)
                .then().statusCode(HttpStatus.NOT_FOUND.value());

        assertThat(clubJoinCodeRepository.findById(recruitmentJoinCodeId).orElseThrow().getRevokedAt())
                .as("모집 링크는 초대 경로로 폐기되지 않는다").isNull();
        assertThat(clubJoinCodeRepository.findById(otherClubInviteId).orElseThrow().getRevokedAt())
                .as("타 동아리 초대 링크는 폐기되지 않는다").isNull();
    }

    @Test
    @DisplayName("초대 링크 id 를 모집 링크 폐기 경로에 끼워 넣어도 서버 오류가 아니라 404 로 막힌다")
    void recruitmentScopedRevokeRejectsClubInviteId() {
        Recruitment externalRecruitment = saveExternalRecruitment(club);
        Long inviteJoinCodeId = createInviteCode(leaderToken, club.getId(), VALID_BODY)
                .jsonPath().getLong("data.joinCodeId");

        // 초대 링크는 귀속 모집이 없다 — 소속 대조가 null 을 그대로 역참조하면 500 이 되어 열거 차단이 무너진다.
        revokeRecruitmentJoinCode(leaderToken, club.getId(), externalRecruitment.getId(), inviteJoinCodeId)
                .then().statusCode(HttpStatus.NOT_FOUND.value());
        assertThat(clubJoinCodeRepository.findById(inviteJoinCodeId).orElseThrow().getRevokedAt())
                .as("초대 링크는 모집 경로로 폐기되지 않는다").isNull();
    }

    @Test
    @DisplayName("일반 회원과 타 동아리 운영진은 부원 초대 링크를 만들거나 조회·폐기할 수 없다")
    void nonManagerAccessReturns403() {
        Long joinCodeId = createInviteCode(leaderToken, club.getId(), VALID_BODY)
                .jsonPath().getLong("data.joinCodeId");

        for (String forbiddenToken : List.of(memberToken, otherClubLeaderToken)) {
            createInviteCode(forbiddenToken, club.getId(), VALID_BODY)
                    .then().statusCode(HttpStatus.FORBIDDEN.value());
            getActiveInviteCode(forbiddenToken, club.getId())
                    .then().statusCode(HttpStatus.FORBIDDEN.value());
            revokeInviteCode(forbiddenToken, club.getId(), joinCodeId)
                    .then().statusCode(HttpStatus.FORBIDDEN.value());
        }
    }

    @Test
    @DisplayName("비로그인 상태에서는 부원 초대 링크 생성·조회·폐기가 모두 401 로 막힌다")
    void anonymousAccessReturns401() {
        Long joinCodeId = createInviteCode(leaderToken, club.getId(), VALID_BODY)
                .jsonPath().getLong("data.joinCodeId");

        RestAssured.given().contentType(ContentType.JSON).body(VALID_BODY)
                .when().post("/api/v1/clubs/{clubId}/join-codes", club.getId())
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());

        RestAssured.given()
                .when().get("/api/v1/clubs/{clubId}/join-codes/active", club.getId())
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());

        RestAssured.given()
                .when().delete("/api/v1/clubs/{clubId}/join-codes/{joinCodeId}", club.getId(), joinCodeId)
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());
    }

    private Response createInviteCode(String token, Long targetClubId, Map<String, Object> body) {
        return RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                    .contentType(ContentType.JSON)
                    .body(body)
                .when()
                    .post("/api/v1/clubs/{clubId}/join-codes", targetClubId);
    }

    private Response getActiveInviteCode(String token, Long targetClubId) {
        return RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .when()
                    .get("/api/v1/clubs/{clubId}/join-codes/active", targetClubId);
    }

    private Response revokeInviteCode(String token, Long targetClubId, Long joinCodeId) {
        return RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .when()
                    .delete("/api/v1/clubs/{clubId}/join-codes/{joinCodeId}", targetClubId, joinCodeId);
    }

    /** 모집 스코프 링크 — 초대 링크와의 독립·교차 주입 확인용. */
    private Response createRecruitmentJoinCode(Recruitment targetRecruitment) {
        return RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("maxUses", 10, "joinWindowDays", 7))
                .when()
                    .post("/api/v1/clubs/{clubId}/recruitments/{recruitmentId}/join-codes",
                            club.getId(), targetRecruitment.getId());
    }

    private Response getActiveRecruitmentJoinCode(Recruitment targetRecruitment) {
        return RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when()
                    .get("/api/v1/clubs/{clubId}/recruitments/{recruitmentId}/join-codes/active",
                            club.getId(), targetRecruitment.getId());
    }

    private Response revokeRecruitmentJoinCode(String token, Long targetClubId,
                                               Long targetRecruitmentId, Long joinCodeId) {
        return RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .when()
                    .delete("/api/v1/clubs/{clubId}/recruitments/{recruitmentId}/join-codes/{joinCodeId}",
                            targetClubId, targetRecruitmentId, joinCodeId);
    }

    /**
     * 만료는 발급 시점 + 프리셋이다 — 하드코딩 절대 날짜 없이 상대 시각으로만 단언한다(시한폭탄 방지).
     * 양방향 오차로 보는 이유는 한쪽만 보면 타임존 regime 착오(−9h)가 통과하기 때문이다.
     */
    private void assertInviteExpiresAt(Response created, Instant beforeIssue, int expiresInHours) {
        String inviteExpiresAt = created.jsonPath().getString("data.inviteExpiresAt");
        assertThat(inviteExpiresAt).as("Event Time 은 오프셋 있는 절대시각(…Z) 으로 직렬화된다").endsWith("Z");
        assertThat(Duration.between(beforeIssue.plus(Duration.ofHours(expiresInHours)),
                Instant.parse(inviteExpiresAt)))
                .as("만료는 발급 시점 + 프리셋 (KST 벽시계 → 절대시각 변환 정합)")
                .isBetween(Duration.ofMinutes(-5), Duration.ofMinutes(5));
        assertThat(created.jsonPath().getString("data.joinExpiresAt"))
                .as("초대 링크의 사용 기한은 절대 만료 시각 하나가 단일 출처다")
                .isEqualTo(inviteExpiresAt);
    }

    /** 감사 이벤트는 기록 순서가 곧 이야기라 id 오름차순으로 본다(재생성 = 폐기 → 재생성). */
    private List<ClubAuditEvent> auditEvents() {
        return clubAuditEventRepository.findAll(Sort.by(Sort.Direction.ASC, "id"));
    }

    /** 실제 학생 플로우와 같이 코드 자리를 하나 확보한 대기 요청을 만든다. */
    private ClubJoinRequest savePendingRequest(ClubJoinCode joinCode, User student) {
        ClubJoinCode storedCode = clubJoinCodeRepository.findById(joinCode.getId()).orElseThrow();
        storedCode.tryConsume();
        clubJoinCodeRepository.save(storedCode);
        return clubJoinRequestRepository.save(ClubJoinRequest.pending(club, student, storedCode));
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
    private Recruitment saveExternalRecruitment(Club targetClub) {
        return recruitmentRepository.save(Recruitment.createWithOptions(targetClub,
                "모집-" + sequence.getAndIncrement(), "내용",
                LocalDate.now().minusDays(1), LocalDate.now().plusDays(14), 10,
                ApplicationMode.EXTERNAL, "https://forms.example.com/duing", false,
                TargetRole.MEMBER, null, null, false));
    }
}
