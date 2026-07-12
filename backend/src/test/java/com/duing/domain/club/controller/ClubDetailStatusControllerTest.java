package com.duing.domain.club.controller;

import static org.hamcrest.Matchers.equalTo;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.photo.entity.ClubPhoto;
import com.duing.domain.club.photo.repository.ClubPhotoRepository;
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
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ClubDetailStatusControllerTest extends IntegrationTestBase {

    @LocalServerPort int port;

    @Autowired ClubRepository clubRepository;
    @Autowired RecruitmentRepository recruitmentRepository;
    @Autowired ClubPhotoRepository clubPhotoRepository;
    @Autowired JdbcTemplate jdbcTemplate;

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

    @Test
    @DisplayName("운영 중(ACTIVE) 동아리의 공개 모집 공고 목록·활동사진 목록 조회는 200 을 반환한다 (빈 목록 포함)")
    void activeClubSubResourcesArePublic() throws Exception {
        Club activeClub = saveClubWithStatus("공개하위리소스클럽", ClubStatus.ACTIVE);

        RestAssured
                .given()
                .when()
                    .get("/api/v1/clubs/{clubId}/recruitments", activeClub.getId())
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("ok", equalTo(true))
                    .body("data.size()", equalTo(0));

        RestAssured
                .given()
                .when()
                    .get("/api/v1/clubs/{clubId}/photos", activeClub.getId())
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("ok", equalTo(true))
                    .body("data.size()", equalTo(0));
    }

    @ParameterizedTest(name = "{0} 동아리는 모집 공고가 있어도 공개 모집 공고 목록 조회가 404 를 반환한다")
    @EnumSource(value = ClubStatus.class, names = {"PENDING_APPROVAL", "INACTIVE", "REJECTED"})
    @DisplayName("승인 대기·운영 중단·거절 동아리는 모집 공고가 있어도 공개 모집 공고 목록 조회가 404 를 반환한다")
    void nonActiveClubRecruitmentsAreHidden(ClubStatus status) throws Exception {
        Club hiddenClub = saveClubWithStatus("비공개모집목록클럽", ClubStatus.ACTIVE);
        recruitmentRepository.save(Recruitment.create(hiddenClub, "숨겨질모집", "내용",
                LocalDate.now().minusDays(1), LocalDate.now().plusDays(7), 5));
        jdbcTemplate.update("UPDATE club SET status = ? WHERE id = ?", status.name(), hiddenClub.getId());

        RestAssured
                .given()
                .when()
                    .get("/api/v1/clubs/{clubId}/recruitments", hiddenClub.getId())
                .then()
                    .statusCode(HttpStatus.NOT_FOUND.value())
                    .body("ok", equalTo(false));
    }

    @ParameterizedTest(name = "{0} 동아리는 활동사진이 있어도 공개 활동사진 목록 조회가 404 를 반환한다")
    @EnumSource(value = ClubStatus.class, names = {"PENDING_APPROVAL", "INACTIVE", "REJECTED"})
    @DisplayName("승인 대기·운영 중단·거절 동아리는 활동사진이 있어도 공개 활동사진 목록 조회가 404 를 반환한다")
    void nonActiveClubPhotosAreHidden(ClubStatus status) throws Exception {
        Club hiddenClub = saveClubWithStatus("비공개사진목록클럽", ClubStatus.ACTIVE);
        clubPhotoRepository.save(ClubPhoto.create(hiddenClub, "hidden.jpg", null, null, null, 0));
        jdbcTemplate.update("UPDATE club SET status = ? WHERE id = ?", status.name(), hiddenClub.getId());

        RestAssured
                .given()
                .when()
                    .get("/api/v1/clubs/{clubId}/photos", hiddenClub.getId())
                .then()
                    .statusCode(HttpStatus.NOT_FOUND.value())
                    .body("ok", equalTo(false));
    }

    @Test
    @DisplayName("존재하지 않는 동아리의 공개 모집 공고 목록·활동사진 목록 조회는 404 를 반환한다")
    void unknownClubSubResourcesReturnNotFound() {
        RestAssured
                .given()
                .when()
                    .get("/api/v1/clubs/{clubId}/recruitments", 999_999L)
                .then()
                    .statusCode(HttpStatus.NOT_FOUND.value())
                    .body("ok", equalTo(false));

        RestAssured
                .given()
                .when()
                    .get("/api/v1/clubs/{clubId}/photos", 999_999L)
                .then()
                    .statusCode(HttpStatus.NOT_FOUND.value())
                    .body("ok", equalTo(false));
    }

    @Test
    @DisplayName("삭제(soft delete)된 동아리의 공개 모집 공고 목록·활동사진 목록 조회는 404 를 반환한다")
    void softDeletedClubSubResourcesAreHidden() throws Exception {
        Club deletedClub = saveClubWithStatus("삭제된클럽", ClubStatus.ACTIVE);
        jdbcTemplate.update("UPDATE club SET deleted_at = NOW() WHERE id = ?", deletedClub.getId());

        RestAssured
                .given()
                .when()
                    .get("/api/v1/clubs/{clubId}/recruitments", deletedClub.getId())
                .then()
                    .statusCode(HttpStatus.NOT_FOUND.value())
                    .body("ok", equalTo(false));

        RestAssured
                .given()
                .when()
                    .get("/api/v1/clubs/{clubId}/photos", deletedClub.getId())
                .then()
                    .statusCode(HttpStatus.NOT_FOUND.value())
                    .body("ok", equalTo(false));
    }

    @Test
    @DisplayName("운영 중(ACTIVE) 동아리의 모집 공고·활동사진은 공개 목록 조회에서 실제로 반환된다")
    void activeClubSubResourcesReturnSeededData() throws Exception {
        Club activeClub = saveClubWithStatus("데이터공개클럽", ClubStatus.ACTIVE);
        recruitmentRepository.save(Recruitment.create(activeClub, "공개될모집", "내용",
                LocalDate.now().minusDays(1), LocalDate.now().plusDays(7), 5));
        clubPhotoRepository.save(ClubPhoto.create(activeClub, "visible.jpg", null, null, null, 0));

        RestAssured
                .given()
                .when()
                    .get("/api/v1/clubs/{clubId}/recruitments", activeClub.getId())
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("ok", equalTo(true))
                    .body("data.size()", equalTo(1));

        RestAssured
                .given()
                .when()
                    .get("/api/v1/clubs/{clubId}/photos", activeClub.getId())
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("ok", equalTo(true))
                    .body("data.size()", equalTo(1));
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
