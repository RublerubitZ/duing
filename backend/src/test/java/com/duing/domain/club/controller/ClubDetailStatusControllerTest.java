package com.duing.domain.club.controller;

import static org.hamcrest.Matchers.equalTo;

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
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ClubDetailStatusControllerTest extends IntegrationTestBase {

    @LocalServerPort int port;

    @Autowired ClubRepository clubRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
    }

    @Test
    @DisplayName("운영 중(ACTIVE) 동아리의 공개 상세 조회는 200 과 상세 정보를 반환한다")
    void activeClubDetailIsPublic() throws Exception {
        Club activeClub = saveClubWithStatus("공개상세클럽", ClubStatus.ACTIVE);

        RestAssured
                .given()
                .when()
                    .get("/api/v1/clubs/{clubId}", activeClub.getId())
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.status", equalTo(ClubStatus.ACTIVE.name()));
    }

    @ParameterizedTest(name = "{0} 동아리의 공개 상세 조회는 404 를 반환한다")
    @EnumSource(value = ClubStatus.class, names = {"PENDING_APPROVAL", "INACTIVE", "REJECTED"})
    @DisplayName("승인 대기·운영 중단·거절 동아리의 공개 상세 조회는 404 를 반환한다")
    void nonActiveClubDetailIsHidden(ClubStatus status) throws Exception {
        Club hiddenClub = saveClubWithStatus("비공개상세클럽", status);

        RestAssured
                .given()
                .when()
                    .get("/api/v1/clubs/{clubId}", hiddenClub.getId())
                .then()
                    .statusCode(HttpStatus.NOT_FOUND.value())
                    .body("ok", equalTo(false));
    }

    private Club saveClubWithStatus(String name, ClubStatus status) throws Exception {
        String uniqueName = name + "-" + sequence.getAndIncrement();
        Club created = Club.create(uniqueName, ClubCategory.ACADEMIC, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(created, status);
        return clubRepository.save(created);
    }
}
