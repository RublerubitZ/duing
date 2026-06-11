package com.duing.domain.interview.service;

import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.domain.interview.exception.InterviewException;
import com.duing.domain.interview.repository.InterviewRoundMemberRepository;
import com.duing.domain.interview.service.dto.query.RoundCandidateQuery;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.exception.RecruitmentException;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralInterviewRoundService implements InterviewRoundService {

    private final RecruitmentRepository recruitmentRepository;
    private final ClubAuthService clubAuthService;
    private final InterviewRoundMemberRepository interviewRoundMemberRepository;

    @Override
    public List<RoundCandidateQuery> getRoundCandidates(Long recruitmentId, Long currentUserId,
                                                        boolean includeUnderReview) {
        Recruitment recruitment = recruitmentRepository.findById(recruitmentId)
                .orElseThrow(RecruitmentException.RecruitmentNotFoundException::new);
        clubAuthService.requireManager(currentUserId, recruitment.getClub().getId());

        if (!recruitment.isUseInterview()) {
            throw new InterviewException.InterviewNotUsed();
        }

        return interviewRoundMemberRepository.findRoundCandidates(recruitmentId, includeUnderReview).stream()
                .map(RoundCandidateQuery::from)
                .toList();
    }
}
