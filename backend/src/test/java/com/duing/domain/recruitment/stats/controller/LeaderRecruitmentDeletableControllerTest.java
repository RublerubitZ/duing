package com.duing.domain.recruitment.stats.controller;

import static org.hamcrest.Matchers.equalTo;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.ClubFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.application.entity.Application;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.joincode.entity.ClubJoinCode;
import com.duing.domain.joincode.entity.ClubJoinRequest;
import com.duing.domain.joincode.repository.ClubJoinCodeRepository;
import com.duing.domain.joincode.repository.ClubJoinRequestRepository;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.TargetRole;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.domain.user.service.UserService;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import java.time.Clock;
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

/**
 * 모집 통계 요약의 삭제 가능 여부 — 운영진 모집 상세는 이 값으로 삭제 버튼을 보인다(#1635).
 * 서버 삭제 가드와 판정이 갈리면 버튼을 눌렀을 때 409 가 나므로, 경우마다 실제 삭제 결과와 함께 본다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class LeaderRecruitmentDeletableControllerTest extends IntegrationTestBase {

    private static final String SUMMARY_PATH = "/api/v1/leader/recruitments/{recruitmentId}/stats/summary";
    private static final String DELETE_PATH = "/api/v1/leader/recruitments/{recruitmentId}";

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired UserService userService;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired RecruitmentRepository recruitmentRepository;
    @Autowired ApplicationRepository applicationRepository;
    @Autowired ClubJoinCodeRepository clubJoinCodeRepository;
    @Autowired ClubJoinRequestRepository clubJoinRequestRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;
    @Autowired Clock clock;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private Club club;
    private User leader;
    private String leaderToken;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        leader = userRepository.save(UserFixture.unique());
        leaderToken = jwtTokenProvider.createToken(leader.getId(), leader.getRole().name());
        Club activeClub = ClubFixture.academic("삭제판정동아리-" + sequence.incrementAndGet());
        activeClub.changeStatus(ClubStatus.ACTIVE, null, null);
        club = clubRepository.save(activeClub);
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
    }

    @Test
    @DisplayName("진행 중인 모집은 삭제할 수 없다고 내려 주고, 실제 삭제도 거절된다")
    void openRecruitmentIsNotDeletable() {
        Recruitment openRecruitment = recruitmentRepository.save(Recruitment.createWithOptions(club, "진행 중 모집", "내용",
                LocalDate.now(clock).minusDays(3), LocalDate.now(clock).plusDays(7), 10, ApplicationMode.SELF, null,
                false, TargetRole.MEMBER, null, null, false));

        assertDeletable(openRecruitment, false);
        deleteRefused(openRecruitment, "진행 중인 모집 공고는 마감한 뒤에 삭제할 수 있습니다.");
    }

    @Test
    @DisplayName("지원서가 없는 마감 모집은 삭제할 수 있다고 내려 주고, 실제로 지워진다")
    void emptyClosedRecruitmentIsDeletable() {
        Recruitment emptyClosed = saveClosedRecruitment(ApplicationMode.SELF);

        assertDeletable(emptyClosed, true);
        deleteSucceeds(emptyClosed);
    }

    @Test
    @DisplayName("탈퇴한 지원자의 지원서만 남은 마감 모집도 삭제할 수 없다고 내려 준다 — 지원 이력을 지키는 서버 가드가 거절한다")
    void closedRecruitmentWithOnlyWithdrawnApplicantIsNotDeletable() {
        Recruitment withdrawnOnlyClosed = saveClosedRecruitment(ApplicationMode.SELF);
        Application withdrawnApplication = applicationRepository.save(
                Application.submit(withdrawnOnlyClosed, userRepository.save(UserFixture.unique()), List.of()));
        userService.withdraw(withdrawnApplication.getUser().getId());

        assertDeletable(withdrawnOnlyClosed, false);
        deleteRefused(withdrawnOnlyClosed, "이미 지원자가 있는 모집 공고는 삭제할 수 없습니다.");
    }

    @Test
    @DisplayName("처리되지 않은 가입 요청이 남은 마감 모집은 삭제할 수 없다고 내려 주고, 요청을 처리하면 삭제할 수 있다")
    void pendingJoinRequestBlocksDeletionUntilProcessed() {
        Recruitment externalClosed = saveClosedRecruitment(ApplicationMode.EXTERNAL);
        ClubJoinCode joinCode = clubJoinCodeRepository.save(ClubJoinCode.issue(
                club, externalClosed, "DL12CD", 12, 30, 7, leader.getId()));
        joinCode.tryConsume();
        clubJoinCodeRepository.save(joinCode);
        ClubJoinRequest pending = clubJoinRequestRepository.save(
                ClubJoinRequest.pending(club, userRepository.save(UserFixture.unique()), joinCode));

        assertDeletable(externalClosed, false);
        deleteRefused(externalClosed, "처리되지 않은 가입 요청이 있습니다. 먼저 승인하거나 거절해주세요.");

        pending.approve(leader, LocalDateTime.now(clock));
        clubJoinRequestRepository.save(pending);

        assertDeletable(externalClosed, true);
        deleteSucceeds(externalClosed);
    }

    /** 마감 모집 — 동아리당 OPEN 모집은 1건(uk_recruitment_club_active)이라 마감한 뒤 저장한다. */
    private Recruitment saveClosedRecruitment(ApplicationMode applicationMode) {
        Recruitment closed = Recruitment.createWithOptions(club, "지난 모집-" + sequence.incrementAndGet(), "내용",
                LocalDate.now(clock).minusDays(40), LocalDate.now(clock).minusDays(10), 10, applicationMode,
                applicationMode == ApplicationMode.EXTERNAL ? "https://forms.example.com/duing" : null,
                false, TargetRole.MEMBER, null, null, false);
        closed.close(LocalDateTime.now(clock));
        return recruitmentRepository.save(closed);
    }

    private void assertDeletable(Recruitment recruitment, boolean expected) {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when()
                    .get(SUMMARY_PATH, recruitment.getId())
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.deletable", equalTo(expected));
    }

    private void deleteSucceeds(Recruitment recruitment) {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when()
                    .delete(DELETE_PATH, recruitment.getId())
                .then()
                    .statusCode(HttpStatus.NO_CONTENT.value());
    }

    /** 가드 셋이 모두 409 라 어느 가드가 막았는지 문구로 가린다. */
    private void deleteRefused(Recruitment recruitment, String expectedMessage) {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when()
                    .delete(DELETE_PATH, recruitment.getId())
                .then()
                    .statusCode(HttpStatus.CONFLICT.value())
                    .body("message", equalTo(expectedMessage));
    }
}
