package com.duing.domain.application.controller;

import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasItem;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.application.entity.Application;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
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
import org.springframework.test.util.ReflectionTestUtils;

/**
 * 지원자 화면이 "심사 중"과 "결과 없이 종료됨"을 구분하려면 모집 마감 여부가 응답에 있어야 한다.
 * 지원 상태(ApplicationStatus)와 직교한 축이므로, 미결 지원이 마감된 모집에 달린 조합을 고정한다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class MyApplicationRecruitmentStatusContractTest extends IntegrationTestBase {

    @LocalServerPort
    private int port;

    @Autowired private UserRepository userRepository;
    @Autowired private ClubRepository clubRepository;
    @Autowired private RecruitmentRepository recruitmentRepository;
    @Autowired private ApplicationRepository applicationRepository;
    @Autowired private JwtTokenProvider jwtTokenProvider;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
    }

    @Test
    @DisplayName("진행 중인 모집의 지원 상세는 recruitmentStatus 가 OPEN 으로 내려온다")
    void detailExposesOpenRecruitmentStatus() {
        User applicant = saveUser("진행중지원자");
        Recruitment recruitment = saveRecruitment(saveActiveClub("진행중동아리"), "진행중모집");
        Application application = applicationRepository.save(
                Application.submit(recruitment, applicant, List.of()));

        givenApplicant(applicant)
                .when().get("/api/v1/users/me/applications/{id}", application.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.recruitmentStatus", equalTo("OPEN"));
    }

    @Test
    @DisplayName("마감된 모집의 미결 지원은 상세에서 recruitmentStatus 가 CLOSED 로 내려온다")
    void detailExposesClosedRecruitmentStatusForUndecidedApplication() {
        User applicant = saveUser("마감후지원자");
        Recruitment recruitment = saveRecruitment(saveActiveClub("마감동아리"), "마감모집");
        Application application = applicationRepository.save(
                Application.submit(recruitment, applicant, List.of()));
        closeRecruitment(recruitment);

        givenApplicant(applicant)
                .when().get("/api/v1/users/me/applications/{id}", application.getId())
                .then().statusCode(HttpStatus.OK.value())
                // 지원 상태는 그대로 미결이고, 마감은 별개 축으로 전달된다.
                .body("data.status", equalTo("SUBMITTED"))
                .body("data.recruitmentStatus", equalTo("CLOSED"));
    }

    @Test
    @DisplayName("내 지원 목록에도 모집별 마감 여부가 함께 내려와 진행 중과 종료를 구분할 수 있다")
    void listExposesRecruitmentStatusPerApplication() {
        User applicant = saveUser("목록지원자");
        Club club = saveActiveClub("목록동아리");
        Recruitment openRecruitment = saveRecruitment(club, "진행중모집");
        Recruitment closedRecruitment = saveRecruitment(saveActiveClub("목록동아리2"), "마감모집");
        applicationRepository.save(Application.submit(openRecruitment, applicant, List.of()));
        applicationRepository.save(Application.submit(closedRecruitment, applicant, List.of()));
        closeRecruitment(closedRecruitment);

        givenApplicant(applicant)
                .when().get("/api/v1/users/me/applications")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.recruitmentStatus", hasItem("OPEN"))
                .body("data.recruitmentStatus", hasItem("CLOSED"));
    }

    private io.restassured.specification.RequestSpecification givenApplicant(User applicant) {
        String token = jwtTokenProvider.createToken(applicant.getId(), applicant.getRole().name());
        return RestAssured.given().header(HttpHeaders.AUTHORIZATION, "Bearer " + token);
    }

    private void closeRecruitment(Recruitment recruitment) {
        recruitment.close(LocalDateTime.now());
        recruitmentRepository.saveAndFlush(recruitment);
    }

    private User saveUser(String nameSuffix) {
        long unique = sequence.incrementAndGet();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                nameSuffix + unique,
                "hash",
                UserRole.STUDENT,
                Grade.FRESHMAN,
                College.IT_ENGINEERING,
                "컴퓨터공학",
                "010-0000-0000",
                LocalDateTime.now()));
    }

    private Club saveActiveClub(String name) {
        Club club = Club.create(name + sequence.incrementAndGet(),
                ClubCategory.ACADEMIC, "공학계열", "설명", null);
        ReflectionTestUtils.setField(club, "status", ClubStatus.ACTIVE);
        return clubRepository.save(club);
    }

    private Recruitment saveRecruitment(Club club, String title) {
        LocalDate today = LocalDate.now();
        return recruitmentRepository.save(Recruitment.create(club,
                title + "-" + sequence.incrementAndGet(), null,
                today.minusDays(1), today.plusDays(7), 10));
    }
}
