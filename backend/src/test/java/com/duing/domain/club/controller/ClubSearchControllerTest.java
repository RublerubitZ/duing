package com.duing.domain.club.controller;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.nullValue;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.Club.UpdatePayload;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.user.entity.College;
import io.restassured.RestAssured;
import java.lang.reflect.Field;
import java.util.List;
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
    @DisplayName("centralClub=false&college=IT_ENGINEERING 이면 해당 단과대 동아리만 반환된다")
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

    @Test
    @DisplayName("목록 응답은 카드가 쓰는 전 필드를 각기 다른 값으로 그대로 담아 내려준다")
    void listResponseCarriesEveryCardField() throws Exception {
        // 값이 서로 달라야 컬럼 순서가 뒤바뀐 projection(동형 스왑)을 잡아낼 수 있다.
        Club saved = saveFullyPopulatedClub("전필드계약클럽");

        RestAssured.given()
                .when().get("/api/v1/clubs?keyword=" + saved.getName())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content", hasSize(1))
                // 응답 키 집합 자체를 고정 — 필드가 늘거나 빠지면 실패한다.
                .body("data.content[0].keySet()", containsInAnyOrder(
                        "id", "name", "category", "division", "college", "department",
                        "logoUrl", "status", "tags", "tagline", "centralClub",
                        "weeklyInterestCount", "activeRecruitment"))
                .body("data.content[0].id", equalTo(saved.getId().intValue()))
                .body("data.content[0].name", equalTo(saved.getName()))
                .body("data.content[0].category", equalTo("SPORTS"))
                .body("data.content[0].division", equalTo("분과값"))
                .body("data.content[0].college", equalTo("DESIGN_ART"))
                .body("data.content[0].department", equalTo("학과값"))
                .body("data.content[0].logoUrl", equalTo("https://cdn.example.test/logo.png"))
                .body("data.content[0].status", equalTo("ACTIVE"))
                .body("data.content[0].tags", contains("태그하나", "태그둘"))
                .body("data.content[0].tagline", equalTo("한줄소개값"))
                .body("data.content[0].centralClub", equalTo(true))
                // 집계 배치 전이라 지표 행이 없다 — 이 경로에서 null 이 아니라 0 으로 내려가는 것이 계약이다.
                .body("data.content[0].weeklyInterestCount", equalTo(0))
                .body("data.content[0].activeRecruitment", nullValue());
    }

    /**
     * 목록 카드가 쓰는 필드는 전부 서로 다른 값으로, 쓰지 않는 필드(소개·커버·활동장소)도 값을 채워
     * 잘못된 컬럼이 실려 오면 단언이 깨지게 한다.
     */
    private Club saveFullyPopulatedClub(String name) throws Exception {
        String uniqueName = name + "-" + sequence.getAndIncrement();
        Club created = Club.create(
                uniqueName, ClubCategory.SPORTS, "분과값", "소개값",
                "https://cdn.example.test/logo.png", true, College.DESIGN_ART, "학과값");
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(created, ClubStatus.ACTIVE);
        created.update(new UpdatePayload(
                null, null, null, null, null,
                "https://cdn.example.test/cover.png",   // coverUrl — 목록 미사용
                List.of("태그하나", "태그둘"),
                null, null, null, null,
                "활동장소값",                             // location — 목록 미사용
                null, null,
                "한줄소개값",
                null, null, null, null, null, null, null, null, null, null, null, null));
        return clubRepository.save(created);
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
