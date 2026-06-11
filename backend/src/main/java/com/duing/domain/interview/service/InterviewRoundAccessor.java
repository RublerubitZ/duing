package com.duing.domain.interview.service;

import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.domain.interview.entity.InterviewRound;
import com.duing.domain.interview.exception.InterviewException;
import com.duing.domain.interview.repository.InterviewRoundRepository;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.exception.RecruitmentException;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * 라운드 조회 + 운영진 권한 검증 헬퍼 — 3번째 사용처(배정 서비스)가 생겨 rule of three 로 추출.
 * 잠금 조회가 필요한 경로는 직접 잠금 조회 후 {@link #requireManager} 만 사용한다.
 */
@Component
@RequiredArgsConstructor
public class InterviewRoundAccessor {

    private final InterviewRoundRepository interviewRoundRepository;
    private final RecruitmentRepository recruitmentRepository;
    private final ClubAuthService clubAuthService;

    public InterviewRound getWithManagerAuth(Long roundId, Long currentUserId) {
        InterviewRound round = interviewRoundRepository.findById(roundId)
                .orElseThrow(InterviewException.RoundNotFound::new);
        requireManager(round, currentUserId);
        return round;
    }

    public void requireManager(InterviewRound round, Long currentUserId) {
        Recruitment recruitment = recruitmentRepository.findById(round.getRecruitmentId())
                .orElseThrow(RecruitmentException.RecruitmentNotFoundException::new);
        clubAuthService.requireManager(currentUserId, recruitment.getClub().getId());
    }
}
