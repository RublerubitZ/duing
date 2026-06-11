package com.duing.domain.interview.service;

import com.duing.domain.interview.entity.InterviewAvailability;
import com.duing.domain.interview.entity.InterviewRound;
import com.duing.domain.interview.entity.InterviewRoundMember;
import com.duing.domain.interview.entity.InterviewSchedule;
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
}
