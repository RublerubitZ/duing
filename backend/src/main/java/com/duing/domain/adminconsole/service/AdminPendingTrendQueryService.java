package com.duing.domain.adminconsole.service;

import com.duing.domain.adminconsole.entity.AdminPendingSnapshot;
import com.duing.domain.adminconsole.repository.AdminPendingSnapshotRepository;
import com.duing.domain.adminconsole.service.dto.query.AdminPendingTrendQuery;
import com.duing.domain.adminconsole.service.dto.query.DailyPendingTotalQuery;
import com.duing.domain.adminconsole.service.dto.query.RecentFlowQuery;
import com.duing.domain.clubmember.repository.LeaderSuccessionRequestRepository;
import com.duing.domain.facilitybooking.repository.FacilityBookingRepository;
import com.duing.domain.federation.repository.FederationInquiryRepository;
import com.duing.domain.promotion.repository.PromotionRequestRepository;
import com.duing.domain.report.repository.ReportRepository;
import com.duing.global.time.TimeMapper;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 총동연 홈 처리 대기 추이 조회.
 *
 * <p>막대는 지난 13일(KST 어제까지)의 하루 끝 기록만 준다 — 오늘 막대는 화면이 머리말과 같은 pending-counts 로 채워
 * 14개가 된다. 접수·처리는 기록하지 않고 각 도메인의 시각 열로 최근 7일(롤링)을 센다. 동아리 승인(승인·반려를 시각으로
 * 구분 못 함)과 모집(대기 단위가 모집 수)은 뺀다.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class AdminPendingTrendQueryService {

    /** 기록으로 채우는 지난날 수 — 오늘 막대는 화면이 채운다. */
    static final int RECORDED_DAYS = 13;

    /** 접수·처리를 세는 최근 기간(롤링, 날짜 경계 없음). */
    static final int RECENT_FLOW_DAYS = 7;

    private final AdminPendingSnapshotRepository adminPendingSnapshotRepository;
    private final ReportRepository reportRepository;
    private final FederationInquiryRepository federationInquiryRepository;
    private final FacilityBookingRepository facilityBookingRepository;
    private final PromotionRequestRepository promotionRequestRepository;
    private final LeaderSuccessionRequestRepository leaderSuccessionRequestRepository;
    private final Clock clock;

    public AdminPendingTrendQuery getTrend() {
        return new AdminPendingTrendQuery(recordedDays(), recentFlow());
    }

    private List<DailyPendingTotalQuery> recordedDays() {
        // clock 은 seoulClock 이라 JVM 기본 존과 무관하게 KST 날짜다.
        LocalDate yesterday = LocalDate.now(clock).minusDays(1);
        LocalDate firstDay = yesterday.minusDays(RECORDED_DAYS - 1);
        Map<LocalDate, Integer> totalByDate = adminPendingSnapshotRepository
                .findBySnapshotDateBetweenOrderBySnapshotDateAsc(firstDay, yesterday).stream()
                .collect(Collectors.toMap(AdminPendingSnapshot::getSnapshotDate, AdminPendingSnapshot::getTotalPendingCount));
        return firstDay.datesUntil(yesterday.plusDays(1))
                .map(date -> new DailyPendingTotalQuery(date, totalByDate.get(date)))
                .toList();
    }

    private RecentFlowQuery recentFlow() {
        // 열마다 저장 regime 이 달라 기준 시각을 따로 만든다(TIMEZONE.md) — 감사·무클럭 now() 열은 저장 존 벽시계,
        // facility_booking.decided_at 만 seoulClock 벽시계.
        LocalDateTime systemSince = TimeMapper.systemNow(clock).minusDays(RECENT_FLOW_DAYS);
        LocalDateTime seoulSince = LocalDateTime.now(clock).minusDays(RECENT_FLOW_DAYS);
        long receivedCount = reportRepository.countByCreatedAtGreaterThanEqual(systemSince)
                + federationInquiryRepository.countByCreatedAtGreaterThanEqual(systemSince)
                + facilityBookingRepository.countByCreatedAtGreaterThanEqual(systemSince)
                + promotionRequestRepository.countByCreatedAtGreaterThanEqual(systemSince)
                + leaderSuccessionRequestRepository.countByCreatedAtGreaterThanEqual(systemSince);
        long handledCount = reportRepository.countByHandledAtGreaterThanEqual(systemSince)
                + federationInquiryRepository.countHandledSince(systemSince)
                + facilityBookingRepository.countByDecidedAtGreaterThanEqual(seoulSince)
                + promotionRequestRepository.countByHandledAtGreaterThanEqual(systemSince)
                + leaderSuccessionRequestRepository.countByHandledAtGreaterThanEqual(systemSince);
        return new RecentFlowQuery(RECENT_FLOW_DAYS, receivedCount, handledCount);
    }
}
