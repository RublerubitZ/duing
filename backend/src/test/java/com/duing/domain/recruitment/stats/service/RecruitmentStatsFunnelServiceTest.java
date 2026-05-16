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
import com.duing.domain.recruitment.stats.service.dto.query.StatsFunnelQuery;
import java.util.EnumMap;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.security.access.AccessDeniedException;

class RecruitmentStatsFunnelServiceTest {

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
                clubAuthService
        );
    }

    private Recruitment mockRecruitment(Long recruitmentId, Long clubId, boolean useInterview) {
        Club club = mock(Club.class);
        when(club.getId()).thenReturn(clubId);

        Recruitment recruitment = mock(Recruitment.class);
        when(recruitment.getId()).thenReturn(recruitmentId);
        when(recruitment.getClub()).thenReturn(club);
        when(recruitment.isUseInterview()).thenReturn(useInterview);

        when(recruitmentRepository.findById(recruitmentId)).thenReturn(Optional.of(recruitment));
        return recruitment;
    }

    private Map<ApplicationStatus, Long> buildStatusMap(
            long submitted, long underReview, long interviewPending, long accepted, long rejected) {
        Map<ApplicationStatus, Long> applicationStatusCounts = new EnumMap<>(ApplicationStatus.class);
        if (submitted > 0) applicationStatusCounts.put(ApplicationStatus.SUBMITTED, submitted);
        if (underReview > 0) applicationStatusCounts.put(ApplicationStatus.UNDER_REVIEW, underReview);
        if (interviewPending > 0) applicationStatusCounts.put(ApplicationStatus.INTERVIEW_PENDING, interviewPending);
        if (accepted > 0) applicationStatusCounts.put(ApplicationStatus.ACCEPTED, accepted);
        if (rejected > 0) applicationStatusCounts.put(ApplicationStatus.REJECTED, rejected);
        return applicationStatusCounts;
    }

    @Test
    @DisplayName("useInterview=true 인 모집에서 상태 분포가 있을 때 4단계 카운트가 정확하게 계산된다")
    void useInterviewTrueRecruitmentReturns4StageFunnelCorrectly() {
        Long recruitmentId = 1L;
        Long clubId = 10L;
        Long currentUserId = 100L;

        mockRecruitment(recruitmentId, clubId, true);
        // submitted=5, underReview=3, interviewPending=2, accepted=1, rejected=1
        Map<ApplicationStatus, Long> applicationStatusCounts = buildStatusMap(5, 3, 2, 1, 1);
        when(recruitmentStatsRepository.findSummaryByRecruitmentId(recruitmentId)).thenReturn(applicationStatusCounts);

        StatsFunnelQuery statsFunnelQuery = recruitmentStatsService.getFunnel(recruitmentId, currentUserId);

        assertThat(statsFunnelQuery.submitted()).isEqualTo(12L);           // 5+3+2+1+1
        assertThat(statsFunnelQuery.documentPassed()).isEqualTo(7L);       // 12-5
        assertThat(statsFunnelQuery.interviewEntered()).isEqualTo(4L);     // 2+1+1
        assertThat(statsFunnelQuery.accepted()).isEqualTo(1L);
    }

    @Test
    @DisplayName("useInterview=false 인 모집의 funnel 은 interviewEntered 가 null 이고 나머지 3단계 카운트는 정확하다")
    void useInterviewFalseRecruitmentReturnsNullForInterviewEntered() {
        Long recruitmentId = 2L;
        Long clubId = 10L;
        Long currentUserId = 100L;

        mockRecruitment(recruitmentId, clubId, false);
        // submitted=4, underReview=2, accepted=2, rejected=1 (면접 없으므로 interviewPending=0)
        Map<ApplicationStatus, Long> applicationStatusCounts = buildStatusMap(4, 2, 0, 2, 1);
        when(recruitmentStatsRepository.findSummaryByRecruitmentId(recruitmentId)).thenReturn(applicationStatusCounts);

        StatsFunnelQuery statsFunnelQuery = recruitmentStatsService.getFunnel(recruitmentId, currentUserId);

        assertThat(statsFunnelQuery.submitted()).isEqualTo(9L);            // 4+2+0+2+1
        assertThat(statsFunnelQuery.documentPassed()).isEqualTo(5L);       // 9-4
        assertThat(statsFunnelQuery.interviewEntered()).isNull();
        assertThat(statsFunnelQuery.accepted()).isEqualTo(2L);
    }

    @Test
    @DisplayName("지원이 0건인 모집의 funnel 은 useInterview=true 면 모든 단계가 0 이고, useInterview=false 면 interviewEntered 가 null 이다")
    void zeroApplicationsReturnsAllZerosOrNullDependingOnUseInterview() {
        Long recruitmentIdWithInterview = 3L;
        Long recruitmentIdWithoutInterview = 4L;
        Long clubId = 10L;
        Long currentUserId = 100L;

        mockRecruitment(recruitmentIdWithInterview, clubId, true);
        mockRecruitment(recruitmentIdWithoutInterview, clubId, false);

        Map<ApplicationStatus, Long> emptyApplicationStatusCounts = new EnumMap<>(ApplicationStatus.class);
        when(recruitmentStatsRepository.findSummaryByRecruitmentId(recruitmentIdWithInterview))
                .thenReturn(emptyApplicationStatusCounts);
        when(recruitmentStatsRepository.findSummaryByRecruitmentId(recruitmentIdWithoutInterview))
                .thenReturn(new EnumMap<>(ApplicationStatus.class));

        StatsFunnelQuery funnelWithInterview = recruitmentStatsService.getFunnel(recruitmentIdWithInterview, currentUserId);
        StatsFunnelQuery funnelWithoutInterview = recruitmentStatsService.getFunnel(recruitmentIdWithoutInterview, currentUserId);

        assertThat(funnelWithInterview.submitted()).isEqualTo(0L);
        assertThat(funnelWithInterview.documentPassed()).isEqualTo(0L);
        assertThat(funnelWithInterview.interviewEntered()).isEqualTo(0L);
        assertThat(funnelWithInterview.accepted()).isEqualTo(0L);

        assertThat(funnelWithoutInterview.submitted()).isEqualTo(0L);
        assertThat(funnelWithoutInterview.documentPassed()).isEqualTo(0L);
        assertThat(funnelWithoutInterview.interviewEntered()).isNull();
        assertThat(funnelWithoutInterview.accepted()).isEqualTo(0L);
    }

    @Test
    @DisplayName("SUBMITTED 가 5건이고 나머지 상태가 0건이면 submitted=5, documentPassed=0, accepted=0 이다")
    void onlySubmittedApplicationsShowsZeroDocumentPassedAndZeroAccepted() {
        Long recruitmentId = 5L;
        Long clubId = 10L;
        Long currentUserId = 100L;

        mockRecruitment(recruitmentId, clubId, true);
        Map<ApplicationStatus, Long> applicationStatusCounts = new EnumMap<>(ApplicationStatus.class);
        applicationStatusCounts.put(ApplicationStatus.SUBMITTED, 5L);
        when(recruitmentStatsRepository.findSummaryByRecruitmentId(recruitmentId)).thenReturn(applicationStatusCounts);

        StatsFunnelQuery statsFunnelQuery = recruitmentStatsService.getFunnel(recruitmentId, currentUserId);

        assertThat(statsFunnelQuery.submitted()).isEqualTo(5L);
        assertThat(statsFunnelQuery.documentPassed()).isEqualTo(0L);
        assertThat(statsFunnelQuery.interviewEntered()).isEqualTo(0L);
        assertThat(statsFunnelQuery.accepted()).isEqualTo(0L);
    }

    @Test
    @DisplayName("다른 동아리의 운영진이 funnel 을 조회하면 AccessDeniedException 이 발생한다")
    void differentClubManagerThrowsAccessDeniedException() {
        Long recruitmentId = 6L;
        Long clubId = 10L;
        Long outsiderUserId = 999L;

        mockRecruitment(recruitmentId, clubId, true);
        doThrow(new AccessDeniedException("해당 동아리의 운영진(LEADER/OFFICER)만 가능한 작업입니다."))
                .when(clubAuthService).requireManager(outsiderUserId, clubId);

        assertThatThrownBy(() -> recruitmentStatsService.getFunnel(recruitmentId, outsiderUserId))
                .isInstanceOf(AccessDeniedException.class);
    }

    @Test
    @DisplayName("존재하지 않는 모집 ID 로 funnel 을 조회하면 RecruitmentNotFoundException 이 발생한다")
    void nonExistentRecruitmentThrowsNotFoundException() {
        Long nonExistentRecruitmentId = 9999L;
        Long currentUserId = 100L;

        when(recruitmentRepository.findById(nonExistentRecruitmentId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> recruitmentStatsService.getFunnel(nonExistentRecruitmentId, currentUserId))
                .isInstanceOf(RecruitmentException.RecruitmentNotFoundException.class);
    }
}