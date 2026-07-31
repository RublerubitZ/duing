package com.duing.domain.club.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.nullValue;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import java.lang.reflect.Field;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.context.annotation.Import;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ClubUpdateControllerTest extends IntegrationTestBase {

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private User leaderUser;
    private User officerUser;
    private User memberUser;
    private User strangerUser;
    private Club club;
    private String leaderToken;
    private String officerToken;
    private String memberToken;
    private String strangerToken;

    @BeforeEach
    void setUp() throws Exception {
        RestAssured.port = port;
        leaderUser = saveUser("리더");
        officerUser = saveUser("임원");
        memberUser = saveUser("일반");
        strangerUser = saveUser("외부인");
        club = saveActiveClub("두잉PATCH");
        clubMemberRepository.save(ClubMember.asLeader(club, leaderUser));
        clubMemberRepository.save(ClubMember.of(club, officerUser, ClubMemberRole.OFFICER));
        clubMemberRepository.save(ClubMember.asMember(club, memberUser));

        leaderToken = jwtTokenProvider.createToken(leaderUser.getId(), leaderUser.getRole().name());
        officerToken = jwtTokenProvider.createToken(officerUser.getId(), officerUser.getRole().name());
        memberToken = jwtTokenProvider.createToken(memberUser.getId(), memberUser.getRole().name());
        strangerToken = jwtTokenProvider.createToken(strangerUser.getId(), strangerUser.getRole().name());
    }

    @Test
    @DisplayName("LEADER 가 호출하면 200 과 변경된 동아리 상세를 반환한다")
    void leaderUpdatesSuccessfully() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("description", "수정된 설명", "coverUrl", "https://cover"))
                .when()
                    .patch("/api/v1/clubs/{clubId}", club.getId())
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("ok", equalTo(true))
                    .body("data.description", equalTo("수정된 설명"))
                    .body("data.coverUrl", equalTo("https://cover"));

        Club reloaded = clubRepository.findById(club.getId()).orElseThrow();
        assertThat(reloaded.getDescription()).isEqualTo("수정된 설명");
    }

    @Test
    @DisplayName("OFFICER 가 호출해도 200 과 변경된 동아리 상세를 반환한다")
    void officerUpdatesSuccessfully() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + officerToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("description", "임원이 고친 설명", "location", "학생회관 303호"))
                .when()
                    .patch("/api/v1/clubs/{clubId}", club.getId())
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("ok", equalTo(true))
                    .body("data.description", equalTo("임원이 고친 설명"))
                    .body("data.location", equalTo("학생회관 303호"));

        Club reloaded = clubRepository.findById(club.getId()).orElseThrow();
        assertThat(reloaded.getDescription()).isEqualTo("임원이 고친 설명");
    }

    @Test
    @DisplayName("MEMBER 가 호출하면 403 을 반환한다")
    void memberIsForbidden() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + memberToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("name", "시도"))
                .when()
                    .patch("/api/v1/clubs/{clubId}", club.getId())
                .then()
                    .statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("비멤버가 호출하면 403 을 반환한다")
    void strangerIsForbidden() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + strangerToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("name", "시도"))
                .when()
                    .patch("/api/v1/clubs/{clubId}", club.getId())
                .then()
                    .statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("인증 없이 호출하면 4xx 인증 오류를 반환한다")
    void anonymousIsRejected() {
        int status = RestAssured
                .given()
                    .contentType(ContentType.JSON)
                    .body(Map.of("name", "시도"))
                .when()
                    .patch("/api/v1/clubs/{clubId}", club.getId())
                .then()
                    .extract().statusCode();
        assertThat(status).isIn(401, 403);
    }

    @Test
    @DisplayName("snsLinks 의 platform 이 허용 목록 외이면 400 을 반환한다")
    void invalidSnsPlatformReturns400() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("snsLinks",
                            java.util.List.of(Map.of("platform", "TIKTOK", "url", "https://tiktok.com/@x"))))
                .when()
                    .patch("/api/v1/clubs/{clubId}", club.getId())
                .then()
                    .statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("faqs 의 question 이 빈 문자열이면 400 을 반환한다")
    void invalidFaqQuestionReturns400() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("faqs",
                            java.util.List.of(Map.of("question", "", "answer", "답", "order", 0))))
                .when()
                    .patch("/api/v1/clubs/{clubId}", club.getId())
                .then()
                    .statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("logoUrl 이 javascript 스킴이면 400 을 반환한다")
    void rejectsJavascriptSchemeLogoUrl() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("logoUrl", "javascript:alert(1)"))
                .when()
                    .patch("/api/v1/clubs/{clubId}", club.getId())
                .then()
                    .statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("coverUrl 이 프로토콜 상대경로(//)면 400 을 반환한다")
    void rejectsProtocolRelativeCoverUrl() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("coverUrl", "//evil.com/x.png"))
                .when()
                    .patch("/api/v1/clubs/{clubId}", club.getId())
                .then()
                    .statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("logoUrl 이 역슬래시(/\\)로 시작하면 400 을 반환한다")
    void rejectsBackslashLogoUrl() {
        // 브라우저가 `\` 를 `/` 로 정규화해 `//evil` 로 해석하므로 프로토콜 상대경로와 동일하게 차단한다.
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("logoUrl", "/\\evil.com/x.png"))
                .when()
                    .patch("/api/v1/clubs/{clubId}", club.getId())
                .then()
                    .statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("logoUrl 이 / 로 시작하는 내부 경로면 200 으로 허용된다")
    void allowsRelativeInternalLogoUrl() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("logoUrl", "/files/club/logo.png"))
                .when()
                    .patch("/api/v1/clubs/{clubId}", club.getId())
                .then()
                    .statusCode(HttpStatus.OK.value());
    }

    @Test
    @DisplayName("tags 가 21개면 400 을 반환한다")
    void tooManyTagsReturns400() {
        String[] tooMany = new String[21];
        for (int i = 0; i < 21; i++) tooMany[i] = "t" + i;
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("tags", tooMany))
                .when()
                    .patch("/api/v1/clubs/{clubId}", club.getId())
                .then()
                    .statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("리더가 요청 바디에 동아리명을 실어 보내도 무시되고 이름은 바뀌지 않는다")
    void lockedFieldIgnored() {
        String originalName = club.getName();
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("name", "해킹시도", "location", "학생회관 101호"))
                .when()
                    .patch("/api/v1/clubs/{clubId}", club.getId())
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.name", equalTo(originalName))
                    .body("data.location", equalTo("학생회관 101호"));
    }

    @Test
    @DisplayName("납부 주기 없이 회비 금액만 보내면 400 이다")
    void feeAmountWithoutCycleRejected() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("membershipFeeAmount", 30000))
                .when()
                    .patch("/api/v1/clubs/{clubId}", club.getId())
                .then()
                    .statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("납부 주기가 NONE 인데 금액이 있으면 400 이다")
    void feeNoneWithAmountRejected() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("feeCycle", "NONE", "membershipFeeAmount", 30000))
                .when()
                    .patch("/api/v1/clubs/{clubId}", club.getId())
                .then()
                    .statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("주기와 금액을 쌍으로 보내면 회비가 저장되고 응답에 반영된다")
    void feePairSaved() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("feeCycle", "SEMESTER", "membershipFeeAmount", 30000))
                .when()
                    .patch("/api/v1/clubs/{clubId}", club.getId())
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.feeCycle", equalTo("SEMESTER"))
                    .body("data.membershipFeeAmount", equalTo(30000));
    }

    @Test
    @DisplayName("허용 목록에 없는 프로젝트 아이콘은 400 이다")
    void invalidProjectIconRejected() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("projects",
                            java.util.List.of(Map.of("icon", "EMOJI", "title", "t"))))
                .when()
                    .patch("/api/v1/clubs/{clubId}", club.getId())
                .then()
                    .statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("프로젝트는 6개를 초과할 수 없다")
    void projectsMaxSix() {
        java.util.List<Map<String, Object>> projects = new java.util.ArrayList<>();
        for (int index = 0; index < 7; index++) {
            projects.add(Map.of("icon", "CODE", "title", "프로젝트" + index));
        }
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("projects", projects))
                .when()
                    .patch("/api/v1/clubs/{clubId}", club.getId())
                .then()
                    .statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("기타 SNS 플랫폼은 플랫폼명이 없으면 400 이다")
    void snsOtherRequiresLabel() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("snsLinks",
                            java.util.List.of(Map.of("platform", "OTHER", "url", "https://a.b"))))
                .when()
                    .patch("/api/v1/clubs/{clubId}", club.getId())
                .then()
                    .statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("기타가 아닌 SNS 플랫폼의 label 은 저장되지 않는다")
    void snsNonOtherLabelDropped() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("snsLinks",
                            java.util.List.of(Map.of("platform", "INSTAGRAM", "label", "라벨",
                                    "url", "https://instagram.com/x"))))
                .when()
                    .patch("/api/v1/clubs/{clubId}", club.getId())
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.snsLinks[0].label", nullValue());
    }

    @Test
    @DisplayName("snsLinks 배열에 null 원소가 있으면 400 을 반환한다")
    void nullSnsLinkElementReturns400() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                    .contentType(ContentType.JSON)
                    .body("{\"snsLinks\":[null]}")
                .when()
                    .patch("/api/v1/clubs/{clubId}", club.getId())
                .then()
                    .statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("projects 배열에 null 원소가 있으면 400 을 반환한다")
    void nullProjectElementReturns400() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                    .contentType(ContentType.JSON)
                    .body("{\"projects\":[null]}")
                .when()
                    .patch("/api/v1/clubs/{clubId}", club.getId())
                .then()
                    .statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("useGeneration 을 true 로 보내면 저장되고 동아리 상세 응답에 노출된다")
    void useGenerationTrueSavedAndExposed() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("useGeneration", true))
                .when()
                    .patch("/api/v1/clubs/{clubId}", club.getId())
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.useGeneration", equalTo(true));

        assertThat(clubRepository.findById(club.getId()).orElseThrow().isUseGeneration()).isTrue();
    }

    @Test
    @DisplayName("동아리 상세 응답은 useGeneration 을 기본값(false)으로 노출한다")
    void useGenerationDefaultExposedFalse() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("location", "학생회관 202호"))
                .when()
                    .patch("/api/v1/clubs/{clubId}", club.getId())
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.useGeneration", equalTo(false));
    }

    @Test
    @DisplayName("대표 연락처 공개 범위를 변경할 수 있다")
    void contactVisibilityUpdated() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("contactVisibility", "PRIVATE"))
                .when()
                    .patch("/api/v1/clubs/{clubId}", club.getId())
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.contactVisibility", equalTo("PRIVATE"));
    }

    private User saveUser(String name) {
        long unique = sequence.getAndIncrement();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                name,
                "hashed",
                UserRole.STUDENT,
                Grade.FRESHMAN,
                College.IT_ENGINEERING,
                "미설정",
                "010-0000-0000",
                java.time.LocalDateTime.now()
        ));
    }

    private Club saveActiveClub(String name) throws Exception {
        String uniqueName = name + "-" + sequence.getAndIncrement();
        Club created = Club.create(uniqueName, ClubCategory.ACADEMIC, "분과", "설명", "https://logo");
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(created, ClubStatus.ACTIVE);
        return clubRepository.save(created);
    }
}
