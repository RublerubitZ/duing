package com.duing.domain.recruitment.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.notNullValue;
import static org.hamcrest.Matchers.nullValue;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.ClubFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.application.entity.Application;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.repository.ClubRepository;
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
 * 총동연(ADMIN) 모집 콘솔의 목록·상세 조회 검증.
 *
 * <p>시드 순서가 곧 최신순 정렬의 기대값이다 — 같은 동아리에 OPEN 모집은 하나뿐이므로
 * (uk_recruitment_club_active) 마감·삭제 모집을 먼저 만든 뒤 진행 중 모집을 만든다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AdminRecruitmentQueryControllerTest extends IntegrationTestBase {

    private static final String LIST_PATH = "/api/v1/admin/recruitments";
    private static final String DETAIL_PATH = "/api/v1/admin/recruitments/{recruitmentId}";
    private static final String EXTERNAL_FORM_URL = "https://forms.example.com/duing";

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired RecruitmentRepository recruitmentRepository;
    @Autowired ApplicationRepository applicationRepository;
    @Autowired ClubJoinCodeRepository clubJoinCodeRepository;
    @Autowired ClubJoinRequestRepository clubJoinRequestRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;
    /** 마감 시각은 프로덕션과 같은 seoulClock 으로 찍는다 — 시스템 존(UTC CI)으로 찍으면 KST 로 해석돼 어긋난다. */
    @Autowired Clock clock;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private Club alphaClub;
    private Club betaClub;

    private Recruitment closedRecruitment;
    private Recruitment deletedRecruitment;
    private Recruitment selfRecruitment;
    private Recruitment externalRecruitment;
    private Recruitment alwaysOpenRecruitment;

    private User leaderUser;
    private String adminToken;
    private String studentToken;
    private String leaderToken;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;

        User adminUser = userRepository.save(UserFixture.admin());
        User studentUser = userRepository.save(UserFixture.unique());
        leaderUser = userRepository.save(UserFixture.unique());
        adminToken = tokenOf(adminUser);
        studentToken = tokenOf(studentUser);
        leaderToken = tokenOf(leaderUser);

        alphaClub = clubRepository.save(ClubFixture.academic("알파동아리"));
        betaClub = clubRepository.save(ClubFixture.academic("베타동아리"));
        Club gammaClub = clubRepository.save(ClubFixture.academic("감마동아리-" + sequence.incrementAndGet()));
        clubMemberRepository.save(ClubMember.asLeader(alphaClub, leaderUser));

        closedRecruitment = saveRecruitment(alphaClub, "지난 학기 모집", ApplicationMode.SELF,
                LocalDate.now().minusDays(40), LocalDate.now().minusDays(10));
        closeRecruitment(closedRecruitment, LocalDateTime.now(clock).minusDays(10));

        deletedRecruitment = saveRecruitment(alphaClub, "삭제된 모집", ApplicationMode.SELF,
                LocalDate.now().minusDays(20), LocalDate.now().plusDays(1));
        recruitmentRepository.delete(deletedRecruitment);

        selfRecruitment = saveRecruitment(alphaClub, "자체 폼 신입 모집", ApplicationMode.SELF,
                LocalDate.now().minusDays(3), LocalDate.now().plusDays(7));
        externalRecruitment = saveRecruitment(betaClub, "외부 폼 Spring 신입 모집", ApplicationMode.EXTERNAL,
                LocalDate.now().minusDays(1), LocalDate.now().plusDays(3));
        alwaysOpenRecruitment = saveRecruitment(gammaClub, "상시 모집", ApplicationMode.SELF,
                LocalDate.now().minusDays(5), null);

        saveApplication(selfRecruitment);
        saveApplication(selfRecruitment);
        applicationRepository.delete(saveApplication(selfRecruitment));
        saveApplication(alwaysOpenRecruitment);
    }

    @Test
    @DisplayName("관리자 목록은 저장 상태와 표시 상태를 함께 내려 기간이 끝난 모집을 모집중으로 적지 않는다")
    void listCarriesDisplayStatusAlongsideRawStatus() {
        // 기간이 끝났는데 아직 마감 처리 전인 모집 — 저장 상태는 OPEN 이라 강제 마감 대상이지만,
        // 학생 화면에는 이미 마감으로 보인다. 총동연 콘솔이 저장 상태만 받으면 같은 모집을
        // "모집중"으로 적어 강제 마감 판단 근거가 실제와 어긋난다(#896).
        // 동아리당 OPEN 모집은 1건(uk_recruitment_club_active)이라 기존 모집이 없는 동아리에 만든다.
        Club gammaClub = clubRepository.save(ClubFixture.academic("감마동아리-" + sequence.incrementAndGet()));
        Recruitment expiredOpen = saveRecruitment(gammaClub, "기간 끝난 모집", ApplicationMode.SELF,
                LocalDate.now().minusDays(30), LocalDate.now().minusDays(1));

        Map<String, Object> expiredRow = findRow(getList(adminToken, Map.of()), expiredOpen.getId());

        assertThat(expiredRow.get("status")).as("액션 게이트는 저장 상태를 본다").isEqualTo("OPEN");
        assertThat(expiredRow.get("displayStatus")).as("표기는 학생 화면과 같은 값을 쓴다").isEqualTo("CLOSED");
        assertThat(expiredRow.get("closedAt")).as("아직 마감되지 않았으므로 마감 시각은 없다").isNull();

        Map<String, Object> closedRow = findRow(getList(adminToken, Map.of()), closedRecruitment.getId());
        assertThat(closedRow.get("displayStatus")).isEqualTo("CLOSED");
        assertThat((String) closedRow.get("closedAt"))
                .as("마감 시각은 오프셋 있는 절대시각(…Z)으로 직렬화된다").endsWith("Z");
    }

    @Test
    @DisplayName("관리자 상세도 표시 상태와 마감 시각을 함께 내려준다")
    void detailCarriesDisplayStatusAndClosedAt() {
        Response detail = getDetail(adminToken, closedRecruitment.getId());

        detail.then().statusCode(HttpStatus.OK.value());
        assertThat(detail.jsonPath().getString("data.status")).isEqualTo("CLOSED");
        assertThat(detail.jsonPath().getString("data.displayStatus")).isEqualTo("CLOSED");
        assertThat(detail.jsonPath().getString("data.closedAt"))
                .as("강제 마감의 주체인 화면이라 언제 마감됐는지 알 수 있어야 한다").endsWith("Z");
    }

    @Test
    @DisplayName("관리자 목록은 전 동아리의 모집을 한 번에 보여주고 삭제된 모집은 빼며 외부 폼 모집의 지원자 수는 비운다")
    void listReturnsEveryClubExceptDeletedRecruitments() {
        Response listed = getList(adminToken, Map.of());

        listed.then()
                .statusCode(HttpStatus.OK.value())
                .body("data", hasSize(4));
        assertThat(listed.jsonPath().getList("data.recruitmentId", Long.class))
                .as("삭제된 모집은 목록에 남지 않는다")
                .containsExactlyInAnyOrder(closedRecruitment.getId(), selfRecruitment.getId(),
                        externalRecruitment.getId(), alwaysOpenRecruitment.getId());

        Map<String, Object> selfRow = findRow(listed, selfRecruitment.getId());
        assertThat(selfRow.get("clubId")).isEqualTo(alphaClub.getId().intValue());
        assertThat(selfRow.get("clubName")).isEqualTo("알파동아리");
        assertThat(selfRow.get("title")).isEqualTo("자체 폼 신입 모집");
        assertThat(selfRow.get("status")).isEqualTo("OPEN");
        assertThat(selfRow.get("applicationMode")).isEqualTo("SELF");
        assertThat(selfRow.get("applicantCount"))
                .as("취소된 지원서는 지원자 수에서 빠진다").isEqualTo(2);
        assertThat(selfRow.get("startDate")).isEqualTo(LocalDate.now().minusDays(3).toString());
        assertThat(selfRow.get("endDate")).isEqualTo(LocalDate.now().plusDays(7).toString());
        assertThat((String) selfRow.get("updatedAt"))
                .as("마지막 수정 시각은 오프셋 있는 절대시각(…Z)으로 직렬화된다").endsWith("Z");

        assertThat(findRow(listed, externalRecruitment.getId()).get("applicantCount"))
                .as("외부 폼 모집은 지원 데이터 자체가 없으므로 0 이 아니라 비어 있다").isNull();
        assertThat(findRow(listed, closedRecruitment.getId()).get("applicantCount"))
                .as("자체 폼 모집은 지원자가 없으면 0 이다").isEqualTo(0);
    }

    @Test
    @DisplayName("검색어는 동아리명과 모집 제목 어느 쪽에 걸려도 찾아내며 대소문자를 가리지 않는다")
    void keywordMatchesClubNameOrTitleIgnoringCase() {
        assertThat(getList(adminToken, Map.of("q", "알파")).jsonPath().getList("data.recruitmentId", Long.class))
                .as("동아리명으로 그 동아리의 모집을 모두 찾는다")
                .containsExactlyInAnyOrder(closedRecruitment.getId(), selfRecruitment.getId());

        assertThat(getList(adminToken, Map.of("q", "spring")).jsonPath().getList("data.recruitmentId", Long.class))
                .as("제목 부분 일치는 대소문자를 가리지 않는다")
                .containsExactly(externalRecruitment.getId());

        getList(adminToken, Map.of("q", "존재하지않는검색어"))
                .then().statusCode(HttpStatus.OK.value()).body("data", hasSize(0));
    }

    @Test
    @DisplayName("상태 필터와 방식 필터는 각각 저장 상태와 모집 방식으로 목록을 좁히고 함께 쓸 수 있다")
    void statusAndModeFiltersNarrowTheList() {
        assertThat(getList(adminToken, Map.of("status", "CLOSED"))
                .jsonPath().getList("data.recruitmentId", Long.class))
                .containsExactly(closedRecruitment.getId());

        assertThat(getList(adminToken, Map.of("mode", "EXTERNAL"))
                .jsonPath().getList("data.recruitmentId", Long.class))
                .containsExactly(externalRecruitment.getId());

        assertThat(getList(adminToken, Map.of("status", "OPEN", "mode", "SELF"))
                .jsonPath().getList("data.recruitmentId", Long.class))
                .containsExactlyInAnyOrder(selfRecruitment.getId(), alwaysOpenRecruitment.getId());
    }

    @Test
    @DisplayName("정렬은 최신순·지원자순·마감임박순 세 가지이며 마감일 없는 상시모집은 마감임박순 맨 뒤로 간다")
    void sortSupportsLatestApplicantsAndDeadline() {
        assertThat(getList(adminToken, Map.of()).jsonPath().getList("data.recruitmentId", Long.class))
                .as("정렬을 생략하면 최신순이다")
                .containsExactly(alwaysOpenRecruitment.getId(), externalRecruitment.getId(),
                        selfRecruitment.getId(), closedRecruitment.getId());

        assertThat(getList(adminToken, Map.of("sort", "APPLICANTS"))
                .jsonPath().getList("data.recruitmentId", Long.class))
                .as("지원자가 많은 모집이 먼저 오고 동수는 최신순으로 갈린다")
                .containsExactly(selfRecruitment.getId(), alwaysOpenRecruitment.getId(),
                        externalRecruitment.getId(), closedRecruitment.getId());

        assertThat(getList(adminToken, Map.of("sort", "DEADLINE"))
                .jsonPath().getList("data.recruitmentId", Long.class))
                .as("마감이 임박한 순서, 마감일 없는 상시모집은 맨 뒤")
                .containsExactly(closedRecruitment.getId(), externalRecruitment.getId(),
                        selfRecruitment.getId(), alwaysOpenRecruitment.getId());
    }

    @Test
    @DisplayName("자체 폼 모집 상세에는 외부 폼 주소도 가입 링크 현황도 실리지 않는다")
    void selfRecruitmentDetailHasNoExternalFields() {
        getDetail(adminToken, selfRecruitment.getId()).then()
                .statusCode(HttpStatus.OK.value())
                .body("data.recruitmentId", equalTo(selfRecruitment.getId().intValue()))
                .body("data.clubId", equalTo(alphaClub.getId().intValue()))
                .body("data.clubName", equalTo("알파동아리"))
                .body("data.applicationMode", equalTo("SELF"))
                .body("data.applicantCount", equalTo(2))
                .body("data.externalFormUrl", nullValue())
                .body("data.joinLink", nullValue());
    }

    @Test
    @DisplayName("외부 폼 모집 상세는 가입 링크 현황을 함께 주되 6자리 코드 값은 절대 내려주지 않는다")
    void externalRecruitmentDetailCarriesJoinLinkStatusWithoutCode() {
        ClubJoinCode joinCode = saveJoinCode(betaClub, externalRecruitment, 12, 10, 7);
        // 신청 4건이 자리를 차감했고 그중 1건이 승인됐다 — 등록 수는 차감분에서 대기분을 뺀 값이다.
        saveConsumedRequest(betaClub, joinCode);
        saveConsumedRequest(betaClub, joinCode);
        saveConsumedRequest(betaClub, joinCode);
        ClubJoinRequest approvedRequest = saveConsumedRequest(betaClub, joinCode);
        approvedRequest.approve(leaderUser, LocalDateTime.now(clock));
        clubJoinRequestRepository.save(approvedRequest);

        Response detail = getDetail(adminToken, externalRecruitment.getId());

        detail.then()
                .statusCode(HttpStatus.OK.value())
                .body("data.applicantCount", nullValue())
                .body("data.externalFormUrl", equalTo(EXTERNAL_FORM_URL))
                .body("data.joinLink.linkStatus", equalTo("ACTIVE"))
                .body("data.joinLink.generation", equalTo(12))
                .body("data.joinLink.maxUses", equalTo(10))
                .body("data.joinLink.usedCount", equalTo(4))
                .body("data.joinLink.totalRequestCount", equalTo(4))
                .body("data.joinLink.pendingCount", equalTo(3))
                .body("data.joinLink.enrolledCount", equalTo(1))
                .body("data.joinLink.joinWindowDays", equalTo(7))
                .body("data.joinLink.joinExpiresAt", nullValue());

        assertThat(detail.jsonPath().getMap("data.joinLink"))
                .as("코드 6자리 값은 관리자 응답에 필드 자체가 없다").doesNotContainKey("code");
        assertThat(detail.asString())
                .as("코드 값이 다른 필드에 섞여 나가지도 않는다").doesNotContain(joinCode.getCode());
    }

    @Test
    @DisplayName("가입 링크는 자리가 소진되면 소진, 마감 후 사용 기한이 지나면 만료로 드러나고 기한 안이면 계속 활성이다")
    void joinLinkStatusFollowsUsageAndDeadline() {
        ClubJoinCode exhaustedCode = saveJoinCode(betaClub, externalRecruitment, null, 1, 7);
        saveConsumedRequest(betaClub, exhaustedCode);

        getDetail(adminToken, externalRecruitment.getId()).then()
                .body("data.joinLink.linkStatus", equalTo("EXHAUSTED"));

        // 소진이 아니라 기한 경과로 만료된 사례 — 자리는 10개 중 0개만 썼다.
        Club deltaClub = clubRepository.save(ClubFixture.academic("델타동아리"));
        Recruitment longClosedRecruitment = saveRecruitment(deltaClub, "지난 외부 폼 모집",
                ApplicationMode.EXTERNAL, LocalDate.now().minusDays(60), LocalDate.now().minusDays(30));
        saveJoinCode(deltaClub, longClosedRecruitment, null, 10, 7);
        closeRecruitment(longClosedRecruitment, LocalDateTime.now(clock).minusDays(30));

        getDetail(adminToken, longClosedRecruitment.getId()).then()
                .body("data.joinLink.linkStatus", equalTo("EXPIRED"))
                .body("data.joinLink.joinExpiresAt", notNullValue());

        // 마감돼도 가입 가능 기간 안이면 링크는 살아 있다.
        Club epsilonClub = clubRepository.save(ClubFixture.academic("엡실론동아리"));
        Recruitment recentlyClosedRecruitment = saveRecruitment(epsilonClub, "막 마감한 외부 폼 모집",
                ApplicationMode.EXTERNAL, LocalDate.now().minusDays(10), LocalDate.now().minusDays(1));
        saveJoinCode(epsilonClub, recentlyClosedRecruitment, null, 10, 7);
        closeRecruitment(recentlyClosedRecruitment, LocalDateTime.now(clock).minusDays(1));

        getDetail(adminToken, recentlyClosedRecruitment.getId()).then()
                .body("data.joinLink.linkStatus", equalTo("ACTIVE"))
                .body("data.joinLink.joinExpiresAt", notNullValue());
    }

    @Test
    @DisplayName("활성 가입 링크가 없는 외부 폼 모집 상세는 링크 현황 없이 내려온다")
    void externalRecruitmentWithoutActiveJoinCodeHasNoJoinLink() {
        getDetail(adminToken, externalRecruitment.getId()).then()
                .statusCode(HttpStatus.OK.value())
                .body("data.applicationMode", equalTo("EXTERNAL"))
                .body("data.joinLink", nullValue());
    }

    @Test
    @DisplayName("없는 모집이나 삭제된 모집의 상세를 요청하면 404 를 반환한다")
    void detailOfMissingOrDeletedRecruitmentReturns404() {
        getDetail(adminToken, deletedRecruitment.getId())
                .then().statusCode(HttpStatus.NOT_FOUND.value());
        getDetail(adminToken, 999_999L)
                .then().statusCode(HttpStatus.NOT_FOUND.value());
    }

    @Test
    @DisplayName("관리자가 아니면 모집 목록·상세에 접근할 수 없다 — 동아리 운영진도 전역 역할은 학생이라 막힌다")
    void nonAdminIsForbidden() {
        getList(studentToken, Map.of()).then().statusCode(HttpStatus.FORBIDDEN.value());
        getDetail(studentToken, selfRecruitment.getId()).then().statusCode(HttpStatus.FORBIDDEN.value());

        // 운영진도 전역 role 은 STUDENT 라, 자기 동아리 모집이어도 관리자 콘솔에는 들어올 수 없다.
        getList(leaderToken, Map.of()).then().statusCode(HttpStatus.FORBIDDEN.value());
        getDetail(leaderToken, selfRecruitment.getId()).then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("비로그인 상태에서는 모집 목록·상세 조회가 401 로 막힌다")
    void anonymousAccessReturns401() {
        RestAssured.given()
                .when().get(LIST_PATH)
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());
        RestAssured.given()
                .when().get(DETAIL_PATH, selfRecruitment.getId())
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());
    }

    private Response getList(String token, Map<String, ?> queryParams) {
        return RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                    .queryParams(queryParams)
                .when()
                    .get(LIST_PATH);
    }

    private Response getDetail(String token, Long recruitmentId) {
        return RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .when()
                    .get(DETAIL_PATH, recruitmentId);
    }

    private Map<String, Object> findRow(Response listed, Long recruitmentId) {
        return listed.jsonPath().getMap("data.find { it.recruitmentId == %d }".formatted(recruitmentId));
    }

    private String tokenOf(User user) {
        return jwtTokenProvider.createToken(user.getId(), user.getRole().name());
    }

    /** 모집 기간은 하드코딩 절대일자 없이 오늘 기준 상대일로 만든다(시한폭탄 테스트 방지). */
    private Recruitment saveRecruitment(Club targetClub, String title, ApplicationMode applicationMode,
                                        LocalDate startDate, LocalDate endDate) {
        return recruitmentRepository.save(Recruitment.createWithOptions(targetClub, title, "내용",
                startDate, endDate, 10, applicationMode,
                applicationMode == ApplicationMode.EXTERNAL ? EXTERNAL_FORM_URL : null,
                false, TargetRole.MEMBER, null, null, false));
    }

    private void closeRecruitment(Recruitment recruitment, LocalDateTime closedAt) {
        Recruitment stored = recruitmentRepository.findById(recruitment.getId()).orElseThrow();
        stored.close(closedAt);
        recruitmentRepository.save(stored);
    }

    private Application saveApplication(Recruitment recruitment) {
        return applicationRepository.save(
                Application.submit(recruitment, userRepository.save(UserFixture.unique()), List.of()));
    }

    private ClubJoinCode saveJoinCode(Club targetClub, Recruitment targetRecruitment, Integer generation,
                                      int maxUses, int joinWindowDays) {
        String code = "T%05d".formatted(sequence.incrementAndGet() % 100_000);
        return clubJoinCodeRepository.save(ClubJoinCode.issue(targetClub, targetRecruitment, code,
                generation, maxUses, joinWindowDays, leaderUser.getId()));
    }

    /** 실제 학생 플로우와 같이 코드 자리를 하나 차감한 대기 요청을 만든다. */
    private ClubJoinRequest saveConsumedRequest(Club targetClub, ClubJoinCode joinCode) {
        ClubJoinCode storedCode = clubJoinCodeRepository.findById(joinCode.getId()).orElseThrow();
        storedCode.tryConsume();
        clubJoinCodeRepository.save(storedCode);
        return clubJoinRequestRepository.save(
                ClubJoinRequest.pending(targetClub, userRepository.save(UserFixture.unique()), storedCode));
    }
}
