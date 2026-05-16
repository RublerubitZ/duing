package com.duing.domain.recruitment.stats.service;

import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.exception.RecruitmentException;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.recruitment.stats.repository.RecruitmentStatsRepositoryCustom;
import com.duing.domain.recruitment.stats.service.dto.query.StatsSummaryQuery;
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

    @Override
    public StatsSummaryQuery getSummary(Long recruitmentId, Long currentUserId) {
        Recruitment recruitment = recruitmentRepository.findById(recruitmentId)
                .orElseThrow(RecruitmentException.RecruitmentNotFoundException::new);

        Long clubId = recruitment.getClub().getId();
        clubAuthService.requireManager(currentUserId, clubId);

        Map<ApplicationStatus, Long> statusCountMap =
                recruitmentStatsRepository.findSummaryByRecruitmentId(recruitmentId);

        long submitted = statusCountMap.getOrDefault(ApplicationStatus.SUBMITTED, 0L);
        long underReview = statusCountMap.getOrDefault(ApplicationStatus.UNDER_REVIEW, 0L);
        long interviewPending = statusCountMap.getOrDefault(ApplicationStatus.INTERVIEW_PENDING, 0L);
        long accepted = statusCountMap.getOrDefault(ApplicationStatus.ACCEPTED, 0L);
        long rejected = statusCountMap.getOrDefault(ApplicationStatus.REJECTED, 0L);

        return StatsSummaryQuery.of(submitted, underReview, interviewPending, accepted, rejected, recruitment.getCapacity());
    }
}