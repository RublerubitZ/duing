package com.duing.domain.adminconsole.service;

import static com.duing.domain.adminconsole.service.WeeklyBriefingTestSupport.placeSeoul;
import static com.duing.domain.adminconsole.service.WeeklyBriefingTestSupport.placeSystem;
import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.ClubFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.adminconsole.repository.AdminPendingSnapshotRepository;
import com.duing.domain.adminconsole.service.dto.query.AdminPendingCountsQuery;
import com.duing.domain.adminconsole.service.dto.query.AdminPendingTrendQuery;
import com.duing.domain.adminconsole.service.dto.query.AdminWeeklyBriefingQuery;
import com.duing.domain.adminconsole.service.dto.query.AdminWeeklyBriefingQuery.Flow;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubaudit.repository.ClubAuditEventRepository;
import com.duing.domain.clubmember.entity.LeaderSuccessionRequest;
import com.duing.domain.clubmember.entity.SuccessionStatus;
import com.duing.domain.clubmember.repository.LeaderSuccessionRequestRepository;
import com.duing.domain.facility.entity.Facility;
import com.duing.domain.facility.repository.FacilityRepository;
import com.duing.domain.facilitybooking.entity.FacilityBooking;
import com.duing.domain.facilitybooking.repository.FacilityBookingRepository;
import com.duing.domain.federation.entity.FederationInquiry;
import com.duing.domain.federation.repository.FederationInquiryRepository;
import com.duing.domain.fee.repository.AdminFeeAuditQueryRepository;
import com.duing.domain.fee.repository.FeeBillRepository;
import com.duing.domain.fee.repository.PaymentRepository;
import com.duing.domain.notice.repository.NoticeRepository;
import com.duing.domain.promotion.entity.PromotionRequest;
import com.duing.domain.promotion.entity.PromotionRequestStatus;
import com.duing.domain.promotion.repository.PromotionRequestRepository;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.report.entity.Report;
import com.duing.domain.report.entity.ReportReasonCode;
import com.duing.domain.report.entity.ReportStatus;
import com.duing.domain.report.entity.ReportTargetType;
import com.duing.domain.report.repository.ReportRepository;
import com.duing.domain.user.profilecheck.repository.ProfileCheckStatsRepositoryCustom;
import com.duing.domain.user.repository.UserRepository;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * 성공 기준 2 — 다음 월요일 00:00 KST 에 홈 추이를 열면, 최근 7일 접수·처리 합 = 지난주 다섯 업무 접수·처리 합이고,
 * 어제(일요일) 막대 = 지난주 주 끝 남은 대기 합계 = 그날 기록의 8칸 합이다. 시계를 고정해도 날짜가 지나며 범위를 벗어나지 않는다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class AdminWeeklyBriefingEquivalenceTest extends IntegrationTestBase {

    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private static final LocalDate WEEK_START = LocalDate.of(2026, 10, 26);
    private static final Clock NEXT_MONDAY_MIDNIGHT = Clock.fixed(WEEK_START.plusDays(7).atStartOfDay(SEOUL).toInstant(), SEOUL);

    @Autowired ReportRepository reportRepository;
    @Autowired FederationInquiryRepository federationInquiryRepository;
    @Autowired FacilityBookingRepository facilityBookingRepository;
    @Autowired PromotionRequestRepository promotionRequestRepository;
    @Autowired LeaderSuccessionRequestRepository leaderSuccessionRequestRepository;
    @Autowired AdminPendingSnapshotRepository adminPendingSnapshotRepository;
    @Autowired NoticeRepository noticeRepository;
    @Autowired RecruitmentRepository recruitmentRepository;
    @Autowired ApplicationRepository applicationRepository;
    @Autowired FeeBillRepository feeBillRepository;
    @Autowired AdminFeeAuditQueryRepository adminFeeAuditQueryRepository;
    @Autowired PaymentRepository paymentRepository;
    @Autowired ClubAuditEventRepository clubAuditEventRepository;
    @Autowired ProfileCheckStatsRepositoryCustom profileCheckStatsRepository;
    @Autowired AdminPendingSnapshotRecorder adminPendingSnapshotRecorder;
    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired FacilityRepository facilityRepository;
    @Autowired JdbcTemplate jdbcTemplate;

    private final AtomicLong sequence = new AtomicLong(1);
    private Long studentUserId;

    @BeforeEach
    void setUp() {
        studentUserId = userRepository.save(UserFixture.unique()).getId();
    }

    private AdminWeeklyBriefingQueryService weeklyService() {
        return new AdminWeeklyBriefingQueryService(reportRepository, federationInquiryRepository,
                facilityBookingRepository, promotionRequestRepository, leaderSuccessionRequestRepository,
                adminPendingSnapshotRepository, noticeRepository, recruitmentRepository, applicationRepository,
                feeBillRepository, adminFeeAuditQueryRepository, paymentRepository, clubAuditEventRepository,
                profileCheckStatsRepository, NEXT_MONDAY_MIDNIGHT);
    }

    private AdminPendingTrendQueryService trendService() {
        return new AdminPendingTrendQueryService(adminPendingSnapshotRepository, reportRepository,
                federationInquiryRepository, facilityBookingRepository, promotionRequestRepository,
                leaderSuccessionRequestRepository, NEXT_MONDAY_MIDNIGHT);
    }

    @Test
    @DisplayName("다음 월요일 00:00 에 홈 추이를 열면 최근 7일 접수·처리 합은 지난주 다섯 업무의 접수·처리 합과 같다")
    void recentFlowEqualsWeeklyFlowAtNextMondayMidnight() {
        // 신고 — 주 안 접수 2(하나는 주 안 처리), 지난주 전에 접수하고 주 안에 처리 1
        Report reportInsideHandled = saveReport(WEEK_START.atStartOfDay());
        handle(reportInsideHandled, WEEK_START.plusDays(2).atTime(10, 0));
        saveReport(WEEK_START.plusDays(6).atTime(23, 59, 59));
        handle(saveReport(WEEK_START.minusDays(3).atTime(9, 0)), WEEK_START.plusDays(1).atTime(9, 0));
        // 문의 — 주 안 접수·답변 1, 주 안 접수·답변 없이 닫힘 1, 오래전 답변 뒤 주 안에 닫힘 1(어느 쪽도 처리 아님)
        saveInquiry(WEEK_START.plusDays(1).atTime(9, 0), WEEK_START.plusDays(2).atTime(9, 0), null);
        saveInquiry(WEEK_START.plusDays(3).atTime(9, 0), null, WEEK_START.plusDays(4).atTime(9, 0));
        saveInquiry(WEEK_START.minusDays(5).atTime(9, 0), WEEK_START.minusDays(4).atTime(9, 0), WEEK_START.plusDays(2).atTime(9, 0));
        // 시설 예약 — 주 안 접수·결정 1, 지난주 전 접수·주 안 결정 1(decided_at 은 seoul)
        saveBooking(WEEK_START.plusDays(1).atTime(10, 0), WEEK_START.plusDays(1).atTime(15, 0));
        saveBooking(WEEK_START.minusDays(2).atTime(10, 0), WEEK_START.plusDays(5).atTime(10, 0));
        // 홍보 — 주 안 접수·처리 1 / 승계 — 주 안 접수 1(대기), 지난주 전 접수·주 안 처리 1
        savePromotion(WEEK_START.plusDays(2).atTime(11, 0), WEEK_START.plusDays(3).atTime(11, 0));
        saveSuccession(WEEK_START.plusDays(4).atTime(11, 0), null);
        saveSuccession(WEEK_START.minusDays(2).atTime(11, 0), WEEK_START.plusDays(3).atTime(11, 0));

        AdminWeeklyBriefingQuery weekly = weeklyService().getWeeklyBriefing(WEEK_START);
        AdminPendingTrendQuery trend = trendService().getTrend();

        List<Flow> flows = List.of(weekly.flow().report(), weekly.flow().inquiry(), weekly.flow().facilityBooking(),
                weekly.flow().promotionRequest(), weekly.flow().leaderSuccession());
        long weeklyReceived = flows.stream().mapToLong(Flow::receivedCount).sum();
        long weeklyHandled = flows.stream().mapToLong(Flow::handledCount).sum();
        // 둘 다 0 으로 같아지는 헛통과를 막는다 — 픽스처의 기대 합: 접수 2+2+1+1+1, 처리 2+2+2+1+1
        assertThat(weeklyReceived).isEqualTo(7);
        assertThat(weeklyHandled).isEqualTo(8);
        assertThat(trend.recentFlow().receivedCount()).isEqualTo(weeklyReceived);
        assertThat(trend.recentFlow().handledCount()).isEqualTo(weeklyHandled);
    }

    @Test
    @DisplayName("지난주 주 끝 남은 대기 8칸은 일요일 기록 행과 같고, 합계는 다음 월요일 홈 추이의 어제 막대와 같다")
    void endPendingEqualsSundaySnapshotAndTrendBar() {
        adminPendingSnapshotRecorder.record(WEEK_START.plusDays(6), AdminPendingCountsQuery.of(1, 2, 3, 4, 5, 6, 7, 8));

        AdminWeeklyBriefingQuery weekly = weeklyService().getWeeklyBriefing(WEEK_START);
        AdminPendingTrendQuery trend = trendService().getTrend();

        AdminPendingCountsQuery endPending = weekly.endPending();
        // 기록기에 넣은 입력값으로 직접 단정한다 — 기록기가 칸을 바꿔 써도 잡힌다.
        assertThat(List.of(endPending.clubApproval(), endPending.facilityBooking(), endPending.inquiryUnanswered(),
                endPending.promotionRequest(), endPending.reportUnresolved(), endPending.leaderSuccession(),
                endPending.stalePendingRecruitment(), endPending.inactiveClubPending()))
                .containsExactly(1L, 2L, 3L, 4L, 5L, 6L, 7L, 8L);
        assertThat(trend.days().get(12).date()).isEqualTo(WEEK_START.plusDays(6));
        assertThat(endPending.totalPendingCount()).isEqualTo(36).isEqualTo((long) trend.days().get(12).totalPendingCount());
    }

    private Report saveReport(LocalDateTime createdAt) {
        Report report = reportRepository.save(Report.create(studentUserId, ReportTargetType.CLUB,
                sequence.incrementAndGet(), ReportReasonCode.SPAM, "신고 내용"));
        placeSystem(jdbcTemplate, "report", report.getId(), "created_at", createdAt);
        return report;
    }

    private void handle(Report report, LocalDateTime handledAt) {
        Report reloaded = reportRepository.findById(report.getId()).orElseThrow();
        reloaded.process(studentUserId, ReportStatus.RESOLVED, "처리 완료");
        placeSystem(jdbcTemplate, "report", reportRepository.save(reloaded).getId(), "handled_at", handledAt);
    }

    private void saveInquiry(LocalDateTime createdAt, LocalDateTime answeredAt, LocalDateTime closedAt) {
        FederationInquiry inquiry = FederationInquiry.create(studentUserId, "문의 제목", "내용");
        if (answeredAt != null) {
            inquiry.markAnswered();
        }
        if (closedAt != null) {
            inquiry.close("확인");
        }
        Long inquiryId = federationInquiryRepository.save(inquiry).getId();
        placeSystem(jdbcTemplate, "federation_inquiry", inquiryId, "created_at", createdAt);
        if (answeredAt != null) {
            placeSystem(jdbcTemplate, "federation_inquiry", inquiryId, "answered_at", answeredAt);
        }
        if (closedAt != null) {
            placeSystem(jdbcTemplate, "federation_inquiry", inquiryId, "closed_at", closedAt);
        }
    }

    private void saveBooking(LocalDateTime createdAt, LocalDateTime decidedAt) {
        Facility facility = facilityRepository.save(Facility.create((int) sequence.incrementAndGet(), "회의실", "학생회관", 1));
        Long clubId = clubRepository.save(ClubFixture.academic("동치동아리" + sequence.incrementAndGet())).getId();
        FacilityBooking booking = facilityBookingRepository.save(FacilityBooking.request(facility.getId(), clubId,
                studentUserId, WEEK_START.plusDays(20), LocalTime.of(10, 0), LocalTime.of(12, 0), "정기 모임", 10,
                "010-1234-5678"));
        placeSystem(jdbcTemplate, "facility_booking", booking.getId(), "created_at", createdAt);
        placeSeoul(jdbcTemplate, "facility_booking", booking.getId(), "decided_at", decidedAt);
    }

    private void savePromotion(LocalDateTime createdAt, LocalDateTime handledAt) {
        Long clubId = clubRepository.save(ClubFixture.academic("동치홍보" + sequence.incrementAndGet())).getId();
        PromotionRequest promotionRequest = PromotionRequest.create(clubId, studentUserId, "홍보 제목", "홍보 설명", null, null);
        promotionRequest.process(studentUserId, PromotionRequestStatus.REJECTED, "반려");
        Long promotionRequestId = promotionRequestRepository.save(promotionRequest).getId();
        placeSystem(jdbcTemplate, "promotion_request", promotionRequestId, "created_at", createdAt);
        placeSystem(jdbcTemplate, "promotion_request", promotionRequestId, "handled_at", handledAt);
    }

    private void saveSuccession(LocalDateTime createdAt, LocalDateTime handledAt) {
        Long clubId = clubRepository.save(ClubFixture.academic("동치승계" + sequence.incrementAndGet())).getId();
        LeaderSuccessionRequest successionRequest = LeaderSuccessionRequest.create(clubId, studentUserId, "승계 사유");
        if (handledAt != null) {
            successionRequest.process(studentUserId, SuccessionStatus.REJECTED, "반려");
        }
        Long successionRequestId = leaderSuccessionRequestRepository.save(successionRequest).getId();
        placeSystem(jdbcTemplate, "leader_succession_request", successionRequestId, "created_at", createdAt);
        if (handledAt != null) {
            placeSystem(jdbcTemplate, "leader_succession_request", successionRequestId, "handled_at", handledAt);
        }
    }
}
