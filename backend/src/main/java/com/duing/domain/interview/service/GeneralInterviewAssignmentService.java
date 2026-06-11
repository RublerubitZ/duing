package com.duing.domain.interview.service;

import com.duing.domain.interview.entity.InterviewAvailability;
import com.duing.domain.interview.entity.InterviewRound;
import com.duing.domain.interview.entity.InterviewRoundMember;
import com.duing.domain.interview.entity.InterviewSchedule;
import com.duing.domain.interview.entity.InterviewScheduleStatus;
import com.duing.domain.interview.entity.InterviewSlot;
import com.duing.domain.interview.entity.RoundMemberStatus;
import com.duing.domain.interview.entity.RoundStatus;
import com.duing.domain.interview.exception.InterviewException;
import com.duing.domain.interview.repository.InterviewAvailabilityRepository;
import com.duing.domain.interview.repository.InterviewRoundMemberRepository;
import com.duing.domain.interview.repository.InterviewRoundRepository;
import com.duing.domain.interview.repository.InterviewScheduleRepository;
import com.duing.domain.interview.repository.InterviewSlotRepository;
import com.duing.domain.interview.service.dto.MatchingInput;
import com.duing.domain.interview.service.dto.MatchingResult;
import com.duing.domain.interview.service.dto.query.AutoAssignResult;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralInterviewAssignmentService implements InterviewAssignmentService {

    private static final Set<RoundStatus> EXCLUDABLE_ROUND_STATUSES =
            Set.of(RoundStatus.DRAFT, RoundStatus.COLLECTING, RoundStatus.ASSIGNING);

    private final InterviewRoundRepository interviewRoundRepository;
    private final InterviewRoundMemberRepository interviewRoundMemberRepository;
    private final InterviewAvailabilityRepository interviewAvailabilityRepository;
    private final InterviewSlotRepository interviewSlotRepository;
    private final InterviewScheduleRepository interviewScheduleRepository;
    private final InterviewRoundAccessor interviewRoundAccessor;
    private final InterviewMatchingService interviewMatchingService;
    private final Clock clock;

    @Override
    @Transactional
    public AutoAssignResult autoAssign(Long roundId, Long currentUserId) {
        // round writer(자동배정·확정·취소) 간 직렬화 — 잠금 조회가 404 를 먼저 판정한다 (스펙 §7).
        InterviewRound round = interviewRoundRepository.findByIdForUpdate(roundId)
                .orElseThrow(InterviewException.RoundNotFound::new);
        interviewRoundAccessor.requireManager(round, currentUserId);

        if (round.getStatus() == RoundStatus.COLLECTING) {
            round.openAssigning();
        } else if (round.getStatus() != RoundStatus.ASSIGNING) {
            throw new InterviewException.RoundTransitionNotAllowed();
        }

        // 잠금 순서: round → slots(id 순) → members(id 순) — 응답 API(application → slots → member)와
        // 자원 순서(슬롯 먼저, 멤버 나중)가 일치해 교착 사이클이 없다. 슬롯 잠금은 동시 capacity
        // 축소와의 race(정원 초과 배정)를 차단한다 — 축소 측은 잠금 획득 후 CapacityBelowAssigned 로 검증.
        List<InterviewSlot> lockedSlots = interviewSlotRepository.findAllByRoundIdForUpdate(roundId);

        List<InterviewRoundMember> respondedMembers = interviewRoundMemberRepository
                .findAllByRoundIdAndStatusForUpdate(roundId, RoundMemberStatus.RESPONDED);

        Map<Long, Set<Long>> selectedSlotIdsByApplicationId = interviewAvailabilityRepository
                .findByRoundId(roundId).stream()
                .collect(Collectors.groupingBy(InterviewAvailability::getApplicationId,
                        Collectors.mapping(InterviewAvailability::getSlotId, Collectors.toSet())));

        MatchingInput matchingInput = new MatchingInput(
                respondedMembers.stream()
                        .map(member -> new MatchingInput.ApplicantSelection(
                                member.getApplicationId(),
                                selectedSlotIdsByApplicationId.getOrDefault(
                                        member.getApplicationId(), Set.of())))
                        .toList(),
                lockedSlots.stream()
                        .sorted(Comparator.comparing(InterviewSlot::getStartTime))
                        .map(slot -> new MatchingInput.SlotState(
                                slot.getId(), slot.getStartTime(), slot.getCapacity()))
                        .toList());

        // 재실행 교체 (§6.2) — 첫 실행에선 no-op 라 분기하지 않는다.
        interviewScheduleRepository.softDeleteByRoundId(roundId);

        MatchingResult matchingResult = interviewMatchingService.match(matchingInput);

        LocalDateTime now = LocalDateTime.now(clock);
        interviewScheduleRepository.saveAll(matchingResult.assigned().stream()
                .map(assignment -> InterviewSchedule.create(
                        assignment.applicationId(), assignment.slotId(), roundId, now))
                .toList());

        return new AutoAssignResult(
                matchingResult.assigned().size(),
                matchingResult.unassignedApplicationIds().size());
    }

    @Override
    @Transactional
    public void assignSchedule(Long roundId, Long memberId, Long slotId, Long currentUserId) {
        // 잠금 순서 §16-7-4: round → slot → member.
        InterviewRound round = interviewRoundRepository.findByIdForUpdate(roundId)
                .orElseThrow(InterviewException.RoundNotFound::new);
        interviewRoundAccessor.requireManager(round, currentUserId);
        if (round.getStatus() != RoundStatus.ASSIGNING) {
            throw new InterviewException.RoundTransitionNotAllowed();
        }

        InterviewSlot slot = interviewSlotRepository.findByIdAndRoundIdForUpdate(slotId, roundId)
                .orElseThrow(InterviewException.InvalidSlotSelection::new);
        InterviewRoundMember member = getLockedMemberOfRound(roundId, memberId);
        if (member.getStatus() == RoundMemberStatus.EXCLUDED) {
            throw new InterviewException.MemberTransitionNotAllowed();
        }

        // 본인 기존 배정을 먼저 비워야 "만석 슬롯 내 본인 재배정(멱등)" 이 자연 통과한다.
        removeActiveSchedule(roundId, member.getApplicationId());
        long assignedCount = interviewScheduleRepository
                .countBySlotIdAndStatus(slotId, InterviewScheduleStatus.ASSIGNED);
        if (assignedCount >= slot.getCapacity()) {
            throw new InterviewException.SlotCapacityExceeded();
        }
        interviewScheduleRepository.save(InterviewSchedule.create(
                member.getApplicationId(), slotId, roundId, LocalDateTime.now(clock)));
    }

    @Override
    @Transactional
    public void unassignSchedule(Long roundId, Long memberId, Long currentUserId) {
        InterviewRound round = interviewRoundRepository.findByIdForUpdate(roundId)
                .orElseThrow(InterviewException.RoundNotFound::new);
        interviewRoundAccessor.requireManager(round, currentUserId);
        if (round.getStatus() != RoundStatus.ASSIGNING) {
            throw new InterviewException.RoundTransitionNotAllowed();
        }

        // 멤버 행을 쓰지 않으므로 멤버 잠금은 불요 — 존재·소속 검증만 한다.
        InterviewRoundMember member = interviewRoundMemberRepository.findById(memberId)
                .filter(found -> found.getRoundId().equals(roundId))
                .orElseThrow(InterviewException.MemberNotFound::new);
        InterviewSchedule schedule = interviewScheduleRepository
                .findByRoundIdAndApplicationIdAndStatus(roundId, member.getApplicationId(),
                        InterviewScheduleStatus.ASSIGNED)
                .orElseThrow(InterviewException.ScheduleNotFound::new);
        interviewScheduleRepository.delete(schedule);
    }

    @Override
    @Transactional
    public void excludeMember(Long roundId, Long memberId, Long currentUserId) {
        // 잠금 순서 §16-7-4: round → member. round 잠금이 자동배정 재실행·향후 확정/취소와
        // 직렬화하고, 멤버 잠금(§16-7-2)이 동시 "배정 vs 제외" 의 잔존 배정을 차단한다.
        InterviewRound round = interviewRoundRepository.findByIdForUpdate(roundId)
                .orElseThrow(InterviewException.RoundNotFound::new);
        interviewRoundAccessor.requireManager(round, currentUserId);
        if (!EXCLUDABLE_ROUND_STATUSES.contains(round.getStatus())) {
            throw new InterviewException.RoundTransitionNotAllowed();
        }

        InterviewRoundMember member = getLockedMemberOfRound(roundId, memberId);
        member.exclude();
        // §16-3 — 누락 시 제외된 지원자에게 리마인더가 발송되고 dashboard 에 배정이 잔존한다.
        removeActiveSchedule(roundId, member.getApplicationId());
    }

    private InterviewRoundMember getLockedMemberOfRound(Long roundId, Long memberId) {
        return interviewRoundMemberRepository.findByIdAndRoundIdForUpdate(memberId, roundId)
                .orElseThrow(InterviewException.MemberNotFound::new);
    }

    private void removeActiveSchedule(Long roundId, Long applicationId) {
        interviewScheduleRepository
                .findByRoundIdAndApplicationIdAndStatus(roundId, applicationId,
                        InterviewScheduleStatus.ASSIGNED)
                .ifPresent(interviewScheduleRepository::delete);
    }
}
