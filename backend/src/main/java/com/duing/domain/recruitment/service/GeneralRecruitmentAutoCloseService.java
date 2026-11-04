package com.duing.domain.recruitment.service;

import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.interview.entity.RoundStatus;
import com.duing.domain.interview.repository.InterviewRoundRepository;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.global.frontend.event.ClubPublicPageChangedEvent;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * {@link RecruitmentAutoCloseService} 구현 — 마감 조건은 인터페이스에 있다.
 *
 * <p>잠금: 모집 행 잠금({@code findByIdForUpdate})을 트랜잭션의 첫 조회로 잡고, 지원·라운드는 잠금 없이 읽는다.
 * 이 트랜잭션은 모집 행 말고는 잠금을 잡지 않으므로 다른 쓰기 경로와 잠금 사이클이 생기지 않고, 라운드 생성·수동 마감·
 * 삭제와는 모집 행 잠금으로 직렬화된다.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralRecruitmentAutoCloseService implements RecruitmentAutoCloseService {

    private final RecruitmentRepository recruitmentRepository;
    private final ApplicationRepository applicationRepository;
    private final InterviewRoundRepository interviewRoundRepository;
    private final ApplicationEventPublisher eventPublisher;
    private final Clock clock;

    @Override
    public List<Long> findCandidateIds() {
        return recruitmentRepository.findOpenIdsEndedBefore(
                RecruitmentAutoClosePolicy.endedBefore(LocalDate.now(clock)));
    }

    @Override
    @Transactional
    public boolean closeIfSettled(Long recruitmentId) {
        // 첫 조회가 잠금이어야 한다 — 무잠금 선조회가 1차 캐시에 올라가면 잠금 조회가 그 stale 스냅샷을 돌려준다.
        Recruitment recruitment = recruitmentRepository.findByIdForUpdate(recruitmentId).orElse(null);
        if (recruitment == null || !isSettled(recruitment)) {
            return false;
        }
        recruitment.close(LocalDateTime.now(clock));
        // 트랜잭션 안에서 발행한다 — 리스너가 AFTER_COMMIT·fallbackExecution=false 라 밖에서 내면 버려진다.
        eventPublisher.publishEvent(new ClubPublicPageChangedEvent(recruitment.getClub().getId()));
        return true;
    }

    private boolean isSettled(Recruitment recruitment) {
        LocalDate endedBefore = RecruitmentAutoClosePolicy.endedBefore(LocalDate.now(clock));
        return recruitment.getStatus() == RecruitmentStatus.OPEN
                && recruitment.getEndDate() != null
                && recruitment.getEndDate().isBefore(endedBefore)
                && !applicationRepository.existsByRecruitmentIdAndStatusIn(
                        recruitment.getId(), ApplicationStatus.activeSet())
                && !interviewRoundRepository.existsByRecruitmentIdAndStatusIn(
                        recruitment.getId(), RoundStatus.inProgressSet());
    }
}
