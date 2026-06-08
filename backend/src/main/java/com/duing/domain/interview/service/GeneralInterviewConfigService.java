package com.duing.domain.interview.service;

import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.domain.interview.controller.dto.response.InterviewConfigResponse;
import com.duing.domain.interview.service.dto.command.CreateInterviewConfigCommand;
import com.duing.domain.interview.service.dto.command.UpdateInterviewConfigCommand;
import com.duing.domain.interview.entity.InterviewConfig;
import com.duing.domain.interview.exception.InterviewException;
import com.duing.domain.interview.repository.InterviewConfigRepository;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.exception.RecruitmentException;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import java.time.LocalDate;
import java.time.LocalDateTime;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralInterviewConfigService implements InterviewConfigService {

    private final InterviewConfigRepository configRepository;
    private final RecruitmentRepository recruitmentRepository;
    private final ClubAuthService clubAuthService;

    @Override
    @Transactional
    public Long create(CreateInterviewConfigCommand command) {
        Recruitment recruitment = recruitmentRepository.findById(command.recruitmentId())
                .orElseThrow(RecruitmentException.RecruitmentNotFoundException::new);
        clubAuthService.requireManager(command.actorUserId(), recruitment.getClub().getId());

        if (configRepository.existsByRecruitmentId(recruitment.getId())) {
            throw new InterviewException.ConfigAlreadyExists();
        }
        if (LocalDate.now().isAfter(recruitment.getStartDate())) {
            throw new InterviewException.RecruitmentAlreadyStarted();
        }
        validateDeadlineInRecruitmentPeriod(command.availabilityDeadline(), recruitment);

        InterviewConfig savedConfig = configRepository.save(
                InterviewConfig.create(recruitment.getId(),
                        command.availabilityDeadline(),
                        command.location()));
        return savedConfig.getId();
    }

    @Override
    @Transactional
    public void update(UpdateInterviewConfigCommand command) {
        Recruitment recruitment = recruitmentRepository.findById(command.recruitmentId())
                .orElseThrow(RecruitmentException.RecruitmentNotFoundException::new);
        clubAuthService.requireManager(command.actorUserId(), recruitment.getClub().getId());

        InterviewConfig config = configRepository.findByRecruitmentId(recruitment.getId())
                .orElseThrow(InterviewException.InterviewConfigNotFound::new);
        if (config.getAssignmentCompletedAt() != null) {
            throw new InterviewException.AssignmentAlreadyCompleted();
        }
        if (command.availabilityDeadline() != null) {
            validateDeadlineInRecruitmentPeriod(command.availabilityDeadline(), recruitment);
            config.updateDeadline(command.availabilityDeadline(), LocalDateTime.now());
        }
        config.updateLocation(command.location());
    }

    @Override
    public InterviewConfigResponse getByRecruitmentId(Long recruitmentId, Long actorUserId) {
        Recruitment recruitment = recruitmentRepository.findById(recruitmentId)
                .orElseThrow(RecruitmentException.RecruitmentNotFoundException::new);
        clubAuthService.requireManager(actorUserId, recruitment.getClub().getId());

        InterviewConfig config = configRepository.findByRecruitmentId(recruitmentId)
                .orElseThrow(InterviewException.InterviewConfigNotFound::new);
        return InterviewConfigResponse.from(config);
    }

    private void validateDeadlineInRecruitmentPeriod(LocalDateTime deadline, Recruitment recruitment) {
        LocalDate deadlineDate = deadline.toLocalDate();
        if (!deadlineDate.isAfter(recruitment.getStartDate())
                || (recruitment.getEndDate() != null && !deadlineDate.isBefore(recruitment.getEndDate()))) {
            throw new InterviewException.InvalidDeadline();
        }
    }
}
