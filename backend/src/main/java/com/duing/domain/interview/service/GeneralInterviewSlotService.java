package com.duing.domain.interview.service;

import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.domain.interview.controller.dto.response.ApplicantInterviewSlotResponse;
import com.duing.domain.interview.entity.InterviewConfig;
import com.duing.domain.interview.entity.InterviewScheduleStatus;
import com.duing.domain.interview.entity.InterviewSlot;
import com.duing.domain.interview.exception.InterviewException;
import com.duing.domain.interview.repository.InterviewAvailabilityRepository;
import com.duing.domain.interview.repository.InterviewConfigRepository;
import com.duing.domain.interview.repository.InterviewScheduleRepository;
import com.duing.domain.interview.repository.InterviewSlotRepository;
import com.duing.domain.interview.service.dto.command.CreateInterviewSlotsCommand;
import com.duing.domain.interview.service.dto.command.UpdateInterviewSlotCommand;
import com.duing.domain.interview.service.dto.query.SlotListView;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.exception.RecruitmentException;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralInterviewSlotService implements InterviewSlotService {

    private final InterviewSlotRepository slotRepository;
    private final InterviewConfigRepository configRepository;
    private final InterviewAvailabilityRepository availabilityRepository;
    private final InterviewScheduleRepository scheduleRepository;
    private final RecruitmentRepository recruitmentRepository;
    private final ClubAuthService clubAuthService;

    @Override
    @Transactional
    public List<Long> createBulk(CreateInterviewSlotsCommand command) {
        Recruitment recruitment = recruitmentRepository.findById(command.recruitmentId())
                .orElseThrow(RecruitmentException.RecruitmentNotFoundException::new);
        clubAuthService.requireManager(command.actorUserId(), recruitment.getClub().getId());

        InterviewConfig config = configRepository.findByRecruitmentId(recruitment.getId())
                .orElseThrow(InterviewException.InterviewConfigNotFound::new);

        LocalDateTime now = LocalDateTime.now();
        if (!config.canCreateSlot(now)) {
            throw new InterviewException.SlotCreationNotAllowedInCurrentPhase();
        }

        List<InterviewSlot> slotsToSave = command.slots().stream()
                .map(slotEntry -> {
                    if (!slotEntry.endTime().isAfter(slotEntry.startTime())) {
                        throw new InterviewException.InvalidSlotSelection();
                    }
                    return InterviewSlot.create(
                            recruitment.getId(),
                            slotEntry.startTime(),
                            slotEntry.endTime(),
                            slotEntry.capacity());
                })
                .toList();

        List<InterviewSlot> savedSlots = slotRepository.saveAll(slotsToSave);
        return savedSlots.stream().map(InterviewSlot::getId).toList();
    }

    @Override
    public List<SlotListView> listByRecruitment(Long recruitmentId, Long actorUserId) {
        Recruitment recruitment = recruitmentRepository.findById(recruitmentId)
                .orElseThrow(RecruitmentException.RecruitmentNotFoundException::new);
        clubAuthService.requireManager(actorUserId, recruitment.getClub().getId());
        return slotRepository.findSlotListViewByRecruitmentId(recruitmentId);
    }

    @Override
    @Transactional
    public void update(UpdateInterviewSlotCommand command) {
        // recruitmentId 만 얻기 위한 사전 조회 (lock 없음)
        InterviewSlot slotPeek = slotRepository.findById(command.slotId())
                .orElseThrow(InterviewException.SlotNotFound::new);
        Recruitment recruitment = recruitmentRepository.findById(slotPeek.getRecruitmentId())
                .orElseThrow(RecruitmentException.RecruitmentNotFoundException::new);
        clubAuthService.requireManager(command.actorUserId(), recruitment.getClub().getId());

        // capacity 변경은 autoAssign · manual assign 의 capacity 검증과 직렬화되어야 한다.
        // 양 path 와 동일하게 interview_config → slot 순서로 lock 한다 (deadlock 회피).
        InterviewConfig config = configRepository.findByRecruitmentIdForUpdate(slotPeek.getRecruitmentId())
                .orElseThrow(InterviewException.InterviewConfigNotFound::new);
        InterviewSlot slot = slotRepository.findByIdForUpdate(command.slotId())
                .orElseThrow(InterviewException.SlotNotFound::new);

        int availabilityCount = Math.toIntExact(availabilityRepository.countBySlotId(slot.getId()));
        long assignedCount = scheduleRepository.countBySlotIdAndStatus(slot.getId(), InterviewScheduleStatus.ASSIGNED);
        LocalDateTime now = LocalDateTime.now();

        InterviewConfig.SlotMutableFields mutable = config.canModifySlot(availabilityCount, now);
        switch (mutable) {
            case NONE -> throw new InterviewException.SlotModificationNotAllowedInCurrentPhase();
            case CAPACITY_ONLY -> {
                if (command.startTime() != null || command.endTime() != null) {
                    throw new InterviewException.SlotTimeChangeForbiddenForSelectedSlot();
                }
            }
            case TIME_AND_CAPACITY -> {
                // 시간 + 정원 모두 허용 — 추가 phase 가드 없음
            }
            default -> throw new IllegalStateException("Unhandled SlotMutableFields: " + mutable);
        }

        if (command.startTime() != null || command.endTime() != null) {
            LocalDateTime newStart = command.startTime() != null ? command.startTime() : slot.getStartTime();
            LocalDateTime newEnd = command.endTime() != null ? command.endTime() : slot.getEndTime();
            if (!newEnd.isAfter(newStart)) {
                throw new InterviewException.InvalidSlotSelection();
            }
            slot.updateTime(newStart, newEnd);
        }

        if (command.capacity() != null) {
            if (command.capacity() < assignedCount) {
                throw new InterviewException.CapacityBelowAssigned();
            }
            slot.updateCapacity(command.capacity());
        }
    }

    @Override
    public List<ApplicantInterviewSlotResponse> listForApplicants(Long recruitmentId) {
        Recruitment recruitment = recruitmentRepository.findById(recruitmentId)
                .orElseThrow(RecruitmentException.RecruitmentNotFoundException::new);
        if (!recruitment.isEffectivelyOpen(LocalDate.now())) {
            throw new InterviewException.NoSlotsAvailable();
        }
        return slotRepository.findByRecruitmentIdOrderByStartTimeAsc(recruitmentId).stream()
                .map(ApplicantInterviewSlotResponse::from)
                .toList();
    }

    @Override
    @Transactional
    public void delete(Long slotId, Long actorUserId) {
        // recruitmentId 만 얻기 위한 사전 조회 (lock 없음)
        InterviewSlot slotPeek = slotRepository.findById(slotId)
                .orElseThrow(InterviewException.SlotNotFound::new);
        Recruitment recruitment = recruitmentRepository.findById(slotPeek.getRecruitmentId())
                .orElseThrow(RecruitmentException.RecruitmentNotFoundException::new);
        clubAuthService.requireManager(actorUserId, recruitment.getClub().getId());

        // update 와 동일하게 interview_config → slot 순서로 lock (deadlock 회피).
        // config 를 먼저 락해 phase 전환(markAssignmentCompleted)과 직렬화한다.
        InterviewConfig config = configRepository.findByRecruitmentIdForUpdate(slotPeek.getRecruitmentId())
                .orElseThrow(InterviewException.InterviewConfigNotFound::new);
        InterviewSlot slot = slotRepository.findByIdForUpdate(slotId)
                .orElseThrow(InterviewException.SlotNotFound::new);

        int availabilityCount = Math.toIntExact(availabilityRepository.countBySlotId(slotId));
        LocalDateTime now = LocalDateTime.now();

        if (!config.canDeleteSlot(availabilityCount, now)) {
            throw new InterviewException.SlotDeletionNotAllowedInCurrentPhase();
        }
        // phase 1/2 에서도 manual-assigned schedule 이 있는 슬롯은 면접 일정 데이터 무결성을 위해 보호.
        // (phase 3 진입은 canDeleteSlot 에서 이미 차단되므로 여기 도달하지 않는다.)
        if (scheduleRepository.countBySlotIdAndStatus(slotId, InterviewScheduleStatus.ASSIGNED) > 0) {
            throw new InterviewException.SlotHasSchedule();
        }
        slotRepository.delete(slot);
    }
}
