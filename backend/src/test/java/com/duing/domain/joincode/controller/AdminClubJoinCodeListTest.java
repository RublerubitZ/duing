package com.duing.domain.joincode.controller;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.ClubFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.joincode.entity.ClubJoinCode;
import com.duing.domain.joincode.entity.ClubJoinRequest;
import com.duing.domain.joincode.repository.ClubJoinCodeRepository;
import com.duing.domain.joincode.repository.ClubJoinRequestRepository;
import com.duing.domain.joincode.service.JoinCodeService;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.TargetRole;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import io.restassured.path.json.JsonPath;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
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
 * 총동연(ADMIN) 동아리 가입 링크 목록 조회 검증.
 *
 * <p>운영진 화면이 "지금 쓸 수 있는 링크 1개"를 보는 것과 달리, 이 목록은 링크 2종을 폐기·만료·소진까지
 * 한 목록으로 싣는다. 상태는 서버가 판정해 내려보내므로 네 상태가 각각 제 값으로 나오는지가 핵심이다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AdminClubJoinCodeListTest extends IntegrationTestBase {

    private static final String JOIN_CODES_PATH = "/api/v1/admin/clubs/{clubId}/join-codes";
    private static final String EXTERNAL_FORM_URL = "https://forms.example.com/duing";

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired RecruitmentRepository recruitmentRepository;
    @Autowired ClubJoinCodeRepository clubJoinCodeRepository;
    @Autowired ClubJoinRequestRepository clubJoinRequestRepository;
    @Autowired JoinCodeService joinCodeService;
    @Autowired JwtTokenProvider jwtTokenProvider;
    /** 폐기·만료 시각은 프로덕션과 같은 seoulClock 으로 만든다 — 시스템 존(UTC CI)으로 찍으면 KST 로 해석돼 −9h 가 된다. */
    @Autowired Clock clock;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private String adminToken;
    private String studentToken;
    private String leaderToken;

    private Club club;
    private User adminUser;
    private User leaderUser;

    private Long inviteCodeId;
    private Long revokedCodeId;
    private Long expiredCodeId;
    private Long exhaustedCodeId;
    private Long otherClubCodeId;
    private Long expiredRecruitmentId;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;

        adminUser = userRepository.save(UserFixture.admin());
        leaderUser = userRepository.save(UserFixture.withName("이운영"));
        User studentUser = userRepository.save(UserFixture.unique());
        User withdrawnLeader = userRepository.save(UserFixture.withName("탈퇴운영진"));
        adminToken = tokenOf(adminUser);
        leaderToken = tokenOf(leaderUser);
        studentToken = tokenOf(studentUser);

        club = clubRepository.save(ClubFixture.academic("링크동아리"));
        clubMemberRepository.save(ClubMember.asLeader(club, leaderUser));

        LocalDateTime now = LocalDateTime.now(clock);

        // 1) 부원 초대 링크(활성) — 동아리당 미폐기 초대 링크는 1개뿐이다(uk_club_join_code_active_invite_per_club).
        ClubJoinCode inviteCode = clubJoinCodeRepository.save(ClubJoinCode.issueClubInvite(
                club, nextCode(), 12, 30, now.plusHours(24), true, leaderUser.getId()));
        inviteCodeId = inviteCode.getId();
        seedRequests(inviteCode);

        // 2) 모집 가입 링크(폐기) — 마감된 모집의 링크를 총동연이 아닌 운영진이 폐기한 형태.
        Recruitment revokedRecruitment = saveClosedRecruitment("폐기된 링크의 모집", now.minusDays(1));
        ClubJoinCode revokedCode = clubJoinCodeRepository.save(ClubJoinCode.issue(
                club, revokedRecruitment, nextCode(), null, 10, 7, leaderUser.getId()));
        revokedCode.revoke(now.minusHours(2), adminUser.getId());
        clubJoinCodeRepository.save(revokedCode);
        revokedCodeId = revokedCode.getId();

        // 3) 모집 가입 링크(만료) — 종료 + 프리셋 0일이라 기한이 이미 지났다. 발급자는 탈퇴시킨다.
        Recruitment expiredRecruitment = saveClosedRecruitment("만료된 링크의 모집", now.minusDays(10));
        expiredRecruitmentId = expiredRecruitment.getId();
        expiredCodeId = clubJoinCodeRepository.save(ClubJoinCode.issue(
                club, expiredRecruitment, nextCode(), null, 10, 0, withdrawnLeader.getId())).getId();
        userRepository.delete(withdrawnLeader);

        // 4) 모집 가입 링크(소진) — 진행 중 모집이라 기간은 살아 있지만 정원을 다 썼다.
        Recruitment openRecruitment = recruitmentRepository.save(Recruitment.createWithOptions(
                club, "진행 중 모집", "내용", LocalDate.now().minusDays(3), LocalDate.now().plusDays(7),
                10, ApplicationMode.EXTERNAL, EXTERNAL_FORM_URL, false, TargetRole.MEMBER, null, null, false));
        ClubJoinCode exhaustedCode = ClubJoinCode.issue(
                club, openRecruitment, nextCode(), null, 1, 7, leaderUser.getId());
        exhaustedCode.tryConsume();
        exhaustedCodeId = clubJoinCodeRepository.save(exhaustedCode).getId();

        // 다른 동아리의 링크 — 어느 것도 응답에 섞이면 안 된다.
        Club otherClub = clubRepository.save(ClubFixture.academic("다른동아리"));
        otherClubCodeId = clubJoinCodeRepository.save(ClubJoinCode.issueClubInvite(
                otherClub, nextCode(), null, 5, now.plusHours(24), false, leaderUser.getId())).getId();
    }

    @Test
    @DisplayName("동아리의 가입 링크를 링크 2종·네 상태 그대로 최신순으로 내려주고 다른 동아리 링크는 섞이지 않는다")
    void listsAllJoinCodesWithResolvedStatus() {
        JsonPath response = list();

        assertThat(response.getList("data.joinCodeId", Long.class))
                .as("발급 최신순 — 다른 동아리 링크는 포함되지 않는다")
                .containsExactly(exhaustedCodeId, expiredCodeId, revokedCodeId, inviteCodeId)
                .doesNotContain(otherClubCodeId);

        assertThat(response.getString(path(inviteCodeId) + ".linkType")).isEqualTo("CLUB_INVITE");
        assertThat(response.getString(path(inviteCodeId) + ".status")).isEqualTo("ACTIVE");
        assertThat(response.getString(path(inviteCodeId) + ".recruitmentId"))
                .as("초대 링크는 귀속 모집이 없다").isNull();
        assertThat(response.getBoolean(path(inviteCodeId) + ".autoApprove")).isTrue();
        assertThat(response.getInt(path(inviteCodeId) + ".generation")).isEqualTo(12);
        assertThat(response.getInt(path(inviteCodeId) + ".maxUses")).isEqualTo(30);
        assertThat(response.getString(path(inviteCodeId) + ".inviteExpiresAt")).isNotNull();
        assertThat(response.getString(path(inviteCodeId) + ".code")).hasSize(6);

        assertThat(response.getString(path(revokedCodeId) + ".linkType")).isEqualTo("RECRUITMENT");
        assertThat(response.getString(path(revokedCodeId) + ".status")).isEqualTo("REVOKED");
        assertThat(response.getString(path(revokedCodeId) + ".recruitmentTitle"))
                .isEqualTo("폐기된 링크의 모집");
        assertThat(response.getString(path(revokedCodeId) + ".inviteExpiresAt"))
                .as("모집 링크는 절대 만료 시각을 갖지 않는다").isNull();

        assertThat(response.getString(path(expiredCodeId) + ".status")).isEqualTo("EXPIRED");
        assertThat(response.getLong(path(expiredCodeId) + ".recruitmentId")).isEqualTo(expiredRecruitmentId);
        assertThat(response.getString(path(expiredCodeId) + ".joinExpiresAt"))
                .as("마감된 모집은 종료 + 프리셋으로 기한이 확정된다").isNotNull();

        assertThat(response.getString(path(exhaustedCodeId) + ".status"))
                .as("기간이 남아 있어도 정원을 다 쓴 링크는 소진이 우선한다").isEqualTo("EXHAUSTED");
        assertThat(response.getInt(path(exhaustedCodeId) + ".usedCount")).isEqualTo(1);
        assertThat(response.getInt(path(exhaustedCodeId) + ".maxUses")).isEqualTo(1);
        assertThat(response.getString(path(exhaustedCodeId) + ".joinExpiresAt"))
                .as("진행 중 모집은 기한이 아직 정해지지 않았다").isNull();
    }

    @Test
    @DisplayName("발급자·폐기자 이름을 붙여 내려주고 탈퇴한 발급자는 이름만 비운다")
    void resolvesIssuerAndRevokerNames() {
        JsonPath response = list();

        assertThat(response.getLong(path(inviteCodeId) + ".createdById")).isEqualTo(leaderUser.getId());
        assertThat(response.getString(path(inviteCodeId) + ".createdByName")).isEqualTo("이운영");
        assertThat(response.getString(path(inviteCodeId) + ".revokedById")).isNull();
        assertThat(response.getString(path(inviteCodeId) + ".revokedByName")).isNull();

        assertThat(response.getLong(path(revokedCodeId) + ".revokedById")).isEqualTo(adminUser.getId());
        assertThat(response.getString(path(revokedCodeId) + ".revokedByName"))
                .isEqualTo(adminUser.getName());
        assertThat(response.getString(path(revokedCodeId) + ".revokedAt")).isNotNull();

        assertThat(response.getLong(path(expiredCodeId) + ".createdById")).isNotNull();
        assertThat(response.getString(path(expiredCodeId) + ".createdByName"))
                .as("탈퇴한 발급자는 이름만 비운다 — 링크 행 자체는 이력으로 남는다").isNull();
    }

    @Test
    @DisplayName("누적 가입 신청과 승인 대기 수를 링크별로 함께 내려준다")
    void includesRequestCounts() {
        JsonPath response = list();

        assertThat(response.getLong(path(inviteCodeId) + ".totalRequestCount"))
                .as("거절된 요청도 누적에는 포함된다").isEqualTo(2L);
        assertThat(response.getLong(path(inviteCodeId) + ".pendingCount")).isEqualTo(1L);
        assertThat(response.getLong(path(revokedCodeId) + ".totalRequestCount"))
                .as("요청이 없는 링크는 0 으로 채운다").isZero();
        assertThat(response.getLong(path(revokedCodeId) + ".pendingCount")).isZero();
    }

    @Test
    @DisplayName("관리자가 아니면 가입 링크 목록을 볼 수 없다 — 동아리 회장도 전역 역할은 학생이라 막힌다")
    void nonAdminIsForbidden() {
        RestAssured.given().header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when().get(JOIN_CODES_PATH, club.getId())
                .then().statusCode(HttpStatus.FORBIDDEN.value());
        RestAssured.given().header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get(JOIN_CODES_PATH, club.getId())
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("없는 동아리는 404 가 아니라 빈 목록이다 — 활동 이력과 같이 존재 검사를 하지 않는다")
    void missingClubReturnsEmptyList() {
        assertThat(list(999_999L).getList("data")).isEmpty();
    }

    @Test
    @DisplayName("폐쇄(soft-delete)된 동아리의 링크도 조회된다 — 폐쇄가 벌크 폐기한 링크가 REVOKED 로 실린다")
    void closedClubJoinCodesStayReadable() {
        Club closedClub = clubRepository.save(ClubFixture.academic("폐쇄동아리"));
        Long closedClubCodeId = clubJoinCodeRepository.save(ClubJoinCode.issueClubInvite(
                closedClub, nextCode(), null, 10, LocalDateTime.now(clock).plusHours(24), false,
                leaderUser.getId())).getId();
        // 폐쇄 경로가 링크를 끊는 그 호출 — 딸린 모집이 없으므로 부원 초대 링크만 폐기된다.
        joinCodeService.revokeActiveOnClubClosure(closedClub.getId(), List.of(), adminUser.getId());
        clubRepository.delete(closedClub);

        JsonPath response = list(closedClub.getId());

        assertThat(response.getList("data.joinCodeId", Long.class)).containsExactly(closedClubCodeId);
        assertThat(response.getString(path(closedClubCodeId) + ".status"))
                .as("폐쇄가 활성 링크를 함께 폐기하므로 남은 상태는 REVOKED 다").isEqualTo("REVOKED");
        assertThat(response.getLong(path(closedClubCodeId) + ".revokedById")).isEqualTo(adminUser.getId());
    }

    private JsonPath list() {
        return list(club.getId());
    }

    private JsonPath list(Long clubId) {
        return RestAssured.given().header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get(JOIN_CODES_PATH, clubId)
                .then().statusCode(HttpStatus.OK.value())
                .extract().jsonPath();
    }

    private static String path(Long joinCodeId) {
        return "data.find { it.joinCodeId == " + joinCodeId + " }";
    }

    /** 한 링크에 대기 1건 + 거절 1건 — 누적은 전 상태를 세고 대기는 PENDING 만 센다. */
    private void seedRequests(ClubJoinCode joinCode) {
        clubJoinRequestRepository.save(ClubJoinRequest.pending(
                club, userRepository.save(UserFixture.unique()), joinCode));
        ClubJoinRequest rejected = ClubJoinRequest.pending(
                club, userRepository.save(UserFixture.unique()), joinCode);
        rejected.reject(leaderUser, LocalDateTime.now(clock));
        clubJoinRequestRepository.save(rejected);
    }

    /** 모집 기간·종료 시각은 하드코딩 절대일자 없이 지금 기준 상대값으로 만든다(시한폭탄 테스트 방지). */
    private Recruitment saveClosedRecruitment(String title, LocalDateTime closedAt) {
        Recruitment recruitment = recruitmentRepository.save(Recruitment.createWithOptions(
                club, title, "내용", LocalDate.now().minusDays(30), LocalDate.now().minusDays(20),
                10, ApplicationMode.EXTERNAL, EXTERNAL_FORM_URL, false, TargetRole.MEMBER, null, null, false));
        recruitment.close(closedAt);
        return recruitmentRepository.save(recruitment);
    }

    private String nextCode() {
        return "T%05d".formatted(sequence.incrementAndGet() % 100_000);
    }

    private String tokenOf(User user) {
        return jwtTokenProvider.createToken(user.getId(), user.getRole().name());
    }
}
