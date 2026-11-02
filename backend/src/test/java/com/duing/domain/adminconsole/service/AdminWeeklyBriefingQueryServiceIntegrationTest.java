package com.duing.domain.adminconsole.service;

import static com.duing.domain.adminconsole.service.WeeklyBriefingTestSupport.boundaryMoments;
import static com.duing.domain.adminconsole.service.WeeklyBriefingTestSupport.latestEndedWeek;
import static com.duing.domain.adminconsole.service.WeeklyBriefingTestSupport.placeSeoul;
import static com.duing.domain.adminconsole.service.WeeklyBriefingTestSupport.placeSystem;
import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.ClubFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.adminconsole.service.dto.query.AdminPendingCountsQuery;
import com.duing.domain.adminconsole.service.dto.query.AdminWeeklyBriefingQuery;
import com.duing.domain.adminconsole.service.dto.query.AdminWeeklyBriefingQuery.FirstAnswer;
import com.duing.domain.adminconsole.service.dto.query.AdminWeeklyBriefingQuery.Flow;
import com.duing.domain.adminconsole.service.dto.query.AdminWeeklyBriefingQuery.WeeklyFlows;
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
import com.duing.domain.user.repository.UserRepository;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
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
class AdminWeeklyBriefingQueryServiceIntegrationTest extends IntegrationTestBase {

    @Autowired AdminWeeklyBriefingQueryService adminWeeklyBriefingQueryService;
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
    private LocalDate weekStart;

    @BeforeEach
    void setUp() {
        studentUserId = userRepository.save(UserFixture.unique()).getId();
        weekStart = latestEndedWeek(clock);
    }

    @Test
    @DisplayName("다섯 업무의 접수는 월 00:00 정각과 일 23:59:59 를 넣고 다음 월 00:00 정각과 전 일요일 23:59:59 는 뺀다")
    void receivedCountsKeepHalfOpenWeekBounds() {
        for (LocalDateTime moment : boundaryMoments(weekStart)) {
            placeSystem(jdbcTemplate, "report", saveReport().getId(), "created_at", moment);
            placeSystem(jdbcTemplate, "federation_inquiry", saveInquiry().getId(), "created_at", moment);
            placeSystem(jdbcTemplate, "facility_booking", saveBooking().getId(), "created_at", moment);
            placeSystem(jdbcTemplate, "promotion_request", savePromotionRequest().getId(), "created_at", moment);
            placeSystem(jdbcTemplate, "leader_succession_request", saveSuccessionRequest().getId(), "created_at", moment);
        }

        WeeklyFlows flow = adminWeeklyBriefingQueryService.getWeeklyBriefing(weekStart).flow();

        assertThat(List.of(flow.report(), flow.inquiry(), flow.facilityBooking(), flow.promotionRequest(),
                flow.leaderSuccession())).extracting(Flow::receivedCount).containsOnly(2L);
    }

    @Test
    @DisplayName("신고·홍보·승계는 처리 시각, 시설 예약은 결정 시각(KST 벽시계)으로 같은 반열린 구간 안의 처리만 센다")
    void handledCountsKeepHalfOpenWeekBounds() {
        for (LocalDateTime moment : boundaryMoments(weekStart)) {
            // 처리 행은 status·handled_by 가 함께 있어야 한다(chk_*_handled_pair) — 처리한 뒤 처리 시각만 옮긴다.
            Report report = saveReport();
            report.process(studentUserId, ReportStatus.RESOLVED, "처리 완료");
            placeSystem(jdbcTemplate, "report", reportRepository.save(report).getId(), "handled_at", moment);
            PromotionRequest promotionRequest = savePromotionRequest();
            promotionRequest.process(studentUserId, PromotionRequestStatus.REJECTED, "반려");
            placeSystem(jdbcTemplate, "promotion_request", promotionRequestRepository.save(promotionRequest).getId(),
                    "handled_at", moment);
            LeaderSuccessionRequest successionRequest = saveSuccessionRequest();
            successionRequest.process(studentUserId, SuccessionStatus.REJECTED, "반려");
            placeSystem(jdbcTemplate, "leader_succession_request",
                    leaderSuccessionRequestRepository.save(successionRequest).getId(), "handled_at", moment);
            // decided_at 은 now(seoulClock) 으로 기록하는 seoul regime — KST 벽시계 그대로 넣는다.
            placeSeoul(jdbcTemplate, "facility_booking", saveBooking().getId(), "decided_at", moment);
        }

        WeeklyFlows flow = adminWeeklyBriefingQueryService.getWeeklyBriefing(weekStart).flow();

        assertThat(List.of(flow.report(), flow.facilityBooking(), flow.promotionRequest(), flow.leaderSuccession()))
                .extracting(Flow::handledCount).containsOnly(2L);
        // 행은 이번 주에 만들어져 그 주 접수로는 세지 않는다.
        assertThat(flow.report().receivedCount()).isZero();
    }

    @Test
    @DisplayName("문의 처리는 답변 시각(답변 없이 닫혔으면 닫은 시각)으로 세고, 첫 답변 평균은 그 주에 나간 답변만으로 분 단위 반올림한다 — 지운 문의는 빠진다")
    void inquiryHandledAndFirstAnswerAverage() {
        // 주 안 답변 두 건 — 접수 뒤 30시간(1800분)·50시간 15분(3015분)
        answeredInquiry(weekStart.atTime(9, 0), weekStart.plusDays(1).atTime(15, 0));
        answeredInquiry(weekStart.plusDays(2).atTime(10, 0), weekStart.plusDays(4).atTime(12, 15));
        // 답변 없이 닫힘(주 안) — 처리로 세지만 첫 답변 평균에는 들지 않는다.
        FederationInquiry closedWithoutAnswer = saveInquiry();
        closedWithoutAnswer.close("중복 문의");
        placeSystem(jdbcTemplate, "federation_inquiry", federationInquiryRepository.save(closedWithoutAnswer).getId(),
                "closed_at", weekStart.plusDays(3).atTime(10, 0));
        // 지난주에 답변하고 이번 주에 닫음 — 처리는 답변 시각으로만 센다(주 밖).
        FederationInquiry answeredEarlier = answeredInquiry(weekStart.minusDays(3).atTime(10, 0),
                weekStart.minusDays(2).atTime(10, 0));
        FederationInquiry reloadedEarlier = federationInquiryRepository.findById(answeredEarlier.getId()).orElseThrow();
        reloadedEarlier.close("확인 완료");
        placeSystem(jdbcTemplate, "federation_inquiry", federationInquiryRepository.save(reloadedEarlier).getId(),
                "closed_at", weekStart.plusDays(2).atTime(10, 0));
        // 주 경계 네 순간 답변(접수는 10시간 전) — 월 00:00 정각·일 23:59:59 는 안, 다음 월 00:00 정각·전 일 23:59:59 는 밖.
        boundaryMoments(weekStart).forEach(moment -> answeredInquiry(moment.minusHours(10), moment));
        // 작성자가 지운 문의 — 주 안 답변이어도 빠진다(JDBC 로 옮긴 뒤라 version 을 새로 읽고 지운다).
        FederationInquiry deleted = answeredInquiry(weekStart.atTime(10, 0), weekStart.atTime(20, 0));
        federationInquiryRepository.delete(federationInquiryRepository.findById(deleted.getId()).orElseThrow());
        federationInquiryRepository.flush();

        AdminWeeklyBriefingQuery briefing = adminWeeklyBriefingQueryService.getWeeklyBriefing(weekStart);

        // 처리 = 주 안 답변 2 + 답변 없이 닫힘 1 + 경계 안 답변 2 = 5. 평균 = (1800+3015+600+600)/4 = 1503.75 → 1504분
        assertThat(briefing.flow().inquiry().handledCount()).isEqualTo(5);
        assertThat(briefing.inquiryFirstAnswer()).isEqualTo(new FirstAnswer(4, 1504L));
    }

    @Test
    @DisplayName("주 끝 남은 대기는 그 주 일요일 기록의 8칸과 기록된 합계를 그대로 주고, 기록이 처음 시작된 날을 함께 준다")
    void endPendingReadsSundaySnapshot() {
        adminPendingSnapshotRecorder.record(weekStart.minusDays(20), AdminPendingCountsQuery.of(9, 9, 9, 9, 9, 9, 9, 9));
        adminPendingSnapshotRecorder.record(weekStart.plusDays(6), AdminPendingCountsQuery.of(1, 2, 3, 4, 5, 6, 7, 8));
        adminPendingSnapshotRecorder.record(weekStart.plusDays(7), AdminPendingCountsQuery.of(50, 0, 0, 0, 0, 0, 0, 0));

        AdminWeeklyBriefingQuery briefing = adminWeeklyBriefingQueryService.getWeeklyBriefing(weekStart);

        assertThat(briefing.endPending()).isEqualTo(AdminPendingCountsQuery.of(1, 2, 3, 4, 5, 6, 7, 8));
        assertThat(briefing.endPending().totalPendingCount()).isEqualTo(36);
        assertThat(briefing.pendingRecordStartedOn()).isEqualTo(weekStart.minusDays(20));
    }

    @Test
    @DisplayName("그 주 일요일 기록이 없으면 주 끝 남은 대기는 null 이고, 기록이 하나도 없으면 첫 기록 날짜도 null 이다")
    void endPendingIsNullWithoutSundaySnapshot() {
        AdminWeeklyBriefingQuery noRecord = adminWeeklyBriefingQueryService.getWeeklyBriefing(weekStart);
        assertThat(noRecord.endPending()).isNull();
        assertThat(noRecord.pendingRecordStartedOn()).isNull();

        adminPendingSnapshotRecorder.record(weekStart.plusDays(5), AdminPendingCountsQuery.of(1, 0, 0, 0, 0, 0, 0, 0));
        AdminWeeklyBriefingQuery missingSunday = adminWeeklyBriefingQueryService.getWeeklyBriefing(weekStart);
        assertThat(missingSunday.endPending()).isNull();
        assertThat(missingSunday.pendingRecordStartedOn()).isEqualTo(weekStart.plusDays(5));
    }

    /** 답변한 문의 — 접수·답변 시각을 KST 벽시계로 옮긴다(둘 다 system regime). */
    private FederationInquiry answeredInquiry(LocalDateTime createdAt, LocalDateTime answeredAt) {
        FederationInquiry inquiry = saveInquiry();
        inquiry.markAnswered();
        FederationInquiry saved = federationInquiryRepository.save(inquiry);
        placeSystem(jdbcTemplate, "federation_inquiry", saved.getId(), "created_at", createdAt);
        placeSystem(jdbcTemplate, "federation_inquiry", saved.getId(), "answered_at", answeredAt);
        return saved;
    }

    private Report saveReport() {
        return reportRepository.save(Report.create(studentUserId, ReportTargetType.CLUB, sequence.incrementAndGet(),
                ReportReasonCode.SPAM, "신고 내용"));
    }

    private FederationInquiry saveInquiry() {
        return federationInquiryRepository.save(FederationInquiry.create(studentUserId, "문의 제목", "내용"));
    }

    private FacilityBooking saveBooking() {
        Facility facility = facilityRepository.save(
                Facility.create((int) sequence.incrementAndGet(), "회의실", "학생회관", 1));
        return facilityBookingRepository.save(FacilityBooking.request(facility.getId(), saveClub().getId(),
                studentUserId, LocalDate.now(clock).plusDays(7), LocalTime.of(10, 0), LocalTime.of(12, 0),
                "정기 모임", 10, "010-1234-5678"));
    }

    /** 홍보·승계는 동아리당 대기 하나(uq_pr_active_pending·uq_lsr_active_pending)라 요청마다 동아리를 만든다. */
    private PromotionRequest savePromotionRequest() {
        return promotionRequestRepository.save(PromotionRequest.create(saveClub().getId(), studentUserId,
                "홍보 제목", "홍보 설명", null, null));
    }

    private LeaderSuccessionRequest saveSuccessionRequest() {
        return leaderSuccessionRequestRepository.save(
                LeaderSuccessionRequest.create(saveClub().getId(), studentUserId, "승계 사유"));
    }

    private Club saveClub() {
        return clubRepository.save(ClubFixture.academic("주간브리핑동아리" + sequence.incrementAndGet()));
    }
}
