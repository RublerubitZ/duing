package com.duing.domain.interview.service;

import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.domain.interview.entity.InterviewSlot;
import com.duing.domain.interview.exception.InterviewException;
import com.duing.domain.interview.repository.InterviewConfigRepository;
import com.duing.domain.interview.repository.InterviewSlotRepository;
import com.duing.domain.interview.service.dto.command.CreateInterviewSlotsCommand;
import com.duing.domain.interview.service.dto.query.SlotListView;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.exception.RecruitmentException;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import java.time.LocalDate;
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
        if (!LocalDate.now().isBefore(recruitment.getStartDate())) {
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
}
