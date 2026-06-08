package com.duing.domain.interview.service;

import com.duing.domain.clubmember.service.ClubAuthService;
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

        if (!configRepository.existsByRecruitmentId(recruitment.getId())) {
            throw new InterviewException.InterviewConfigNotFound();
        }
        if (LocalDate.now().isAfter(recruitment.getStartDate())) {
            throw new InterviewException.RecruitmentAlreadyStarted();
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
        configRepository.findByRecruitmentIdForUpdate(slotPeek.getRecruitmentId())
                .orElseThrow(InterviewException.InterviewConfigNotFound::new);
        InterviewSlot slot = slotRepository.findByIdForUpdate(command.slotId())
                .orElseThrow(InterviewException.SlotNotFound::new);

        long availabilityCount = availabilityRepository.countBySlotId(slot.getId());
        long assignedCount = scheduleRepository.countBySlotIdAndStatus(slot.getId(), InterviewScheduleStatus.ASSIGNED);

        if (command.startTime() != null || command.endTime() != null) {
            if (availabilityCount > 0) {
                throw new InterviewException.SlotHasAvailability();
            }
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
    @Transactional
    public void delete(Long slotId, Long actorUserId) {
        InterviewSlot slot = slotRepository.findByIdForUpdate(slotId)
                .orElseThrow(InterviewException.SlotNotFound::new);
        Recruitment recruitment = recruitmentRepository.findById(slot.getRecruitmentId())
                .orElseThrow(RecruitmentException.RecruitmentNotFoundException::new);
        clubAuthService.requireManager(actorUserId, recruitment.getClub().getId());

        if (availabilityRepository.countBySlotId(slotId) > 0) {
            throw new InterviewException.SlotHasAvailability();
        }
        if (scheduleRepository.countBySlotIdAndStatus(slotId, InterviewScheduleStatus.ASSIGNED) > 0) {
            throw new InterviewException.SlotHasSchedule();
        }
        slotRepository.delete(slot);
    }
}
