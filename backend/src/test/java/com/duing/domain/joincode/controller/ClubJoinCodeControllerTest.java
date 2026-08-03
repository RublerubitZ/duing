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
import com.duing.domain.clubmember.entity.ClubMemberRole;
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
    private String leaderToken;
    private String memberToken;
    private String otherClubLeaderToken;

    @BeforeEach
    void setUp() throws Exception {
        RestAssured.port = port;

        User leaderUser = saveUser();
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
    }

    @Test
    @DisplayName("진행 중인 외부 폼 모집이 있으면 운영진이 6자 가입 코드를 만들고 만료 시각을 절대시각으로 받는다")
    void leaderCreatesJoinCodeReturns201() {
        saveRecruitment(club, ApplicationMode.EXTERNAL, false);
        Instant beforeCreate = Instant.now();

        Response created = createJoinCode(leaderToken, Map.of(
                "maxUses", 30, "expiresInDays", 30, "generation", 12));

        created.then()
                .statusCode(HttpStatus.CREATED.value())
                .body("data.maxUses", equalTo(30))
                .body("data.usedCount", equalTo(0))
                .body("data.generation", equalTo(12))
                .body("data.recruitmentOpen", equalTo(true));

        String code = created.jsonPath().getString("data.code");
        assertThat(code).as("Crockford Base32 6자").hasSize(6).matches("[0-9A-HJKMNP-TV-Z]{6}");

        String expiresAt = created.jsonPath().getString("data.expiresAt");
        assertThat(expiresAt).as("Event Time 은 오프셋 있는 절대시각(…Z) 으로 직렬화된다").endsWith("Z");
        assertThat(Duration.between(beforeCreate.plus(Duration.ofDays(30)), Instant.parse(expiresAt)))
                .as("만료는 생성 시점 + 30일").isLessThan(Duration.ofMinutes(5));
    }

    @Test
    @DisplayName("자체 폼 모집만 있거나 외부 폼 모집이 마감됐으면 가입 코드를 만들 수 없다")
    void createRequiresOpenExternalRecruitment() {
        Map<String, Object> validBody = Map.of("maxUses", 10, "expiresInDays", 30);

        // 모집 자체가 없음
        createJoinCode(leaderToken, validBody).then().statusCode(HttpStatus.CONFLICT.value());

        // 자체 폼(SELF) OPEN 모집만 존재
        Recruitment selfRecruitment = saveRecruitment(club, ApplicationMode.SELF, false);
        createJoinCode(leaderToken, validBody).then().statusCode(HttpStatus.CONFLICT.value());

        // 외부 폼이지만 마감(CLOSED) — 동아리당 OPEN 모집은 1건뿐이라(uk_recruitment_club_active)
        // 다음 모집을 만들기 전에 앞의 OPEN 모집을 마감한다.
        closeRecruitment(selfRecruitment);
        saveRecruitment(club, ApplicationMode.EXTERNAL, true);
        createJoinCode(leaderToken, validBody).then().statusCode(HttpStatus.CONFLICT.value());

        // 외부 폼 + OPEN 이 생기면 비로소 생성된다
        saveRecruitment(club, ApplicationMode.EXTERNAL, false);
        createJoinCode(leaderToken, validBody).then().statusCode(HttpStatus.CREATED.value());
    }

    @Test
    @DisplayName("코드를 재생성하면 이전 코드는 폐기되고 활성 코드는 새 코드 하나만 남는다")
    void recreateRevokesPreviousCode() {
        saveRecruitment(club, ApplicationMode.EXTERNAL, false);
        String firstCode = createJoinCode(leaderToken, Map.of("maxUses", 10, "expiresInDays", 30))
                .jsonPath().getString("data.code");

        String secondCode = createJoinCode(leaderToken, Map.of(
                        "maxUses", 20, "expiresInDays", 7, "generation", 13))
                .then().statusCode(HttpStatus.CREATED.value())
                .extract().jsonPath().getString("data.code");

        assertThat(secondCode).isNotEqualTo(firstCode);
        getActiveJoinCode(leaderToken).then()
                .statusCode(HttpStatus.OK.value())
                .body("data.code", equalTo(secondCode))
                .body("data.generation", equalTo(13));
        assertThat(clubJoinCodeRepository.findByClubIdAndRevokedAtIsNull(club.getId()))
                .as("활성 코드는 정확히 1개").isPresent()
                .get().extracting(ClubJoinCode::getCode).isEqualTo(secondCode);
    }

    @Test
    @DisplayName("만료 기간이 7·30·90일이 아니거나 최대 사용 인원이 범위를 벗어나면 생성 요청이 거절된다")
    void invalidCreateInputReturns400() {
        saveRecruitment(club, ApplicationMode.EXTERNAL, false);

        createJoinCode(leaderToken, Map.of("maxUses", 10, "expiresInDays", 15))
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
        createJoinCode(leaderToken, Map.of("maxUses", 501, "expiresInDays", 30))
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
        createJoinCode(leaderToken, Map.of("maxUses", 0, "expiresInDays", 30))
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
        createJoinCode(leaderToken, Map.of("expiresInDays", 30))
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("일반 회원과 타 동아리 운영진은 가입 코드를 만들 수 없다")
    void nonManagerCreateReturns403() {
        saveRecruitment(club, ApplicationMode.EXTERNAL, false);
        Map<String, Object> validBody = Map.of("maxUses", 10, "expiresInDays", 30);

        createJoinCode(memberToken, validBody).then().statusCode(HttpStatus.FORBIDDEN.value());
        createJoinCode(otherClubLeaderToken, validBody).then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("비로그인 상태에서는 가입 코드 생성·조회·폐기가 모두 401 로 막힌다")
    void anonymousAccessReturns401() {
        saveRecruitment(club, ApplicationMode.EXTERNAL, false);
        Long joinCodeId = createJoinCode(leaderToken, Map.of("maxUses", 10, "expiresInDays", 30))
                .jsonPath().getLong("data.joinCodeId");

        RestAssured.given().contentType(ContentType.JSON)
                    .body(Map.of("maxUses", 10, "expiresInDays", 30))
                .when().post("/api/v1/clubs/{clubId}/join-codes", club.getId())
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());

        RestAssured.given()
                .when().get("/api/v1/clubs/{clubId}/join-codes/active", club.getId())
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());

        RestAssured.given()
                .when().delete("/api/v1/clubs/{clubId}/join-codes/{joinCodeId}", club.getId(), joinCodeId)
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());
    }

    @Test
    @DisplayName("활성 코드가 없거나 폐기된 뒤에는 활성 코드 조회가 빈 결과를 반환한다")
    void activeJoinCodeIsNullWhenAbsentOrRevoked() {
        getActiveJoinCode(leaderToken).then()
                .statusCode(HttpStatus.OK.value())
                .body("ok", equalTo(true))
                .body("data", nullValue());

        saveRecruitment(club, ApplicationMode.EXTERNAL, false);
        Long joinCodeId = createJoinCode(leaderToken, Map.of("maxUses", 10, "expiresInDays", 30))
                .jsonPath().getLong("data.joinCodeId");

        revokeJoinCode(leaderToken, club.getId(), joinCodeId)
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        getActiveJoinCode(leaderToken).then()
                .statusCode(HttpStatus.OK.value())
                .body("data", nullValue());
    }

    @Test
    @DisplayName("이미 폐기된 코드를 다시 폐기해도 성공하고 최초 폐기 시각은 바뀌지 않는다")
    void revokeIsIdempotent() {
        saveRecruitment(club, ApplicationMode.EXTERNAL, false);
        Long joinCodeId = createJoinCode(leaderToken, Map.of("maxUses", 10, "expiresInDays", 30))
                .jsonPath().getLong("data.joinCodeId");

        revokeJoinCode(leaderToken, club.getId(), joinCodeId)
                .then().statusCode(HttpStatus.NO_CONTENT.value());
        LocalDateTime firstRevokedAt = clubJoinCodeRepository.findById(joinCodeId)
                .orElseThrow().getRevokedAt();

        revokeJoinCode(leaderToken, club.getId(), joinCodeId)
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        assertThat(clubJoinCodeRepository.findById(joinCodeId).orElseThrow().getRevokedAt())
                .as("멱등 폐기는 감사 시각을 덮어쓰지 않는다").isEqualTo(firstRevokedAt);
    }

    @Test
    @DisplayName("다른 동아리의 코드를 자기 동아리 경로로 폐기하려 하면 존재를 알리지 않고 404 를 반환한다")
    void revokeOtherClubCodeReturns404() {
        saveRecruitment(otherClub, ApplicationMode.EXTERNAL, false);
        Long otherClubJoinCodeId = RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + otherClubLeaderToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("maxUses", 10, "expiresInDays", 30))
                .when()
                    .post("/api/v1/clubs/{clubId}/join-codes", otherClub.getId())
                .then().statusCode(HttpStatus.CREATED.value())
                .extract().jsonPath().getLong("data.joinCodeId");

        revokeJoinCode(leaderToken, club.getId(), otherClubJoinCodeId)
                .then().statusCode(HttpStatus.NOT_FOUND.value());
        assertThat(clubJoinCodeRepository.findById(otherClubJoinCodeId).orElseThrow().getRevokedAt())
                .as("타 동아리 코드는 폐기되지 않는다").isNull();
    }

    private Response createJoinCode(String token, Map<String, Object> body) {
        return RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                    .contentType(ContentType.JSON)
                    .body(body)
                .when()
                    .post("/api/v1/clubs/{clubId}/join-codes", club.getId());
    }

    private Response getActiveJoinCode(String token) {
        return RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .when()
                    .get("/api/v1/clubs/{clubId}/join-codes/active", club.getId());
    }

    private Response revokeJoinCode(String token, Long targetClubId, Long joinCodeId) {
        return RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .when()
                    .delete("/api/v1/clubs/{clubId}/join-codes/{joinCodeId}", targetClubId, joinCodeId);
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
    private Recruitment saveRecruitment(Club targetClub, ApplicationMode applicationMode, boolean closed) {
        Recruitment recruitment = Recruitment.createWithOptions(targetClub,
                "모집-" + sequence.getAndIncrement(), "내용",
                LocalDate.now().minusDays(1), LocalDate.now().plusDays(14), 10,
                applicationMode,
                applicationMode == ApplicationMode.EXTERNAL ? "https://forms.example.com/duing" : null,
                false, TargetRole.MEMBER, null, null, false);
        if (closed) {
            recruitment.close();
        }
        return recruitmentRepository.save(recruitment);
    }

    private void closeRecruitment(Recruitment recruitment) {
        Recruitment stored = recruitmentRepository.findById(recruitment.getId()).orElseThrow();
        stored.close();
        recruitmentRepository.save(stored);
    }
}
