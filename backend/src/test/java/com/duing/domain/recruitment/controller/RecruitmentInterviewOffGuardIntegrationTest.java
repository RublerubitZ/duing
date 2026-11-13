package com.duing.domain.recruitment.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.nullValue;

import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.InterviewRoundFixture;
import com.duing.domain.application.entity.Application;
import com.duing.domain.club.entity.Club;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.interview.controller.InterviewControllerTestSupport;
import com.duing.domain.interview.entity.RoundStatus;
import com.duing.domain.interview.service.InterviewRoundService;
import com.duing.domain.interview.service.dto.command.CreateInterviewRoundCommand;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import com.duing.domain.recruitment.service.RecruitmentService;
import com.duing.domain.user.entity.User;
import com.duing.global.constant.ErrorCodes;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import io.restassured.response.Response;
import io.restassured.response.ValidatableResponse;
import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 모집 수정에서 면접 끄기 가드 — 면접을 켠 모집에 취소하지 않은 라운드가 있으면 끄는 요청을 409 로 막는다.
 * 요청 본문은 수정 폼처럼 제목 변경과 useInterview 를 함께 싣는다.
 * 모집 수정 잠금 경합(첫 조회의 모집 행 잠금이 라운드 생성·마감과 직렬화되는지)도 함께 본다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class RecruitmentInterviewOffGuardIntegrationTest extends InterviewControllerTestSupport {

    private static final String UPDATE_PATH = "/api/v1/leader/recruitments/{recruitmentId}";
    private static final String ROUNDS_EXIST_MESSAGE = "취소하지 않은 면접 라운드가 있어 면접을 끌 수 없습니다. "
            + "초안은 폐기하고 진행 중인 라운드는 취소한 뒤 다시 시도해주세요(확정된 라운드가 있으면 끌 수 없습니다).";
    private static final String CHANGED_TITLE = "바뀐 모집 제목";

    @LocalServerPort
    private int port;

    @Autowired private InterviewRoundService interviewRoundService;
    @Autowired private RecruitmentService recruitmentService;
    @Autowired private PlatformTransactionManager transactionManager;
    @Autowired private JdbcTemplate jdbcTemplate;

    private User leader;
    private String leaderToken;
    private Club club;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        leader = saveUser("끄기리더");
        leaderToken = tokenFor(leader);
        club = saveActiveClub("끄기동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
    }

    @ParameterizedTest(name = "{0} 라운드가 있으면 409")
    @EnumSource(value = RoundStatus.class, names = "CANCELLED", mode = EnumSource.Mode.EXCLUDE)
    @DisplayName("면접을 켠 모집에 취소하지 않은 라운드가 있으면 면접을 끌 수 없다")
    void rejectsTurningOffWithUncancelledRound(RoundStatus status) {
        Recruitment recruitment = saveInterviewRecruitment(club, "거절모집");
        saveRound(recruitment, status);

        patchRecruitment(leaderToken, recruitment, CHANGED_TITLE, false)
                .statusCode(HttpStatus.CONFLICT.value())
                .body("message", equalTo(ROUNDS_EXIST_MESSAGE))
                .body("code", nullValue());

        assertSaved(recruitment, true, recruitment.getTitle());
    }

    @Test
    @DisplayName("다른 동아리 운영진이 면접을 끄려 하면 라운드가 있어도 409 가 아니라 미존재와 같은 404 다")
    void otherClubLeaderGetsNotFoundBeforeRoundGuard() {
        Recruitment recruitment = saveInterviewRecruitment(club, "남의모집");
        saveRound(recruitment, RoundStatus.DRAFT);
        User otherLeader = saveUser("타동아리리더");
        clubMemberRepository.save(ClubMember.asLeader(saveActiveClub("타동아리"), otherLeader));

        patchRecruitment(tokenFor(otherLeader), recruitment, CHANGED_TITLE, false)
                .statusCode(HttpStatus.NOT_FOUND.value())
                .body("message", equalTo("모집 공고를 찾을 수 없습니다."));

        assertSaved(recruitment, true, recruitment.getTitle());
    }

    @Test
    @DisplayName("면접을 켠 모집의 라운드가 모두 취소됐으면 면접을 끌 수 있다")
    void allowsTurningOffWhenOnlyCancelledRounds() {
        Recruitment recruitment = saveInterviewRecruitment(club, "취소모집");
        saveRound(recruitment, RoundStatus.CANCELLED);

        patchRecruitment(leaderToken, recruitment, CHANGED_TITLE, false)
                .statusCode(HttpStatus.NO_CONTENT.value());

        assertSaved(recruitment, false, CHANGED_TITLE);
    }

    @Test
    @DisplayName("면접을 켠 모집에 라운드가 없으면 면접을 끌 수 있다")
    void allowsTurningOffWithoutRounds() {
        Recruitment recruitment = saveInterviewRecruitment(club, "라운드없는모집");

        patchRecruitment(leaderToken, recruitment, CHANGED_TITLE, false)
                .statusCode(HttpStatus.NO_CONTENT.value());

        assertSaved(recruitment, false, CHANGED_TITLE);
    }

    @Test
    @DisplayName("이미 면접이 꺼진 옛 모집은 남은 라운드가 있어도 면접 꺼짐을 다시 보내며 다른 필드를 고칠 수 있다")
    void allowsEditingLegacyInterviewOffRecruitmentWithRounds() {
        Recruitment legacyRecruitment = saveLegacyInterviewOffRecruitmentWithDraftRound();

        patchRecruitment(leaderToken, legacyRecruitment, CHANGED_TITLE, false)
                .statusCode(HttpStatus.NO_CONTENT.value());

        assertSaved(legacyRecruitment, false, CHANGED_TITLE);
    }

    @Test
    @DisplayName("이미 면접이 꺼진 옛 모집은 남은 라운드가 있어도 면접을 다시 켤 수 있다")
    void allowsTurningOnLegacyInterviewOffRecruitmentWithRounds() {
        Recruitment legacyRecruitment = saveLegacyInterviewOffRecruitmentWithDraftRound();

        patchRecruitment(leaderToken, legacyRecruitment, CHANGED_TITLE, true)
                .statusCode(HttpStatus.NO_CONTENT.value());

        assertSaved(legacyRecruitment, true, CHANGED_TITLE);
    }

    @Test
    @DisplayName("면접 진행 여부를 보내지 않은 수정은 초안 라운드가 있어도 저장되고 면접은 켜진 채로 남는다")
    void allowsEditWithoutUseInterviewWhenRoundsExist() {
        Recruitment recruitment = saveInterviewRecruitment(club, "생략모집");
        saveRound(recruitment, RoundStatus.DRAFT);

        patchRecruitment(leaderToken, recruitment, CHANGED_TITLE, null)
                .statusCode(HttpStatus.NO_CONTENT.value());

        assertSaved(recruitment, true, CHANGED_TITLE);
    }

    @Test
    @DisplayName("마감된 모집에서 면접을 끄려 하면 라운드가 있어도 기존의 마감 409 가 먼저 나간다")
    void closedRecruitmentKeepsClosedConflict() {
        Recruitment recruitment = saveInterviewRecruitment(club, "마감모집");
        saveRound(recruitment, RoundStatus.DRAFT);
        recruitment.close(LocalDateTime.now());
        recruitmentRepository.saveAndFlush(recruitment);

        patchRecruitment(leaderToken, recruitment, CHANGED_TITLE, false)
                .statusCode(HttpStatus.CONFLICT.value())
                .body("code", equalTo(ErrorCodes.RECRUITMENT_CLOSED));
    }

    @Test
    @DisplayName("라운드 생성이 모집 행을 잠근 사이 들어온 면접 끄기는 생성이 끝날 때까지 기다렸다가 생긴 라운드를 보고 409 로 거절된다")
    void turningOffWaitsForRoundCreationAndIsRejectedAfterwards() throws Exception {
        Recruitment recruitment = saveInterviewRecruitment(club, "경합모집");
        Application candidate = saveOnHoldApplication(recruitment, "경합후보");
        TransactionTemplate createTransaction = new TransactionTemplate(transactionManager);
        CountDownLatch createHoldsRowLock = new CountDownLatch(1);
        CountDownLatch createMayCommit = new CountDownLatch(1);
        ExecutorService executor = Executors.newFixedThreadPool(2);

        try {
            // 라운드 생성을 커밋 직전에 붙잡아, createRound 가 잡은 모집 행 잠금을 계속 쥔 상태로 만든다.
            Future<?> creating = executor.submit(() -> createTransaction.executeWithoutResult(transaction -> {
                interviewRoundService.createRound(new CreateInterviewRoundCommand(recruitment.getId(),
                        leader.getId(), "1차 면접", null, null, List.of(candidate.getId())));
                interviewRoundRepository.flush();
                createHoldsRowLock.countDown();
                awaitQuietly(createMayCommit);
            }));
            assertThat(createHoldsRowLock.await(10, TimeUnit.SECONDS))
                    .as("라운드 생성 트랜잭션이 모집 행 잠금을 획득").isTrue();

            Future<Response> turningOff = executor.submit(() ->
                    patchRecruitment(leaderToken, recruitment, CHANGED_TITLE, false).extract().response());

            // 끄기가 행 잠금 대기에 들어간 뒤에 생성을 놓는다 — 잠금이 없으면 가드가 생성 커밋 전에 0개를 보고 지나간 뒤
            // UPDATE 에서 기다리다 204 로 끝나고, 잠금이 있으면 첫 조회에서 기다리다 커밋된 라운드를 본다.
            awaitBlockedLock();
            createMayCommit.countDown();
            creating.get(30, TimeUnit.SECONDS);

            Response turnOffResponse = turningOff.get(30, TimeUnit.SECONDS);
            assertThat(turnOffResponse.statusCode())
                    .as("잠금이 없으면 가드가 생성 커밋 전에 0개를 보고 204 로 끝난다")
                    .isEqualTo(HttpStatus.CONFLICT.value());
            assertThat(turnOffResponse.jsonPath().getString("message")).isEqualTo(ROUNDS_EXIST_MESSAGE);
        } finally {
            createMayCommit.countDown();
            executor.shutdownNow();
        }

        assertSaved(recruitment, true, recruitment.getTitle());
        assertThat(interviewRoundRepository.findByRecruitmentIdOrderByCreatedAtDesc(recruitment.getId()))
                .hasSize(1);
    }

    @Test
    @DisplayName("마감이 모집 행을 잠근 사이 들어온 수정은 마감이 끝날 때까지 기다렸다가 마감 코드와 함께 409 로 거절되고 마감을 되돌리지 않는다")
    void updateWaitsForCloseAndIsRejectedAfterwards() throws Exception {
        Recruitment recruitment = saveInterviewRecruitment(club, "마감경합모집");
        TransactionTemplate closeTransaction = new TransactionTemplate(transactionManager);
        CountDownLatch closeHoldsRowLock = new CountDownLatch(1);
        CountDownLatch closeMayCommit = new CountDownLatch(1);
        ExecutorService executor = Executors.newFixedThreadPool(2);

        try {
            // 마감을 커밋 직전에 붙잡아, close() 가 잡은 모집 행 잠금을 계속 쥔 상태로 만든다.
            Future<?> closing = executor.submit(() -> closeTransaction.executeWithoutResult(transaction -> {
                recruitmentService.close(recruitment.getId(), leader.getId());
                recruitmentRepository.flush();
                closeHoldsRowLock.countDown();
                awaitQuietly(closeMayCommit);
            }));
            assertThat(closeHoldsRowLock.await(10, TimeUnit.SECONDS))
                    .as("마감 트랜잭션이 모집 행 잠금을 획득").isTrue();

            Future<Response> updating = executor.submit(() ->
                    patchRecruitment(leaderToken, recruitment, CHANGED_TITLE, null).extract().response());

            // 수정이 행 잠금 대기에 들어간 뒤에 마감을 놓는다 — 잠금이 없으면 수정은 마감 전의 OPEN 을 읽고 전 컬럼 UPDATE 에서
            // 기다리다 204 로 끝나며 마감을 OPEN 으로 되돌리고, 잠금이 있으면 첫 조회에서 기다리다 커밋된 CLOSED 를 본다.
            awaitBlockedLock();
            closeMayCommit.countDown();
            closing.get(30, TimeUnit.SECONDS);

            Response updateResponse = updating.get(30, TimeUnit.SECONDS);
            assertThat(updateResponse.statusCode())
                    .as("잠금이 없으면 수정이 마감 전의 OPEN 을 읽고 204 로 끝난다")
                    .isEqualTo(HttpStatus.CONFLICT.value());
            assertThat(updateResponse.jsonPath().getString("code")).isEqualTo(ErrorCodes.RECRUITMENT_CLOSED);
        } finally {
            closeMayCommit.countDown();
            executor.shutdownNow();
        }

        Recruitment reloaded = recruitmentRepository.findById(recruitment.getId()).orElseThrow();
        assertThat(reloaded.getStatus()).isEqualTo(RecruitmentStatus.CLOSED);
        assertThat(reloaded.getClosedAt()).isNotNull();
        assertThat(reloaded.getTitle()).isEqualTo(recruitment.getTitle());
    }

    /* ---- helpers ---- */

    private void saveRound(Recruitment recruitment, RoundStatus status) {
        interviewRoundRepository.save(InterviewRoundFixture.withStatus(
                recruitment.getId(), LocalDateTime.now().plusDays(3), null, status));
    }

    // 면접을 끄는 가드가 생기기 전에 꺼진 모집 — 꺼진 모집 생성 뒤 라운드를 저장소로 직접 넣어 재현한다.
    private Recruitment saveLegacyInterviewOffRecruitmentWithDraftRound() {
        Recruitment legacyRecruitment = saveSimpleRecruitment(club, "옛모집");
        saveRound(legacyRecruitment, RoundStatus.DRAFT);
        return legacyRecruitment;
    }

    private void assertSaved(Recruitment recruitment, boolean expectedUseInterview, String expectedTitle) {
        Recruitment reloaded = recruitmentRepository.findById(recruitment.getId()).orElseThrow();
        assertThat(reloaded.isUseInterview()).isEqualTo(expectedUseInterview);
        assertThat(reloaded.getTitle()).isEqualTo(expectedTitle);
    }

    private static void awaitQuietly(CountDownLatch latch) {
        try {
            latch.await(20, TimeUnit.SECONDS);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(interrupted);
        }
    }

    private void awaitBlockedLock() {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
        while (System.nanoTime() < deadline) {
            Integer blocked = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM pg_locks WHERE NOT granted", Integer.class);
            if (blocked != null && blocked > 0) {
                return;
            }
            sleepBriefly();
        }
        throw new IllegalStateException("면접 끄기가 제한 시간 안에 모집 행 잠금 대기에 진입하지 않았다.");
    }

    private void sleepBriefly() {
        try {
            Thread.sleep(50);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("잠금 대기 폴링이 중단되었다.", interrupted);
        }
    }

    private String tokenFor(User user) {
        return jwtTokenProvider.createToken(user.getId(), user.getRole().name());
    }

    private ValidatableResponse patchRecruitment(String token, Recruitment recruitment, String title,
                                                 Boolean useInterview) {
        String body = useInterview == null
                ? "{\"title\": \"%s\"}".formatted(title)
                : "{\"title\": \"%s\", \"useInterview\": %s}".formatted(title, useInterview);
        return RestAssured.given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                    .contentType(ContentType.JSON)
                    .body(body)
                .when()
                    .patch(UPDATE_PATH, recruitment.getId())
                .then();
    }
}
