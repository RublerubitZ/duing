package com.duing.domain.application.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;

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
import com.duing.global.constant.ErrorCodes;
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

// 지원 철회 엔드포인트의 마감 모집 계약을 HTTP 로 고정한다 — 마감 실패는 프론트가 단일 분기로 처리할 수
// 있도록 status·code 가 다른 마감 가드(RECRUITMENT_CLOSED)와 같아야 한다.
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class MyApplicationWithdrawControllerTest extends IntegrationTestBase {

    private static final String WITHDRAW_PATH = "/api/v1/users/me/applications/{applicationId}";

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
    @DisplayName("마감된 모집의 지원은 철회할 수 없고 마감 코드와 함께 409 로 거절되며 지원 데이터는 그대로 남는다")
    void closedRecruitmentBlocksWithdraw() {
        Recruitment recruitment = saveOpenRecruitment(saveActiveClub("철회차단동아리"), "철회차단모집");
        User applicant = saveUser("마감철회지원자");
        Application application = applicationRepository.save(
                Application.submit(recruitment, applicant, List.of()));
        recruitment.close(LocalDateTime.now());
        recruitmentRepository.save(recruitment);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenFor(applicant))
                .when().delete(WITHDRAW_PATH, application.getId())
                .then().statusCode(HttpStatus.CONFLICT.value())
                .body("code", equalTo(ErrorCodes.RECRUITMENT_CLOSED))
                .body("message", equalTo("마감된 모집의 지원은 철회할 수 없어요."));

        assertThat(applicationRepository.findById(application.getId())).isPresent();
    }

    private String tokenFor(User user) {
        return jwtTokenProvider.createToken(user.getId(), user.getRole().name());
    }

    private User saveUser(String nameSuffix) {
        long unique = sequence.incrementAndGet();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                nameSuffix + unique,
                "hashed",
                UserRole.STUDENT,
                Grade.FRESHMAN,
                College.IT_ENGINEERING,
                "컴퓨터공학",
                "010-0000-0000",
                LocalDateTime.now()));
    }

    private Club saveActiveClub(String name) {
        Club club = Club.create(name + "-" + sequence.incrementAndGet(),
                ClubCategory.ACADEMIC, "분과", "설명", null);
        ReflectionTestUtils.setField(club, "status", ClubStatus.ACTIVE);
        return clubRepository.save(club);
    }

    private Recruitment saveOpenRecruitment(Club club, String title) {
        LocalDate today = LocalDate.now();
        return recruitmentRepository.save(Recruitment.create(club, title + "-" + sequence.incrementAndGet(),
                null, today.minusDays(1), today.plusDays(7), 10));
    }
}
