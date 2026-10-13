package com.duing.domain.adminconsole.controller;

import static org.hamcrest.Matchers.equalTo;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.ClubFixture;
import com.duing.common.fixture.ClubStaffFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.LeaderSuccessionRequest;
import com.duing.domain.clubmember.entity.SuccessionStatus;
import com.duing.domain.clubmember.repository.LeaderSuccessionRequestRepository;
import com.duing.domain.facility.entity.Facility;
import com.duing.domain.facility.repository.FacilityRepository;
import com.duing.domain.facilitybooking.entity.BookingStatus;
import com.duing.domain.facilitybooking.entity.FacilityBooking;
import com.duing.domain.facilitybooking.repository.FacilityBookingRepository;
import com.duing.domain.federation.entity.FederationInquiry;
import com.duing.domain.federation.repository.FederationInquiryRepository;
import com.duing.domain.promotion.entity.PromotionRequest;
import com.duing.domain.promotion.repository.PromotionRequestRepository;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.TargetRole;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.report.entity.Report;
import com.duing.domain.report.entity.ReportReasonCode;
import com.duing.domain.report.entity.ReportStatus;
import com.duing.domain.report.entity.ReportTargetType;
import com.duing.domain.report.repository.ReportRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import com.duing.global.time.TimeMapper;
import io.restassured.RestAssured;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AdminPendingCountsControllerTest extends IntegrationTestBase {

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired FederationInquiryRepository federationInquiryRepository;
    @Autowired ReportRepository reportRepository;
    @Autowired FacilityBookingRepository facilityBookingRepository;
    @Autowired PromotionRequestRepository promotionRequestRepository;
    @Autowired LeaderSuccessionRequestRepository leaderSuccessionRequestRepository;
    @Autowired FacilityRepository facilityRepository;
    @Autowired RecruitmentRepository recruitmentRepository;
    @Autowired ApplicationRepository applicationRepository;
    @Autowired JdbcTemplate jdbcTemplate;
    @Autowired Clock clock;
    @Autowired JwtTokenProvider jwtTokenProvider;

    private final java.util.concurrent.atomic.AtomicLong sequence =
            new java.util.concurrent.atomic.AtomicLong(1);

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
                    .body("data.stalePendingRecruitment", equalTo(0))
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

    /**
     * 시설 예약은 조치가 필요한 상태가 둘이다 — 승인 대기와, 승인 뒤 겹침이 드러나 되돌아온 충돌.
     * 엔티티도 이 둘에서만 재승인을 허용하므로 뱃지가 승인 대기만 세면 방치된 충돌 건이 보이지 않는다.
     */
    @Test
    @DisplayName("시설 예약은 승인 대기와 충돌을 함께 세고 확정된 건은 제외한다")
    void countsBookingsNeedingActionAcrossPendingAndConflict() {
        saveBooking(BookingStatus.PENDING);
        saveBooking(BookingStatus.CONFLICT);
        saveBooking(BookingStatus.APPROVED);

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when()
                    .get("/api/v1/admin/pending-counts")
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.facilityBooking", equalTo(2))
                    .body("data.totalPendingCount", equalTo(2));
    }

    @Test
    @DisplayName("홍보 요청과 회장 승계는 대기 중인 건만 세고 총합에 합산된다")
    void countsPromotionRequestsAndSuccessionRequests() {
        // 승계 요청은 동아리당 대기 1건만 허용하는 유니크 제약이 있어 동아리를 나눠 만든다.
        Club pendingClub = saveClub("승계대기동아리", ClubStatus.ACTIVE);
        Club processedClub = saveClub("승계처리동아리", ClubStatus.ACTIVE);

        promotionRequestRepository.save(PromotionRequest.create(pendingClub.getId(), studentUserId,
                "홍보 제목", "홍보 설명", null, null));

        leaderSuccessionRequestRepository.save(
                LeaderSuccessionRequest.create(pendingClub.getId(), studentUserId, "승계 사유"));
        LeaderSuccessionRequest processedSuccession = leaderSuccessionRequestRepository.save(
                LeaderSuccessionRequest.create(processedClub.getId(), studentUserId, "처리된 승계 사유"));
        processedSuccession.process(studentUserId, SuccessionStatus.REJECTED, "반려");
        leaderSuccessionRequestRepository.save(processedSuccession);

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when()
                    .get("/api/v1/admin/pending-counts")
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.promotionRequest", equalTo(1))
                    .body("data.leaderSuccession", equalTo(1))
                    .body("data.totalPendingCount", equalTo(2));
    }

    /**
     * 미처리 지원서 리마인더 잡과 같은 집합 — 7일 넘게 SUBMITTED 로 남은 지원서가 있는 진행 중(OPEN) 모집 수.
     * 지원서 건수가 아니라 모집 수를 센다. 7일 경계는 실행 중 시계가 흐르므로 ±1시간 여유로 양쪽을 확인한다.
     */
    @Test
    @DisplayName("7일 넘게 처리되지 않은 지원서가 있는 진행 중 모집만 세고, 보류·마감·비활성 동아리·외부 폼 모집은 제외한다")
    void countsOpenRecruitmentsWithSubmittedApplicationsOlderThanSevenDays() {
        // 집계: 10일 전 제출 2건(모집 1개로 센다), 7일 경계 바로 바깥(7일 + 1시간 전).
        Recruitment twoOldApplications = saveOpenRecruitment(saveActiveClub());
        submittedAgo(saveApplication(twoOldApplications, ApplicationStatus.SUBMITTED), Duration.ofDays(10));
        submittedAgo(saveApplication(twoOldApplications, ApplicationStatus.SUBMITTED), Duration.ofDays(10));
        Recruitment justPastBoundary = saveOpenRecruitment(saveActiveClub());
        submittedAgo(saveApplication(justPastBoundary, ApplicationStatus.SUBMITTED),
                Duration.ofDays(7).plusHours(1));

        // 제외: 7일 경계 바로 안쪽(7일 − 1시간 전).
        Recruitment withinBoundary = saveOpenRecruitment(saveActiveClub());
        submittedAgo(saveApplication(withinBoundary, ApplicationStatus.SUBMITTED),
                Duration.ofDays(7).minusHours(1));
        // 제외: 오래됐어도 운영진이 보류로 손댄 지원서.
        Recruitment onHoldOnly = saveOpenRecruitment(saveActiveClub());
        submittedAgo(saveApplication(onHoldOnly, ApplicationStatus.ON_HOLD), Duration.ofDays(10));
        // 제외: 수동 마감(CLOSED)된 모집.
        LocalDate today = LocalDate.now(clock);
        Recruitment closedRecruitment = Recruitment.create(saveActiveClub(), "마감모집", null,
                today.minusDays(30), today.plusDays(7), 10);
        closedRecruitment.close(LocalDateTime.now(clock));
        recruitmentRepository.save(closedRecruitment);
        submittedAgo(saveApplication(closedRecruitment, ApplicationStatus.SUBMITTED), Duration.ofDays(10));
        // 제외: 운영 중단(비 ACTIVE) 동아리의 모집 — 벌크 마감을 우회해 동아리 상태만 바꾼다.
        Club inactiveClub = saveActiveClub();
        Recruitment inactiveClubRecruitment = saveOpenRecruitment(inactiveClub);
        submittedAgo(saveApplication(inactiveClubRecruitment, ApplicationStatus.SUBMITTED), Duration.ofDays(10));
        jdbcTemplate.update("UPDATE club SET status = 'INACTIVE' WHERE id = ?", inactiveClub.getId());
        // 제외: 외부 폼 모집 — 지원서가 두잉에 없다.
        recruitmentRepository.save(Recruitment.createWithOptions(saveActiveClub(), "외부폼모집", null,
                today.minusDays(30), today.plusDays(7), 10, ApplicationMode.EXTERNAL,
                "https://forms.example.com/duing", false, TargetRole.MEMBER, null, null, false));

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when()
                    .get("/api/v1/admin/pending-counts")
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.stalePendingRecruitment", equalTo(2))
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

    private Club saveActiveClub() {
        return clubRepository.save(ClubStaffFixture.activeClub());
    }

    private Recruitment saveOpenRecruitment(Club club) {
        LocalDate today = LocalDate.now(clock);
        return recruitmentRepository.save(Recruitment.create(club, "모집" + sequence.incrementAndGet(), null,
                today.minusDays(30), today.plusDays(7), 10));
    }

    /** 지정 상태의 지원서를 저장한다 — 상태 전이는 도메인 메서드로(면접 미사용 모집). */
    private Application saveApplication(Recruitment recruitment, ApplicationStatus status) {
        Application application = Application.submit(recruitment, userRepository.save(UserFixture.unique()),
                List.of());
        if (status != ApplicationStatus.SUBMITTED) {
            application.transitionTo(status, false);
        }
        return applicationRepository.saveAndFlush(application);
    }

    /**
     * 제출 시각을 과거로 옮긴다. created_at 은 @CreatedDate 가 INSERT 때 덮어써 저장 뒤 JDBC 로 바꾼다.
     * 감사 필드는 system regime 이라 집계와 같은 TimeMapper.systemNow(clock) 를 기준으로 삼는다.
     */
    private void submittedAgo(Application application, Duration age) {
        jdbcTemplate.update("UPDATE application SET created_at = ? WHERE id = ?",
                Timestamp.valueOf(TimeMapper.systemNow(clock).minus(age)), application.getId());
    }

    private void saveBooking(BookingStatus status) {
        Facility facility = facilityRepository.save(
                Facility.create((int) sequence.incrementAndGet(), "회의실", "학생회관", 1));
        Club club = saveClub("예약동아리" + sequence.incrementAndGet(), ClubStatus.ACTIVE);
        FacilityBooking booking = facilityBookingRepository.save(FacilityBooking.request(
                facility.getId(), club.getId(), studentUserId, LocalDate.now().plusDays(7),
                LocalTime.of(10, 0), LocalTime.of(12, 0), "정기 모임", 10, "010-1234-5678"));
        if (status == BookingStatus.PENDING) {
            return;
        }
        // 충돌은 승인 이후에만 갈 수 있는 상태라 승인 → 충돌 순으로 전이시킨다.
        booking.approve(studentUserId, LocalDateTime.now(), LocalDateTime.now());
        if (status == BookingStatus.CONFLICT) {
            booking.markConflict("겹침 확인");
        }
        facilityBookingRepository.save(booking);
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
