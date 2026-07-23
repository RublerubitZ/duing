package com.duing.domain.club.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.heroactivity.entity.ClubHeroActivity;
import com.duing.domain.club.heroactivity.repository.ClubHeroActivityRepository;
import com.duing.domain.club.photo.entity.ClubPhoto;
import com.duing.domain.club.photo.repository.ClubPhotoRepository;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import io.restassured.path.json.JsonPath;
import java.lang.reflect.Field;
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

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ClubHeroActivityControllerTest extends IntegrationTestBase {

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired ClubPhotoRepository clubPhotoRepository;
    @Autowired ClubHeroActivityRepository clubHeroActivityRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private User leaderUser;
    private User officerUser;
    private User memberUser;
    private Club club;
    private String leaderToken;
    private String officerToken;
    private String memberToken;

    @BeforeEach
    void setUp() throws Exception {
        RestAssured.port = port;
        leaderUser = saveUser("리더");
        officerUser = saveUser("운영");
        memberUser = saveUser("일반");
        club = saveClub("두잉대표활동컨트롤러", ClubStatus.ACTIVE);
        clubMemberRepository.save(ClubMember.asLeader(club, leaderUser));
        clubMemberRepository.save(ClubMember.of(club, officerUser, ClubMemberRole.OFFICER));
        clubMemberRepository.save(ClubMember.asMember(club, memberUser));

        leaderToken = jwtTokenProvider.createToken(leaderUser.getId(), leaderUser.getRole().name());
        officerToken = jwtTokenProvider.createToken(officerUser.getId(), officerUser.getRole().name());
        memberToken = jwtTokenProvider.createToken(memberUser.getId(), memberUser.getRole().name());
    }

    @Test
    @DisplayName("OFFICER 가 대표 활동을 등록하면 201 과 storageKey·displayOrder 를 반환한다")
    void officerCreatesReturns201() {
        ClubPhoto photo = savePhoto("hero.jpg", 1);

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + officerToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of(
                            "clubPhotoId", photo.getId(),
                            "title", "여름 워크숍",
                            "description", "1박 2일 팀 빌딩",
                            "displayOrder", 1))
                .when()
                    .post("/api/v1/clubs/{clubId}/hero-activities", club.getId())
                .then()
                    .statusCode(HttpStatus.CREATED.value())
                    .body("data.storageKey", equalTo("hero.jpg"))
                    .body("data.title", equalTo("여름 워크숍"))
                    .body("data.displayOrder", equalTo(1));
    }

    @Test
    @DisplayName("제목 누락·제목 31자·설명 81자 등록 요청은 각각 400 을 반환한다")
    void invalidContentReturns400() {
        ClubPhoto photo = savePhoto("hero.jpg", 1);
        Long photoId = photo.getId();

        // 제목 누락
        postCreate(leaderToken, Map.of(
                "clubPhotoId", photoId, "description", "설명", "displayOrder", 1))
                .then().statusCode(HttpStatus.BAD_REQUEST.value());

        // 제목 31자
        postCreate(leaderToken, Map.of(
                "clubPhotoId", photoId, "title", "가".repeat(31),
                "description", "설명", "displayOrder", 1))
                .then().statusCode(HttpStatus.BAD_REQUEST.value());

        // 설명 81자
        postCreate(leaderToken, Map.of(
                "clubPhotoId", photoId, "title", "제목",
                "description", "가".repeat(81), "displayOrder", 1))
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("displayOrder 0·7 은 400, 점유 슬롯·중복 사진 등록은 409 를 반환한다")
    void slotAndDuplicateConstraints() {
        ClubPhoto occupied = savePhoto("a.jpg", 1);
        ClubPhoto fresh = savePhoto("b.jpg", 2);
        saveActivity(occupied, "기존", "기존 설명", 1);

        // displayOrder 0 (범위 밖)
        postCreate(leaderToken, Map.of(
                "clubPhotoId", fresh.getId(), "title", "제목",
                "description", "설명", "displayOrder", 0))
                .then().statusCode(HttpStatus.BAD_REQUEST.value());

        // displayOrder 7 (범위 밖)
        postCreate(leaderToken, Map.of(
                "clubPhotoId", fresh.getId(), "title", "제목",
                "description", "설명", "displayOrder", 7))
                .then().statusCode(HttpStatus.BAD_REQUEST.value());

        // 이미 점유된 슬롯 1
        postCreate(leaderToken, Map.of(
                "clubPhotoId", fresh.getId(), "title", "제목",
                "description", "설명", "displayOrder", 1))
                .then().statusCode(HttpStatus.CONFLICT.value());

        // 이미 대표로 등록된 사진
        postCreate(leaderToken, Map.of(
                "clubPhotoId", occupied.getId(), "title", "제목",
                "description", "설명", "displayOrder", 2))
                .then().statusCode(HttpStatus.CONFLICT.value());
    }

    @Test
    @DisplayName("제목만 PATCH 하면 204 이고 GET 시 기존 설명이 유지된다")
    void patchTitleOnlyPreservesDescription() {
        ClubPhoto photo = savePhoto("hero.jpg", 1);
        ClubHeroActivity activity = saveActivity(photo, "원제목", "원설명", 1);

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("title", "새제목"))
                .when()
                    .patch("/api/v1/clubs/{clubId}/hero-activities/{heroActivityId}",
                            club.getId(), activity.getId())
                .then()
                    .statusCode(HttpStatus.NO_CONTENT.value());

        JsonPath list = getList(null);
        assertThat(list.getString("data[0].title")).isEqualTo("새제목");
        assertThat(list.getString("data[0].description")).isEqualTo("원설명");
    }

    @Test
    @DisplayName("PUT /order 로 두 슬롯을 스왑하면 200 과 정렬된 목록을 반환하고, 집합 불일치는 400 이다")
    void reorderSwapAndMismatch() {
        ClubPhoto photoA = savePhoto("a.jpg", 1);
        ClubPhoto photoB = savePhoto("b.jpg", 2);
        ClubHeroActivity first = saveActivity(photoA, "A", "A 설명", 1);
        ClubHeroActivity second = saveActivity(photoB, "B", "B 설명", 2);

        JsonPath swapped = RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("items", List.of(
                            Map.of("heroActivityId", first.getId(), "displayOrder", 2),
                            Map.of("heroActivityId", second.getId(), "displayOrder", 1))))
                .when()
                    .put("/api/v1/clubs/{clubId}/hero-activities/order", club.getId())
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .extract().jsonPath();

        assertThat(swapped.getList("data.id", Long.class))
                .containsExactly(second.getId(), first.getId());
        assertThat(swapped.getList("data.displayOrder", Integer.class))
                .containsExactly(1, 2);

        // 집합 불일치 — second 누락
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("items", List.of(
                            Map.of("heroActivityId", first.getId(), "displayOrder", 1))))
                .when()
                    .put("/api/v1/clubs/{clubId}/hero-activities/order", club.getId())
                .then()
                    .statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("DELETE 후 GET 목록에서 해당 슬롯이 빠지고 잔여 활동의 순서는 유지된다")
    void deleteRemovesSlotKeepsRemainingOrder() {
        ClubPhoto photoA = savePhoto("a.jpg", 1);
        ClubPhoto photoB = savePhoto("b.jpg", 2);
        ClubHeroActivity first = saveActivity(photoA, "A", "A 설명", 1);
        ClubHeroActivity second = saveActivity(photoB, "B", "B 설명", 2);

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when()
                    .delete("/api/v1/clubs/{clubId}/hero-activities/{heroActivityId}",
                            club.getId(), first.getId())
                .then()
                    .statusCode(HttpStatus.NO_CONTENT.value());

        JsonPath list = getList(null);
        assertThat(list.getList("data.id", Long.class)).containsExactly(second.getId());
        assertThat(list.getInt("data[0].displayOrder")).isEqualTo(2);
    }

    @Test
    @DisplayName("MEMBER 쓰기는 403, 비로그인 쓰기는 401/403 인증 오류를 반환한다")
    void memberForbiddenAndAnonymousUnauthorized() {
        ClubPhoto photo = savePhoto("hero.jpg", 1);
        Map<String, Object> body = Map.of(
                "clubPhotoId", photo.getId(), "title", "제목",
                "description", "설명", "displayOrder", 1);

        postCreate(memberToken, body)
                .then().statusCode(HttpStatus.FORBIDDEN.value());

        int anonymousStatus = RestAssured
                .given()
                    .contentType(ContentType.JSON)
                    .body(body)
                .when()
                    .post("/api/v1/clubs/{clubId}/hero-activities", club.getId())
                .then()
                    .extract().statusCode();
        assertThat(anonymousStatus).isIn(401, 403);
    }

    @Test
    @DisplayName("비ACTIVE 동아리의 공개 GET 은 404 를 반환한다")
    void nonActiveClubGetReturns404() throws Exception {
        Club pending = saveClub("승인대기동아리", ClubStatus.PENDING_APPROVAL);

        RestAssured
                .given()
                .when()
                    .get("/api/v1/clubs/{clubId}/hero-activities", pending.getId())
                .then()
                    .statusCode(HttpStatus.NOT_FOUND.value());
    }

    private io.restassured.response.Response postCreate(String token, Map<String, Object> body) {
        return RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                    .contentType(ContentType.JSON)
                    .body(body)
                .when()
                    .post("/api/v1/clubs/{clubId}/hero-activities", club.getId());
    }

    private JsonPath getList(String token) {
        var request = RestAssured.given();
        if (token != null) {
            request.header(HttpHeaders.AUTHORIZATION, "Bearer " + token);
        }
        return request
                .when()
                    .get("/api/v1/clubs/{clubId}/hero-activities", club.getId())
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .extract().jsonPath();
    }

    private ClubPhoto savePhoto(String storageKey, int displayOrder) {
        return clubPhotoRepository.save(
                ClubPhoto.create(club, storageKey, null, 100, 100, displayOrder));
    }

    private ClubHeroActivity saveActivity(ClubPhoto photo, String title, String description, int slot) {
        return clubHeroActivityRepository.save(
                ClubHeroActivity.create(club, photo, title, description, slot));
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

    private Club saveClub(String name, ClubStatus status) throws Exception {
        String uniqueName = name + "-" + sequence.getAndIncrement();
        Club created = Club.create(uniqueName, ClubCategory.ACADEMIC, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(created, status);
        return clubRepository.save(created);
    }
}
