package com.duing.domain.club.controller;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasKey;
import static org.hamcrest.Matchers.nullValue;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.PendingItemsFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.joincode.repository.ClubJoinCodeRepository;
import com.duing.domain.joincode.repository.ClubJoinRequestRepository;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import java.time.Clock;
import java.time.LocalDate;
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
class AdminClubsListPendingItemsControllerTest extends IntegrationTestBase {

    private static final String ADMIN_CLUBS_PATH = "/api/v1/admin/clubs";

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired RecruitmentRepository recruitmentRepository;
    @Autowired ApplicationRepository applicationRepository;
    @Autowired ClubJoinCodeRepository clubJoinCodeRepository;
    @Autowired ClubJoinRequestRepository clubJoinRequestRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;
    @Autowired Clock clock;

    private String adminToken;
    private LocalDate today;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        User adminUser = userRepository.save(UserFixture.admin());
        adminToken = jwtTokenProvider.createToken(adminUser.getId(), adminUser.getRole().name());
        today = LocalDate.now(clock);
    }

    @Test
    @DisplayName("needsPendingCleanup=true 면 정리할 남은 미결이 있는 운영 중단 동아리만 오고, 행에 남은 지원서·가입 신청 수가 실린다")
    void pendingCleanupFilterReturnsInactiveClubsWithCounts() {
        Club inactiveWithPending = saveClub(ClubStatus.INACTIVE);
        Recruitment closedRecruitment = saveRecruitment(inactiveWithPending, true);
        saveApplication(closedRecruitment, ApplicationStatus.SUBMITTED);
        saveApplication(closedRecruitment, ApplicationStatus.ON_HOLD);
        PendingItemsFixture.savePendingJoinRequest(clubJoinCodeRepository, clubJoinRequestRepository, inactiveWithPending,
                PendingItemsFixture.saveJoinCode(clubJoinCodeRepository, inactiveWithPending, closedRecruitment),
                userRepository.save(UserFixture.unique()));
        saveClub(ClubStatus.INACTIVE);
        Club activeWithPending = saveClub(ClubStatus.ACTIVE);
        saveApplication(saveRecruitment(activeWithPending, false), ApplicationStatus.SUBMITTED);

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                    .queryParam("needsPendingCleanup", true)
                    .queryParam("size", 100)
                .when()
                    .get(ADMIN_CLUBS_PATH)
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.totalElements", equalTo(1))
                    .body("data.content.id", contains(inactiveWithPending.getId().intValue()))
                    .body("data.content[0].undecidedApplicationCount", equalTo(2))
                    .body("data.content[0].pendingJoinRequestCount", equalTo(1));
    }

    @Test
    @DisplayName("파라미터가 없으면 지금처럼 모든 상태를 돌려주고, 운영 중단 행만 두 건수(0 포함)를 싣고 다른 상태 행은 두 키가 null 이다")
    void defaultListKeepsAllStatusesAndCountsOnlyInactiveRows() {
        Club inactiveWithPending = saveClub(ClubStatus.INACTIVE);
        saveApplication(saveRecruitment(inactiveWithPending, true), ApplicationStatus.SUBMITTED);
        Club inactiveWithoutPending = saveClub(ClubStatus.INACTIVE);
        Club activeWithPending = saveClub(ClubStatus.ACTIVE);
        saveApplication(saveRecruitment(activeWithPending, false), ApplicationStatus.SUBMITTED);
        Club pendingApproval = saveClub(ClubStatus.PENDING_APPROVAL);

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                    .queryParam("size", 100)
                .when()
                    .get(ADMIN_CLUBS_PATH)
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.totalElements", equalTo(4))
                    .body(rowOf(inactiveWithPending) + ".undecidedApplicationCount", equalTo(1))
                    .body(rowOf(inactiveWithPending) + ".pendingJoinRequestCount", equalTo(0))
                    .body(rowOf(inactiveWithoutPending) + ".undecidedApplicationCount", equalTo(0))
                    .body(rowOf(inactiveWithoutPending) + ".pendingJoinRequestCount", equalTo(0))
                    // 키 부재도 JsonPath 로는 null 이라 키가 있는지 따로 본다(프론트는 부재를 옛 백엔드로 읽는다).
                    .body(rowOf(activeWithPending), hasKey("undecidedApplicationCount"))
                    .body(rowOf(activeWithPending), hasKey("pendingJoinRequestCount"))
                    .body(rowOf(activeWithPending) + ".undecidedApplicationCount", nullValue())
                    .body(rowOf(activeWithPending) + ".pendingJoinRequestCount", nullValue())
                    .body(rowOf(pendingApproval) + ".undecidedApplicationCount", nullValue())
                    .body(rowOf(pendingApproval) + ".pendingJoinRequestCount", nullValue());
    }

    private String rowOf(Club club) {
        return "data.content.find { it.id == %d }".formatted(club.getId());
    }

    private Club saveClub(ClubStatus status) {
        return PendingItemsFixture.saveClub(clubRepository, status);
    }

    private Recruitment saveRecruitment(Club club, boolean closed) {
        return PendingItemsFixture.saveRecruitment(recruitmentRepository, club, today, closed);
    }

    private void saveApplication(Recruitment recruitment, ApplicationStatus status) {
        PendingItemsFixture.saveApplication(applicationRepository, recruitment,
                userRepository.save(UserFixture.unique()), status);
    }
}
