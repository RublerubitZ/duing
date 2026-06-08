package com.duing.domain.interview.controller;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.application.entity.Application;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.interview.entity.InterviewSchedule;
import com.duing.domain.interview.entity.InterviewScheduleStatus;
import com.duing.domain.interview.entity.InterviewSlot;
import com.duing.domain.interview.repository.InterviewScheduleRepository;
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

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class InterviewScheduleControllerTest extends IntegrationTestBase {

    @LocalServerPort
    private int port;

    @Autowired private UserRepository userRepository;
    @Autowired private ClubRepository clubRepository;
    @Autowired private ClubMemberRepository clubMemberRepository;
    @Autowired private RecruitmentRepository recruitmentRepository;
    @Autowired private ApplicationRepository applicationRepository;
    @Autowired private InterviewSlotRepository slotRepository;
    @Autowired private InterviewScheduleRepository scheduleRepository;
    @Autowired private JwtTokenProvider jwtTokenProvider;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private String applicantToken;
    private String otherUserToken;
    private Long applicationId;
    private Long slotId;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;

        Club club = saveActiveClub("면접일정동아리");
        User leader = saveUser("리더");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));

        Recruitment recruitment = recruitmentRepository.save(
                Recruitment.create(club, "면접일정모집", null,
                        LocalDate.now().minusDays(1), LocalDate.now().plusDays(7), 10));

        InterviewSlot slot = slotRepository.save(InterviewSlot.create(
                recruitment.getId(),
                LocalDateTime.now().plusDays(10),
                LocalDateTime.now().plusDays(10).plusHours(1),
                5));
        slotId = slot.getId();

        User applicant = saveUser("지원자");
        applicantToken = jwtTokenProvider.createToken(applicant.getId(), applicant.getRole().name());

        User otherUser = saveUser("타인");
        otherUserToken = jwtTokenProvider.createToken(otherUser.getId(), otherUser.getRole().name());

        Application application = applicationRepository.save(
                Application.submit(recruitment, applicant, List.of()));
        applicationId = application.getId();
    }

    // ── 시나리오 ────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("schedule 이 배정된 본인 application 을 조회하면 assigned=true 와 slotId 가 응답된다")
    void 배정된_schedule이_있으면_200_assigned_true로_응답한다() {
        scheduleRepository.save(
                InterviewSchedule.create(applicationId, slotId, 1L, LocalDateTime.now()));

        var response = RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + applicantToken)
                .when().get("/api/v1/applications/" + applicationId + "/interview-schedule")
                .then().statusCode(HttpStatus.OK.value())
                .extract().jsonPath();

        assertThat(response.getBoolean("data.assigned")).isTrue();
        assertThat((Integer) response.get("data.schedule.slotId")).isEqualTo(slotId.intValue());
        assertThat(response.getString("data.schedule.status"))
                .isEqualTo(InterviewScheduleStatus.ASSIGNED.name());
    }

    @Test
    @DisplayName("schedule 이 없는 본인 application 을 조회하면 assigned=false, schedule=null 로 응답한다")
    void 배정된_schedule이_없으면_200_assigned_false로_응답한다() {
        var response = RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + applicantToken)
                .when().get("/api/v1/applications/" + applicationId + "/interview-schedule")
                .then().statusCode(HttpStatus.OK.value())
                .extract().jsonPath();

        assertThat(response.getBoolean("data.assigned")).isFalse();
        assertThat((Object) response.get("data.schedule")).isNull();
    }

    @Test
    @DisplayName("다른 사용자가 조회하면 403 이 반환된다")
    void 타인이_조회하면_403_반환된다() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + otherUserToken)
                .when().get("/api/v1/applications/" + applicationId + "/interview-schedule")
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("존재하지 않는 applicationId 로 조회하면 404 가 반환된다")
    void 존재하지_않는_application_조회시_404가_반환된다() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + applicantToken)
                .when().get("/api/v1/applications/999999/interview-schedule")
                .then().statusCode(HttpStatus.NOT_FOUND.value());
    }

    @Test
    @DisplayName("CANCELLED 상태의 schedule 도 assigned=true, status=CANCELLED 로 응답한다")
    void CANCELLED_schedule도_assigned_true로_응답한다() {
        InterviewSchedule schedule =
                InterviewSchedule.create(applicationId, slotId, 1L, LocalDateTime.now());
        schedule.cancel();
        scheduleRepository.save(schedule);

        var response = RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + applicantToken)
                .when().get("/api/v1/applications/" + applicationId + "/interview-schedule")
                .then().statusCode(HttpStatus.OK.value())
                .extract().jsonPath();

        assertThat(response.getBoolean("data.assigned")).isTrue();
        assertThat(response.getString("data.schedule.status"))
                .isEqualTo(InterviewScheduleStatus.CANCELLED.name());
    }

    // ── 헬퍼 ─────────────────────────────────────────────────────────────────────

    private User saveUser(String nameSuffix) {
        long seq = sequence.incrementAndGet();
        return userRepository.save(User.create(
                String.format("%010d", seq % 10_000_000_000L),
                nameSuffix + seq,
                "schedctrl" + seq + "@duing.ac.kr",
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
