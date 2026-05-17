package com.duing.domain.club.controller;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.photo.entity.ClubPhoto;
import com.duing.domain.club.photo.repository.ClubPhotoRepository;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
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
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.test.annotation.DirtiesContext;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class ClubPhotoControllerTest {

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired ClubPhotoRepository clubPhotoRepository;
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
        club = saveActiveClub("두잉포토컨트롤러");
        clubMemberRepository.save(ClubMember.asLeader(club, leaderUser));
        clubMemberRepository.save(ClubMember.of(club, officerUser, ClubMemberRole.OFFICER));
        clubMemberRepository.save(ClubMember.asMember(club, memberUser));

        leaderToken = jwtTokenProvider.createToken(leaderUser.getId(), leaderUser.getRole().name());
        officerToken = jwtTokenProvider.createToken(officerUser.getId(), officerUser.getRole().name());
        memberToken = jwtTokenProvider.createToken(memberUser.getId(), memberUser.getRole().name());
    }

    @Test
    @DisplayName("OFFICER 가 POST 하면 201 과 photoId 를 반환한다")
    void officerCreatesReturns201() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + officerToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("storageKey", "k.jpg", "caption", "사진"))
                .when()
                    .post("/api/v1/clubs/{clubId}/photos", club.getId())
                .then()
                    .statusCode(HttpStatus.CREATED.value())
                    .body("data.storageKey", org.hamcrest.Matchers.equalTo("k.jpg"))
                    .body("data.caption", org.hamcrest.Matchers.equalTo("사진"))
                    .body("data.displayOrder", org.hamcrest.Matchers.equalTo(0));
    }

    @Test
    @DisplayName("MEMBER 가 POST 하면 403 을 반환한다")
    void memberCannotCreate() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + memberToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("storageKey", "k.jpg"))
                .when()
                    .post("/api/v1/clubs/{clubId}/photos", club.getId())
                .then()
                    .statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("storageKey 가 비면 400 을 반환한다")
    void emptyStorageKeyReturns400() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("storageKey", ""))
                .when()
                    .post("/api/v1/clubs/{clubId}/photos", club.getId())
                .then()
                    .statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("PATCH 캡션 수정 후 GET 으로 변경이 반영된다")
    void patchUpdatesCaption() {
        ClubPhoto photo = clubPhotoRepository.save(ClubPhoto.create(club, "k.jpg", "원본", 1, 1, 0));

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("caption", "변경됨"))
                .when()
                    .patch("/api/v1/clubs/{clubId}/photos/{photoId}", club.getId(), photo.getId())
                .then()
                    .statusCode(HttpStatus.NO_CONTENT.value());

        assertThat(clubPhotoRepository.findById(photo.getId()).orElseThrow().getCaption())
                .isEqualTo("변경됨");
    }

    @Test
    @DisplayName("다른 동아리의 photoId 로 PATCH 하면 404 를 반환한다")
    void patchForeignPhotoReturns404() throws Exception {
        Club otherClub = saveActiveClub("타동아리");
        clubMemberRepository.save(ClubMember.asLeader(otherClub, leaderUser));
        ClubPhoto photoInOther = clubPhotoRepository.save(
                ClubPhoto.create(otherClub, "k.jpg", null, null, null, 0));

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("caption", "x"))
                .when()
                    .patch("/api/v1/clubs/{clubId}/photos/{photoId}", club.getId(), photoInOther.getId())
                .then()
                    .statusCode(HttpStatus.NOT_FOUND.value());
    }

    @Test
    @DisplayName("PUT /order 페이로드 누락 시 400 을 반환한다")
    void reorderMismatchReturns400() {
        ClubPhoto p1 = clubPhotoRepository.save(ClubPhoto.create(club, "1.jpg", null, null, null, 0));
        clubPhotoRepository.save(ClubPhoto.create(club, "2.jpg", null, null, null, 1));

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("items", List.of(Map.of("photoId", p1.getId(), "displayOrder", 0))))
                .when()
                    .put("/api/v1/clubs/{clubId}/photos/order", club.getId())
                .then()
                    .statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("DELETE 후 GET 목록에서 빠진다")
    void deleteRemovesFromList() {
        ClubPhoto photo = clubPhotoRepository.save(ClubPhoto.create(club, "k.jpg", null, null, null, 0));

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when()
                    .delete("/api/v1/clubs/{clubId}/photos/{photoId}", club.getId(), photo.getId())
                .then()
                    .statusCode(HttpStatus.NO_CONTENT.value());

        assertThat(clubPhotoRepository.findByClubIdOrderByDisplayOrderAsc(club.getId())).isEmpty();
    }

    @Test
    @DisplayName("인증 없이 POST 하면 4xx 인증 오류를 반환한다")
    void anonymousCreateRejected() {
        int status = RestAssured
                .given()
                    .contentType(ContentType.JSON)
                    .body(Map.of("storageKey", "k.jpg"))
                .when()
                    .post("/api/v1/clubs/{clubId}/photos", club.getId())
                .then()
                    .extract().statusCode();
        assertThat(status).isIn(401, 403);
    }

    private User saveUser(String name) {
        long unique = sequence.getAndIncrement();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                name,
                "u" + unique + "@daegu.ac.kr",
                "hashed",
                UserRole.STUDENT
        ));
    }

    private Club saveActiveClub(String name) throws Exception {
        String uniqueName = name + "-" + sequence.getAndIncrement();
        Club created = Club.create(uniqueName, ClubCategory.ACADEMIC, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(created, ClubStatus.ACTIVE);
        return clubRepository.save(created);
    }
}
