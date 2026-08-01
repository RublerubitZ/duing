package com.duing.domain.club.controller;

import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
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
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ClubSearchFavoriteFilterTest extends IntegrationTestBase {

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private User student;
    private String studentToken;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        student = userRepository.save(UserFixture.withName("찜검색학생"));
        studentToken = jwtTokenProvider.createToken(student.getId(), student.getRole().name());
    }

    @Test
    @DisplayName("비로그인 요청이 favorite=true 를 지정하면 401 을 반환한다")
    void anonymousFavoriteFilterReturns401() {
        RestAssured.given()
                .when().get("/api/v1/clubs?favorite=true")
                .then().statusCode(HttpStatus.UNAUTHORIZED.value())
                .body("ok", equalTo(false));
    }

    @Test
    @DisplayName("비로그인 요청의 favorite=false 는 필터 미적용으로 200 을 반환한다")
    void anonymousFavoriteFalseReturns200() {
        RestAssured.given()
                .when().get("/api/v1/clubs?favorite=false")
                .then().statusCode(HttpStatus.OK.value())
                .body("ok", equalTo(true));
    }

    @Test
    @DisplayName("로그인 사용자의 찜이 없으면 200 과 빈 목록을 반환한다")
    void authenticatedWithNoFavoritesReturnsEmptyList() throws Exception {
        // 찜하지 않은 동아리를 하나 둔다 — 없으면 필터 미구현 상태에서도 0건이라 검증이 공허해진다.
        saveActiveClub("찜없음대조클럽");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when().get("/api/v1/clubs?favorite=true")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.totalElements", equalTo(0));
    }

    @Test
    @DisplayName("favorite=true 는 내가 찜한 동아리만 반환한다")
    void favoriteFilterReturnsOnlyMyFavorites() throws Exception {
        Club favorited = saveActiveClub("컨트롤러찜클럽");
        Club notFavorited = saveActiveClub("컨트롤러안찜클럽");
        addFavorite(favorited.getId());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when().get("/api/v1/clubs?favorite=true")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.totalElements", equalTo(1))
                .body("data.content.name", hasItem(favorited.getName()))
                .body("data.content.name", not(hasItem(notFavorited.getName())));
    }

    @Test
    @DisplayName("favorite 미지정이면 찜 여부와 무관하게 전체가 반환된다")
    void withoutFavoriteParamReturnsAll() throws Exception {
        Club favorited = saveActiveClub("전체찜클럽");
        Club notFavorited = saveActiveClub("전체안찜클럽");
        addFavorite(favorited.getId());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when().get("/api/v1/clubs?keyword=클럽")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content.name", hasItem(favorited.getName()))
                .body("data.content.name", hasItem(notFavorited.getName()));
    }

    private void addFavorite(Long clubId) {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when().post("/api/v1/me/favorites/{clubId}", clubId)
                .then().statusCode(HttpStatus.CREATED.value());
    }

    private Club saveActiveClub(String name) throws Exception {
        String uniqueName = name + "-" + sequence.getAndIncrement();
        Club created = Club.create(uniqueName, ClubCategory.OTHER, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(created, ClubStatus.ACTIVE);
        return clubRepository.save(created);
    }
}
