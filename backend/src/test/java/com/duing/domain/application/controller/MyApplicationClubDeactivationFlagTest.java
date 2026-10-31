package com.duing.domain.application.controller;

import static org.hamcrest.Matchers.equalTo;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.PendingItemsFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.application.service.ApplicationService;
import com.duing.domain.application.service.dto.command.UpdateApplicationStatusCommand;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.club.service.ClubPendingCleanupService;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import io.restassured.specification.RequestSpecification;
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

/** 지원자 화면의 "선발 종료" 구분 근거(스펙 §3-2·§4-4) — 정리 실행이 남긴 지원서 칸을 내 지원 응답이 그대로 옮긴다. */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class MyApplicationClubDeactivationFlagTest extends IntegrationTestBase {

    private static final String MY_APPLICATIONS_PATH = "/api/v1/users/me/applications";

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired RecruitmentRepository recruitmentRepository;
    @Autowired ApplicationRepository applicationRepository;
    @Autowired ApplicationService applicationService;
    @Autowired ClubPendingCleanupService clubPendingCleanupService;
    @Autowired JwtTokenProvider jwtTokenProvider;
    @Autowired Clock clock;

    private User applicant;
    private User adminUser;
    private LocalDate today;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        applicant = userRepository.save(UserFixture.unique());
        adminUser = userRepository.save(UserFixture.admin());
        today = LocalDate.now(clock);
    }

    @Test
    @DisplayName("운영 중단 정리로 불합격된 지원서는 내 지원 목록·상세 모두 endedByClubDeactivation 이 true 다")
    void cleanedApplicationIsFlaggedInListAndDetail() {
        Club inactiveClub = PendingItemsFixture.saveClub(clubRepository, ClubStatus.INACTIVE);
        Application cleaned = saveApplication(inactiveClub, true);
        clubPendingCleanupService.cleanup(inactiveClub.getId(), adminUser.getId());

        givenApplicant()
                .when()
                    .get(MY_APPLICATIONS_PATH)
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body(listRowOf(cleaned) + ".status", equalTo("REJECTED"))
                    .body(listRowOf(cleaned) + ".endedByClubDeactivation", equalTo(true));
        givenApplicant()
                .when()
                    .get(MY_APPLICATIONS_PATH + "/{applicationId}", cleaned.getId())
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.status", equalTo("REJECTED"))
                    .body("data.endedByClubDeactivation", equalTo(true));
    }

    @Test
    @DisplayName("운영진이 불합격 처리한 지원서(총동연 계정이 회장을 겸해도)와 결과 대기 지원서는 목록·상세 모두 endedByClubDeactivation 이 false 다")
    void operatorRejectionAndUndecidedApplicationAreNotFlagged() {
        Club activeClub = PendingItemsFixture.saveClub(clubRepository, ClubStatus.ACTIVE);
        clubMemberRepository.save(ClubMember.asLeader(activeClub, adminUser));
        Application operatorRejected = saveApplication(activeClub, false);
        applicationService.updateStatus(new UpdateApplicationStatusCommand(
                operatorRejected.getId(), adminUser.getId(), ApplicationStatus.REJECTED));
        // 운영 중 동아리는 진행(OPEN) 모집이 하나뿐이다(V38 uk_recruitment_club_active) — 결과 대기 대조군은 마감 모집에 둔다.
        Application undecided = saveApplication(activeClub, true);

        givenApplicant()
                .when()
                    .get(MY_APPLICATIONS_PATH)
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body(listRowOf(operatorRejected) + ".status", equalTo("REJECTED"))
                    .body(listRowOf(operatorRejected) + ".endedByClubDeactivation", equalTo(false))
                    .body(listRowOf(undecided) + ".endedByClubDeactivation", equalTo(false));
        givenApplicant()
                .when()
                    .get(MY_APPLICATIONS_PATH + "/{applicationId}", operatorRejected.getId())
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.endedByClubDeactivation", equalTo(false));
        givenApplicant()
                .when()
                    .get(MY_APPLICATIONS_PATH + "/{applicationId}", undecided.getId())
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.endedByClubDeactivation", equalTo(false));
    }

    /** 지원자 한 명이 같은 모집에 두 번 지원할 수 없어(uk_application_recruitment_user_active) 지원서마다 모집을 새로 만든다. */
    private Application saveApplication(Club club, boolean closedRecruitment) {
        return PendingItemsFixture.saveApplication(applicationRepository,
                PendingItemsFixture.saveRecruitment(recruitmentRepository, club, today, closedRecruitment),
                applicant, ApplicationStatus.SUBMITTED);
    }

    private RequestSpecification givenApplicant() {
        String token = jwtTokenProvider.createToken(applicant.getId(), applicant.getRole().name());
        return RestAssured.given().header(HttpHeaders.AUTHORIZATION, "Bearer " + token);
    }

    private String listRowOf(Application application) {
        return "data.find { it.id == %d }".formatted(application.getId());
    }
}
