package com.duing.domain.adminconsole.service;

import com.duing.domain.adminconsole.entity.AdminPendingSnapshot;
import com.duing.domain.adminconsole.repository.AdminPendingSnapshotRepository;
import com.duing.domain.adminconsole.service.dto.query.AdminPendingCountsQuery;
import com.duing.domain.adminconsole.service.dto.query.AdminWeeklyBriefingQuery;
import com.duing.domain.adminconsole.service.dto.query.AdminWeeklyBriefingQuery.FeeActivity;
import com.duing.domain.adminconsole.service.dto.query.AdminWeeklyBriefingQuery.FirstAnswer;
import com.duing.domain.adminconsole.service.dto.query.AdminWeeklyBriefingQuery.Flow;
import com.duing.domain.adminconsole.service.dto.query.AdminWeeklyBriefingQuery.RecruitmentActivity;
import com.duing.domain.adminconsole.service.dto.query.AdminWeeklyBriefingQuery.WeeklyFlows;
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
import java.time.LocalDate;
import java.time.LocalDateTime;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 총동연 주간 브리핑 — 고른 주(KST 월 00:00 ~ 다음 월 00:00)에 접수·처리한 일과 활동.
 *
 * <p>경계는 {@link WeekBounds} 가 열의 저장 regime 마다 만든다(TIMEZONE.md) — 같은 주라도 열마다 다른 축 값을 쓴다.
 * 다섯 업무의 접수·처리는 홈 처리 대기 추이(AdminPendingTrendQueryService#recentFlow)와 같은 열·같은 규칙이고 기간만 다르다.
 * 남은 대기는 새로 세지 않고 그 주 일요일의 하루 끝 기록(admin_pending_snapshot)을 읽는다 — 홈 추이 막대와 같은 숫자다.
 * 여러 도메인을 가로지르는 읽기 전용 집계라 콘솔 패키지에 둔다(AdminPendingCountsQueryService 선례). 문장은 23~24개다.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class AdminWeeklyBriefingQueryService {

    private final ReportRepository reportRepository;
    private final FederationInquiryRepository federationInquiryRepository;
    private final FacilityBookingRepository facilityBookingRepository;
    private final PromotionRequestRepository promotionRequestRepository;
    private final LeaderSuccessionRequestRepository leaderSuccessionRequestRepository;
    private final AdminPendingSnapshotRepository adminPendingSnapshotRepository;
    private final NoticeRepository noticeRepository;
    private final RecruitmentRepository recruitmentRepository;
    private final ApplicationRepository applicationRepository;
    private final FeeBillRepository feeBillRepository;
    private final AdminFeeAuditQueryRepository adminFeeAuditQueryRepository;
    private final PaymentRepository paymentRepository;
    private final ClubAuditEventRepository clubAuditEventRepository;
    private final ProfileCheckStatsRepositoryCustom profileCheckStatsRepository;
    private final Clock clock;

    public AdminWeeklyBriefingQuery getWeeklyBriefing(LocalDate weekStart) {
        WeekBounds week = WeekBounds.endedWeek(weekStart, clock);
        return new AdminWeeklyBriefingQuery(
                flows(week),
                adminPendingSnapshotRepository.findById(week.lastDay())
                        .map(AdminWeeklyBriefingQueryService::toPendingCounts)
                        .orElse(null),
                adminPendingSnapshotRepository.findFirstByOrderBySnapshotDateAsc()
                        .map(AdminPendingSnapshot::getSnapshotDate)
                        .orElse(null),
                firstAnswer(week),
                noticeRepository.countByOwningClubIdIsNullAndCreatedAtGreaterThanEqualAndCreatedAtLessThan(
                        week.systemFrom(), week.systemTo()),
                recruitmentActivity(week),
                feeActivity(week),
                // confirmed_at 은 Instant 로 기록한다 — 절대 시각 경계.
                profileCheckStatsRepository.countTargetConfirmationsBetween(week.instantFrom(), week.instantTo()));
    }

    private WeeklyFlows flows(WeekBounds week) {
        LocalDateTime from = week.systemFrom();
        LocalDateTime to = week.systemTo();
        return new WeeklyFlows(
                new Flow(reportRepository.countByCreatedAtGreaterThanEqualAndCreatedAtLessThan(from, to),
                        reportRepository.countByHandledAtGreaterThanEqualAndHandledAtLessThan(from, to)),
                new Flow(federationInquiryRepository.countByCreatedAtGreaterThanEqualAndCreatedAtLessThan(from, to),
                        federationInquiryRepository.countHandledBetween(from, to)),
                new Flow(facilityBookingRepository.countByCreatedAtGreaterThanEqualAndCreatedAtLessThan(from, to),
                        // decided_at 만 now(seoulClock) 으로 기록하는 seoul regime — KST 벽시계 경계(운영 9시간 밀림 방지).
                        facilityBookingRepository.countByDecidedAtGreaterThanEqualAndDecidedAtLessThan(
                                week.seoulFrom(), week.seoulTo())),
                new Flow(promotionRequestRepository.countByCreatedAtGreaterThanEqualAndCreatedAtLessThan(from, to),
                        promotionRequestRepository.countByHandledAtGreaterThanEqualAndHandledAtLessThan(from, to)),
                new Flow(leaderSuccessionRequestRepository.countByCreatedAtGreaterThanEqualAndCreatedAtLessThan(from, to),
                        leaderSuccessionRequestRepository.countByHandledAtGreaterThanEqualAndHandledAtLessThan(from, to)));
    }

    private FirstAnswer firstAnswer(WeekBounds week) {
        long answerCount = federationInquiryRepository.countByAnsweredAtGreaterThanEqualAndAnsweredAtLessThan(
                week.systemFrom(), week.systemTo());
        if (answerCount == 0) {
            return new FirstAnswer(0, null);
        }
        Double averageMinutes = federationInquiryRepository.averageFirstAnswerMinutes(week.systemFrom(), week.systemTo());
        return new FirstAnswer(answerCount, averageMinutes == null ? null : Math.round(averageMinutes));
    }

    private RecruitmentActivity recruitmentActivity(WeekBounds week) {
        return new RecruitmentActivity(
                recruitmentRepository.countByCreatedAtGreaterThanEqualAndCreatedAtLessThan(week.systemFrom(), week.systemTo()),
                // end_date 는 KST 날짜 열 — 월~일 양끝 포함.
                recruitmentRepository.countByEndDateBetween(week.firstDay(), week.lastDay()),
                applicationRepository.countByCreatedAtGreaterThanEqualAndCreatedAtLessThan(week.systemFrom(), week.systemTo()));
    }

    private FeeActivity feeActivity(WeekBounds week) {
        LocalDateTime from = week.systemFrom();
        LocalDateTime to = week.systemTo();
        return new FeeActivity(
                feeBillRepository.countByStatusNotAndCreatedAtGreaterThanEqualAndCreatedAtLessThan(FeeStatus.CANCELLED, from, to),
                adminFeeAuditQueryRepository.countBilledClubs(from, to),
                paymentRepository.countByCreatedAtGreaterThanEqualAndCreatedAtLessThan(from, to),
                // voided_at 은 Instant 로 기록한다(V112) — 절대 시각 경계.
                paymentRepository.countByVoidedAtGreaterThanEqualAndVoidedAtLessThan(week.instantFrom(), week.instantTo()),
                clubAuditEventRepository.countDistinctClubsBetween(ClubAuditEventType.feeAccountChangeTypes(), from, to));
    }

    /** 합계는 다시 더하지 않고 기록된 값을 쓴다 — 홈 처리 대기 추이 막대(그날 total_pending_count)와 같은 숫자여야 한다. */
    private static AdminPendingCountsQuery toPendingCounts(AdminPendingSnapshot snapshot) {
        return new AdminPendingCountsQuery(snapshot.getClubApproval(), snapshot.getFacilityBooking(),
                snapshot.getInquiryUnanswered(), snapshot.getPromotionRequest(), snapshot.getReportUnresolved(),
                snapshot.getLeaderSuccession(), snapshot.getStalePendingRecruitment(),
                snapshot.getInactiveClubPending(), snapshot.getTotalPendingCount());
    }
}
