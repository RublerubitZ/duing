package com.duing.domain.recruitment.stats.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.club.entity.Club;
import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.exception.RecruitmentException;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.recruitment.stats.repository.RecruitmentStatsRepositoryCustom;
import com.duing.domain.recruitment.stats.service.dto.query.StatsSummaryQuery;
import java.time.Clock;
import java.util.EnumMap;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.security.access.AccessDeniedException;

class RecruitmentStatsSummaryServiceTest {

    private RecruitmentRepository recruitmentRepository;
    private RecruitmentStatsRepositoryCustom recruitmentStatsRepository;
    private ClubAuthService clubAuthService;
    private GeneralRecruitmentStatsService recruitmentStatsService;

    @BeforeEach
    void setUp() {
        recruitmentRepository = mock(RecruitmentRepository.class);
        recruitmentStatsRepository = mock(RecruitmentStatsRepositoryCustom.class);
        clubAuthService = mock(ClubAuthService.class);
        recruitmentStatsService = new GeneralRecruitmentStatsService(
                recruitmentRepository,
                recruitmentStatsRepository,
                clubAuthService,
                Clock.systemDefaultZone()
        );
    }

    private Recruitment mockRecruitmentWithCapacity(Long recruitmentId, Long clubId, int capacity) {
        Club club = mock(Club.class);
        when(club.getId()).thenReturn(clubId);

        Recruitment recruitment = mock(Recruitment.class);
        when(recruitment.getId()).thenReturn(recruitmentId);
        when(recruitment.getClub()).thenReturn(club);
        when(recruitment.getCapacity()).thenReturn(capacity);

        when(recruitmentRepository.findById(recruitmentId)).thenReturn(Optional.of(recruitment));
        return recruitment;
    }

    private Map<ApplicationStatus, Long> buildStatusMap(
            long submitted, long onHold, long interviewPending, long accepted, long rejected) {
        Map<ApplicationStatus, Long> statusCountMap = new EnumMap<>(ApplicationStatus.class);
        if (submitted > 0) statusCountMap.put(ApplicationStatus.SUBMITTED, submitted);
        if (onHold > 0) statusCountMap.put(ApplicationStatus.ON_HOLD, onHold);
        if (interviewPending > 0) statusCountMap.put(ApplicationStatus.INTERVIEW_PENDING, interviewPending);
        if (accepted > 0) statusCountMap.put(ApplicationStatus.ACCEPTED, accepted);
        if (rejected > 0) statusCountMap.put(ApplicationStatus.REJECTED, rejected);
        return statusCountMap;
    }

    @Test
    @DisplayName("상태별 분포가 정확히 매핑된다 — SUBMITTED=3, ON_HOLD=2, INTERVIEW_PENDING=1, ACCEPTED=1, REJECTED=1 이면 total=8")
    void statusDistributionIsMappedCorrectly() {
        Long recruitmentId = 1L;
        Long clubId = 10L;
        Long currentUserId = 100L;

        mockRecruitmentWithCapacity(recruitmentId, clubId, 10);
        Map<ApplicationStatus, Long> statusCountMap = buildStatusMap(3, 2, 1, 1, 1);
        when(recruitmentStatsRepository.findSummaryByRecruitmentId(recruitmentId)).thenReturn(statusCountMap);

        StatsSummaryQuery summary = recruitmentStatsService.getSummary(recruitmentId, currentUserId);

        assertThat(summary.total()).isEqualTo(8);
        assertThat(summary.submitted()).isEqualTo(3);
        assertThat(summary.onHold()).isEqualTo(2);
        assertThat(summary.interviewPending()).isEqualTo(1);
        assertThat(summary.accepted()).isEqualTo(1);
        assertThat(summary.rejected()).isEqualTo(1);
    }

    @Test
    @DisplayName("통계 요약의 전체 인원은 지원·보류·면접 대상·합격·불합격 상태 수의 합과 항상 같다")
    void summaryTotalEqualsSumOfAllStatusCounts() {
        Long recruitmentId = 7L;
        Long clubId = 10L;
        Long currentUserId = 100L;

        mockRecruitmentWithCapacity(recruitmentId, clubId, 10);
        Map<ApplicationStatus, Long> statusCountMap = buildStatusMap(2, 1, 1, 1, 1);
        when(recruitmentStatsRepository.findSummaryByRecruitmentId(recruitmentId)).thenReturn(statusCountMap);

        StatsSummaryQuery summary = recruitmentStatsService.getSummary(recruitmentId, currentUserId);

        assertThat(summary.total()).isEqualTo(6);
        assertThat(summary.total()).isEqualTo(
                summary.submitted() + summary.onHold() + summary.interviewPending()
                        + summary.accepted() + summary.rejected());
    }

    @Test
    @DisplayName("지원이 하나도 없는 모집의 summary 는 모든 칸이 0 이고 total=0, ratio=0.0 이다")
    void emptyRecruitmentReturnsAllZeros() {
        Long recruitmentId = 2L;
        Long clubId = 10L;
        Long currentUserId = 100L;

        mockRecruitmentWithCapacity(recruitmentId, clubId, 5);
        when(recruitmentStatsRepository.findSummaryByRecruitmentId(recruitmentId))
                .thenReturn(new EnumMap<>(ApplicationStatus.class));

        StatsSummaryQuery summary = recruitmentStatsService.getSummary(recruitmentId, currentUserId);

        assertThat(summary.total()).isEqualTo(0);
        assertThat(summary.submitted()).isEqualTo(0);
        assertThat(summary.onHold()).isEqualTo(0);
        assertThat(summary.interviewPending()).isEqualTo(0);
        assertThat(summary.accepted()).isEqualTo(0);
        assertThat(summary.rejected()).isEqualTo(0);
        assertThat(summary.ratio()).isEqualTo(0.0);
    }

    @Test
    @DisplayName("capacity=10, accepted=3 이면 ratio=0.3 이다")
    void ratioIsCalculatedCorrectly() {
        Long recruitmentId = 3L;
        Long clubId = 10L;
        Long currentUserId = 100L;

        mockRecruitmentWithCapacity(recruitmentId, clubId, 10);
        Map<ApplicationStatus, Long> statusCountMap = new EnumMap<>(ApplicationStatus.class);
        statusCountMap.put(ApplicationStatus.ACCEPTED, 3L);
        when(recruitmentStatsRepository.findSummaryByRecruitmentId(recruitmentId)).thenReturn(statusCountMap);

        StatsSummaryQuery summary = recruitmentStatsService.getSummary(recruitmentId, currentUserId);

        assertThat(summary.capacity()).isEqualTo(10);
        assertThat(summary.accepted()).isEqualTo(3);
        assertThat(summary.ratio()).isEqualTo(0.3);
    }

    @Test
    @DisplayName("capacity=0 인 모집은 ratio=0.0 으로 반환되어 zero-division 을 방지한다")
    void capacityZeroReturnsRatioZero() {
        Long recruitmentId = 4L;
        Long clubId = 10L;
        Long currentUserId = 100L;

        mockRecruitmentWithCapacity(recruitmentId, clubId, 0);
        Map<ApplicationStatus, Long> statusCountMap = new EnumMap<>(ApplicationStatus.class);
        statusCountMap.put(ApplicationStatus.ACCEPTED, 3L);
        when(recruitmentStatsRepository.findSummaryByRecruitmentId(recruitmentId)).thenReturn(statusCountMap);

        StatsSummaryQuery summary = recruitmentStatsService.getSummary(recruitmentId, currentUserId);

        assertThat(summary.capacity()).isEqualTo(0);
        assertThat(summary.ratio()).isEqualTo(0.0);
    }

    @Test
    @DisplayName("soft-delete 된 지원서는 집계에서 제외된다 — 레포지토리가 deletedAt IS NULL 을 적용하여 정확한 카운트를 반환한다")
    void softDeletedApplicationsAreExcluded() {
        Long recruitmentId = 5L;
        Long clubId = 10L;
        Long currentUserId = 100L;

        mockRecruitmentWithCapacity(recruitmentId, clubId, 10);
        // 레포지토리는 deletedAt IS NULL 조건이 적용된 결과만 반환함 (2건 — soft-delete된 3건 제외)
        Map<ApplicationStatus, Long> statusCountMap = new EnumMap<>(ApplicationStatus.class);
        statusCountMap.put(ApplicationStatus.SUBMITTED, 2L);
        when(recruitmentStatsRepository.findSummaryByRecruitmentId(recruitmentId)).thenReturn(statusCountMap);

        StatsSummaryQuery summary = recruitmentStatsService.getSummary(recruitmentId, currentUserId);

        assertThat(summary.total()).isEqualTo(2);
        assertThat(summary.submitted()).isEqualTo(2);
    }

    @Test
    @DisplayName("다른 동아리의 운영진이 조회하면 AccessDeniedException 이 발생한다")
    void differentClubManagerThrowsAccessDeniedException() {
        Long recruitmentId = 6L;
        Long clubId = 10L;
        Long outsiderUserId = 999L;

        mockRecruitmentWithCapacity(recruitmentId, clubId, 5);
        doThrow(new AccessDeniedException("해당 동아리의 운영진(LEADER/OFFICER)만 가능한 작업입니다."))
                .when(clubAuthService).requireManager(outsiderUserId, clubId);

        assertThatThrownBy(() -> recruitmentStatsService.getSummary(recruitmentId, outsiderUserId))
                .isInstanceOf(AccessDeniedException.class);
    }

    @Test
    @DisplayName("존재하지 않는 모집 ID 로 조회하면 RecruitmentNotFoundException 이 발생한다")
    void nonExistentRecruitmentThrowsNotFoundException() {
        Long nonExistentRecruitmentId = 9999L;
        Long currentUserId = 100L;

        when(recruitmentRepository.findById(nonExistentRecruitmentId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> recruitmentStatsService.getSummary(nonExistentRecruitmentId, currentUserId))
                .isInstanceOf(RecruitmentException.RecruitmentNotFoundException.class);
    }
}
