package com.duing.domain.recruitment.stats.service;

import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.exception.RecruitmentException;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.recruitment.stats.repository.RecruitmentStatsRepositoryCustom;
import com.duing.domain.recruitment.stats.service.dto.query.StatsDailyPointQuery;
import com.duing.domain.recruitment.stats.service.dto.query.StatsFunnelQuery;
import com.duing.domain.recruitment.stats.service.dto.query.StatsSummaryQuery;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralRecruitmentStatsService implements RecruitmentStatsService {

    private final RecruitmentRepository recruitmentRepository;
    private final RecruitmentStatsRepositoryCustom recruitmentStatsRepository;
    private final ClubAuthService clubAuthService;
    private final Clock clock;

    @Override
    public StatsSummaryQuery getSummary(Long recruitmentId, Long currentUserId) {
        Recruitment recruitment = recruitmentRepository.findById(recruitmentId)
                .orElseThrow(RecruitmentException.RecruitmentNotFoundException::new);

        Long clubId = recruitment.getClub().getId();
        clubAuthService.requireManager(currentUserId, clubId);

        Map<ApplicationStatus, Long> statusCountMap =
                recruitmentStatsRepository.findSummaryByRecruitmentId(recruitmentId);

        long submitted = statusCountMap.getOrDefault(ApplicationStatus.SUBMITTED, 0L);
        long onHold = statusCountMap.getOrDefault(ApplicationStatus.ON_HOLD, 0L);
        long interviewPending = statusCountMap.getOrDefault(ApplicationStatus.INTERVIEW_PENDING, 0L);
        long accepted = statusCountMap.getOrDefault(ApplicationStatus.ACCEPTED, 0L);
        long rejected = statusCountMap.getOrDefault(ApplicationStatus.REJECTED, 0L);

        return StatsSummaryQuery.of(submitted, onHold, interviewPending, accepted, rejected, recruitment.getCapacity());
    }

    @Override
    public List<StatsDailyPointQuery> getDaily(Long recruitmentId, Long currentUserId) {
        Recruitment recruitment = recruitmentRepository.findById(recruitmentId)
                .orElseThrow(RecruitmentException.RecruitmentNotFoundException::new);

        Long clubId = recruitment.getClub().getId();
        clubAuthService.requireManager(currentUserId, clubId);

        LocalDate startDate = recruitment.getStartDate();
        // 상시모집(endDate=null)은 종료일이 없으므로 구간의 끝을 따로 정해야 한다. 마감된 뒤에는
        // 마감 시각까지만 그린다 — 오늘로 두면 마감 후에도 0 인 점이 매일 하나씩 붙어 차트가 무한히
        // 길어지고, 실제 모집 기간이 그래프 왼쪽 끝으로 밀려난다. 종료 스탬프가 없는 레거시 마감 건은
        // 기준을 알 수 없으므로 지금까지처럼 오늘까지 그린다.
        LocalDate effectiveEndDate = recruitment.getEndDate() != null
                ? recruitment.getEndDate()
                : alwaysOpenEndDate(recruitment);

        Map<LocalDate, Long> dailySubmissionCounts =
                recruitmentStatsRepository.findDailySubmissionCounts(recruitmentId, startDate, effectiveEndDate);

        List<StatsDailyPointQuery> paddedDays = new ArrayList<>();
        for (LocalDate paddingDate = startDate; !paddingDate.isAfter(effectiveEndDate); paddingDate = paddingDate.plusDays(1)) {
            long submittedCount = dailySubmissionCounts.getOrDefault(paddingDate, 0L);
            paddedDays.add(new StatsDailyPointQuery(paddingDate, submittedCount));
        }
        return paddedDays;
    }

    /** 상시모집의 구간 끝 — 마감됐고 종료 시각이 남아 있으면 그 날짜, 아니면 오늘(KST). */
    private LocalDate alwaysOpenEndDate(Recruitment recruitment) {
        LocalDateTime closedAt = recruitment.getClosedAt();
        return closedAt != null ? closedAt.toLocalDate() : LocalDate.now(clock);
    }

    @Override
    public StatsFunnelQuery getFunnel(Long recruitmentId, Long currentUserId) {
        Recruitment recruitment = recruitmentRepository.findById(recruitmentId)
                .orElseThrow(RecruitmentException.RecruitmentNotFoundException::new);

        Long clubId = recruitment.getClub().getId();
        clubAuthService.requireManager(currentUserId, clubId);

        Map<ApplicationStatus, Long> applicationStatusCounts =
                recruitmentStatsRepository.findSummaryByRecruitmentId(recruitmentId);

        return StatsFunnelQuery.from(applicationStatusCounts, recruitment.isUseInterview());
    }
}
