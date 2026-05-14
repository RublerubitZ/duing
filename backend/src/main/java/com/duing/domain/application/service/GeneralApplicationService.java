package com.duing.domain.application.service;

import com.duing.domain.application.entity.Application;
import com.duing.domain.application.exception.ApplicationDomainException;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.application.service.dto.command.SubmitApplicationCommand;
import com.duing.domain.application.service.dto.command.UpdateApplicationStatusCommand;
import com.duing.domain.application.service.dto.query.ApplicantQuery;
import com.duing.domain.application.service.dto.query.ApplicationSummaryQuery;
import com.duing.domain.club.entity.Club;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentForm;
import com.duing.domain.recruitment.exception.RecruitmentException;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.exception.UserException;
import com.duing.domain.user.repository.UserRepository;
import java.time.LocalDate;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralApplicationService implements ApplicationService {

    private final ApplicationRepository applicationRepository;
    private final RecruitmentRepository recruitmentRepository;
    private final UserRepository userRepository;

    @Override
    @Transactional
    public Long submit(SubmitApplicationCommand submitApplicationCommand) {
        Recruitment recruitment = recruitmentRepository.findById(submitApplicationCommand.recruitmentId())
                .orElseThrow(RecruitmentException.RecruitmentNotFoundException::new);

        if (!recruitment.isEffectivelyOpen(LocalDate.now())) {
            throw new ApplicationDomainException.RecruitmentClosedException();
        }

        User user = userRepository.findById(submitApplicationCommand.userId())
                .orElseThrow(UserException.UserNotFoundException::new);

        if (applicationRepository.existsByRecruitmentIdAndUserId(recruitment.getId(), user.getId())) {
            throw new ApplicationDomainException.DuplicateApplicationException();
        }

        validateAnswersAgainstForm(recruitment, submitApplicationCommand.answers());

        Application application = Application.submit(recruitment, user, submitApplicationCommand.answers());
        return applicationRepository.save(application).getId();
    }

    @Override
    public List<ApplicationSummaryQuery> getMyApplications(Long userId) {
        return applicationRepository.findByUserIdOrderByCreatedAtDesc(userId).stream()
                .map(ApplicationSummaryQuery::from)
                .toList();
    }

    @Override
    public List<ApplicantQuery> getApplicants(Long recruitmentId, Long currentUserId) {
        Recruitment recruitment = recruitmentRepository.findById(recruitmentId)
                .orElseThrow(RecruitmentException.RecruitmentNotFoundException::new);
        verifyClubLeader(recruitment.getClub(), currentUserId);

        return applicationRepository.findByRecruitmentIdOrderByCreatedAtAsc(recruitmentId).stream()
                .map(ApplicantQuery::from)
                .toList();
    }

    @Override
    @Transactional
    public void updateStatus(UpdateApplicationStatusCommand updateApplicationStatusCommand) {
        Application application = applicationRepository.findById(updateApplicationStatusCommand.applicationId())
                .orElseThrow(ApplicationDomainException.ApplicationNotFoundException::new);
        verifyClubLeader(application.getRecruitment().getClub(), updateApplicationStatusCommand.currentUserId());

        try {
            application.updateStatus(updateApplicationStatusCommand.status());
        } catch (IllegalArgumentException exception) {
            throw new ApplicationDomainException.InvalidStatusTransitionException();
        }
    }

    private void validateAnswersAgainstForm(Recruitment recruitment, List<String> answers) {
        RecruitmentForm form = recruitment.getForm();
        int expected = form == null ? 0 : form.getQuestions().size();
        int actual = answers == null ? 0 : answers.size();
        if (expected != actual) {
            throw new ApplicationDomainException.InvalidAnswersException();
        }
    }

    private void verifyClubLeader(Club club, Long currentUserId) {
        if (club.getLeader() == null || !club.getLeader().getId().equals(currentUserId)) {
            throw new ApplicationDomainException.NotClubLeaderException();
        }
    }
}
