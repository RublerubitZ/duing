package com.duing.domain.joincode.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.nullValue;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.joincode.entity.ClubJoinCode;
import com.duing.domain.joincode.repository.ClubJoinCodeRepository;
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
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
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

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ClubJoinCodeControllerTest extends IntegrationTestBase {

    private static final Map<String, Object> VALID_BODY = Map.of("maxUses", 10, "expiresInDays", 30);

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired RecruitmentRepository recruitmentRepository;
    @Autowired ClubJoinCodeRepository clubJoinCodeRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private Club club;
    private Club otherClub;
    private Recruitment externalRecruitment;
    private User leaderUser;
    private String leaderToken;
    private String memberToken;
    private String otherClubLeaderToken;

    @BeforeEach
    void setUp() throws Exception {
        RestAssured.port = port;

        leaderUser = saveUser();
        User memberUser = saveUser();
        User otherClubLeaderUser = saveUser();

        club = saveActiveClub("가입코드동아리");
        otherClub = saveActiveClub("타동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leaderUser));
        clubMemberRepository.save(ClubMember.asMember(club, memberUser));
        clubMemberRepository.save(ClubMember.asLeader(otherClub, otherClubLeaderUser));

        leaderToken = tokenOf(leaderUser);
        memberToken = tokenOf(memberUser);
        otherClubLeaderToken = tokenOf(otherClubLeaderUser);

        externalRecruitment = saveRecruitment(club, ApplicationMode.EXTERNAL);
    }

    @Test
    @DisplayName("외부 폼 모집에서 운영진이 6자 가입 코드를 만들고 만료 시각을 절대시각으로 받는다")
    void leaderCreatesJoinCodeReturns201() {
        Instant beforeCreate = Instant.now();

        Response created = createJoinCode(leaderToken, externalRecruitment, Map.of(
                "maxUses", 30, "expiresInDays", 30, "generation", 12));

        created.then()
                .statusCode(HttpStatus.CREATED.value())
                .body("data.maxUses", equalTo(30))
                .body("data.usedCount", equalTo(0))
                .body("data.generation", equalTo(12));

        String code = created.jsonPath().getString("data.code");
        assertThat(code).as("Crockford Base32 6자").hasSize(6).matches("[0-9A-HJKMNP-TV-Z]{6}");

        ClubJoinCode stored = clubJoinCodeRepository.findById(
                created.jsonPath().getLong("data.joinCodeId")).orElseThrow();
        assertThat(stored.getRecruitment().getId()).as("코드는 경로의 모집에 귀속된다")
                .isEqualTo(externalRecruitment.getId());
        assertThat(stored.getClub().getId())
                .as("비정규화된 club_id 도 함께 채워진다 — 가입 요청 콘솔이 동아리 단위로 조회한다")
                .isEqualTo(club.getId());
        assertThat(stored.getCreatedById()).as("발급 주체가 감사 컬럼에 기록된다")
                .isEqualTo(leaderUser.getId());

        String expiresAt = created.jsonPath().getString("data.expiresAt");
        assertThat(expiresAt).as("Event Time 은 오프셋 있는 절대시각(…Z) 으로 직렬화된다").endsWith("Z");
        // 양방향 오차 단언 — 한쪽만 보면 타임존 regime 착오(seoul 을 system 으로 변환 시 −9h)가 통과한다.
        assertThat(Duration.between(beforeCreate.plus(Duration.ofDays(30)), Instant.parse(expiresAt)))
                .as("만료는 생성 시점 + 30일 (KST 벽시계 → 절대시각 변환 정합)")
                .isBetween(Duration.ofMinutes(-5), Duration.ofMinutes(5));
    }

    @Test
    @DisplayName("가입 코드는 진행 중인 외부 폼 모집에서만 만들 수 있고 마감된 모집은 사유를 구분해 거절한다")
    void createIsAllowedOnlyForOpenExternalRecruitment() {
        createJoinCode(leaderToken, externalRecruitment, VALID_BODY)
                .then().statusCode(HttpStatus.CREATED.value());

        // 모집 생성 → 즉시 마감 → 코드 발급으로 모집 절차를 건너뛰는 우회를 막는다.
        closeRecruitment(externalRecruitment);
        createJoinCode(leaderToken, externalRecruitment, VALID_BODY)
                .then().statusCode(HttpStatus.CONFLICT.value())
                .body("message", equalTo("모집이 진행 중일 때만 가입 링크를 만들 수 있습니다."));

        // 동아리당 OPEN 모집은 1건뿐이라(uk_recruitment_club_active) 외부 폼 모집을 마감한 뒤 만든다.
        Recruitment selfRecruitment = saveRecruitment(club, ApplicationMode.SELF);
        createJoinCode(leaderToken, selfRecruitment, VALID_BODY)
                .then().statusCode(HttpStatus.CONFLICT.value())
                .body("message", equalTo("외부 폼 모집에서만 가입 링크를 사용할 수 있습니다."));

        closeRecruitment(selfRecruitment);
        createJoinCode(leaderToken, selfRecruitment, VALID_BODY)
                .then().statusCode(HttpStatus.CONFLICT.value())
                .body("message", equalTo("외부 폼 모집에서만 가입 링크를 사용할 수 있습니다."));
    }

    @Test
    @DisplayName("다른 동아리의 모집 id 를 자기 동아리 경로에 끼워 넣으면 존재를 알리지 않고 404 를 반환한다")
    void recruitmentOfAnotherClubReturns404() {
        Recruitment otherClubRecruitment = saveRecruitment(otherClub, ApplicationMode.EXTERNAL);

        createJoinCode(leaderToken, otherClubRecruitment, VALID_BODY)
                .then().statusCode(HttpStatus.NOT_FOUND.value());
        getActiveJoinCode(leaderToken, otherClubRecruitment)
                .then().statusCode(HttpStatus.NOT_FOUND.value());
        revokeJoinCode(leaderToken, club.getId(), otherClubRecruitment.getId(), 1L)
                .then().statusCode(HttpStatus.NOT_FOUND.value());
    }

    @Test
    @DisplayName("같은 동아리의 외부 폼 모집이 여럿이면 모집마다 활성 코드를 하나씩 가질 수 있다")
    void eachRecruitmentKeepsItsOwnActiveCode() {
        // 발급은 진행 중 모집에서만 가능하고 동아리당 OPEN 모집은 1건이므로,
        // 먼저 발급 → 마감 → 다음 모집 개설 순으로 두 모집의 활성 코드를 만든다.
        String firstCode = createJoinCode(leaderToken, externalRecruitment, VALID_BODY)
                .then().statusCode(HttpStatus.CREATED.value())
                .extract().jsonPath().getString("data.code");

        closeRecruitment(externalRecruitment);
        Recruitment secondRecruitment = saveRecruitment(club, ApplicationMode.EXTERNAL);
        String secondCode = createJoinCode(leaderToken, secondRecruitment, VALID_BODY)
                .then().statusCode(HttpStatus.CREATED.value())
                .extract().jsonPath().getString("data.code");

        assertThat(secondCode).as("모집마다 서로 다른 코드").isNotEqualTo(firstCode);
        getActiveJoinCode(leaderToken, externalRecruitment).then()
                .statusCode(HttpStatus.OK.value())
                .body("data.code", equalTo(firstCode));
        getActiveJoinCode(leaderToken, secondRecruitment).then()
                .statusCode(HttpStatus.OK.value())
                .body("data.code", equalTo(secondCode));
    }

    @Test
    @DisplayName("같은 모집에서 코드를 재생성하면 이전 코드는 폐기되고 활성 코드는 새 코드 하나만 남는다")
    void recreateRevokesPreviousCode() {
        Response firstCreated = createJoinCode(leaderToken, externalRecruitment, VALID_BODY);
        String firstCode = firstCreated.jsonPath().getString("data.code");
        Long firstJoinCodeId = firstCreated.jsonPath().getLong("data.joinCodeId");

        String secondCode = createJoinCode(leaderToken, externalRecruitment, Map.of(
                        "maxUses", 20, "expiresInDays", 7, "generation", 13))
                .then().statusCode(HttpStatus.CREATED.value())
                .extract().jsonPath().getString("data.code");

        assertThat(secondCode).isNotEqualTo(firstCode);
        getActiveJoinCode(leaderToken, externalRecruitment).then()
                .statusCode(HttpStatus.OK.value())
                .body("data.code", equalTo(secondCode))
                .body("data.generation", equalTo(13));
        assertThat(clubJoinCodeRepository.findByRecruitmentIdAndRevokedAtIsNull(externalRecruitment.getId()))
                .as("모집의 활성 코드는 정확히 1개").isPresent()
                .get().extracting(ClubJoinCode::getCode).isEqualTo(secondCode);
        assertThat(clubJoinCodeRepository.findById(firstJoinCodeId).orElseThrow().getRevokedById())
                .as("재생성으로 자동 폐기된 이전 코드에도 폐기 주체가 남는다").isEqualTo(leaderUser.getId());
    }

    @Test
    @DisplayName("만료 기간이 7·30·90일이 아니거나 최대 사용 인원이 범위를 벗어나면 생성 요청이 거절된다")
    void invalidCreateInputReturns400() {
        createJoinCode(leaderToken, externalRecruitment, Map.of("maxUses", 10, "expiresInDays", 15))
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
        createJoinCode(leaderToken, externalRecruitment, Map.of("maxUses", 501, "expiresInDays", 30))
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
        createJoinCode(leaderToken, externalRecruitment, Map.of("maxUses", 0, "expiresInDays", 30))
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
        createJoinCode(leaderToken, externalRecruitment, Map.of("expiresInDays", 30))
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("일반 회원과 타 동아리 운영진은 가입 코드를 만들 수 없다")
    void nonManagerCreateReturns403() {
        createJoinCode(memberToken, externalRecruitment, VALID_BODY)
                .then().statusCode(HttpStatus.FORBIDDEN.value());
        createJoinCode(otherClubLeaderToken, externalRecruitment, VALID_BODY)
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("비로그인 상태에서는 가입 코드 생성·조회·폐기가 모두 401 로 막힌다")
    void anonymousAccessReturns401() {
        Long joinCodeId = createJoinCode(leaderToken, externalRecruitment, VALID_BODY)
                .jsonPath().getLong("data.joinCodeId");
        Long recruitmentId = externalRecruitment.getId();

        RestAssured.given().contentType(ContentType.JSON).body(VALID_BODY)
                .when().post("/api/v1/clubs/{clubId}/recruitments/{recruitmentId}/join-codes",
                        club.getId(), recruitmentId)
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());

        RestAssured.given()
                .when().get("/api/v1/clubs/{clubId}/recruitments/{recruitmentId}/join-codes/active",
                        club.getId(), recruitmentId)
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());

        RestAssured.given()
                .when().delete("/api/v1/clubs/{clubId}/recruitments/{recruitmentId}/join-codes/{joinCodeId}",
                        club.getId(), recruitmentId, joinCodeId)
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());
    }

    @Test
    @DisplayName("활성 코드가 없거나 폐기된 뒤에는 활성 코드 조회가 빈 결과를 반환한다")
    void activeJoinCodeIsNullWhenAbsentOrRevoked() {
        getActiveJoinCode(leaderToken, externalRecruitment).then()
                .statusCode(HttpStatus.OK.value())
                .body("ok", equalTo(true))
                .body("data", nullValue());

        Long joinCodeId = createJoinCode(leaderToken, externalRecruitment, VALID_BODY)
                .jsonPath().getLong("data.joinCodeId");

        revokeJoinCode(leaderToken, club.getId(), externalRecruitment.getId(), joinCodeId)
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        getActiveJoinCode(leaderToken, externalRecruitment).then()
                .statusCode(HttpStatus.OK.value())
                .body("data", nullValue());
    }

    @Test
    @DisplayName("이미 폐기된 코드를 다시 폐기해도 성공하고 최초 폐기 시각은 바뀌지 않는다")
    void revokeIsIdempotent() {
        Long joinCodeId = createJoinCode(leaderToken, externalRecruitment, VALID_BODY)
                .jsonPath().getLong("data.joinCodeId");

        revokeJoinCode(leaderToken, club.getId(), externalRecruitment.getId(), joinCodeId)
                .then().statusCode(HttpStatus.NO_CONTENT.value());
        ClubJoinCode revoked = clubJoinCodeRepository.findById(joinCodeId).orElseThrow();
        LocalDateTime firstRevokedAt = revoked.getRevokedAt();
        assertThat(revoked.getRevokedById()).as("수동 폐기 주체가 감사 컬럼에 기록된다")
                .isEqualTo(leaderUser.getId());

        revokeJoinCode(leaderToken, club.getId(), externalRecruitment.getId(), joinCodeId)
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        assertThat(clubJoinCodeRepository.findById(joinCodeId).orElseThrow().getRevokedAt())
                .as("멱등 폐기는 감사 시각을 덮어쓰지 않는다").isEqualTo(firstRevokedAt);
    }

    @Test
    @DisplayName("다른 모집의 코드를 자기 모집 경로로 폐기하려 하면 존재를 알리지 않고 404 를 반환한다")
    void revokeCodeOfAnotherRecruitmentReturns404() {
        closeRecruitment(externalRecruitment);
        Recruitment secondRecruitment = saveRecruitment(club, ApplicationMode.EXTERNAL);
        Long otherRecruitmentJoinCodeId = createJoinCode(leaderToken, secondRecruitment, VALID_BODY)
                .then().statusCode(HttpStatus.CREATED.value())
                .extract().jsonPath().getLong("data.joinCodeId");

        revokeJoinCode(leaderToken, club.getId(), externalRecruitment.getId(), otherRecruitmentJoinCodeId)
                .then().statusCode(HttpStatus.NOT_FOUND.value());
        assertThat(clubJoinCodeRepository.findById(otherRecruitmentJoinCodeId).orElseThrow().getRevokedAt())
                .as("다른 모집의 코드는 폐기되지 않는다").isNull();
    }

    private Response createJoinCode(String token, Recruitment targetRecruitment, Map<String, Object> body) {
        return RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                    .contentType(ContentType.JSON)
                    .body(body)
                .when()
                    .post("/api/v1/clubs/{clubId}/recruitments/{recruitmentId}/join-codes",
                            club.getId(), targetRecruitment.getId());
    }

    private Response getActiveJoinCode(String token, Recruitment targetRecruitment) {
        return RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .when()
                    .get("/api/v1/clubs/{clubId}/recruitments/{recruitmentId}/join-codes/active",
                            club.getId(), targetRecruitment.getId());
    }

    private Response revokeJoinCode(String token, Long targetClubId, Long targetRecruitmentId, Long joinCodeId) {
        return RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .when()
                    .delete("/api/v1/clubs/{clubId}/recruitments/{recruitmentId}/join-codes/{joinCodeId}",
                            targetClubId, targetRecruitmentId, joinCodeId);
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
    private Recruitment saveRecruitment(Club targetClub, ApplicationMode applicationMode) {
        return recruitmentRepository.save(Recruitment.createWithOptions(targetClub,
                "모집-" + sequence.getAndIncrement(), "내용",
                LocalDate.now().minusDays(1), LocalDate.now().plusDays(14), 10,
                applicationMode,
                applicationMode == ApplicationMode.EXTERNAL ? "https://forms.example.com/duing" : null,
                false, TargetRole.MEMBER, null, null, false));
    }

    private void closeRecruitment(Recruitment recruitment) {
        Recruitment stored = recruitmentRepository.findById(recruitment.getId()).orElseThrow();
        stored.close();
        recruitmentRepository.save(stored);
    }
}
