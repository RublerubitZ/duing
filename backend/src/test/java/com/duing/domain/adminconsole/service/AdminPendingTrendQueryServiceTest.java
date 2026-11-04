package com.duing.domain.adminconsole.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import com.duing.domain.adminconsole.repository.AdminPendingSnapshotRepository;
import com.duing.domain.adminconsole.service.dto.query.AdminPendingTrendQuery;
import com.duing.domain.adminconsole.service.dto.query.DailyPendingTotalQuery;
import com.duing.domain.clubmember.repository.LeaderSuccessionRequestRepository;
import com.duing.domain.facilitybooking.repository.FacilityBookingRepository;
import com.duing.domain.federation.repository.FederationInquiryRepository;
import com.duing.domain.promotion.repository.PromotionRequestRepository;
import com.duing.domain.report.repository.ReportRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.TimeZone;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * 날짜·기준 시각의 regime 을 고정한다. 드리프트는 JVM 기본 존이 KST 가 아닐 때만 드러나므로 각 테스트가 기본 존을
 * UTC 로 잠시 바꾼다(PiiRetentionJobCutoffTest 전례). Clock 은 항상 seoulClock 과 같은 존.
 */
@ExtendWith(MockitoExtension.class)
class AdminPendingTrendQueryServiceTest {

    /** UTC 2026-10-29 15:30 = KST 2026-10-30 00:30 — UTC 날짜(10/29)와 KST 날짜(10/30)가 갈리는 순간. */
    private static final Instant NOW = Instant.parse("2026-10-29T15:30:00Z");
    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private static final Clock SEOUL_CLOCK = Clock.fixed(NOW, SEOUL);

    @Mock AdminPendingSnapshotRepository adminPendingSnapshotRepository;
    @Mock ReportRepository reportRepository;
    @Mock FederationInquiryRepository federationInquiryRepository;
    @Mock FacilityBookingRepository facilityBookingRepository;
    @Mock PromotionRequestRepository promotionRequestRepository;
    @Mock LeaderSuccessionRequestRepository leaderSuccessionRequestRepository;

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

    private AdminPendingTrendQueryService service() {
        return new AdminPendingTrendQueryService(adminPendingSnapshotRepository, reportRepository,
                federationInquiryRepository, facilityBookingRepository, promotionRequestRepository,
                leaderSuccessionRequestRepository, SEOUL_CLOCK);
    }

    @Test
    @DisplayName("지난날 13개는 JVM 기본 존이 UTC 여도 KST 어제(10/29)에서 끝나고, 기록이 없는 날은 null 이다")
    void recordedDaysEndAtSeoulYesterdayUnderUtcJvm() {
        LocalDate seoulYesterday = LocalDate.of(2026, 10, 29);
        LocalDate firstDay = LocalDate.of(2026, 10, 17);
        when(adminPendingSnapshotRepository.findBySnapshotDateBetweenOrderBySnapshotDateAsc(firstDay, seoulYesterday))
                .thenReturn(List.of());

        AdminPendingTrendQuery trend = service().getTrend();

        assertThat(trend.days()).hasSize(13);
        assertThat(trend.days()).extracting(DailyPendingTotalQuery::date)
                .startsWith(firstDay)
                .endsWith(seoulYesterday);
        assertThat(trend.days()).extracting(DailyPendingTotalQuery::totalPendingCount).containsOnlyNulls();
    }

    @Test
    @DisplayName("접수·처리 기준 시각은 열의 regime 을 따른다 — 시설 결정 시각만 KST 벽시계, 나머지는 저장 존(UTC) 벽시계")
    void flowCutoffsFollowEachColumnRegimeUnderUtcJvm() {
        // 저장 존(UTC) 벽시계 10/29 15:30 - 7일. KST 벽시계로 계산했다면 9시간 늦은 값이 된다.
        LocalDateTime systemSince = LocalDateTime.ofInstant(NOW, ZoneOffset.UTC).minusDays(7);
        // decided_at 은 now(seoulClock) 으로 기록됐다 — KST 벽시계 10/30 00:30 - 7일.
        LocalDateTime seoulSince = LocalDateTime.ofInstant(NOW, SEOUL).minusDays(7);
        when(adminPendingSnapshotRepository.findBySnapshotDateBetweenOrderBySnapshotDateAsc(
                LocalDate.of(2026, 10, 17), LocalDate.of(2026, 10, 29))).thenReturn(List.of());
        when(reportRepository.countByCreatedAtGreaterThanEqual(systemSince)).thenReturn(1L);
        when(federationInquiryRepository.countByCreatedAtGreaterThanEqual(systemSince)).thenReturn(2L);
        when(facilityBookingRepository.countByCreatedAtGreaterThanEqual(systemSince)).thenReturn(3L);
        when(promotionRequestRepository.countByCreatedAtGreaterThanEqual(systemSince)).thenReturn(4L);
        when(leaderSuccessionRequestRepository.countByCreatedAtGreaterThanEqual(systemSince)).thenReturn(5L);
        when(reportRepository.countByHandledAtGreaterThanEqual(systemSince)).thenReturn(10L);
        when(federationInquiryRepository.countHandledSince(systemSince)).thenReturn(20L);
        when(facilityBookingRepository.countByDecidedAtGreaterThanEqual(seoulSince)).thenReturn(30L);
        when(promotionRequestRepository.countByHandledAtGreaterThanEqual(systemSince)).thenReturn(40L);
        when(leaderSuccessionRequestRepository.countByHandledAtGreaterThanEqual(systemSince)).thenReturn(50L);

        AdminPendingTrendQuery trend = service().getTrend();

        assertThat(trend.recentFlow().days()).isEqualTo(7);
        assertThat(trend.recentFlow().receivedCount()).isEqualTo(15L);
        assertThat(trend.recentFlow().handledCount()).isEqualTo(150L);
    }
}
