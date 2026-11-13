package com.duing.domain.recruitment.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.nullValue;

import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.InterviewRoundFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.interview.controller.InterviewControllerTestSupport;
import com.duing.domain.interview.entity.RoundStatus;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.user.entity.User;
import com.duing.global.constant.ErrorCodes;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import io.restassured.response.ValidatableResponse;
import java.time.LocalDateTime;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;

/**
 * 모집 수정에서 면접 끄기 가드 — 면접을 켠 모집에 취소하지 않은 라운드가 있으면 끄는 요청을 409 로 막는다.
 * 요청 본문은 수정 폼처럼 제목 변경과 useInterview 를 함께 싣는다.
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

    private String leaderToken;
    private Club club;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        User leader = saveUser("끄기리더");
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
        saveDraftRound(recruitment);
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
        saveDraftRound(recruitment);

        patchRecruitment(leaderToken, recruitment, CHANGED_TITLE, null)
                .statusCode(HttpStatus.NO_CONTENT.value());

        assertSaved(recruitment, true, CHANGED_TITLE);
    }

    @Test
    @DisplayName("마감된 모집에서 면접을 끄려 하면 라운드가 있어도 기존의 마감 409 가 먼저 나간다")
    void closedRecruitmentKeepsClosedConflict() {
        Recruitment recruitment = saveInterviewRecruitment(club, "마감모집");
        saveDraftRound(recruitment);
        recruitment.close(LocalDateTime.now());
        recruitmentRepository.saveAndFlush(recruitment);

        patchRecruitment(leaderToken, recruitment, CHANGED_TITLE, false)
                .statusCode(HttpStatus.CONFLICT.value())
                .body("code", equalTo(ErrorCodes.RECRUITMENT_CLOSED));
    }

    /* ---- helpers ---- */

    private void saveDraftRound(Recruitment recruitment) {
        interviewRoundRepository.save(
                InterviewRoundFixture.draft(recruitment.getId(), LocalDateTime.now().plusDays(7)));
    }

    private void saveRound(Recruitment recruitment, RoundStatus status) {
        interviewRoundRepository.save(InterviewRoundFixture.withStatus(
                recruitment.getId(), LocalDateTime.now().plusDays(3), null, status));
    }

    // 면접을 끄는 가드가 생기기 전에 꺼진 모집 — 꺼진 모집 생성 뒤 라운드를 저장소로 직접 넣어 재현한다.
    private Recruitment saveLegacyInterviewOffRecruitmentWithDraftRound() {
        Recruitment legacyRecruitment = saveSimpleRecruitment(club, "옛모집");
        saveDraftRound(legacyRecruitment);
        return legacyRecruitment;
    }

    private void assertSaved(Recruitment recruitment, boolean expectedUseInterview, String expectedTitle) {
        Recruitment reloaded = recruitmentRepository.findById(recruitment.getId()).orElseThrow();
        assertThat(reloaded.isUseInterview()).isEqualTo(expectedUseInterview);
        assertThat(reloaded.getTitle()).isEqualTo(expectedTitle);
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
