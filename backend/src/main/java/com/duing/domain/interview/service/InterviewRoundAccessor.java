package com.duing.domain.interview.service;

import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.domain.interview.entity.InterviewRound;
import com.duing.domain.interview.exception.InterviewException;
import com.duing.domain.interview.repository.InterviewRoundRepository;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.exception.RecruitmentException;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.recruitment.service.ClosedRecruitmentPolicy;
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

    /**
     * 조회용 — 권한만 본다. 마감된 모집의 라운드도 열람은 계속 허용한다(아카이브).
     */
    public void requireManager(InterviewRound round, Long currentUserId) {
        clubAuthService.requireManager(currentUserId, resolveRecruitment(round).getClub().getId());
    }

    /**
     * 쓰기용 — 권한 + 모집 마감 여부를 함께 본다.
     *
     * <p>마감된 모집에서 허용되는 유일한 쓰기는 남은 지원서의 최종 결과 확정이고, 면접 라운드 운영은
     * 거기 포함되지 않는다. 가드가 없으면 마감 후에도 일정을 바꾸고 라운드를 확정해 <b>학생에게 면접
     * 알림이 계속 나간다</b> — 정작 그 면접 결과를 반영하려는 순간에야 막히던 모순을 없앤다.
     */
    public void requireManagerForWrite(InterviewRound round, Long currentUserId) {
        Recruitment recruitment = resolveRecruitment(round);
        clubAuthService.requireManager(currentUserId, recruitment.getClub().getId());
        ClosedRecruitmentPolicy.requireOpen(recruitment);
    }

    /** 쓰기 경로에서 라운드 조회까지 함께 하는 진입점. */
    public InterviewRound getForWrite(Long roundId, Long currentUserId) {
        InterviewRound round = interviewRoundRepository.findById(roundId)
                .orElseThrow(InterviewException.RoundNotFound::new);
        requireManagerForWrite(round, currentUserId);
        return round;
    }

    private Recruitment resolveRecruitment(InterviewRound round) {
        return recruitmentRepository.findById(round.getRecruitmentId())
                .orElseThrow(RecruitmentException.RecruitmentNotFoundException::new);
    }
}
