package com.duing.domain.club.controller;

import static org.hamcrest.Matchers.equalTo;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import io.restassured.RestAssured;
import java.lang.reflect.Field;
import java.time.LocalDate;
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
class ClubSearchSortTest extends IntegrationTestBase {

    @LocalServerPort int port;

    @Autowired ClubRepository clubRepository;
    @Autowired RecruitmentRepository recruitmentRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
    }

    @Test
    @DisplayName("sort=ALPHABETICAL 이면 이름 가나다순으로 첫 번째 결과가 반환된다")
    void alphabeticalSortReturnsFirstClubInAlphabeticalOrder() throws Exception {
        Club naClub = saveActiveClub("나가나다sort");
        Club gaClub = saveActiveClub("가가나다sort");
        Club daClub = saveActiveClub("다가나다sort");

        RestAssured.given()
                .when().get("/api/v1/clubs?sort=ALPHABETICAL&keyword=가나다sort")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content[0].name", equalTo(gaClub.getName()));
    }

    @Test
    @DisplayName("sort 미지정(RECOMMENDED 기본값) 이면 모집중 동아리가 모집공고 없는 동아리보다 앞에 반환된다")
    void defaultSortPlacesRecruitingClubFirst() throws Exception {
        saveActiveClub("무모집defaultrec");
        Club recruiting = saveActiveClub("모집중defaultrec");
        saveOpenRecruitment(recruiting, LocalDate.now().plusDays(5));

        RestAssured.given()
                .when().get("/api/v1/clubs?keyword=defaultrec")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content[0].name", equalTo(recruiting.getName()));
    }

    @Test
    @DisplayName("구 클라이언트의 sort=RECENT 는 400 없이 추천순(RECOMMENDED)과 동일하게 동작한다")
    void legacyRecentSortIsAcceptedAsRecommendedAlias() throws Exception {
        saveActiveClub("무모집legacyrec");
        Club recruiting = saveActiveClub("모집중legacyrec");
        saveOpenRecruitment(recruiting, LocalDate.now().plusDays(5));

        RestAssured.given()
                .when().get("/api/v1/clubs?sort=RECENT&keyword=legacyrec")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content[0].name", equalTo(recruiting.getName()));
    }

    @Test
    @DisplayName("sort=DEADLINE_SOON 이면 가장 가까운 마감일의 모집을 가진 동아리가 앞에 반환된다")
    void deadlineSoonSortReturnsClubWithEarliestDeadlineFirst() throws Exception {
        Club urgentClub = saveActiveClub("임박동아리deadline");
        Club laterClub = saveActiveClub("여유동아리deadline");

        saveOpenRecruitment(urgentClub, LocalDate.now().plusDays(3));
        saveOpenRecruitment(laterClub, LocalDate.now().plusDays(30));

        RestAssured.given()
                .when().get("/api/v1/clubs?sort=DEADLINE_SOON&keyword=deadline")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content[0].name", equalTo(urgentClub.getName()));
    }

    private Club saveActiveClub(String name) throws Exception {
        String uniqueName = name + "-" + sequence.getAndIncrement();
        Club created = Club.create(uniqueName, ClubCategory.ACADEMIC, "분과", "설명", null, false, null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(created, ClubStatus.ACTIVE);
        return clubRepository.save(created);
    }

    private void saveOpenRecruitment(Club club, LocalDate endDate) {
        LocalDate today = LocalDate.now();
        Recruitment recruitment = Recruitment.create(club, "모집-" + sequence.getAndIncrement(), null, today, endDate, 10);
        recruitmentRepository.save(recruitment);
    }
}
