package com.duing.domain.interview.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.notNullValue;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.interview.entity.InterviewConfig;
import com.duing.domain.interview.entity.InterviewSlot;
import com.duing.domain.interview.repository.InterviewConfigRepository;
import com.duing.domain.interview.repository.InterviewSlotRepository;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import java.lang.reflect.Field;
import java.time.LocalDate;
import java.time.LocalDateTime;
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
class ApplicantInterviewSlotControllerTest extends IntegrationTestBase {

    @LocalServerPort
    private int port;

    @Autowired private UserRepository userRepository;
    @Autowired private ClubRepository clubRepository;
    @Autowired private ClubMemberRepository clubMemberRepository;
    @Autowired private RecruitmentRepository recruitmentRepository;
    @Autowired private InterviewConfigRepository configRepository;
    @Autowired private InterviewSlotRepository slotRepository;
    @Autowired private JwtTokenProvider jwtTokenProvider;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private String applicantToken;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        User applicant = saveUser("지원자");
        applicantToken = jwtTokenProvider.createToken(applicant.getId(), applicant.getRole().name());
    }

    @Test
    @DisplayName("지원자가 effectivelyOpen 인 모집의 슬롯을 조회하면 200 + 슬롯 배열을 반환한다")
    void listReturnsSlotsWhenRecruitmentIsOpen() {
        Recruitment recruitment = openRecruitment();
        configRepository.save(InterviewConfig.create(
                recruitment.getId(), LocalDateTime.now().plusDays(5), "공학관 2201호"));
        slotRepository.save(InterviewSlot.create(
                recruitment.getId(),
                LocalDateTime.now().plusDays(10),
                LocalDateTime.now().plusDays(10).plusHours(1), 5));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + applicantToken)
                .when().get("/api/v1/recruitments/" + recruitment.getId() + "/applicant-interview-slots")
                .then().statusCode(HttpStatus.OK.value())
                .body("data", hasSize(1))
                .body("data[0].slotId", notNullValue())
                .body("data[0].startTime", notNullValue())
                .body("data[0].endTime", notNullValue())
                .body("data[0].capacity", equalTo(5));
    }

    @Test
    @DisplayName("응답에 location 필드가 포함되지 않는다")
    void listResponseDoesNotIncludeLocation() {
        Recruitment recruitment = openRecruitment();
        configRepository.save(InterviewConfig.create(
                recruitment.getId(), LocalDateTime.now().plusDays(5), "공학관 2201호"));
        slotRepository.save(InterviewSlot.create(
                recruitment.getId(),
                LocalDateTime.now().plusDays(10),
                LocalDateTime.now().plusDays(10).plusHours(1), 5));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + applicantToken)
                .when().get("/api/v1/recruitments/" + recruitment.getId() + "/applicant-interview-slots")
                .then().statusCode(HttpStatus.OK.value())
                .body("data[0].location", not(notNullValue()));
    }

    @Test
    @DisplayName("effectivelyOpen 이 아닌 모집 조회 시 409 NoSlotsAvailable 이 반환된다")
    void listReturns409WhenRecruitmentNotOpen() {
        Recruitment closedRecruitment = closedRecruitment();

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + applicantToken)
                .when().get("/api/v1/recruitments/" + closedRecruitment.getId() + "/applicant-interview-slots")
                .then().statusCode(HttpStatus.CONFLICT.value());
    }

    @Test
    @DisplayName("미인증 호출은 401 또는 403 이 반환된다")
    void listReturns401WhenUnauthenticated() {
        Recruitment recruitment = openRecruitment();

        int status = RestAssured.given()
                .when().get("/api/v1/recruitments/" + recruitment.getId() + "/applicant-interview-slots")
                .then().extract().statusCode();
        assertThat(status).isIn(
                HttpStatus.UNAUTHORIZED.value(),
                HttpStatus.FORBIDDEN.value());
    }

    // ── 헬퍼 ────────────────────────────────────────────────────────────────────

    private Recruitment openRecruitment() {
        Club club = saveActiveClub("열린동아리");
        User leader = saveUser("리더");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        return recruitmentRepository.save(
                Recruitment.create(club, "열린모집-" + sequence.incrementAndGet(), null,
                        LocalDate.now().minusDays(1), LocalDate.now().plusDays(7), 10));
    }

    private Recruitment closedRecruitment() {
        Club club = saveActiveClub("종료동아리");
        User leader = saveUser("종료리더");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        return recruitmentRepository.save(
                Recruitment.create(club, "종료모집-" + sequence.incrementAndGet(), null,
                        LocalDate.now().minusDays(10), LocalDate.now().minusDays(1), 10));
    }

    private User saveUser(String nameSuffix) {
        long seq = sequence.incrementAndGet();
        return userRepository.save(User.create(
                String.format("%010d", seq % 10_000_000_000L),
                nameSuffix + seq,
                "ais" + seq + "@duing.ac.kr",
                "hash",
                UserRole.STUDENT,
                Grade.FRESHMAN,
                College.IT_ENGINEERING,
                "미설정",
                "010-0000-0000",
                LocalDateTime.now()));
    }

    private Club saveActiveClub(String name) {
        Club club = Club.create(name + "-" + sequence.incrementAndGet(),
                ClubCategory.OTHER, "분과", "설명", null);
        try {
            Field statusField = Club.class.getDeclaredField("status");
            statusField.setAccessible(true);
            statusField.set(club, ClubStatus.ACTIVE);
        } catch (ReflectiveOperationException reflectionFailure) {
            throw new IllegalStateException(reflectionFailure);
        }
        return clubRepository.save(club);
    }
}
