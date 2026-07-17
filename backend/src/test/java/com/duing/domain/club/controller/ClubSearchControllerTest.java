package com.duing.domain.club.controller;

import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.user.entity.College;
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

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ClubSearchControllerTest extends IntegrationTestBase {

    @LocalServerPort int port;

    @Autowired ClubRepository clubRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
    }

    @Test
    @DisplayName("centralClub=true 면 중앙동아리만 반환된다")
    void centralOnlyFilter() throws Exception {
        Club central = saveActiveClub("중앙클럽", true, null);
        Club department = saveActiveClub("학과클럽", false, College.IT_ENGINEERING);

        RestAssured.given()
                .when().get("/api/v1/clubs?centralClub=true&keyword=클럽")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content.name", hasItem(central.getName()))
                .body("data.content.name", not(hasItem(department.getName())));
    }

    @Test
    @DisplayName("centralClub=false&college=IT_ENGINEERING 이면 해당 단과대 학과동아리만 반환된다")
    void departmentCollegeFilter() throws Exception {
        Club central = saveActiveClub("중앙클럽필터", true, null);
        Club itDept = saveActiveClub("IT학과클럽", false, College.IT_ENGINEERING);
        Club artDept = saveActiveClub("예술학과클럽", false, College.DESIGN_ART);

        RestAssured.given()
                .when().get("/api/v1/clubs?centralClub=false&college=IT_ENGINEERING&keyword=클럽")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content.name", hasItem(itDept.getName()))
                .body("data.content.name", not(hasItem(central.getName())))
                .body("data.content.name", not(hasItem(artDept.getName())));
    }

    @Test
    @DisplayName("centralClub 미지정이면 중앙·학과 모두 반환된다")
    void noScopeReturnsAll() throws Exception {
        Club central = saveActiveClub("중앙전체", true, null);
        Club department = saveActiveClub("학과전체", false, College.IT_ENGINEERING);

        RestAssured.given()
                .when().get("/api/v1/clubs?keyword=전체")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content.name", hasItem(central.getName()))
                .body("data.content.name", hasItem(department.getName()));
    }

    @Test
    @DisplayName("목록 응답에 동아리 한줄 소개(tagline)가 포함된다")
    void listContainsTagline() throws Exception {
        Club club = saveActiveClub("태그라인클럽", true, null);
        Field taglineField = Club.class.getDeclaredField("tagline");
        taglineField.setAccessible(true);
        taglineField.set(club, "매주 함께 성장하는 동아리");
        clubRepository.save(club);

        RestAssured.given()
                .when().get("/api/v1/clubs?keyword=태그라인클럽")
                .then().statusCode(HttpStatus.OK.value())
                .body(
                        "data.content.find { it.name == '" + club.getName() + "' }.tagline",
                        equalTo("매주 함께 성장하는 동아리")
                );
    }

    private Club saveActiveClub(String name, boolean centralClub, College college) throws Exception {
        String uniqueName = name + "-" + sequence.getAndIncrement();
        Club created = Club.create(uniqueName, ClubCategory.ACADEMIC, "분과", "설명", null, false, null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(created, ClubStatus.ACTIVE);
        Field centralField = Club.class.getDeclaredField("centralClub");
        centralField.setAccessible(true);
        centralField.set(created, centralClub);
        Field collegeField = Club.class.getDeclaredField("college");
        collegeField.setAccessible(true);
        collegeField.set(created, college);
        return clubRepository.save(created);
    }
}
