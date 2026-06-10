package com.duing.domain.application.controller;

import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.notNullValue;
import static org.hamcrest.Matchers.nullValue;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.interview.entity.InterviewAvailability;
import com.duing.domain.interview.entity.InterviewConfig;
import com.duing.domain.interview.entity.InterviewSchedule;
import com.duing.domain.interview.entity.InterviewSlot;
import com.duing.domain.interview.repository.InterviewAvailabilityRepository;
import com.duing.domain.interview.repository.InterviewConfigRepository;
import com.duing.domain.interview.repository.InterviewScheduleRepository;
import com.duing.domain.interview.repository.InterviewSlotRepository;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.TargetRole;
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

// 지원자 my-application 상세에 stepper 데이터(가능시간 수 / 일정 배정 여부 / 마감 시각) 가
// 노출되는지 검증한다. Spec P0-1.
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class MyApplicationControllerStepperTest extends IntegrationTestBase {

    @LocalServerPort
    private int port;

    @Autowired private UserRepository userRepository;
    @Autowired private ClubRepository clubRepository;
    @Autowired private RecruitmentRepository recruitmentRepository;
    @Autowired private ApplicationRepository applicationRepository;
    @Autowired private InterviewConfigRepository interviewConfigRepository;
    @Autowired private InterviewSlotRepository interviewSlotRepository;
    @Autowired private InterviewAvailabilityRepository interviewAvailabilityRepository;
    @Autowired private InterviewScheduleRepository interviewScheduleRepository;
    @Autowired private JwtTokenProvider jwtTokenProvider;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
    }

    @Test
    @DisplayName("면접 대상 지원자는 제출한 가능시간 수와 마감 시각, 일정 배정 여부를 함께 응답받는다")
    void interviewPendingExposesAvailabilityCountAndDeadline() {
        User applicant = saveUser("지원자");
        String applicantToken = jwtTokenProvider.createToken(applicant.getId(), applicant.getRole().name());

        Club club = saveActiveClub("면접동아리");
        Recruitment recruitment = saveInterviewRecruitment(club, "면접모집");
        LocalDateTime deadline = LocalDateTime.of(2026, 6, 15, 18, 0);
        interviewConfigRepository.save(InterviewConfig.create(recruitment.getId(), deadline));

        InterviewSlot slotA = interviewSlotRepository.save(InterviewSlot.create(
                recruitment.getId(),
                LocalDateTime.of(2026, 6, 20, 14, 0),
                LocalDateTime.of(2026, 6, 20, 14, 30),
                3));
        InterviewSlot slotB = interviewSlotRepository.save(InterviewSlot.create(
                recruitment.getId(),
                LocalDateTime.of(2026, 6, 20, 14, 30),
                LocalDateTime.of(2026, 6, 20, 15, 0),
                3));

        Application application = saveInterviewPendingApplication(recruitment, applicant);
        interviewAvailabilityRepository.save(InterviewAvailability.create(
                application.getId(), slotA.getId(), recruitment.getId()));
        interviewAvailabilityRepository.save(InterviewAvailability.create(
                application.getId(), slotB.getId(), recruitment.getId()));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + applicantToken)
                .when().get("/api/v1/users/me/applications/{id}", application.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.interviewAvailabilityCount", is(2))
                .body("data.interview", nullValue())
                .body("data.availabilityDeadline", equalTo("2026-06-15T18:00:00"));
    }

    @Test
    @DisplayName("운영진이 면접 일정을 배정하고 InterviewConfig.location 이 설정된 지원자는 interview 객체로 노출된다")
    void scheduleAssignedReflectsInterview() {
        User applicant = saveUser("배정된지원자");
        String applicantToken = jwtTokenProvider.createToken(applicant.getId(), applicant.getRole().name());

        Club club = saveActiveClub("배정확인동아리");
        Recruitment recruitment = saveInterviewRecruitment(club, "배정확인모집");
        interviewConfigRepository.save(InterviewConfig.create(
                recruitment.getId(), LocalDateTime.of(2026, 6, 15, 18, 0), "3호관 201호"));

        InterviewSlot slot = interviewSlotRepository.save(InterviewSlot.create(
                recruitment.getId(),
                LocalDateTime.of(2026, 6, 20, 14, 0),
                LocalDateTime.of(2026, 6, 20, 14, 30),
                3));

        Application application = saveInterviewPendingApplication(recruitment, applicant);
        interviewAvailabilityRepository.save(InterviewAvailability.create(
                application.getId(), slot.getId(), recruitment.getId()));
        interviewScheduleRepository.save(InterviewSchedule.create(
                application.getId(), slot.getId(), recruitment.getId(), LocalDateTime.now()));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + applicantToken)
                .when().get("/api/v1/users/me/applications/{id}", application.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.interviewAvailabilityCount", is(1))
                .body("data.interview", notNullValue())
                .body("data.interview.startAt", equalTo("2026-06-20T14:00:00"))
                .body("data.interview.endAt", equalTo("2026-06-20T14:30:00"))
                .body("data.interview.location", equalTo("3호관 201호"));
    }

    @Test
    @DisplayName("InterviewSchedule 이 CANCELLED 상태이면 interview 는 null 로 노출된다")
    void cancelledScheduleIsTreatedAsUnassigned() {
        User applicant = saveUser("취소된지원자");
        String applicantToken = jwtTokenProvider.createToken(applicant.getId(), applicant.getRole().name());

        Club club = saveActiveClub("취소동아리");
        Recruitment recruitment = saveInterviewRecruitment(club, "취소모집");
        interviewConfigRepository.save(InterviewConfig.create(
                recruitment.getId(), LocalDateTime.of(2026, 6, 15, 18, 0), "3호관 201호"));

        InterviewSlot slot = interviewSlotRepository.save(InterviewSlot.create(
                recruitment.getId(),
                LocalDateTime.of(2026, 6, 20, 14, 0),
                LocalDateTime.of(2026, 6, 20, 14, 30),
                3));

        Application application = saveInterviewPendingApplication(recruitment, applicant);
        interviewAvailabilityRepository.save(InterviewAvailability.create(
                application.getId(), slot.getId(), recruitment.getId()));
        InterviewSchedule schedule = interviewScheduleRepository.save(InterviewSchedule.create(
                application.getId(), slot.getId(), recruitment.getId(), LocalDateTime.now()));
        schedule.cancel();
        interviewScheduleRepository.save(schedule);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + applicantToken)
                .when().get("/api/v1/users/me/applications/{id}", application.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.interviewAvailabilityCount", is(1))
                .body("data.interview", nullValue());
    }

    @Test
    @DisplayName("면접을 사용하지 않는 모집의 본인 지원 상세는 availabilityDeadline 과 interview 가 모두 null 이다")
    void useInterviewFalseReturnsNullDeadline() {
        User applicant = saveUser("일반지원자");
        String applicantToken = jwtTokenProvider.createToken(applicant.getId(), applicant.getRole().name());

        Club club = saveActiveClub("일반동아리");
        Recruitment recruitment = saveSimpleRecruitment(club, "면접없는모집");
        Application application = applicationRepository.save(
                Application.submit(recruitment, applicant, List.of()));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + applicantToken)
                .when().get("/api/v1/users/me/applications/{id}", application.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.interviewAvailabilityCount", is(0))
                .body("data.interview", nullValue())
                .body("data.availabilityDeadline", nullValue());
    }

    @Test
    @DisplayName("면접 사용 모집이지만 InterviewConfig 가 아직 없으면 availabilityDeadline 은 null 이다")
    void useInterviewWithoutConfigReturnsNullDeadline() {
        User applicant = saveUser("설정전지원자");
        String applicantToken = jwtTokenProvider.createToken(applicant.getId(), applicant.getRole().name());

        Club club = saveActiveClub("설정전동아리");
        Recruitment recruitment = saveInterviewRecruitment(club, "설정전모집");
        Application application = saveInterviewPendingApplication(recruitment, applicant);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + applicantToken)
                .when().get("/api/v1/users/me/applications/{id}", application.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.availabilityDeadline", nullValue());
    }

    private User saveUser(String nameSuffix) {
        long unique = sequence.incrementAndGet();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                nameSuffix + unique,
                "stepper" + unique + "@daegu.ac.kr",
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

    private Recruitment saveInterviewRecruitment(Club club, String title) {
        LocalDate today = LocalDate.now();
        Recruitment recruitment = Recruitment.createWithOptions(club,
                title + "-" + sequence.incrementAndGet(), null,
                today.minusDays(1), today.plusDays(7), 10,
                ApplicationMode.SELF, null,
                true, TargetRole.MEMBER,
                today.plusDays(7), today.plusDays(14),
                false);
        return recruitmentRepository.save(recruitment);
    }

    private Recruitment saveSimpleRecruitment(Club club, String title) {
        LocalDate today = LocalDate.now();
        Recruitment recruitment = Recruitment.create(club,
                title + "-" + sequence.incrementAndGet(), null,
                today.minusDays(1), today.plusDays(7), 10);
        return recruitmentRepository.save(recruitment);
    }

    private Application saveInterviewPendingApplication(Recruitment recruitment, User user) {
        Application application = Application.submit(recruitment, user, List.of());
        ReflectionTestUtils.setField(application, "status", ApplicationStatus.INTERVIEW_PENDING);
        return applicationRepository.save(application);
    }
}
