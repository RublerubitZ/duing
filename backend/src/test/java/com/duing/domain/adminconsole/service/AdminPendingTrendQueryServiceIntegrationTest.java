package com.duing.domain.adminconsole.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.ClubFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.adminconsole.service.dto.query.AdminPendingCountsQuery;
import com.duing.domain.adminconsole.service.dto.query.AdminPendingTrendQuery;
import com.duing.domain.adminconsole.service.dto.query.DailyPendingTotalQuery;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.LeaderSuccessionRequest;
import com.duing.domain.clubmember.entity.SuccessionStatus;
import com.duing.domain.clubmember.repository.LeaderSuccessionRequestRepository;
import com.duing.domain.facility.entity.Facility;
import com.duing.domain.facility.repository.FacilityRepository;
import com.duing.domain.facilitybooking.entity.FacilityBooking;
import com.duing.domain.facilitybooking.repository.FacilityBookingRepository;
import com.duing.domain.federation.entity.FederationInquiry;
import com.duing.domain.federation.repository.FederationInquiryRepository;
import com.duing.domain.promotion.entity.PromotionRequest;
import com.duing.domain.promotion.entity.PromotionRequestStatus;
import com.duing.domain.promotion.repository.PromotionRequestRepository;
import com.duing.domain.report.entity.Report;
import com.duing.domain.report.entity.ReportReasonCode;
import com.duing.domain.report.entity.ReportStatus;
import com.duing.domain.report.entity.ReportTargetType;
import com.duing.domain.report.repository.ReportRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.time.TimeMapper;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
class AdminPendingTrendQueryServiceIntegrationTest extends IntegrationTestBase {

    @Autowired AdminPendingTrendQueryService adminPendingTrendQueryService;
    @Autowired AdminPendingSnapshotRecorder adminPendingSnapshotRecorder;
    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ReportRepository reportRepository;
    @Autowired FederationInquiryRepository federationInquiryRepository;
    @Autowired FacilityRepository facilityRepository;
    @Autowired FacilityBookingRepository facilityBookingRepository;
    @Autowired PromotionRequestRepository promotionRequestRepository;
    @Autowired LeaderSuccessionRequestRepository leaderSuccessionRequestRepository;
    @Autowired JdbcTemplate jdbcTemplate;
    @Autowired Clock clock;

    private final AtomicLong sequence = new AtomicLong(1);
    private Long studentUserId;

    @BeforeEach
    void setUp() {
        User studentUser = userRepository.save(UserFixture.unique());
        studentUserId = studentUser.getId();
    }

    @Test
    @DisplayName("지난날 13개는 KST 어제까지 오래된 순이고, 범위 밖(14일 전·오늘) 기록은 빼고 빈 날은 null 이다")
    void fillsThirteenRecordedDaysAndLeavesMissingDaysNull() {
        LocalDate yesterday = LocalDate.now(clock).minusDays(1);
        adminPendingSnapshotRecorder.record(yesterday, AdminPendingCountsQuery.of(5, 0, 0, 0, 0, 0, 0, 0));
        adminPendingSnapshotRecorder.record(yesterday.minusDays(12), AdminPendingCountsQuery.of(3, 0, 0, 0, 0, 0, 0, 0));
        adminPendingSnapshotRecorder.record(yesterday.minusDays(13), AdminPendingCountsQuery.of(99, 0, 0, 0, 0, 0, 0, 0));
        adminPendingSnapshotRecorder.record(yesterday.plusDays(1), AdminPendingCountsQuery.of(77, 0, 0, 0, 0, 0, 0, 0));

        AdminPendingTrendQuery trend = adminPendingTrendQueryService.getTrend();

        assertThat(trend.days()).hasSize(13);
        assertThat(trend.days().get(0)).isEqualTo(new DailyPendingTotalQuery(yesterday.minusDays(12), 3));
        assertThat(trend.days().get(12)).isEqualTo(new DailyPendingTotalQuery(yesterday, 5));
        assertThat(trend.days().subList(1, 12)).extracting(DailyPendingTotalQuery::totalPendingCount).containsOnlyNulls();
    }

    @Test
    @DisplayName("최근 7일 안에 들어온 건만 접수로 센다 — 7일 경계 바로 바깥은 빠진다")
    void countsOnlyItemsReceivedWithinSevenDays() {
        saveReport();
        Report justInside = saveReport();
        Report justOutside = saveReport();
        moveCreatedAt("report", justInside.getId(), Duration.ofDays(7).minusHours(1));
        moveCreatedAt("report", justOutside.getId(), Duration.ofDays(7).plusHours(1));

        AdminPendingTrendQuery trend = adminPendingTrendQueryService.getTrend();

        assertThat(trend.recentFlow().receivedCount()).isEqualTo(2);
        assertThat(trend.recentFlow().handledCount()).isZero();
    }

    @Test
    @DisplayName("신고·홍보·승계는 처리 시각으로 세고, 동아리 폐쇄로 반려된 승계·홍보도 처리로 센다")
    void countsHandledReportsPromotionsAndSuccessionsIncludingClosureRejections() {
        Report handledReport = saveReport();
        handledReport.process(studentUserId, ReportStatus.RESOLVED, "처리 완료");
        reportRepository.save(handledReport);
        Club club = clubRepository.save(ClubFixture.academic("폐쇄동아리" + sequence.incrementAndGet()));
        // 동아리 폐쇄는 대기 중인 승계·홍보를 이 process(REJECTED) 경로로 닫는다
        // (GeneralPromotionRequestService#rejectPendingOnClubClosure·GeneralLeaderSuccessionService#cancelPendingOnClubClosure).
        PromotionRequest promotionRequest = promotionRequestRepository.save(PromotionRequest.create(
                club.getId(), studentUserId, "홍보 제목", "홍보 설명", null, null));
        promotionRequest.process(studentUserId, PromotionRequestStatus.REJECTED, "동아리 폐쇄");
        promotionRequestRepository.save(promotionRequest);
        LeaderSuccessionRequest successionRequest = leaderSuccessionRequestRepository.save(
                LeaderSuccessionRequest.create(club.getId(), studentUserId, "승계 사유"));
        successionRequest.process(studentUserId, SuccessionStatus.REJECTED, "동아리 폐쇄");
        leaderSuccessionRequestRepository.save(successionRequest);

        AdminPendingTrendQuery trend = adminPendingTrendQueryService.getTrend();

        assertThat(trend.recentFlow().receivedCount()).isEqualTo(3);
        assertThat(trend.recentFlow().handledCount()).isEqualTo(3);
    }

    @Test
    @DisplayName("문의는 답변 또는 답변 없이 닫힌 시각으로 처리를 센다 — 오래전 답변 뒤 이번 주에 닫힌 건은 처리로 다시 세지 않는다")
    void countsInquiriesByAnsweredOrClosedTime() {
        FederationInquiry answered = federationInquiryRepository.save(FederationInquiry.create(studentUserId, "답변 문의", "내용"));
        answered.markAnswered();
        federationInquiryRepository.save(answered);
        FederationInquiry closedWithoutAnswer = federationInquiryRepository.save(
                FederationInquiry.create(studentUserId, "닫힌 문의", "내용"));
        closedWithoutAnswer.close("중복 문의");
        federationInquiryRepository.save(closedWithoutAnswer);
        FederationInquiry answeredLongAgo = federationInquiryRepository.save(
                FederationInquiry.create(studentUserId, "예전 답변 문의", "내용"));
        answeredLongAgo.markAnswered();
        answeredLongAgo.close("확인 완료");
        federationInquiryRepository.save(answeredLongAgo);
        jdbcTemplate.update("UPDATE federation_inquiry SET answered_at = ? WHERE id = ?",
                Timestamp.valueOf(TimeMapper.systemNow(clock).minusDays(10)), answeredLongAgo.getId());

        AdminPendingTrendQuery trend = adminPendingTrendQueryService.getTrend();

        assertThat(trend.recentFlow().receivedCount()).isEqualTo(3);
        assertThat(trend.recentFlow().handledCount()).isEqualTo(2);
    }

    @Test
    @DisplayName("작성자가 지운 문의는 접수에서도 처리에서도 빠진다")
    void excludesInquiriesDeletedByAuthor() {
        FederationInquiry deleted = federationInquiryRepository.save(FederationInquiry.create(studentUserId, "지울 문의", "내용"));
        deleted.markAnswered();
        FederationInquiry answeredBeforeDelete = federationInquiryRepository.saveAndFlush(deleted);
        federationInquiryRepository.delete(answeredBeforeDelete);
        federationInquiryRepository.flush();

        AdminPendingTrendQuery trend = adminPendingTrendQueryService.getTrend();

        assertThat(trend.recentFlow().receivedCount()).isZero();
        assertThat(trend.recentFlow().handledCount()).isZero();
    }

    @Test
    @DisplayName("시설 예약은 승인·반려 결정 시각으로 처리를 세고, 동아리 취소·충돌 뒤 관리자 취소는 처리로 세지 않는다")
    void countsBookingsByDecisionTimeAndIgnoresCancellations() {
        FacilityBooking approved = saveBooking();
        approved.approve(studentUserId, LocalDateTime.now(clock), LocalDateTime.now(clock));
        facilityBookingRepository.save(approved);
        FacilityBooking rejectedLongAgo = saveBooking();
        rejectedLongAgo.reject(studentUserId, "일정 겹침", LocalDateTime.now(clock).minusDays(8));
        facilityBookingRepository.save(rejectedLongAgo);
        FacilityBooking cancelledByClub = saveBooking();
        cancelledByClub.cancelByClub();
        facilityBookingRepository.save(cancelledByClub);
        // 오래전에 승인됐다가 충돌로 되돌아온 뒤 관리자가 취소 — 대기에서는 빠지지만 decided_at 이 새로 찍히지 않아 처리로 세지 않는다.
        FacilityBooking conflictCancelledByAdmin = saveBooking();
        conflictCancelledByAdmin.approve(studentUserId, LocalDateTime.now(clock), LocalDateTime.now(clock).minusDays(8));
        conflictCancelledByAdmin.markConflict("겹침 확인");
        conflictCancelledByAdmin.cancelByAdmin();
        facilityBookingRepository.save(conflictCancelledByAdmin);

        AdminPendingTrendQuery trend = adminPendingTrendQueryService.getTrend();

        assertThat(trend.recentFlow().receivedCount()).isEqualTo(4);
        assertThat(trend.recentFlow().handledCount()).isEqualTo(1);
    }

    private Report saveReport() {
        return reportRepository.save(Report.create(studentUserId, ReportTargetType.CLUB, sequence.incrementAndGet(),
                ReportReasonCode.SPAM, "신고 내용"));
    }

    /** created_at 은 @CreatedDate 가 INSERT 때 덮어써 저장 뒤 JDBC 로 옮긴다. 감사 필드는 system regime. */
    private void moveCreatedAt(String table, Long id, Duration age) {
        jdbcTemplate.update("UPDATE " + table + " SET created_at = ? WHERE id = ?",
                Timestamp.valueOf(TimeMapper.systemNow(clock).minus(age)), id);
    }

    private FacilityBooking saveBooking() {
        Facility facility = facilityRepository.save(
                Facility.create((int) sequence.incrementAndGet(), "회의실", "학생회관", 1));
        Club club = clubRepository.save(ClubFixture.academic("예약동아리" + sequence.incrementAndGet()));
        return facilityBookingRepository.save(FacilityBooking.request(
                facility.getId(), club.getId(), studentUserId, LocalDate.now(clock).plusDays(7),
                LocalTime.of(10, 0), LocalTime.of(12, 0), "정기 모임", 10, "010-1234-5678"));
    }
}
