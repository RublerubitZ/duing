package com.duing.domain.recruitment.service;

import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.interview.entity.RoundStatus;
import com.duing.domain.interview.repository.InterviewRoundRepository;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.repository.RecruitmentCountRow;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.recruitment.service.dto.query.AutoCloseOutlookQuery;
import com.duing.global.frontend.event.ClubPublicPageChangedEvent;
import com.duing.global.jobrun.MonitoredJob;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * {@link RecruitmentAutoCloseService} 구현 — 마감 조건 설명은 인터페이스에, 판정 규칙(유예 경계·만료-OPEN·전망 조립)은
 * {@link RecruitmentAutoClosePolicy} 에 있다. 이 클래스는 막는 이유를 세어 그 규칙에 넘긴다.
 *
 * <p>잠금: 모집 행 잠금({@code findByIdForUpdate})을 트랜잭션의 첫 조회로 잡고, 지원·라운드는 잠금 없이 센다.
 * 이 트랜잭션은 모집 행 말고는 잠금을 잡지 않으므로 다른 쓰기 경로와 잠금 사이클이 생기지 않고, 라운드 생성·수동 마감·
 * 삭제와는 모집 행 잠금으로 직렬화된다. 전망 계산은 모집을 다시 읽지 않는다(잠근 엔티티와 두 집계 쿼리만 쓴다).
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralRecruitmentAutoCloseService implements RecruitmentAutoCloseService {

    private final RecruitmentRepository recruitmentRepository;
    private final ApplicationRepository applicationRepository;
    private final InterviewRoundRepository interviewRoundRepository;
    private final ApplicationEventPublisher eventPublisher;
    private final Environment environment;
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
        if (recruitment == null) {
            return false;
        }
        AutoCloseOutlookQuery outlook = computeOutlooks(List.of(recruitment), LocalDate.now(clock)).get(recruitmentId);
        if (outlook == null || !outlook.closable()) {
            return false;
        }
        recruitment.close(LocalDateTime.now(clock));
        // 트랜잭션 안에서 발행한다 — 리스너가 AFTER_COMMIT·fallbackExecution=false 라 밖에서 내면 버려진다.
        eventPublisher.publishEvent(new ClubPublicPageChangedEvent(recruitment.getClub().getId()));
        return true;
    }

    @Override
    public Optional<AutoCloseOutlookQuery> findOutlook(Recruitment recruitment) {
        return Optional.ofNullable(findOutlooks(List.of(recruitment), LocalDate.now(clock)).get(recruitment.getId()));
    }

    @Override
    public Map<Long, AutoCloseOutlookQuery> findOutlooks(Collection<Recruitment> recruitments, LocalDate today) {
        if (!MonitoredJob.RECRUITMENT_AUTO_CLOSE.isEnabledIn(environment)) {
            return Map.of();
        }
        return computeOutlooks(recruitments, today);
    }

    /**
     * 잡과 화면이 함께 쓰는 한 계산 — 만료-OPEN 모집만 모아 두 집계 쿼리로 막는 이유를 세고 조립한다.
     * 스위치는 보지 않는다(잡은 켜져 있을 때만 등록되고, 테스트는 잡 메서드를 직접 부른다).
     */
    private Map<Long, AutoCloseOutlookQuery> computeOutlooks(Collection<Recruitment> recruitments, LocalDate today) {
        List<Recruitment> expiredOpen = recruitments.stream()
                .filter(recruitment -> RecruitmentAutoClosePolicy.isExpiredOpen(recruitment, today))
                .toList();
        if (expiredOpen.isEmpty()) {
            // 집계 쿼리의 IN () 을 피한다.
            return Map.of();
        }
        List<Long> recruitmentIds = expiredOpen.stream().map(Recruitment::getId).toList();
        Map<Long, Long> undecidedCounts = toCountMap(applicationRepository
                .countByRecruitmentIdsAndStatusInExcludingWithdrawnApplicants(recruitmentIds, ApplicationStatus.activeSet()));
        Map<Long, Long> inProgressRoundCounts = toCountMap(interviewRoundRepository
                .countByRecruitmentIdsAndStatusInWithAwaitingMembers(
                        recruitmentIds, RoundStatus.inProgressSet(), ApplicationStatus.activeSet()));

        Map<Long, AutoCloseOutlookQuery> outlooks = new HashMap<>();
        for (Recruitment recruitment : expiredOpen) {
            outlooks.put(recruitment.getId(), RecruitmentAutoClosePolicy.outlook(recruitment, today,
                    undecidedCounts.getOrDefault(recruitment.getId(), 0L),
                    inProgressRoundCounts.getOrDefault(recruitment.getId(), 0L)));
        }
        return outlooks;
    }

    private static Map<Long, Long> toCountMap(List<RecruitmentCountRow> countRows) {
        return countRows.stream()
                .collect(Collectors.toMap(RecruitmentCountRow::getRecruitmentId, RecruitmentCountRow::getItemCount));
    }

}
