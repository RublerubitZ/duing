package com.duing.domain.interview.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.notNullValue;

import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.InterviewRoundFixture;
import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.repository.ApplicationStatusHistoryRepository;
import com.duing.domain.club.entity.Club;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.interview.entity.InterviewRound;
import com.duing.domain.interview.entity.InterviewRoundMember;
import com.duing.domain.interview.entity.RoundMemberStatus;
import com.duing.domain.interview.entity.RoundStatus;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.user.entity.User;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
// wizard Step2 의 첫 persist — 면접 대상 선정 + 라운드(DRAFT) + 멤버 생성이 한 트랜잭션으로
// 처리되는지, placement 불변식과 DRAFT 1개 제약이 강제되는지 검증한다 (스펙 §9.1 API 2·§7·§16).
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class LeaderInterviewRoundCreateControllerTest extends InterviewControllerTestSupport {

    private static final String CREATE_PATH = "/api/v1/leader/recruitments/{recruitmentId}/interview-rounds";

    @LocalServerPort
    private int port;

    @Autowired private ApplicationStatusHistoryRepository applicationStatusHistoryRepository;

    private User leader;
    private String leaderToken;
    private Recruitment recruitment;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        leader = saveUser("리더");
        leaderToken = jwtTokenProvider.createToken(leader.getId(), leader.getRole().name());
        Club club = saveActiveClub("라운드생성동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        recruitment = saveInterviewRecruitment(club, "라운드생성모집");
    }

    @Test
    @DisplayName("서류 검토 중 지원자와 대기열 지원자를 함께 선정하면 라운드가 DRAFT 로 생성되고 전이·이력·멤버가 한 번에 처리된다")
    void createRoundSelectsCandidatesAtomically() {
        Application reviewing1 = saveUnderReviewApplication(recruitment, "서류1");
        Application reviewing2 = saveUnderReviewApplication(recruitment, "서류2");
        Application queued = saveInterviewPendingApplication(recruitment, "대기열");
        long queuedHistoryBefore = applicationStatusHistoryRepository
                .findByApplicationIdOrderByCreatedAtDesc(queued.getId()).size();

        Integer roundId = RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "title", "1차 면접",
                        "availabilityDeadline", LocalDateTime.now().plusDays(7).toString(),
                        "location", "본관 201호",
                        "applicationIds", List.of(reviewing1.getId(), reviewing2.getId(), queued.getId())))
                .when().post(CREATE_PATH, recruitment.getId())
                .then().statusCode(HttpStatus.CREATED.value())
                .body("data.roundId", notNullValue())
                .extract().path("data.roundId");

        InterviewRound round = interviewRoundRepository.findById(roundId.longValue()).orElseThrow();
        assertThat(round.getStatus()).isEqualTo(RoundStatus.DRAFT);
        assertThat(round.getTitle()).isEqualTo("1차 면접");
        assertThat(round.getLocation()).isEqualTo("본관 201호");

        List<InterviewRoundMember> members = interviewRoundMemberRepository.findAll().stream()
                .filter(member -> member.getRoundId().equals(round.getId()))
                .toList();
        assertThat(members).hasSize(3);
        assertThat(members).allMatch(member -> member.getStatus() == RoundMemberStatus.INVITED);

        // UNDER_REVIEW 후보는 INTERVIEW_PENDING 으로 전이 + 이력 기록
        assertThat(applicationRepository.findById(reviewing1.getId()).orElseThrow().getStatus())
                .isEqualTo(ApplicationStatus.INTERVIEW_PENDING);
        assertThat(applicationStatusHistoryRepository
                .findByApplicationIdOrderByCreatedAtDesc(reviewing1.getId()))
                .isNotEmpty();
        assertThat(applicationRepository.findById(reviewing2.getId()).orElseThrow().getStatus())
                .isEqualTo(ApplicationStatus.INTERVIEW_PENDING);
        assertThat(applicationStatusHistoryRepository
                .findByApplicationIdOrderByCreatedAtDesc(reviewing2.getId()))
                .isNotEmpty();
        // 대기열 후보는 상태 유지 + 이력 추가 없음
        assertThat(applicationRepository.findById(queued.getId()).orElseThrow().getStatus())
                .isEqualTo(ApplicationStatus.INTERVIEW_PENDING);
        assertThat(applicationStatusHistoryRepository
                .findByApplicationIdOrderByCreatedAtDesc(queued.getId()))
                .hasSize((int) queuedHistoryBefore);
    }

    @Test
    @DisplayName("availabilityDeadline 없이도 라운드를 만들 수 있다 — 마감은 발송 전까지만 정하면 된다")
    void deadlineIsOptionalInDraft() {
        Application reviewing = saveUnderReviewApplication(recruitment, "마감없음");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("title", "1차 면접", "applicationIds", List.of(reviewing.getId())))
                .when().post(CREATE_PATH, recruitment.getId())
                .then().statusCode(HttpStatus.CREATED.value());
    }

    @Test
    @DisplayName("availabilityDeadline 이 현재 이전이면 라운드를 만들 수 없다")
    void pastDeadlineIsRejected() {
        Application reviewing = saveUnderReviewApplication(recruitment, "과거마감");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "title", "1차 면접",
                        "availabilityDeadline", LocalDateTime.now().minusHours(1).toString(),
                        "applicationIds", List.of(reviewing.getId())))
                .when().post(CREATE_PATH, recruitment.getId())
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("선정 불가 상태(SUBMITTED) 지원자가 섞이면 전체가 거부되고 아무것도 변하지 않는다")
    void ineligibleStatusRejectsWholeRequestAtomically() {
        Application reviewing = saveUnderReviewApplication(recruitment, "정상후보");
        Application submitted = saveSubmittedApplication(recruitment, "미열람");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("title", "1차 면접",
                        "applicationIds", List.of(reviewing.getId(), submitted.getId())))
                .when().post(CREATE_PATH, recruitment.getId())
                .then().statusCode(HttpStatus.BAD_REQUEST.value());

        // 원자성: 정상 후보도 전이되지 않았고 라운드도 생성되지 않았다
        assertThat(applicationRepository.findById(reviewing.getId()).orElseThrow().getStatus())
                .isEqualTo(ApplicationStatus.UNDER_REVIEW);
        assertThat(interviewRoundRepository.findAll().stream()
                .filter(round -> round.getRecruitmentId().equals(recruitment.getId())))
                .isEmpty();
    }

    @Test
    @DisplayName("이미 합격 처리된 지원자는 면접 대상으로 선정할 수 없다")
    void acceptedApplicantIsRejected() {
        Application accepted = saveApplicationWithStatus(recruitment, "합격자", ApplicationStatus.ACCEPTED);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("title", "1차 면접", "applicationIds", List.of(accepted.getId())))
                .when().post(CREATE_PATH, recruitment.getId())
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("다른 모집의 지원자를 선정 목록에 넣으면 거부된다")
    void candidateFromOtherRecruitmentIsRejected() {
        Club otherClub = saveActiveClub("타동아리");
        clubMemberRepository.save(ClubMember.asLeader(otherClub, saveUser("타리더")));
        Recruitment otherRecruitment = saveInterviewRecruitment(otherClub, "타모집");
        User applicant = saveUser("타지원자");
        Application otherApplication = applicationRepository.save(
                Application.submit(otherRecruitment, applicant, List.of()));
        otherApplication.transitionTo(ApplicationStatus.UNDER_REVIEW, true);
        applicationRepository.save(otherApplication);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("title", "1차 면접", "applicationIds", List.of(otherApplication.getId())))
                .when().post(CREATE_PATH, recruitment.getId())
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("이미 진행 중인 라운드에 소속된 지원자를 다시 선정하면 409 로 거부된다")
    void candidateAlreadyInActiveRoundIsRejected() {
        Application placed = saveInterviewPendingApplication(recruitment, "기소속");
        InterviewRound collectingRound = interviewRoundRepository.save(InterviewRoundFixture.withStatus(
                recruitment.getId(), LocalDateTime.now().plusDays(3), null, RoundStatus.COLLECTING));
        interviewRoundMemberRepository.save(
                InterviewRoundMember.invite(collectingRound.getId(), placed.getId()));
        Application fresh = saveUnderReviewApplication(recruitment, "신규후보");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("title", "2차 면접",
                        "applicationIds", List.of(placed.getId(), fresh.getId())))
                .when().post(CREATE_PATH, recruitment.getId())
                .then().statusCode(HttpStatus.CONFLICT.value());

        // 원자성: 신규 후보도 전이되지 않았다
        assertThat(applicationRepository.findById(fresh.getId()).orElseThrow().getStatus())
                .isEqualTo(ApplicationStatus.UNDER_REVIEW);
    }

    @Test
    @DisplayName("모집에 이미 준비 중(DRAFT) 라운드가 있으면 새 라운드를 만들 수 없다")
    void secondDraftRoundIsRejected() {
        interviewRoundRepository.save(
                InterviewRoundFixture.draft(recruitment.getId(), LocalDateTime.now().plusDays(7)));
        Application reviewing = saveUnderReviewApplication(recruitment, "후보");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("title", "2차 면접", "applicationIds", List.of(reviewing.getId())))
                .when().post(CREATE_PATH, recruitment.getId())
                .then().statusCode(HttpStatus.CONFLICT.value());
    }

    @Test
    @DisplayName("존재하지 않는 지원서가 포함되면 404 를 반환한다")
    void unknownApplicationIdReturnsNotFound() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("title", "1차 면접", "applicationIds", List.of(999_999L)))
                .when().post(CREATE_PATH, recruitment.getId())
                .then().statusCode(HttpStatus.NOT_FOUND.value());
    }

    @Test
    @DisplayName("선정 대상이 비어 있으면 400 을 반환한다")
    void emptyApplicationIdsIsRejected() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("title", "1차 면접", "applicationIds", List.of()))
                .when().post(CREATE_PATH, recruitment.getId())
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("중복으로 선택된 지원자는 한 번만 멤버로 등록된다")
    void duplicateApplicationIdsAreDeduplicated() {
        Application reviewing = saveUnderReviewApplication(recruitment, "중복선택");

        Integer roundId = RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("title", "1차 면접",
                        "applicationIds", List.of(reviewing.getId(), reviewing.getId())))
                .when().post(CREATE_PATH, recruitment.getId())
                .then().statusCode(HttpStatus.CREATED.value())
                .extract().path("data.roundId");

        long memberCount = interviewRoundMemberRepository.findAll().stream()
                .filter(member -> member.getRoundId().equals(roundId.longValue()))
                .count();
        assertThat(memberCount).isEqualTo(1);
    }

    @Test
    @DisplayName("해당 동아리 운영진이 아니면 라운드를 만들 수 없다")
    void nonManagerCannotCreateRound() {
        User outsider = saveUser("외부인");
        String outsiderToken = jwtTokenProvider.createToken(outsider.getId(), outsider.getRole().name());
        Application reviewing = saveUnderReviewApplication(recruitment, "후보");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + outsiderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("title", "1차 면접", "applicationIds", List.of(reviewing.getId())))
                .when().post(CREATE_PATH, recruitment.getId())
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("면접을 사용하지 않는 모집에는 라운드를 만들 수 없다")
    void interviewNotUsedRecruitmentIsRejected() {
        Club club = saveActiveClub("면접없는동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        LocalDate today = LocalDate.now();
        Recruitment simpleRecruitment = recruitmentRepository.save(Recruitment.create(club,
                "면접없는모집-" + sequence.incrementAndGet(), null,
                today.minusDays(1), today.plusDays(7), 10));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("title", "1차 면접", "applicationIds", List.of(1L)))
                .when().post(CREATE_PATH, simpleRecruitment.getId())
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("존재하지 않는 모집에는 라운드를 만들 수 없다")
    void unknownRecruitmentReturnsNotFound() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("title", "1차 면접", "applicationIds", List.of(1L)))
                .when().post(CREATE_PATH, 999_999L)
                .then().statusCode(HttpStatus.NOT_FOUND.value());
    }

    @Test
    @DisplayName("같은 모집에 동시에 라운드 생성을 요청하면 정확히 하나만 성공한다")
    void concurrentCreationAllowsExactlyOne() throws Exception {
        Application reviewing = saveUnderReviewApplication(recruitment, "동시성후보");
        Map<String, Object> requestBody = Map.of(
                "title", "1차 면접", "applicationIds", List.of(reviewing.getId()));

        ExecutorService executor = Executors.newFixedThreadPool(2);
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        try {
            List<java.util.concurrent.Future<Integer>> futures = java.util.stream.Stream.of(1, 2)
                    .map(attempt -> executor.submit(() -> {
                        ready.countDown();
                        start.await(5, TimeUnit.SECONDS);
                        return RestAssured.given()
                                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                                .contentType(ContentType.JSON)
                                .body(requestBody)
                                .when().post(CREATE_PATH, recruitment.getId())
                                .then().extract().statusCode();
                    }))
                    .toList();
            ready.await(5, TimeUnit.SECONDS);
            start.countDown();

            List<Integer> statusCodes = futures.stream()
                    .map(future -> {
                        try {
                            return future.get(30, TimeUnit.SECONDS);
                        } catch (Exception unexpected) {
                            throw new IllegalStateException(unexpected);
                        }
                    })
                    .toList();

            // 한쪽은 201, 다른 쪽은 409 (placement 잠금 직렬화 또는 DRAFT partial unique)
            assertThat(statusCodes).containsExactlyInAnyOrder(
                    HttpStatus.CREATED.value(), HttpStatus.CONFLICT.value());
        } finally {
            executor.shutdownNow();
        }

        // 라운드와 멤버가 정확히 1 개씩만 생성됐다
        long roundCount = interviewRoundRepository.findAll().stream()
                .filter(round -> round.getRecruitmentId().equals(recruitment.getId()))
                .count();
        long memberCount = interviewRoundMemberRepository.findAll().stream()
                .filter(member -> member.getApplicationId().equals(reviewing.getId()))
                .count();
        assertThat(roundCount).isEqualTo(1);
        assertThat(memberCount).isEqualTo(1);
    }
}
