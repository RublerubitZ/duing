package com.duing.domain.adminconsole.controller;

import static org.hamcrest.Matchers.equalTo;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.ClubFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.federation.entity.FederationInquiry;
import com.duing.domain.federation.repository.FederationInquiryRepository;
import com.duing.domain.report.entity.Report;
import com.duing.domain.report.entity.ReportReasonCode;
import com.duing.domain.report.entity.ReportStatus;
import com.duing.domain.report.entity.ReportTargetType;
import com.duing.domain.report.repository.ReportRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
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
class AdminPendingCountsControllerTest extends IntegrationTestBase {

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired FederationInquiryRepository federationInquiryRepository;
    @Autowired ReportRepository reportRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;

    private String adminToken;
    private String studentToken;
    private Long studentUserId;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        User adminUser = userRepository.save(UserFixture.admin());
        User studentUser = userRepository.save(UserFixture.unique());
        studentUserId = studentUser.getId();
        adminToken = jwtTokenProvider.createToken(adminUser.getId(), adminUser.getRole().name());
        studentToken = jwtTokenProvider.createToken(studentUser.getId(), studentUser.getRole().name());
    }

    @Test
    @DisplayName("처리 대기 중인 항목이 없으면 모든 건수와 총합이 0 이다")
    void returnsZerosWhenNothingIsPending() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when()
                    .get("/api/v1/admin/pending-counts")
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("ok", equalTo(true))
                    .body("data.clubApproval", equalTo(0))
                    .body("data.facilityBooking", equalTo(0))
                    .body("data.inquiryUnanswered", equalTo(0))
                    .body("data.promotionRequest", equalTo(0))
                    .body("data.reportUnresolved", equalTo(0))
                    .body("data.leaderSuccession", equalTo(0))
                    .body("data.totalPendingCount", equalTo(0));
    }

    @Test
    @DisplayName("대기 상태인 항목만 세고 처리가 끝난 항목은 제외한다")
    void countsOnlyPendingItems() {
        saveClub("승인대기동아리1", ClubStatus.PENDING_APPROVAL);
        saveClub("승인대기동아리2", ClubStatus.PENDING_APPROVAL);
        saveClub("활성동아리", ClubStatus.ACTIVE);

        reportRepository.save(Report.create(studentUserId, ReportTargetType.CLUB, 1L,
                ReportReasonCode.SPAM, "미처리 신고"));
        Report resolved = reportRepository.save(Report.create(studentUserId, ReportTargetType.CLUB, 2L,
                ReportReasonCode.SPAM, "처리된 신고"));
        resolved.process(studentUserId, ReportStatus.RESOLVED, "처리 완료");
        reportRepository.save(resolved);

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when()
                    .get("/api/v1/admin/pending-counts")
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.clubApproval", equalTo(2))
                    .body("data.reportUnresolved", equalTo(1))
                    .body("data.totalPendingCount", equalTo(3));
    }

    /**
     * 이 규칙이 백엔드에 있는 이유 — 답변이 나가지 않은 문의는 RECEIVED 하나가 아니라 IN_PROGRESS 도 포함이다.
     * 프론트가 상태별로 목록을 세면 화면마다 "미답변" 정의가 갈린다.
     */
    @Test
    @DisplayName("미답변 문의는 접수와 처리 중을 합산하고 답변 완료는 제외한다")
    void countsUnansweredInquiriesAcrossReceivedAndInProgress() {
        federationInquiryRepository.save(FederationInquiry.create(studentUserId, "접수된 문의", "내용"));

        FederationInquiry inProgress = federationInquiryRepository.save(
                FederationInquiry.create(studentUserId, "답변 작성 중 문의", "내용"));
        inProgress.startProgress();
        federationInquiryRepository.save(inProgress);

        FederationInquiry answered = federationInquiryRepository.save(
                FederationInquiry.create(studentUserId, "답변 완료 문의", "내용"));
        answered.startProgress();
        answered.markAnswered();
        federationInquiryRepository.save(answered);

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when()
                    .get("/api/v1/admin/pending-counts")
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.inquiryUnanswered", equalTo(2))
                    .body("data.totalPendingCount", equalTo(2));
    }

    @Test
    @DisplayName("ADMIN 이 아닌 사용자는 미처리 건수를 조회할 수 없다")
    void rejectsNonAdminUser() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when()
                    .get("/api/v1/admin/pending-counts")
                .then()
                    .statusCode(HttpStatus.FORBIDDEN.value());
    }

    private Club saveClub(String name, ClubStatus status) {
        Club club = clubRepository.save(ClubFixture.academic(name));
        if (status != ClubStatus.PENDING_APPROVAL) {
            club.changeStatus(status, "테스트 상태 전환", studentUserId);
            clubRepository.save(club);
        }
        return club;
    }
}
