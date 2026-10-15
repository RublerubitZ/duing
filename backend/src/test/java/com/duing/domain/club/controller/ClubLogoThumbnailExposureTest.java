package com.duing.domain.club.controller;

import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.nullValue;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import io.restassured.RestAssured;
import java.lang.reflect.Field;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;

/** 목록·상세 응답의 logoThumbnailUrl 노출 계약(스펙 §4.6) — 값이 있으면 그대로, 없으면 null(클라이언트는 logoUrl 로 폴백). */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ClubLogoThumbnailExposureTest extends IntegrationTestBase {

    private static final String LOGO_URL = "https://files.example.com/club/logo/a.png";
    private static final String THUMBNAIL_URL = "https://files.example.com/club/logo/a-thumb.png";

    @LocalServerPort int port;
    @Autowired ClubRepository clubRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @BeforeEach
    void setUpPort() {
        RestAssured.port = port;
    }

    private Club saveActiveClub(String logoUrl) throws Exception {
        Club club = Club.create("썸네일노출-" + sequence.incrementAndGet(), ClubCategory.ACADEMIC, "분과", "설명", logoUrl);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(club, ClubStatus.ACTIVE);
        return clubRepository.save(club);
    }

    @Test
    @DisplayName("썸네일이 있는 동아리는 목록 카드와 상세 응답 모두에 logoThumbnailUrl 을 그대로 담아 내려준다")
    void listAndDetailExposeThumbnailUrl() throws Exception {
        Club club = saveActiveClub(LOGO_URL);
        clubRepository.setLogoThumbnailUrlIfLogoUnchanged(club.getId(), LOGO_URL, THUMBNAIL_URL);

        RestAssured.given()
                .when().get("/api/v1/clubs?keyword=" + club.getName())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content[0].logoUrl", equalTo(LOGO_URL))
                .body("data.content[0].logoThumbnailUrl", equalTo(THUMBNAIL_URL));

        RestAssured.given()
                .when().get("/api/v1/clubs/{clubId}", club.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.logoUrl", equalTo(LOGO_URL))
                .body("data.logoThumbnailUrl", equalTo(THUMBNAIL_URL));
    }

    @Test
    @DisplayName("썸네일이 아직 없는 동아리는 목록·상세 모두 logoThumbnailUrl 이 null 이고 logoUrl 은 그대로다")
    void missingThumbnailIsNullInBothResponses() throws Exception {
        Club club = saveActiveClub(LOGO_URL);

        RestAssured.given()
                .when().get("/api/v1/clubs?keyword=" + club.getName())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content[0].logoUrl", equalTo(LOGO_URL))
                .body("data.content[0].logoThumbnailUrl", nullValue());

        RestAssured.given()
                .when().get("/api/v1/clubs/{clubId}", club.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.logoUrl", equalTo(LOGO_URL))
                .body("data.logoThumbnailUrl", nullValue());
    }
}
