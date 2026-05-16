package com.duing.domain.application.service;

import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.exception.ApplicationDomainException;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.application.service.dto.command.SubmitApplicationCommand;
import com.duing.domain.application.service.dto.command.UpdateApplicationStatusCommand;
import com.duing.domain.application.service.dto.query.ApplicantDetailQuery;
import com.duing.domain.application.service.dto.query.ApplicantQuery;
import com.duing.domain.application.service.dto.query.ApplicationSummaryQuery;
import com.duing.domain.application.service.dto.query.MyApplicationDetailQuery;
import com.duing.domain.club.entity.Club;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.exception.ClubMemberException;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentForm;
import com.duing.domain.recruitment.entity.TargetRole;
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
    private final ClubMemberRepository clubMemberRepository;
    private final ClubAuthService clubAuthService;

    @Override
    @Transactional
    public Long submit(SubmitApplicationCommand submitApplicationCommand) {
        Recruitment recruitment = recruitmentRepository.findById(submitApplicationCommand.recruitmentId())
                .orElseThrow(RecruitmentException.RecruitmentNotFoundException::new);

        if (!recruitment.isEffectivelyOpen(LocalDate.now())) {
            throw new ApplicationDomainException.RecruitmentClosedException();
        }

        if (recruitment.getApplicationMode() == ApplicationMode.EXTERNAL) {
            throw new ApplicationDomainException.ExternalFormSubmitException();
        }

        User user = userRepository.findById(submitApplicationCommand.userId())
                .orElseThrow(UserException.UserNotFoundException::new);

        if (applicationRepository.existsByRecruitmentIdAndUserId(recruitment.getId(), user.getId())) {
            throw new ApplicationDomainException.DuplicateApplicationException();
        }

        if (recruitment.getTargetRole() == TargetRole.OFFICER) {
            boolean isExistingMember = clubMemberRepository
                    .existsByClubIdAndUserId(recruitment.getClub().getId(), user.getId());
            if (!isExistingMember) {
                throw new ApplicationDomainException.OfficerMembershipRequiredException();
            }
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
    public MyApplicationDetailQuery getMyApplicationDetail(Long applicationId, Long currentUserId) {
        Application application = applicationRepository.findById(applicationId)
                .orElseThrow(ApplicationDomainException.ApplicationNotFoundException::new);
        if (!application.getUser().getId().equals(currentUserId)) {
            throw new ApplicationDomainException.ForbiddenApplicationAccessException();
        }
        return MyApplicationDetailQuery.from(application);
    }

    @Override
    public List<ApplicantQuery> getApplicants(Long recruitmentId, Long currentUserId) {
        Recruitment recruitment = recruitmentRepository.findById(recruitmentId)
                .orElseThrow(RecruitmentException.RecruitmentNotFoundException::new);
        verifyClubManager(recruitment.getClub(), currentUserId);

        return applicationRepository.findByRecruitmentIdOrderByCreatedAtAsc(recruitmentId).stream()
                .map(ApplicantQuery::from)
                .toList();
    }

    @Override
    public ApplicantDetailQuery getApplicantDetail(Long applicationId, Long currentUserId) {
        Application application = applicationRepository.findWithRecruitmentAndClubById(applicationId)
                .orElseThrow(ApplicationDomainException.ApplicationNotFoundException::new);
        Long clubId = application.getRecruitment().getClub().getId();
        clubAuthService.requireManager(currentUserId, clubId);
        return ApplicantDetailQuery.from(application);
    }

    @Override
    @Transactional
    public void updateStatus(UpdateApplicationStatusCommand updateApplicationStatusCommand) {
        Application application = applicationRepository.findById(updateApplicationStatusCommand.applicationId())
                .orElseThrow(ApplicationDomainException.ApplicationNotFoundException::new);
        verifyClubManager(application.getRecruitment().getClub(), updateApplicationStatusCommand.currentUserId());

        application.transitionTo(
                updateApplicationStatusCommand.status(),
                application.getRecruitment().isUseInterview());

        // 합격 처리 시 지원자를 모집의 targetRole 에 맞춰 동아리 회원으로 자동 등록.
        // 이미 회원이면 무시 (멱등성 보장). 동시 ACCEPTED 처리 시 race condition 은
        // club_member (club_id, user_id) WHERE deleted_at IS NULL partial unique 인덱스(V7)로
        // DB 레벨에서 차단되며, 충돌 시 다른 트랜잭션이 먼저 등록한 케이스로 간주해 무시한다.
        if (updateApplicationStatusCommand.status() == ApplicationStatus.ACCEPTED) {
            Club club = application.getRecruitment().getClub();
            User applicant = application.getUser();
            ClubMemberRole grantedRole = application.getRecruitment().getTargetRole().toClubMemberRole();
            try {
                if (!clubMemberRepository.existsByClubIdAndUserId(club.getId(), applicant.getId())) {
                    clubMemberRepository.save(ClubMember.of(club, applicant, grantedRole));
                }
            } catch (org.springframework.dao.DataIntegrityViolationException duplicateMembership) {
                // 동시 ACCEPTED 처리 시 다른 트랜잭션이 먼저 등록한 경우로 간주, idempotent 처리.
            }
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

    private void verifyClubManager(Club club, Long currentUserId) {
        clubMemberRepository.findByClubIdAndUserId(club.getId(), currentUserId)
                .filter(ClubMember::canManageClub)
                .orElseThrow(ClubMemberException.NotClubManagerException::new);
    }
}
