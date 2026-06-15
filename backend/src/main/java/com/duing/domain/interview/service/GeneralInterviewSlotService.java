package com.duing.domain.interview.service;

import com.duing.domain.interview.entity.InterviewRound;
import com.duing.domain.interview.entity.InterviewRoundMember;
import com.duing.domain.interview.entity.InterviewScheduleStatus;
import com.duing.domain.interview.entity.InterviewSlot;
import com.duing.domain.interview.entity.RoundMemberStatus;
import com.duing.domain.interview.entity.RoundStatus;
import com.duing.domain.interview.event.InterviewAvailabilityRequestedEvent;
import com.duing.domain.interview.exception.InterviewException;
import com.duing.domain.interview.repository.InterviewAvailabilityRepository;
import com.duing.domain.interview.repository.InterviewRoundMemberRepository;
import com.duing.domain.interview.repository.InterviewRoundRepository;
import com.duing.domain.interview.repository.InterviewScheduleRepository;
import com.duing.domain.interview.repository.InterviewSlotRepository;
import com.duing.domain.interview.service.dto.command.CreateInterviewSlotsCommand;
import com.duing.domain.interview.service.dto.command.UpdateInterviewSlotCommand;
import com.duing.domain.interview.service.dto.query.SlotsCreationResult;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralInterviewSlotService implements InterviewSlotService {

    private final InterviewRoundRepository interviewRoundRepository;
    private final InterviewSlotRepository interviewSlotRepository;
    private final InterviewAvailabilityRepository interviewAvailabilityRepository;
    private final InterviewRoundMemberRepository interviewRoundMemberRepository;
    private final InterviewScheduleRepository interviewScheduleRepository;
    private final ApplicationEventPublisher eventPublisher;
    private final Clock clock;
    private final InterviewRoundAccessor interviewRoundAccessor;

    @Override
    @Transactional
    public SlotsCreationResult createSlots(CreateInterviewSlotsCommand createCommand) {
        InterviewRound round = getRoundWithManagerAuth(createCommand.roundId(), createCommand.currentUserId());
        requireSlotChangeablePhase(round);

        for (CreateInterviewSlotsCommand.SlotItem slotItem : createCommand.slots()) {
            if (!slotItem.endTime().isAfter(slotItem.startTime())) {
                throw new InterviewException.InvalidSlotTime();
            }
        }

        List<InterviewSlot> savedSlots = interviewSlotRepository.saveAll(
                createCommand.slots().stream()
                        .map(slotItem -> InterviewSlot.create(
                                round.getId(), slotItem.startTime(), slotItem.endTime(), slotItem.capacity()))
                        .toList());

        int reinvitedMemberCount = reinviteNoAvailableSlotMembers(round, LocalDateTime.now(clock));

        return new SlotsCreationResult(
                savedSlots.stream().map(InterviewSlot::getId).toList(),
                reinvitedMemberCount);
    }

    /**
     * Rule 2 (스펙 §5.5): COLLECTING && 마감 전 추가 슬롯 생성 시 NO_AVAILABLE_SLOT 멤버를
     * INVITED 로 복귀시키고 재알림을 발화한다. 마감 후엔 [마감 연장]이 먼저고,
     * DRAFT(발송 전)·ASSIGNING 이후 단계에서는 발동하지 않는다.
     * requestSequence 는 발동당 1 회 증가 — dedupKey 의 applicationId 가 대상자별 분리를 담당한다 (스펙 §8).
     */
    private int reinviteNoAvailableSlotMembers(InterviewRound round, LocalDateTime now) {
        boolean rule2Active = round.getStatus() == RoundStatus.COLLECTING
                && round.getAvailabilityDeadline() != null
                && now.isBefore(round.getAvailabilityDeadline());
        if (!rule2Active) {
            return 0;
        }

        List<InterviewRoundMember> stuckMembers = interviewRoundMemberRepository
                .findAllByRoundIdAndStatusForUpdate(round.getId(), RoundMemberStatus.NO_AVAILABLE_SLOT);
        if (stuckMembers.isEmpty()) {
            return 0;
        }

        round.increaseRequestSequence();
        for (InterviewRoundMember stuckMember : stuckMembers) {
            stuckMember.reinviteAfterSlotAdded();
            eventPublisher.publishEvent(new InterviewAvailabilityRequestedEvent(
                    round.getId(), stuckMember.getApplicationId(), round.getRequestSequence()));
        }
        return stuckMembers.size();
    }

    @Override
    @Transactional
    public void updateSlot(UpdateInterviewSlotCommand updateCommand) {
        InterviewSlot slot = interviewSlotRepository.findByIdForUpdate(updateCommand.slotId())
                .orElseThrow(InterviewException.SlotNotFound::new);
        InterviewRound round = getRoundWithManagerAuth(slot.getRoundId(), updateCommand.currentUserId());
        requireSlotChangeablePhase(round);

        boolean startTimeGiven = updateCommand.startTime() != null;
        boolean endTimeGiven = updateCommand.endTime() != null;
        if (startTimeGiven != endTimeGiven) {
            throw new InterviewException.SlotTimePairRequired();
        }
        if (startTimeGiven) {
            if (!updateCommand.endTime().isAfter(updateCommand.startTime())) {
                throw new InterviewException.InvalidSlotTime();
            }
            if (interviewAvailabilityRepository.countBySlotId(slot.getId()) > 0) {
                throw new InterviewException.SlotTimeChangeForbiddenForSelectedSlot();
            }
            // §6.4 로 SCHEDULED 슬롯 조작이 열리며 도달 가능해짐 — 수동 배정 멤버는 응답 기록이 없어
            // availability 검사로 안 잡힌다. 배정이 있는 슬롯의 시간 변경은 확정 통보를 무효화하므로 차단.
            if (interviewScheduleRepository.countBySlotIdAndStatus(
                    slot.getId(), InterviewScheduleStatus.ASSIGNED) > 0) {
                throw new InterviewException.SlotHasAssignments();
            }
            slot.updateTime(updateCommand.startTime(), updateCommand.endTime());
        }
        if (updateCommand.capacity() != null) {
            // SCHEDULED 에서의 슬롯 변경이 §6.4 로 허용되어 이 경로에 실제로 도달할 수 있다.
            // 예외 이름이 약속한 검사를 채워 기존 배정(ASSIGNED status)이 정원 아래로 내려가지 않도록 보호한다.
            if (interviewScheduleRepository.countBySlotIdAndStatus(
                    slot.getId(), InterviewScheduleStatus.ASSIGNED) > updateCommand.capacity()) {
                throw new InterviewException.CapacityBelowAssigned();
            }
            slot.updateCapacity(updateCommand.capacity());
        }
    }

    @Override
    @Transactional
    public void deleteSlot(Long slotId, Long currentUserId) {
        InterviewSlot slot = interviewSlotRepository.findByIdForUpdate(slotId)
                .orElseThrow(InterviewException.SlotNotFound::new);
        InterviewRound round = getRoundWithManagerAuth(slot.getRoundId(), currentUserId);
        requireSlotChangeablePhase(round);

        if (interviewAvailabilityRepository.countBySlotId(slot.getId()) > 0) {
            throw new InterviewException.SlotHasAvailability();
        }
        // §6.4 로 SCHEDULED 슬롯 조작이 열리며 도달 가능해짐 — 수동 배정 멤버는 응답 기록이 없어
        // availability 검사로 안 잡힌다. 배정이 있는 슬롯 삭제는 확정된 면접을 고아로 만들므로 차단.
        if (interviewScheduleRepository.countBySlotIdAndStatus(
                slot.getId(), InterviewScheduleStatus.ASSIGNED) > 0) {
            throw new InterviewException.SlotHasAssignments();
        }
        // 발송 가드(슬롯≥1)가 보장한 "수집 중 라운드에 선택지가 있다" 불변식을 삭제 경로에서도 지킨다.
        // (발송과 삭제의 순수 동시 race 윈도우는 수용 — 발생해도 추가 슬롯 생성 + Rule 2 로 복구 가능)
        if (round.getStatus() == RoundStatus.COLLECTING
                && interviewSlotRepository.countByRoundId(round.getId()) == 1) {
            throw new InterviewException.LastSlotUndeletableWhileCollecting();
        }
        interviewSlotRepository.delete(slot);
    }

    private InterviewRound getRoundWithManagerAuth(Long roundId, Long currentUserId) {
        return interviewRoundAccessor.getWithManagerAuth(roundId, currentUserId);
    }

    /**
     * 슬롯 변경(생성·수정·삭제) phase 가드 — DRAFT·COLLECTING·SCHEDULED 허용 (스펙 §9.1 API 4·§6.4).
     * ASSIGNING 은 여전히 불가 — 수동 배정용 슬롯 추가가 필요하면 ASSIGNING 재실행 전에 처리한다.
     * SCHEDULED 추가 시 Rule 2(NO_AVAILABLE_SLOT 재초대)는 발동하지 않는다 (수집 종료, §6.4).
     * CANCELLED 는 명시 집합에 없으므로 종결 상태가 새지 않는다.
     */
    private void requireSlotChangeablePhase(InterviewRound round) {
        RoundStatus status = round.getStatus();
        if (status != RoundStatus.DRAFT
                && status != RoundStatus.COLLECTING
                && status != RoundStatus.SCHEDULED) {
            throw new InterviewException.SlotChangeNotAllowedInCurrentPhase();
        }
    }
}
