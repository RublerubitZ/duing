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
import com.duing.domain.interview.entity.InterviewAvailability;
import com.duing.domain.interview.entity.InterviewConfig;
import com.duing.domain.interview.entity.InterviewSlot;
import com.duing.domain.interview.repository.InterviewAvailabilityRepository;
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
import io.restassured.http.ContentType;
import java.lang.reflect.Field;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
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
class InterviewAvailabilityControllerTest extends IntegrationTestBase {

    @LocalServerPort
    private int port;

    @Autowired private UserRepository userRepository;
    @Autowired private ClubRepository clubRepository;
    @Autowired private ClubMemberRepository clubMemberRepository;
    @Autowired private RecruitmentRepository recruitmentRepository;
    @Autowired private InterviewConfigRepository configRepository;
    @Autowired private InterviewSlotRepository slotRepository;
    @Autowired private InterviewAvailabilityRepository availabilityRepository;
    @Autowired private ApplicationRepository applicationRepository;
    @Autowired private JwtTokenProvider jwtTokenProvider;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private Long applicantId;
    private String applicantToken;
    private String otherUserToken;
    private Long applicationId;
    private Long slotAId;
    private Long slotBId;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;

        Club club = saveActiveClub("가용시간테스트동아리");
        User leader = saveUser("리더");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));

        Recruitment recruitment = recruitmentRepository.save(
                Recruitment.create(club, "가용시간모집", null,
                        LocalDate.now().minusDays(1), LocalDate.now().plusDays(7), 10));

        configRepository.save(
                InterviewConfig.create(recruitment.getId(), LocalDateTime.now().plusDays(7)));

        InterviewSlot slotA = slotRepository.save(InterviewSlot.create(
                recruitment.getId(),
                LocalDateTime.now().plusDays(10),
                LocalDateTime.now().plusDays(10).plusHours(1),
                5));
        InterviewSlot slotB = slotRepository.save(InterviewSlot.create(
                recruitment.getId(),
                LocalDateTime.now().plusDays(11),
                LocalDateTime.now().plusDays(11).plusHours(1),
                5));
        slotAId = slotA.getId();
        slotBId = slotB.getId();

        User applicant = saveUser("지원자");
        applicantId = applicant.getId();
        applicantToken = jwtTokenProvider.createToken(applicant.getId(), applicant.getRole().name());

        User otherUser = saveUser("타인");
        otherUserToken = jwtTokenProvider.createToken(otherUser.getId(), otherUser.getRole().name());

        Application application = applicationRepository.save(
                Application.submit(recruitment, applicant, List.of()));
        applicationId = application.getId();
    }

    // ── 시나리오 ────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("지원자는 deadline 전 자신의 가능시간을 PUT 으로 교체할 수 있다")
    void replaceHappyPath() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + applicantToken)
                .contentType(ContentType.JSON)
                .body(Map.of("slotIds", List.of(slotAId, slotBId)))
                .when().put("/api/v1/applications/" + applicationId + "/interview-availabilities")
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        List<InterviewAvailability> savedAvailabilities =
                availabilityRepository.findByApplicationId(applicationId);
        assertThat(savedAvailabilities).hasSize(2);
    }

    @Test
    @DisplayName("PUT 두 번 호출 시 두 번째 결과로 완전히 교체된다")
    void secondPutCompletelyReplaces() {
        // 첫 번째 PUT — slotA, slotB
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + applicantToken)
                .contentType(ContentType.JSON)
                .body(Map.of("slotIds", List.of(slotAId, slotBId)))
                .when().put("/api/v1/applications/" + applicationId + "/interview-availabilities")
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        // 두 번째 PUT — slotA 만
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + applicantToken)
                .contentType(ContentType.JSON)
                .body(Map.of("slotIds", List.of(slotAId)))
                .when().put("/api/v1/applications/" + applicationId + "/interview-availabilities")
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        List<InterviewAvailability> finalAvailabilities =
                availabilityRepository.findByApplicationId(applicationId);
        assertThat(finalAvailabilities).hasSize(1);
        assertThat(finalAvailabilities.get(0).getSlotId()).isEqualTo(slotAId);
    }

    @Test
    @DisplayName("다른 사용자의 application 에 PUT 호출 시 403 NotApplicationOwner 가 반환된다")
    void putByNonOwnerReturns403() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + otherUserToken)
                .contentType(ContentType.JSON)
                .body(Map.of("slotIds", List.of(slotAId)))
                .when().put("/api/v1/applications/" + applicationId + "/interview-availabilities")
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("deadline 이후 PUT 은 409 AvailabilityPeriodClosed 가 반환된다")
    void putAfterDeadlineReturns409() {
        // 같은 applicant 의 새 application 을 마감된 config 가 있는 모집에 생성
        Club club = saveActiveClub("마감동아리");
        User leader = saveUser("마감리더");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment closedRecruitment = recruitmentRepository.save(
                Recruitment.create(club, "마감모집", null,
                        LocalDate.now().minusDays(2), LocalDate.now().plusDays(5), 10));
        configRepository.save(
                InterviewConfig.create(closedRecruitment.getId(), LocalDateTime.now().minusSeconds(1)));
        InterviewSlot slot = slotRepository.save(InterviewSlot.create(
                closedRecruitment.getId(),
                LocalDateTime.now().plusDays(10),
                LocalDateTime.now().plusDays(10).plusHours(1),
                5));
        User applicant = saveUser("마감지원자");
        String closedApplicantToken = jwtTokenProvider.createToken(applicant.getId(), applicant.getRole().name());
        Application closedApplication = applicationRepository.save(
                Application.submit(closedRecruitment, applicant, List.of()));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + closedApplicantToken)
                .contentType(ContentType.JSON)
                .body(Map.of("slotIds", List.of(slot.getId())))
                .when().put("/api/v1/applications/" + closedApplication.getId() + "/interview-availabilities")
                .then().statusCode(HttpStatus.CONFLICT.value());
    }

    @Test
    @DisplayName("assignmentCompletedAt 이 채워진 후 PUT 은 409 AssignmentAlreadyCompleted 가 반환된다")
    void putAfterAssignmentCompletedReturns409() {
        Club club = saveActiveClub("배정완료동아리");
        User leader = saveUser("배정리더");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = recruitmentRepository.save(
                Recruitment.create(club, "배정완료모집", null,
                        LocalDate.now().minusDays(1), LocalDate.now().plusDays(7), 10));
        InterviewSlot slot = slotRepository.save(InterviewSlot.create(
                recruitment.getId(),
                LocalDateTime.now().plusDays(10),
                LocalDateTime.now().plusDays(10).plusHours(1),
                5));
        User applicant = saveUser("배정지원자");
        String completedApplicantToken = jwtTokenProvider.createToken(applicant.getId(), applicant.getRole().name());
        Application completedApplication = applicationRepository.save(
                Application.submit(recruitment, applicant, List.of()));

        // assignmentCompletedAt 이 채워진 config 생성
        InterviewConfig completedConfig = configRepository.save(
                InterviewConfig.create(recruitment.getId(), LocalDateTime.now().plusDays(7)));
        completedConfig.markAssignmentCompleted(LocalDateTime.now());
        configRepository.save(completedConfig);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + completedApplicantToken)
                .contentType(ContentType.JSON)
                .body(Map.of("slotIds", List.of(slot.getId())))
                .when().put("/api/v1/applications/" + completedApplication.getId() + "/interview-availabilities")
                .then().statusCode(HttpStatus.CONFLICT.value());
    }

    @Test
    @DisplayName("빈 slotIds 로 PUT 호출 시 400 InvalidSlotSelection 이 반환된다")
    void putWithEmptySlotIdsReturns400() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + applicantToken)
                .contentType(ContentType.JSON)
                .body(Map.of("slotIds", List.of()))
                .when().put("/api/v1/applications/" + applicationId + "/interview-availabilities")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("동일 slotId 가 중복된 PUT 호출은 400 DuplicateSlotInRequest 가 반환된다")
    void putWithDuplicateSlotIdsReturns400() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + applicantToken)
                .contentType(ContentType.JSON)
                .body(Map.of("slotIds", List.of(slotAId, slotAId)))
                .when().put("/api/v1/applications/" + applicationId + "/interview-availabilities")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    // ── 헬퍼 ────────────────────────────────────────────────────────────────────

    private User saveUser(String nameSuffix) {
        long seq = sequence.incrementAndGet();
        return userRepository.save(User.create(
                String.format("%010d", seq % 10_000_000_000L),
                nameSuffix + seq,
                "ctrl" + seq + "@duing.ac.kr",
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
