package com.duing.domain.recruitment.stats.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.duing.domain.club.entity.Club;
import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.exception.RecruitmentException;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.recruitment.stats.repository.RecruitmentStatsRepositoryCustom;
import com.duing.domain.recruitment.stats.service.dto.query.StatsDailyPointQuery;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.security.access.AccessDeniedException;

class RecruitmentStatsDailyServiceTest {

    // 2025-03-09T15:00Z = 2025-03-10 00:00 KST — "오늘"을 KST 기준으로 고정한다
    private static final Clock FIXED_SEOUL_CLOCK =
            Clock.fixed(Instant.parse("2025-03-09T15:00:00Z"), ZoneId.of("Asia/Seoul"));

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
                FIXED_SEOUL_CLOCK
        );
    }

    private Recruitment mockRecruitmentWithPeriod(Long recruitmentId, Long clubId, LocalDate startDate, LocalDate endDate) {
        Club club = mock(Club.class);
        when(club.getId()).thenReturn(clubId);

        Recruitment recruitment = mock(Recruitment.class);
        when(recruitment.getId()).thenReturn(recruitmentId);
        when(recruitment.getClub()).thenReturn(club);
        when(recruitment.getStartDate()).thenReturn(startDate);
        when(recruitment.getEndDate()).thenReturn(endDate);

        when(recruitmentRepository.findById(recruitmentId)).thenReturn(Optional.of(recruitment));
        return recruitment;
    }

    @Test
    @DisplayName("3월 1·3일에만 지원이 있고 모집 기간이 [3월 1일, 3월 5일]이면 길이 5의 리스트가 반환되고 누락된 날은 0으로 padding된다")
    void dailyResultIsPaddedForMissingDates() {
        Long recruitmentId = 1L;
        Long clubId = 10L;
        Long currentUserId = 100L;

        LocalDate startDate = LocalDate.of(2025, 3, 1);
        LocalDate endDate = LocalDate.of(2025, 3, 5);
        mockRecruitmentWithPeriod(recruitmentId, clubId, startDate, endDate);

        Map<LocalDate, Long> dailySubmissionCounts = new HashMap<>();
        dailySubmissionCounts.put(LocalDate.of(2025, 3, 1), 2L);
        dailySubmissionCounts.put(LocalDate.of(2025, 3, 3), 1L);
        when(recruitmentStatsRepository.findDailySubmissionCounts(recruitmentId, startDate, endDate))
                .thenReturn(dailySubmissionCounts);

        List<StatsDailyPointQuery> result = recruitmentStatsService.getDaily(recruitmentId, currentUserId);

        assertThat(result).hasSize(5);
        assertThat(result.get(0).date()).isEqualTo(LocalDate.of(2025, 3, 1));
        assertThat(result.get(0).submittedCount()).isEqualTo(2L);
        assertThat(result.get(1).date()).isEqualTo(LocalDate.of(2025, 3, 2));
        assertThat(result.get(1).submittedCount()).isEqualTo(0L);
        assertThat(result.get(2).date()).isEqualTo(LocalDate.of(2025, 3, 3));
        assertThat(result.get(2).submittedCount()).isEqualTo(1L);
        assertThat(result.get(3).date()).isEqualTo(LocalDate.of(2025, 3, 4));
        assertThat(result.get(3).submittedCount()).isEqualTo(0L);
        assertThat(result.get(4).date()).isEqualTo(LocalDate.of(2025, 3, 5));
        assertThat(result.get(4).submittedCount()).isEqualTo(0L);
    }

    @Test
    @DisplayName("레포지터리가 빈 결과를 반환하면 모집 기간 전체 길이의 0으로 채워진 리스트가 반환된다")
    void emptyRepositoryResultReturnsFullyZeroPaddedList() {
        Long recruitmentId = 2L;
        Long clubId = 10L;
        Long currentUserId = 100L;

        LocalDate startDate = LocalDate.of(2025, 4, 1);
        LocalDate endDate = LocalDate.of(2025, 4, 7);
        mockRecruitmentWithPeriod(recruitmentId, clubId, startDate, endDate);

        when(recruitmentStatsRepository.findDailySubmissionCounts(recruitmentId, startDate, endDate))
                .thenReturn(new HashMap<>());

        List<StatsDailyPointQuery> result = recruitmentStatsService.getDaily(recruitmentId, currentUserId);

        assertThat(result).hasSize(7);
        result.forEach(dailyPoint -> assertThat(dailyPoint.submittedCount()).isEqualTo(0L));
        assertThat(result.get(0).date()).isEqualTo(startDate);
        assertThat(result.get(6).date()).isEqualTo(endDate);
    }

    @Test
    @DisplayName("상시모집(종료일 없음)은 시작일부터 오늘(KST)까지 0으로 padding된 일별 통계가 반환된다")
    void alwaysOpenRecruitmentIsPaddedFromStartDateToToday() {
        Long recruitmentId = 5L;
        Long clubId = 10L;
        Long currentUserId = 100L;

        LocalDate today = LocalDate.now(FIXED_SEOUL_CLOCK);
        LocalDate startDate = today.minusDays(4);
        mockRecruitmentWithPeriod(recruitmentId, clubId, startDate, null);

        Map<LocalDate, Long> dailySubmissionCounts = new HashMap<>();
        dailySubmissionCounts.put(startDate, 3L);
        when(recruitmentStatsRepository.findDailySubmissionCounts(recruitmentId, startDate, today))
                .thenReturn(dailySubmissionCounts);

        List<StatsDailyPointQuery> result = recruitmentStatsService.getDaily(recruitmentId, currentUserId);

        assertThat(result).hasSize(5);
        assertThat(result.get(0).date()).isEqualTo(startDate);
        assertThat(result.get(0).submittedCount()).isEqualTo(3L);
        assertThat(result.get(4).date()).isEqualTo(today);
        assertThat(result.get(4).submittedCount()).isEqualTo(0L);
    }

    @Test
    @DisplayName("마감된 상시모집은 마감일까지만 그려지고 마감 후 날짜가 계속 붙지 않는다")
    void closedAlwaysOpenRecruitmentStopsAtClosedDate() {
        Long recruitmentId = 6L;
        Long clubId = 10L;
        Long currentUserId = 100L;

        LocalDate today = LocalDate.now(FIXED_SEOUL_CLOCK);
        LocalDate startDate = today.minusDays(10);
        LocalDate closedDate = today.minusDays(8);
        Recruitment recruitment = mockRecruitmentWithPeriod(recruitmentId, clubId, startDate, null);
        when(recruitment.getClosedAt()).thenReturn(closedDate.atTime(18, 0));

        when(recruitmentStatsRepository.findDailySubmissionCounts(recruitmentId, startDate, closedDate))
                .thenReturn(Map.of(startDate, 2L));

        List<StatsDailyPointQuery> result = recruitmentStatsService.getDaily(recruitmentId, currentUserId);

        // 마감일 기준이 아니라 오늘 기준으로 그리면 마감 후 매일 0 인 점이 하나씩 늘어 차트가 무한히 길어진다.
        assertThat(result).hasSize(3);
        assertThat(result.get(result.size() - 1).date()).isEqualTo(closedDate);
    }

    @Test
    @DisplayName("종료 시각이 남지 않은 레거시 마감 상시모집은 지금까지처럼 오늘까지 그린다")
    void closedAlwaysOpenWithoutStampFallsBackToToday() {
        Long recruitmentId = 7L;
        Long clubId = 10L;
        Long currentUserId = 100L;

        LocalDate today = LocalDate.now(FIXED_SEOUL_CLOCK);
        LocalDate startDate = today.minusDays(2);
        Recruitment recruitment = mockRecruitmentWithPeriod(recruitmentId, clubId, startDate, null);
        when(recruitment.getClosedAt()).thenReturn(null);

        when(recruitmentStatsRepository.findDailySubmissionCounts(recruitmentId, startDate, today))
                .thenReturn(Map.of());

        assertThat(recruitmentStatsService.getDaily(recruitmentId, currentUserId)).hasSize(3);
    }

    @Test
    @DisplayName("존재하지 않는 모집 ID로 일별 통계를 조회하면 RecruitmentNotFoundException이 발생한다")
    void nonExistentRecruitmentThrowsNotFoundException() {
        Long nonExistentRecruitmentId = 9999L;
        Long currentUserId = 100L;

        when(recruitmentRepository.findById(nonExistentRecruitmentId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> recruitmentStatsService.getDaily(nonExistentRecruitmentId, currentUserId))
                .isInstanceOf(RecruitmentException.RecruitmentNotFoundException.class);
    }

    @Test
    @DisplayName("다른 동아리의 운영진이 일별 통계를 조회하면 AccessDeniedException이 발생한다")
    void differentClubManagerThrowsAccessDeniedException() {
        Long recruitmentId = 3L;
        Long clubId = 10L;
        Long outsiderUserId = 999L;

        LocalDate startDate = LocalDate.of(2025, 3, 1);
        LocalDate endDate = LocalDate.of(2025, 3, 5);
        mockRecruitmentWithPeriod(recruitmentId, clubId, startDate, endDate);

        doThrow(new AccessDeniedException("해당 동아리의 운영진(LEADER/OFFICER)만 가능한 작업입니다."))
                .when(clubAuthService).requireManager(outsiderUserId, clubId);

        assertThatThrownBy(() -> recruitmentStatsService.getDaily(recruitmentId, outsiderUserId))
                .isInstanceOf(AccessDeniedException.class);
    }
}
