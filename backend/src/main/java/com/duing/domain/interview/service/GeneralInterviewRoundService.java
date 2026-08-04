package com.duing.domain.interview.service;

import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.entity.ApplicationStatusHistory;
import com.duing.domain.application.exception.ApplicationDomainException;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.application.repository.ApplicationStatusHistoryRepository;
import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.domain.interview.entity.InterviewRound;
import com.duing.domain.interview.entity.InterviewRoundMember;
import com.duing.domain.interview.entity.InterviewSchedule;
import com.duing.domain.interview.entity.InterviewScheduleStatus;
import com.duing.domain.interview.entity.RoundMemberStatus;
import com.duing.domain.interview.entity.RoundStatus;
import com.duing.domain.interview.event.InterviewAvailabilityRequestedEvent;
import com.duing.domain.interview.exception.InterviewException;
import com.duing.domain.interview.repository.InterviewAvailabilityRepository;
import com.duing.domain.interview.repository.InterviewRoundMemberRepository;
import com.duing.domain.interview.repository.InterviewRoundRepository;
import com.duing.domain.interview.repository.InterviewScheduleRepository;
import com.duing.domain.interview.repository.InterviewSlotRepository;
import com.duing.domain.interview.service.dto.command.CreateInterviewRoundCommand;
import com.duing.domain.interview.service.dto.command.UpdateInterviewRoundCommand;
import com.duing.domain.interview.service.dto.query.AvailabilityRequestResult;
import com.duing.domain.interview.service.dto.query.MemberSelectionCount;
import com.duing.domain.interview.service.dto.query.RoundCandidateQuery;
import com.duing.domain.interview.service.dto.query.RoundDetailQuery;
import com.duing.domain.interview.service.dto.query.RoundMemberLine;
import com.duing.domain.interview.service.dto.query.RoundMemberStatusCount;
import com.duing.domain.interview.service.dto.query.RoundSummaryQuery;
import com.duing.domain.interview.service.dto.query.SlotSelectionCount;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.exception.RecruitmentException;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.exception.UserException;
import com.duing.domain.user.repository.UserRepository;
import java.sql.SQLException;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralInterviewRoundService implements InterviewRoundService {

    // V49 의 모집당 DRAFT 라운드 1개 partial unique (race 최종 방어선).
    private static final String DRAFT_ROUND_UNIQUE_INDEX = "uq_interview_round_draft_per_recruitment";
    // PostgreSQL unique_violation.
    private static final String POSTGRES_UNIQUE_VIOLATION_SQL_STATE = "23505";

    private final RecruitmentRepository recruitmentRepository;
    private final ClubAuthService clubAuthService;
    private final InterviewRoundMemberRepository interviewRoundMemberRepository;
    private final InterviewRoundRepository interviewRoundRepository;
    private final ApplicationRepository applicationRepository;
    private final ApplicationStatusHistoryRepository applicationStatusHistoryRepository;
    private final UserRepository userRepository;
    private final InterviewSlotRepository interviewSlotRepository;
    private final InterviewScheduleRepository interviewScheduleRepository;
    private final InterviewAvailabilityRepository interviewAvailabilityRepository;
    private final ApplicationEventPublisher eventPublisher;
    private final Clock clock;
    private final InterviewRoundAccessor interviewRoundAccessor;

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

    @Override
    @Transactional
    public Long createRound(CreateInterviewRoundCommand createCommand) {
        Recruitment recruitment = recruitmentRepository.findById(createCommand.recruitmentId())
                .orElseThrow(RecruitmentException.RecruitmentNotFoundException::new);
        clubAuthService.requireManager(createCommand.currentUserId(), recruitment.getClub().getId());

        User changedBy = userRepository.findById(createCommand.currentUserId())
                .orElseThrow(UserException.UserNotFoundException::new);

        if (!recruitment.isUseInterview()) {
            throw new InterviewException.InterviewNotUsed();
        }

        LocalDateTime now = LocalDateTime.now(clock);
        if (createCommand.availabilityDeadline() != null
                && !createCommand.availabilityDeadline().isAfter(now)) {
            throw new InterviewException.InvalidDeadline();
        }

        // 친절한 사전 체크 — 동시 생성 race 는 아래 partial unique(23505) 가 최종 차단한다.
        if (interviewRoundRepository.existsByRecruitmentIdAndStatus(
                createCommand.recruitmentId(), RoundStatus.DRAFT)) {
            throw new InterviewException.DraftRoundAlreadyExists();
        }

        // 입력 ID 중복은 클라이언트 실수 보호 차원에서 제거하되 순서는 유지한다 (bulkUpdateStatus 전례).
        Set<Long> applicationIds = new LinkedHashSet<>(createCommand.applicationIds());

        // 같은 지원자를 두 라운드에 동시 배치하는 race 를 행 잠금으로 직렬화한다 (스펙 §7).
        // 후행 트랜잭션은 잠금 해제 후 아래 placement 검증에서 선행 커밋의 멤버십을 보고 409 로 떨어진다.
        List<Application> applications = applicationRepository.findAllByIdInForUpdate(applicationIds);
        if (applications.size() != applicationIds.size()) {
            throw new ApplicationDomainException.ApplicationNotFoundException();
        }

        for (Application application : applications) {
            if (!application.getRecruitment().getId().equals(createCommand.recruitmentId())) {
                throw new InterviewException.CandidateNotInRecruitment();
            }
            ApplicationStatus candidateStatus = application.getStatus();
            if (candidateStatus != ApplicationStatus.SUBMITTED
                    && candidateStatus != ApplicationStatus.ON_HOLD
                    && candidateStatus != ApplicationStatus.INTERVIEW_PENDING) {
                throw new InterviewException.CandidateNotEligible();
            }
        }

        // placement-active 멤버십 최대 1개 불변식 (스펙 §5.4·§16) 의 생성 측 강제.
        List<Long> alreadyPlacedIds = interviewRoundMemberRepository
                .findApplicationIdsWithPlacementActiveMembership(applicationIds);
        if (!alreadyPlacedIds.isEmpty()) {
            throw new InterviewException.CandidateAlreadyInActiveRound();
        }

        InterviewRound round;
        try {
            round = interviewRoundRepository.save(InterviewRound.create(
                    createCommand.recruitmentId(),
                    createCommand.title(),
                    createCommand.availabilityDeadline(),
                    createCommand.location()));
            interviewRoundRepository.flush();
        } catch (DataIntegrityViolationException racedDraftCreation) {
            if (isDraftRoundUniqueViolation(racedDraftCreation)) {
                throw new InterviewException.DraftRoundAlreadyExists();
            }
            throw racedDraftCreation;
        }

        for (Application application : applications) {
            // 대기열(INTERVIEW_PENDING) 재수용은 상태 변화가 없으므로 전이·이력을 만들지 않는다.
            ApplicationStatus statusBeforePromotion = application.getStatus();
            if (statusBeforePromotion != ApplicationStatus.INTERVIEW_PENDING) {
                application.transitionTo(ApplicationStatus.INTERVIEW_PENDING, true);
                applicationStatusHistoryRepository.save(ApplicationStatusHistory.record(
                        application, statusBeforePromotion,
                        ApplicationStatus.INTERVIEW_PENDING, changedBy));
            }
        }

        List<InterviewRoundMember> members = applicationIds.stream()
                .map(applicationId -> InterviewRoundMember.invite(round.getId(), applicationId))
                .toList();
        interviewRoundMemberRepository.saveAll(members);

        return round.getId();
    }

    @Override
    @Transactional
    public AvailabilityRequestResult requestAvailability(Long roundId, Long currentUserId) {
        InterviewRound round = interviewRoundAccessor.getWithManagerAuth(roundId, currentUserId);

        if (interviewSlotRepository.countByRoundId(round.getId()) == 0) {
            throw new InterviewException.RoundHasNoSlots();
        }
        List<InterviewRoundMember> invitedMembers = interviewRoundMemberRepository
                .findByRoundIdAndStatus(round.getId(), RoundMemberStatus.INVITED);
        if (invitedMembers.isEmpty()) {
            throw new InterviewException.NoMemberToNotify();
        }

        round.openCollecting(LocalDateTime.now(clock));
        notifyAvailabilityRequest(round, invitedMembers);
        return new AvailabilityRequestResult(invitedMembers.size());
    }

    @Override
    @Transactional
    public AvailabilityRequestResult remind(Long roundId, Long currentUserId) {
        InterviewRound round = interviewRoundAccessor.getWithManagerAuth(roundId, currentUserId);

        if (round.getStatus() != RoundStatus.COLLECTING) {
            throw new InterviewException.RoundTransitionNotAllowed();
        }
        List<InterviewRoundMember> unrespondedMembers = interviewRoundMemberRepository
                .findByRoundIdAndStatus(round.getId(), RoundMemberStatus.INVITED);
        if (unrespondedMembers.isEmpty()) {
            throw new InterviewException.NoMemberToNotify();
        }

        notifyAvailabilityRequest(round, unrespondedMembers);
        return new AvailabilityRequestResult(unrespondedMembers.size());
    }

    /**
     * 요청 회차를 1 올리고 대상 멤버별로 Availability 요청 이벤트를 발행한다 (스펙 §8).
     * 알림 생성은 AFTER_COMMIT 리스너(InterviewAvailabilityRequestedListener)가 담당한다.
     */
    private void notifyAvailabilityRequest(InterviewRound round, List<InterviewRoundMember> targets) {
        round.increaseRequestSequence();
        for (InterviewRoundMember target : targets) {
            eventPublisher.publishEvent(new InterviewAvailabilityRequestedEvent(
                    round.getId(), target.getApplicationId(), round.getRequestSequence()));
        }
    }

    @Override
    @Transactional
    public void updateRound(UpdateInterviewRoundCommand updateCommand) {
        // §16-7-4 — round writer 직렬화 (자동배정·확정·취소와 동일 잠금).
        InterviewRound round = interviewRoundRepository.findByIdForUpdate(updateCommand.roundId())
                .orElseThrow(InterviewException.RoundNotFound::new);
        interviewRoundAccessor.requireManager(round, updateCommand.currentUserId());

        boolean nothingToUpdate = updateCommand.title() == null
                && updateCommand.location() == null
                && updateCommand.availabilityDeadline() == null;
        boolean blankTitle = updateCommand.title() != null && updateCommand.title().trim().isEmpty();
        if (nothingToUpdate || blankTitle) {
            throw new InterviewException.InvalidRoundUpdate();
        }

        if (updateCommand.title() != null || updateCommand.location() != null) {
            round.updateInfo(
                    updateCommand.title() == null ? null : updateCommand.title().trim(),
                    updateCommand.location());
        }
        if (updateCommand.availabilityDeadline() != null) {
            round.updateDeadline(updateCommand.availabilityDeadline(), LocalDateTime.now(clock));
        }
    }

    @Override
    @Transactional
    public void cancelRound(Long roundId, Long currentUserId) {
        InterviewRound round = interviewRoundRepository.findByIdForUpdate(roundId)
                .orElseThrow(InterviewException.RoundNotFound::new);
        interviewRoundAccessor.requireManager(round, currentUserId);

        round.cancel();
        // §16-2 — 누락 시 취소된 라운드의 draft 배정이 새 라운드 배정과 병존해
        // findByApplicationId 류 Optional reader 가 NonUniqueResult 로 깨진다.
        interviewScheduleRepository.softDeleteByRoundId(roundId);
    }

    @Override
    public List<RoundSummaryQuery> getRounds(Long recruitmentId, Long currentUserId) {
        Recruitment recruitment = recruitmentRepository.findById(recruitmentId)
                .orElseThrow(RecruitmentException.RecruitmentNotFoundException::new);
        clubAuthService.requireManager(currentUserId, recruitment.getClub().getId());
        if (!recruitment.isUseInterview()) {
            throw new InterviewException.InterviewNotUsed();
        }

        List<InterviewRound> rounds = interviewRoundRepository
                .findByRecruitmentIdOrderByCreatedAtDesc(recruitmentId);
        // 라운드가 없으면 카운트 집계 쿼리 자체를 생략한다 (in 빈 리스트 호출 방지 의도).
        if (rounds.isEmpty()) {
            return List.of();
        }

        Map<Long, Map<RoundMemberStatus, Long>> countsByRoundId = interviewRoundMemberRepository
                .countMembersGroupedByStatus(rounds.stream().map(InterviewRound::getId).toList())
                .stream()
                .collect(Collectors.groupingBy(RoundMemberStatusCount::roundId,
                        Collectors.toMap(RoundMemberStatusCount::status, RoundMemberStatusCount::count)));

        return rounds.stream()
                .map(round -> RoundSummaryQuery.of(round,
                        countsByRoundId.getOrDefault(round.getId(), Map.of())))
                .toList();
    }

    @Override
    public RoundDetailQuery getRoundDetail(Long roundId, Long currentUserId) {
        InterviewRound round = interviewRoundAccessor.getWithManagerAuth(roundId, currentUserId);

        List<RoundMemberLine> memberLines = interviewRoundMemberRepository
                .findMemberLinesByRoundId(round.getId());
        Map<Long, Long> selectionCountByApplicationId = interviewAvailabilityRepository
                .countByRoundIdGroupedByApplication(round.getId()).stream()
                .collect(Collectors.toMap(MemberSelectionCount::applicationId, MemberSelectionCount::count));
        Map<Long, Long> selectionCountBySlotId = interviewAvailabilityRepository
                .countByRoundIdGroupedBySlot(round.getId()).stream()
                .collect(Collectors.toMap(SlotSelectionCount::slotId, SlotSelectionCount::count));

        // 활성(ASSIGNED·미삭제) schedule — ASSIGNING(draft 검토)·SCHEDULED 에서 §10.4 검토 영역이 사용.
        // soft-deleted slot 참조는 도달 불가: 슬롯 삭제는 availability 참조 0 && DRAFT·COLLECTING 한정(BE#4 가드)인데
        // schedule 은 ASSIGNING 부터 생긴다 — 가드를 완화하는 PR 은 이 집계의 slot join 필요성을 재검토할 것.
        List<InterviewSchedule> activeSchedules = interviewScheduleRepository
                .findByRoundIdAndStatus(round.getId(), InterviewScheduleStatus.ASSIGNED);
        Map<Long, Long> assignedSlotIdByApplicationId = activeSchedules.stream()
                .collect(Collectors.toMap(InterviewSchedule::getApplicationId, InterviewSchedule::getSlotId));
        Map<Long, Long> assignedCountBySlotId = activeSchedules.stream()
                .collect(Collectors.groupingBy(InterviewSchedule::getSlotId, Collectors.counting()));

        return RoundDetailQuery.assemble(round, memberLines,
                selectionCountByApplicationId, assignedSlotIdByApplicationId,
                interviewSlotRepository.findByRoundIdOrderByStartTimeAsc(round.getId()),
                selectionCountBySlotId, assignedCountBySlotId,
                LocalDateTime.now(clock));
    }

    @Override
    @Transactional
    public void softDeleteAllOnClubClosure(List<Long> recruitmentIds) {
        for (Long recruitmentId : recruitmentIds) {
            List<InterviewRound> rounds =
                    interviewRoundRepository.findByRecruitmentIdOrderByCreatedAtDesc(recruitmentId);
            for (InterviewRound round : rounds) {
                interviewScheduleRepository.softDeleteByRoundId(round.getId());
                interviewRoundRepository.delete(round);
            }
        }
    }

    /**
     * 동시 라운드 생성으로 인한 DRAFT partial unique 위반 only true.
     * 다른 무결성 위반은 그대로 위로 전파한다 (club_member 23505 처리 전례).
     */
    private static boolean isDraftRoundUniqueViolation(DataIntegrityViolationException exception) {
        Throwable mostSpecific = exception.getMostSpecificCause();
        if (!(mostSpecific instanceof SQLException sqlException)) {
            return false;
        }
        if (!POSTGRES_UNIQUE_VIOLATION_SQL_STATE.equals(sqlException.getSQLState())) {
            return false;
        }
        String message = sqlException.getMessage();
        return message != null && message.contains(DRAFT_ROUND_UNIQUE_INDEX);
    }
}
