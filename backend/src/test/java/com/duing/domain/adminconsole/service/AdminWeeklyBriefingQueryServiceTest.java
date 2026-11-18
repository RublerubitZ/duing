package com.duing.domain.adminconsole.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.duing.domain.adminconsole.repository.AdminPendingSnapshotRepository;
import com.duing.domain.adminconsole.service.dto.query.AdminWeeklyBriefingQuery;
import com.duing.domain.adminconsole.service.dto.query.AdminWeeklyBriefingQuery.FeeActivity;
import com.duing.domain.adminconsole.service.dto.query.AdminWeeklyBriefingQuery.FirstAnswer;
import com.duing.domain.adminconsole.service.dto.query.AdminWeeklyBriefingQuery.Flow;
import com.duing.domain.adminconsole.service.dto.query.AdminWeeklyBriefingQuery.RecruitmentActivity;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.clubaudit.entity.ClubAuditEventType;
import com.duing.domain.clubaudit.repository.ClubAuditEventRepository;
import com.duing.domain.clubmember.repository.LeaderSuccessionRequestRepository;
import com.duing.domain.facilitybooking.repository.FacilityBookingRepository;
import com.duing.domain.federation.repository.FederationInquiryRepository;
import com.duing.domain.fee.entity.FeeStatus;
import com.duing.domain.fee.repository.AdminFeeAuditQueryRepository;
import com.duing.domain.fee.repository.FeeBillRepository;
import com.duing.domain.fee.repository.PaymentRepository;
import com.duing.domain.notice.repository.NoticeRepository;
import com.duing.domain.promotion.repository.PromotionRequestRepository;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.report.repository.ReportRepository;
import com.duing.domain.user.profilecheck.repository.ProfileCheckStatsRepositoryCustom;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Optional;
import java.util.TimeZone;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * 열마다 경계 축(regime)이 맞는지 고정한다. 9시간 밀림은 JVM 기본 존이 KST 가 아닐 때만 드러나므로 기본 존을 UTC 로
 * 잠시 바꾼다(AdminPendingTrendQueryServiceTest 전례). 저장소는 엄격 스텁이라 다른 경계로 부르면 PotentialStubbingProblem 으로 바로 실패한다.
 */
@ExtendWith(MockitoExtension.class)
class AdminWeeklyBriefingQueryServiceTest {

    /** UTC 2026-11-04 05:00 = KST 2026-11-04(수) 14:00 — 가장 최근에 끝난 주는 10/26(월) 주. */
    private static final Clock SEOUL_CLOCK = Clock.fixed(Instant.parse("2026-11-04T05:00:00Z"), ZoneId.of("Asia/Seoul"));
    private static final LocalDate WEEK_START = LocalDate.of(2026, 10, 26);
    /** 저장 존(UTC) 벽시계로 옮긴 KST 10/26 00:00 · 11/2 00:00 — 감사·무클럭 now() 열의 경계. */
    private static final LocalDateTime SYSTEM_FROM = LocalDateTime.of(2026, 10, 25, 15, 0);
    private static final LocalDateTime SYSTEM_TO = LocalDateTime.of(2026, 11, 1, 15, 0);
    /** KST 벽시계 그대로 — facility_booking.decided_at(now(seoulClock)) 의 경계. */
    private static final LocalDateTime SEOUL_FROM = LocalDateTime.of(2026, 10, 26, 0, 0);
    private static final LocalDateTime SEOUL_TO = LocalDateTime.of(2026, 11, 2, 0, 0);
    /** 절대 시각 — payment.voided_at·profile_check_confirmation.confirmed_at(Instant) 의 경계. */
    private static final Instant INSTANT_FROM = Instant.parse("2026-10-25T15:00:00Z");
    private static final Instant INSTANT_TO = Instant.parse("2026-11-01T15:00:00Z");

    @Mock ReportRepository reportRepository;
    @Mock FederationInquiryRepository federationInquiryRepository;
    @Mock FacilityBookingRepository facilityBookingRepository;
    @Mock PromotionRequestRepository promotionRequestRepository;
    @Mock LeaderSuccessionRequestRepository leaderSuccessionRequestRepository;
    @Mock AdminPendingSnapshotRepository adminPendingSnapshotRepository;
    @Mock NoticeRepository noticeRepository;
    @Mock RecruitmentRepository recruitmentRepository;
    @Mock ApplicationRepository applicationRepository;
    @Mock FeeBillRepository feeBillRepository;
    @Mock AdminFeeAuditQueryRepository adminFeeAuditQueryRepository;
    @Mock PaymentRepository paymentRepository;
    @Mock ClubAuditEventRepository clubAuditEventRepository;
    @Mock ProfileCheckStatsRepositoryCustom profileCheckStatsRepository;

    private TimeZone originalDefaultZone;

    @BeforeEach
    void useUtcJvmZone() {
        originalDefaultZone = TimeZone.getDefault();
        TimeZone.setDefault(TimeZone.getTimeZone("UTC"));
    }

    @AfterEach
    void restoreDefaultZone() {
        TimeZone.setDefault(originalDefaultZone);
    }

    private AdminWeeklyBriefingQueryService service() {
        return new AdminWeeklyBriefingQueryService(reportRepository, federationInquiryRepository,
                facilityBookingRepository, promotionRequestRepository, leaderSuccessionRequestRepository,
                adminPendingSnapshotRepository, noticeRepository, recruitmentRepository, applicationRepository,
                feeBillRepository, adminFeeAuditQueryRepository, paymentRepository, clubAuditEventRepository,
                profileCheckStatsRepository, SEOUL_CLOCK);
    }

    @Test
    @DisplayName("운영과 같은 UTC JVM 에서 시설 처리(decided_at)만 KST 벽시계 경계로, 나머지 접수·처리·답변은 저장 존 벽시계 경계로 센다")
    void eachColumnUsesItsRegimeBoundsUnderUtcJvm() {
        when(reportRepository.countByCreatedAtGreaterThanEqualAndCreatedAtLessThan(SYSTEM_FROM, SYSTEM_TO)).thenReturn(1L);
        when(reportRepository.countByHandledAtGreaterThanEqualAndHandledAtLessThan(SYSTEM_FROM, SYSTEM_TO)).thenReturn(2L);
        when(federationInquiryRepository.countByCreatedAtGreaterThanEqualAndCreatedAtLessThan(SYSTEM_FROM, SYSTEM_TO)).thenReturn(3L);
        when(federationInquiryRepository.countHandledBetween(SYSTEM_FROM, SYSTEM_TO)).thenReturn(4L);
        when(facilityBookingRepository.countByCreatedAtGreaterThanEqualAndCreatedAtLessThan(SYSTEM_FROM, SYSTEM_TO)).thenReturn(5L);
        when(facilityBookingRepository.countByDecidedAtGreaterThanEqualAndDecidedAtLessThan(SEOUL_FROM, SEOUL_TO)).thenReturn(6L);
        when(promotionRequestRepository.countByCreatedAtGreaterThanEqualAndCreatedAtLessThan(SYSTEM_FROM, SYSTEM_TO)).thenReturn(7L);
        when(promotionRequestRepository.countByHandledAtGreaterThanEqualAndHandledAtLessThan(SYSTEM_FROM, SYSTEM_TO)).thenReturn(8L);
        when(leaderSuccessionRequestRepository.countByCreatedAtGreaterThanEqualAndCreatedAtLessThan(SYSTEM_FROM, SYSTEM_TO)).thenReturn(9L);
        when(leaderSuccessionRequestRepository.countByHandledAtGreaterThanEqualAndHandledAtLessThan(SYSTEM_FROM, SYSTEM_TO)).thenReturn(10L);
        when(federationInquiryRepository.countByAnsweredAtGreaterThanEqualAndAnsweredAtLessThan(SYSTEM_FROM, SYSTEM_TO)).thenReturn(4L);
        when(federationInquiryRepository.averageFirstAnswerMinutes(SYSTEM_FROM, SYSTEM_TO)).thenReturn(2580.4);
        when(adminPendingSnapshotRepository.findById(LocalDate.of(2026, 11, 1))).thenReturn(Optional.empty());
        when(adminPendingSnapshotRepository.findFirstByOrderBySnapshotDateAsc()).thenReturn(Optional.empty());

        AdminWeeklyBriefingQuery briefing = service().getWeeklyBriefing(WEEK_START);

        assertThat(briefing.flow().report()).isEqualTo(new Flow(1, 2));
        assertThat(briefing.flow().inquiry()).isEqualTo(new Flow(3, 4));
        assertThat(briefing.flow().facilityBooking()).isEqualTo(new Flow(5, 6));
        assertThat(briefing.flow().promotionRequest()).isEqualTo(new Flow(7, 8));
        assertThat(briefing.flow().leaderSuccession()).isEqualTo(new Flow(9, 10));
        assertThat(briefing.inquiryFirstAnswer()).isEqualTo(new FirstAnswer(4, 2580L));
        assertThat(briefing.endPending()).isNull();
        assertThat(briefing.pendingRecordStartedOn()).isNull();
    }

    @Test
    @DisplayName("그 주에 나간 답변이 없으면 평균 쿼리를 부르지 않고 평균은 null 이다")
    void skipsAverageWithoutAnswers() {
        AdminWeeklyBriefingQuery briefing = service().getWeeklyBriefing(WEEK_START);

        assertThat(briefing.inquiryFirstAnswer()).isEqualTo(new FirstAnswer(0, null));
        verify(federationInquiryRepository, never()).averageFirstAnswerMinutes(any(), any());
    }

    @Test
    @DisplayName("운영과 같은 UTC JVM 에서 납부 정정·정보 확인은 절대 시각 경계로, 모집 기간 끝은 KST 날짜(월~일)로, 나머지 활동은 저장 존 벽시계 경계로 센다")
    void activityMetricsUseTheirRegimeBoundsUnderUtcJvm() {
        when(noticeRepository.countByOwningClubIdIsNullAndCreatedAtGreaterThanEqualAndCreatedAtLessThan(SYSTEM_FROM, SYSTEM_TO)).thenReturn(1L);
        when(recruitmentRepository.countByCreatedAtGreaterThanEqualAndCreatedAtLessThan(SYSTEM_FROM, SYSTEM_TO)).thenReturn(2L);
        when(recruitmentRepository.countByEndDateBetween(LocalDate.of(2026, 10, 26), LocalDate.of(2026, 11, 1))).thenReturn(3L);
        when(applicationRepository.countByCreatedAtGreaterThanEqualAndCreatedAtLessThan(SYSTEM_FROM, SYSTEM_TO)).thenReturn(4L);
        when(feeBillRepository.countByStatusNotAndCreatedAtGreaterThanEqualAndCreatedAtLessThan(FeeStatus.CANCELLED, SYSTEM_FROM, SYSTEM_TO)).thenReturn(5L);
        when(adminFeeAuditQueryRepository.countBilledClubs(SYSTEM_FROM, SYSTEM_TO)).thenReturn(6L);
        when(paymentRepository.countByCreatedAtGreaterThanEqualAndCreatedAtLessThan(SYSTEM_FROM, SYSTEM_TO)).thenReturn(7L);
        when(paymentRepository.countByVoidedAtGreaterThanEqualAndVoidedAtLessThan(INSTANT_FROM, INSTANT_TO)).thenReturn(8L);
        when(clubAuditEventRepository.countDistinctClubsBetween(ClubAuditEventType.feeAccountChangeTypes(), SYSTEM_FROM, SYSTEM_TO)).thenReturn(9L);
        when(profileCheckStatsRepository.countTargetConfirmationsBetween(INSTANT_FROM, INSTANT_TO)).thenReturn(10L);

        AdminWeeklyBriefingQuery briefing = service().getWeeklyBriefing(WEEK_START);

        assertThat(briefing.federationNoticeCount()).isEqualTo(1);
        assertThat(briefing.recruitment()).isEqualTo(new RecruitmentActivity(2, 3, 4));
        assertThat(briefing.fee()).isEqualTo(new FeeActivity(5, 6, 7, 8, 9));
        assertThat(briefing.profileCheckConfirmedCount()).isEqualTo(10);
    }
}
