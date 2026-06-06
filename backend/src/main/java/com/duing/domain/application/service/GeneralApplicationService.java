package com.duing.domain.application.service;

import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.exception.ApplicationDomainException;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.application.service.dto.command.BulkUpdateApplicationStatusCommand;
import com.duing.domain.application.service.dto.command.SubmitApplicationCommand;
import com.duing.domain.application.service.dto.command.UpdateApplicationStatusCommand;
import com.duing.domain.application.service.dto.command.UpdateInterviewCommand;
import com.duing.domain.application.service.dto.query.ApplicantDetailQuery;
import com.duing.domain.application.service.dto.query.ApplicantQuery;
import com.duing.domain.application.service.dto.query.ApplicationSummaryQuery;
import com.duing.domain.application.service.dto.query.BulkUpdateApplicationStatusResult;
import com.duing.domain.application.service.dto.query.MyApplicationDetailQuery;
import com.duing.domain.club.entity.Club;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.domain.draft.service.ApplicationDraftService;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentForm;
import com.duing.domain.recruitment.entity.TargetRole;
import com.duing.domain.recruitment.exception.RecruitmentException;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.exception.UserException;
import com.duing.domain.user.repository.UserRepository;
import com.duing.domain.notification.event.InterviewScheduledEvent;
import com.duing.global.notification.InterviewNotificationService;
import com.duing.global.exception.ApplicationException;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralApplicationService implements ApplicationService {

    private static final Logger log = LoggerFactory.getLogger(GeneralApplicationService.class);

    // V7 partial unique 인덱스. (club_id, user_id) WHERE deleted_at IS NULL.
    private static final String CLUB_MEMBER_UNIQUE_CONSTRAINT = "uk_club_member_club_user_active";
    // PostgreSQL unique_violation.
    private static final String POSTGRES_UNIQUE_VIOLATION_SQL_STATE = "23505";

    private final ApplicationRepository applicationRepository;
    private final RecruitmentRepository recruitmentRepository;
    private final UserRepository userRepository;
    private final ClubMemberRepository clubMemberRepository;
    private final ClubAuthService clubAuthService;
    private final InterviewNotificationService interviewNotificationService;
    private final ApplicationDraftService applicationDraftService;
    private final ApplicationEventPublisher eventPublisher;
    /**
     * 일괄 처리의 건별 트랜잭션을 위해 자기 자신의 프록시를 lazy 주입한다.
     * 생성자 자체에 self-reference 를 넣으면 순환 의존이 되므로 setter 주입을 사용한다.
     * 단위 테스트가 8-arg 생성자만 사용하는 케이스를 보호하기 위해서이기도 하다 — bulkUpdateStatus 만
     * 본 의존이 필요하고 그 외 진입점에서는 NPE 위험이 없다.
     */
    @org.springframework.beans.factory.annotation.Autowired
    private ObjectProvider<ApplicationService> selfProvider;

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
        Long savedApplicationId = applicationRepository.save(application).getId();
        applicationDraftService.discard(submitApplicationCommand.userId(), submitApplicationCommand.recruitmentId());
        return savedApplicationId;
    }

    @Override
    public List<ApplicationSummaryQuery> getMyApplications(Long userId, Set<ApplicationStatus> statuses) {
        return applicationRepository.findByUserIdAndStatusInOrderByCreatedAtDesc(userId, statuses).stream()
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
        clubAuthService.requireManager(currentUserId, recruitment.getClub().getId());

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
        clubAuthService.requireManager(updateApplicationStatusCommand.currentUserId(), application.getRecruitment().getClub().getId());

        application.transitionTo(
                updateApplicationStatusCommand.status(),
                application.getRecruitment().isUseInterview());

        // 합격 처리 시 지원자를 모집의 targetRole 에 맞춰 동아리 회원으로 자동 등록.
        // - 기존 멤버십이 없으면 신규 생성.
        // - 기존 멤버십이 있으면 역할을 비교해 상위 역할로만 승급 (강등 금지, 멱등성 보장).
        // 동시 ACCEPTED 처리 시 race condition 은
        // club_member (club_id, user_id) WHERE deleted_at IS NULL partial unique 인덱스(V7)로
        // DB 레벨에서 차단된다. flush 로 트랜잭션 안에서 충돌을 트리거하고,
        // 23505 + uk_club_member_club_user_active 만 idempotent 처리, 나머지는 전파한다.
        if (updateApplicationStatusCommand.status() == ApplicationStatus.ACCEPTED) {
            Club club = application.getRecruitment().getClub();
            User applicant = application.getUser();
            ClubMemberRole grantedRole = application.getRecruitment().getTargetRole().toClubMemberRole();
            clubMemberRepository.findByClubIdAndUserId(club.getId(), applicant.getId())
                    .ifPresentOrElse(
                            existingMembership -> {
                                if (shouldUpgrade(existingMembership.getRole(), grantedRole)) {
                                    existingMembership.changeRole(grantedRole);
                                }
                            },
                            () -> {
                                try {
                                    clubMemberRepository.save(ClubMember.of(club, applicant, grantedRole));
                                    clubMemberRepository.flush();
                                } catch (DataIntegrityViolationException racedInsertion) {
                                    if (!isClubMemberDuplicateMembership(racedInsertion)) {
                                        throw racedInsertion;
                                    }
                                    // 다른 트랜잭션이 먼저 (club, user) 멤버십을 등록한 경우로 간주, idempotent 처리.
                                }
                            });
        }

        // Optimistic Lock 충돌은 커밋 시 발생해 GlobalExceptionHandler 의 fallthrough 로 빠진다.
        // 명시적 flush 로 현재 트랜잭션 안에서 잡아 도메인 예외(409) 로 변환해야
        // bulkUpdateStatus 의 ApplicationException 분기에 정확한 사용자 메시지가 실린다.
        try {
            applicationRepository.flush();
        } catch (ObjectOptimisticLockingFailureException concurrentUpdate) {
            throw new ApplicationDomainException.ConcurrentStatusUpdateException();
        }
    }

    @Override
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public BulkUpdateApplicationStatusResult bulkUpdateStatus(BulkUpdateApplicationStatusCommand bulkCommand) {
        // 입력 ID 중복은 클라이언트 실수 보호 차원에서 제거하되 순서는 유지한다.
        Set<Long> uniqueIds = new LinkedHashSet<>(bulkCommand.applicationIds());

        // 건별 트랜잭션을 얻기 위해 자기 자신의 프록시를 통해 updateStatus 를 호출한다.
        // 본 메서드는 @Transactional(NOT_SUPPORTED) 로 클래스 레벨 readOnly TX 를 일시중단하므로
        // 각 self.updateStatus(...) 가 REQUIRED 로 신규 쓰기 TX 를 연다.
        ApplicationService self = selfProvider.getObject();

        int updated = 0;
        List<BulkUpdateApplicationStatusResult.Failure> failures = new ArrayList<>();
        for (Long applicationId : uniqueIds) {
            try {
                self.updateStatus(new UpdateApplicationStatusCommand(
                        applicationId, bulkCommand.currentUserId(), bulkCommand.status()));
                updated++;
            } catch (ApplicationException domainFailure) {
                // 도메인 실패 (없음 / 권한 / 잘못된 전이) — 사용자에게 노출할 한국어 메시지가 들어있다.
                failures.add(new BulkUpdateApplicationStatusResult.Failure(
                        applicationId, domainFailure.getMessage()));
            } catch (RuntimeException unexpected) {
                // 시스템성 실패 — 로그는 남기되 응답에는 일반화된 메시지로 노출한다.
                log.warn("[일괄 상태 변경 실패] applicationId={}, target={}",
                        applicationId, bulkCommand.status(), unexpected);
                failures.add(new BulkUpdateApplicationStatusResult.Failure(
                        applicationId, "일시적 오류로 처리하지 못했습니다."));
            }
        }
        return new BulkUpdateApplicationStatusResult(updated, failures);
    }

    @Override
    @Transactional
    public void updateInterview(UpdateInterviewCommand updateInterviewCommand) {
        Application application = applicationRepository.findById(updateInterviewCommand.applicationId())
                .orElseThrow(ApplicationDomainException.ApplicationNotFoundException::new);
        clubAuthService.requireManager(updateInterviewCommand.currentUserId(),
                application.getRecruitment().getClub().getId());

        application.updateInterview(updateInterviewCommand.interviewAt(), updateInterviewCommand.interviewLocation());

        try {
            interviewNotificationService.notifyInterviewScheduled(
                    application.getId(),
                    application.getUser().getEmail(),
                    updateInterviewCommand.interviewAt(),
                    updateInterviewCommand.interviewLocation());
        } catch (Exception notificationFailure) {
            log.warn("[면접 알림 발송 실패] applicationId={}", application.getId());
        }

        eventPublisher.publishEvent(new InterviewScheduledEvent(
                application.getId(),
                application.getUser().getId(),
                application.getRecruitment().getClub().getName(),
                application.getInterviewAt(),
                application.getInterviewLocation()));
    }

    /**
     * 현재 역할보다 부여할 역할이 상위일 때만 true 를 반환한다.
     * 역할 서열: MEMBER(0) < OFFICER(1) < LEADER(2).
     * LEADER 는 이 경로에서 부여되지 않으며, 강등은 절대 허용하지 않는다.
     */
    private boolean shouldUpgrade(ClubMemberRole currentRole, ClubMemberRole grantedRole) {
        return grantedRole.ordinal() > currentRole.ordinal();
    }

    /**
     * 동시 ACCEPTED 처리로 인한 club_member 중복 삽입 only true.
     * 향후 club_member 에 새 unique / CHECK / FK 가 추가되어도 그 위반은 그대로 위로 전파된다.
     */
    private static boolean isClubMemberDuplicateMembership(DataIntegrityViolationException exception) {
        Throwable mostSpecific = exception.getMostSpecificCause();
        if (!(mostSpecific instanceof java.sql.SQLException sqlException)) {
            return false;
        }
        if (!POSTGRES_UNIQUE_VIOLATION_SQL_STATE.equals(sqlException.getSQLState())) {
            return false;
        }
        String message = sqlException.getMessage();
        return message != null && message.contains(CLUB_MEMBER_UNIQUE_CONSTRAINT);
    }

    private void validateAnswersAgainstForm(Recruitment recruitment, List<String> answers) {
        RecruitmentForm form = recruitment.getForm();
        int expected = form == null ? 0 : form.getQuestions().size();
        int actual = answers == null ? 0 : answers.size();
        if (expected != actual) {
            throw new ApplicationDomainException.InvalidAnswersException();
        }
    }
}
