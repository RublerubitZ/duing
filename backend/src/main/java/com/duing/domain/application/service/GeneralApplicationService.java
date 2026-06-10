package com.duing.domain.application.service;

import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.entity.ApplicationStatusHistory;
import com.duing.domain.application.exception.ApplicationDomainException;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.application.repository.ApplicationStatusHistoryRepository;
import com.duing.domain.application.service.dto.command.BulkUpdateApplicationStatusCommand;
import com.duing.domain.application.service.dto.command.SubmitApplicationCommand;
import com.duing.domain.application.service.dto.command.UpdateApplicationStatusCommand;
import com.duing.domain.application.service.dto.query.ApplicantDetailQuery;
import com.duing.domain.application.service.dto.query.ApplicantNeighborsQuery;
import com.duing.domain.application.service.dto.query.ApplicantQuery;
import com.duing.domain.application.service.dto.query.ApplicantSearchCondition;
import com.duing.domain.application.service.dto.query.ApplicationSummaryQuery;
import com.duing.domain.application.service.dto.query.AssignedInterviewQuery;
import com.duing.domain.application.service.dto.query.BulkUpdateApplicationStatusResult;
import com.duing.domain.application.service.dto.query.MyApplicationDetailQuery;
import com.duing.domain.applicationEvaluation.entity.ApplicationEvaluation;
import com.duing.domain.applicationEvaluation.repository.ApplicationEvaluationRepository;
import com.duing.domain.club.entity.Club;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.domain.draft.service.ApplicationDraftService;
import com.duing.domain.interview.entity.InterviewConfig;
import com.duing.domain.interview.entity.InterviewSchedule;
import com.duing.domain.interview.entity.InterviewScheduleStatus;
import com.duing.domain.interview.entity.InterviewSlot;
import com.duing.domain.interview.repository.InterviewAvailabilityRepository;
import com.duing.domain.interview.repository.InterviewConfigRepository;
import com.duing.domain.interview.repository.InterviewScheduleRepository;
import com.duing.domain.interview.repository.InterviewSlotRepository;
import com.duing.domain.interview.service.InterviewAvailabilityService;
import com.duing.domain.interview.service.dto.command.CreateAvailabilitiesInSubmissionCommand;
import com.duing.domain.interview.service.dto.query.InterviewSlotTimeWindow;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentForm;
import com.duing.domain.recruitment.exception.RecruitmentException;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.exception.UserException;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.exception.ApplicationException;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
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
    private final ApplicationDraftService applicationDraftService;
    private final ApplicationStatusHistoryRepository applicationStatusHistoryRepository;
    private final ApplicationEvaluationRepository applicationEvaluationRepository;
    private final InterviewAvailabilityService interviewAvailabilityService;
    private final InterviewAvailabilityRepository interviewAvailabilityRepository;
    private final InterviewScheduleRepository interviewScheduleRepository;
    private final InterviewConfigRepository interviewConfigRepository;
    private final InterviewSlotRepository interviewSlotRepository;

    /**
     * 일괄 처리의 건별 트랜잭션을 위해 자기 자신의 프록시를 lazy 주입한다.
     * 생성자 자체에 self-reference 를 넣으면 순환 의존이 되므로 setter 주입을 사용한다.
     * 단위 테스트가 8-arg 생성자만 사용하는 케이스를 보호하기 위해서이기도 하다 — bulkUpdateStatus 만
     * 본 의존이 필요하고 그 외 진입점에서는 NPE 위험이 없다.
     */
    @Autowired
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

        validateClubMembershipPolicy(recruitment, user);

        validateAnswersAgainstForm(recruitment, submitApplicationCommand.answers());

        Application application = Application.submit(recruitment, user, submitApplicationCommand.answers());
        Long savedApplicationId = applicationRepository.save(application).getId();

        interviewAvailabilityService.createAllInSubmission(new CreateAvailabilitiesInSubmissionCommand(
                savedApplicationId,
                submitApplicationCommand.recruitmentId(),
                submitApplicationCommand.interviewSlotIds()
        ));

        applicationDraftService.discard(submitApplicationCommand.userId(), submitApplicationCommand.recruitmentId());
        return savedApplicationId;
    }

    @Override
    public List<ApplicationSummaryQuery> getMyApplications(Long userId, Set<ApplicationStatus> statuses) {
        List<Application> applications =
                applicationRepository.findByUserIdAndStatusInOrderByCreatedAtDesc(userId, statuses);
        if (applications.isEmpty()) {
            return List.of();
        }

        // 응답 카드의 nested interview 채움용 batch lookup — application 별 개별 쿼리(N+1) 회피.
        // ASSIGNED schedule 이 있으면 interview 가 채워지고 (location 은 nullable),
        // CANCELLED 만 / 미배정인 경우만 null 로 응답한다 (Codex review BE-3 — config.location null 도 interview 노출 유지).
        Map<Long, AssignedInterviewQuery> interviewByApplicationId =
                resolveInterviewBatch(applications.stream().map(Application::getId).toList());

        return applications.stream()
                .map(application -> ApplicationSummaryQuery.from(
                        application, interviewByApplicationId.get(application.getId())))
                .toList();
    }

    @Override
    public MyApplicationDetailQuery getMyApplicationDetail(Long applicationId, Long currentUserId) {
        Application application = applicationRepository.findById(applicationId)
                .orElseThrow(ApplicationDomainException.ApplicationNotFoundException::new);
        if (!application.getUser().getId().equals(currentUserId)) {
            throw new ApplicationDomainException.ForbiddenApplicationAccessException();
        }

        // 지원자 stepper 의 Step 3 sub-state 분기를 위해 면접 진행 상황을 derived 필드로 노출한다.
        // - interviewAvailabilityCount: 본인이 제출한 면접 가능 시간 개수
        // - interview: 현재 배정된 면접 (ASSIGNED schedule 이 있으면 location 이 null 이어도 객체로 노출, 그 외엔 null)
        // - availabilityDeadline: 가능시간 제출 마감 시각 원본(useInterview=false 또는 config 미존재 → null)
        // useInterview=false 모집은 면접 관련 레포지토리 호출 자체를 생략한다.
        if (!application.getRecruitment().isUseInterview()) {
            return MyApplicationDetailQuery.fromAll(application, 0, null, null);
        }

        long interviewAvailabilityCount =
                interviewAvailabilityRepository.countByApplicationId(applicationId);
        InterviewConfig interviewConfig =
                interviewConfigRepository.findByRecruitmentId(application.getRecruitment().getId())
                        .orElse(null);
        LocalDateTime availabilityDeadline = interviewConfig == null ? null
                : interviewConfig.getAvailabilityDeadline();
        AssignedInterviewQuery interview = resolveAssignedInterview(applicationId, interviewConfig);

        return MyApplicationDetailQuery.fromAll(
                application,
                Math.toIntExact(interviewAvailabilityCount),
                interview,
                availabilityDeadline);
    }

    @Override
    public List<ApplicantQuery> getApplicants(Long recruitmentId, Long currentUserId, ApplicantSearchCondition condition) {
        Recruitment recruitment = recruitmentRepository.findById(recruitmentId)
                .orElseThrow(RecruitmentException.RecruitmentNotFoundException::new);
        clubAuthService.requireManager(currentUserId, recruitment.getClub().getId());

        return applicationRepository.searchApplicants(recruitmentId, currentUserId, condition).stream()
                .map(row -> ApplicantQuery.of(row.application(), row.interviewStartAt(), row.myScore()))
                .toList();
    }

    @Override
    public ApplicantDetailQuery getApplicantDetail(Long applicationId, Long currentUserId) {
        Application application = applicationRepository.findWithRecruitmentAndClubById(applicationId)
                .orElseThrow(ApplicationDomainException.ApplicationNotFoundException::new);
        Long clubId = application.getRecruitment().getClub().getId();
        clubAuthService.requireManager(currentUserId, clubId);

        List<ApplicationStatusHistory> historyRows =
                applicationStatusHistoryRepository.findByApplicationIdOrderByCreatedAtDesc(applicationId);
        List<ApplicationEvaluation> evaluations =
                applicationEvaluationRepository.findByApplicationIdWithEvaluator(applicationId);

        // 운영진 상세 카드에 노출할 "지원자가 선택한 면접 가능시간 + 현재 배정 슬롯 + 배정 면접 일정".
        // useInterview=false 모집은 면접 도메인 자체가 없으므로 추가 쿼리 호출 자체를 생략하고
        // 빈 리스트 / null 로 응답한다 (Task 1 의 useInterview 가드 패턴과 동일).
        // 또한 InterviewSchedule.cancel() 은 status 만 CANCELLED 로 바꾸는 도메인 취소이고
        // soft delete 가 아니므로 assignedSlot 쿼리는 status=ASSIGNED 조건을 명시한다.
        List<ApplicantDetailQuery.AvailabilityItem> interviewAvailabilities;
        ApplicantDetailQuery.AvailabilityItem assignedSlot;
        AssignedInterviewQuery interview;
        if (application.getRecruitment().isUseInterview()) {
            // interview 도메인은 자체 표현인 InterviewSlotTimeWindow 로 반환하고,
            // application 도메인이 자기 표현인 AvailabilityItem 으로 매핑한다.
            List<InterviewSlotTimeWindow> availabilityWindows =
                    interviewAvailabilityRepository.findAvailabilityItemsByApplicationId(applicationId);
            interviewAvailabilities = availabilityWindows.stream()
                    .map(window -> new ApplicantDetailQuery.AvailabilityItem(
                            window.slotId(), window.startTime(), window.endTime()))
                    .toList();
            assignedSlot = interviewScheduleRepository
                    .findAssignedSlotByApplicationId(applicationId)
                    .map(window -> new ApplicantDetailQuery.AvailabilityItem(
                            window.slotId(), window.startTime(), window.endTime()))
                    .orElse(null);
            InterviewConfig interviewConfig = interviewConfigRepository
                    .findByRecruitmentId(application.getRecruitment().getId())
                    .orElse(null);
            interview = resolveAssignedInterview(applicationId, interviewConfig);
        } else {
            interviewAvailabilities = List.of();
            assignedSlot = null;
            interview = null;
        }

        return ApplicantDetailQuery.fromAll(application, historyRows, evaluations, currentUserId,
                interviewAvailabilities, assignedSlot, interview);
    }

    @Override
    @Transactional
    public void updateStatus(UpdateApplicationStatusCommand updateApplicationStatusCommand) {
        Application application = applicationRepository.findById(updateApplicationStatusCommand.applicationId())
                .orElseThrow(ApplicationDomainException.ApplicationNotFoundException::new);
        clubAuthService.requireManager(updateApplicationStatusCommand.currentUserId(), application.getRecruitment().getClub().getId());

        ApplicationStatus previousStatus = application.getStatus();
        application.transitionTo(
                updateApplicationStatusCommand.status(),
                application.getRecruitment().isUseInterview());

        User changedBy = userRepository.findById(updateApplicationStatusCommand.currentUserId())
                .orElseThrow(UserException.UserNotFoundException::new);
        applicationStatusHistoryRepository.save(
                ApplicationStatusHistory.record(application, previousStatus, updateApplicationStatusCommand.status(), changedBy)
        );

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
    public ApplicantNeighborsQuery getNeighbors(Long recruitmentId, Long applicationId, Long currentUserId,
                                                 ApplicantSearchCondition condition) {
        Recruitment recruitment = recruitmentRepository.findById(recruitmentId)
                .orElseThrow(RecruitmentException.RecruitmentNotFoundException::new);
        clubAuthService.requireManager(currentUserId, recruitment.getClub().getId());
        return applicationRepository.findNeighbors(recruitmentId, applicationId, condition);
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

    /**
     * 모집 대상 역할별 지원 자격을 검증한다.
     * - MEMBER 모집: 해당 동아리에 소속된 사용자(역할 무관) 는 재지원 불가. 다른 동아리 소속은 영향 없음.
     * - OFFICER 모집: 해당 동아리의 MEMBER 만 지원 가능. 멤버십 없음은 차단,
     *   이미 OFFICER/LEADER 인 사용자도 재지원 차단.
     * 소프트 삭제·비활성 멤버십은 SQLRestriction 으로 조회 자체에서 제외되므로 별도 처리하지 않는다.
     */
    private void validateClubMembershipPolicy(Recruitment recruitment, User user) {
        Long clubId = recruitment.getClub().getId();
        ClubMemberRole currentRole = clubMemberRepository.findByClubIdAndUserId(clubId, user.getId())
                .map(ClubMember::getRole)
                .orElse(null);

        switch (recruitment.getTargetRole()) {
            case MEMBER -> {
                if (currentRole != null) {
                    throw new ApplicationDomainException.AlreadyClubMemberException();
                }
            }
            case OFFICER -> {
                if (currentRole == null) {
                    throw new ApplicationDomainException.OfficerMembershipRequiredException();
                }
                if (currentRole != ClubMemberRole.MEMBER) {
                    throw new ApplicationDomainException.IneligibleOfficerApplicantException();
                }
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

    /**
     * 응답 DTO 의 nested {@code interview} 채움용 단건 헬퍼.
     * ASSIGNED 상태 schedule 이 있고 그 schedule 에 매핑된 슬롯이 존재하면 {@link AssignedInterviewQuery} 를 반환한다.
     * {@code InterviewConfig} 이 없거나 {@code config.location} 이 null 이어도 interview 자체는 그대로 노출하되
     * location 만 null 로 채운다 (Codex review BE-3).
     * <p>
     * {@code InterviewSchedule.cancel()} 은 status 만 CANCELLED 로 바꾸는 도메인 취소로
     * {@code @SQLRestriction} 가 걸려 있지 않으므로 status 조건을 명시한다.
     */
    private AssignedInterviewQuery resolveAssignedInterview(Long applicationId, InterviewConfig interviewConfig) {
        String location = interviewConfig == null ? null : interviewConfig.getLocation();
        return interviewScheduleRepository.findByApplicationId(applicationId)
                .filter(schedule -> schedule.getStatus() == InterviewScheduleStatus.ASSIGNED)
                .flatMap(schedule -> interviewSlotRepository.findById(schedule.getSlotId()))
                .map(slot -> new AssignedInterviewQuery(
                        slot.getStartTime(), slot.getEndTime(), location))
                .orElse(null);
    }

    /**
     * 응답 리스트 DTO 의 nested {@code interview} 채움용 batch 헬퍼.
     * 지원 ID 다건을 한 번에 끌어와 N+1 을 회피한다 — Task 2 (InterviewReminderJob) 패턴과 동일.
     * <ol>
     *   <li>application_id IN (...) AND status=ASSIGNED InterviewSchedule 일괄 조회</li>
     *   <li>대상 schedule 들의 slot_id / recruitment_id 를 batch 로 join</li>
     *   <li>{@code InterviewConfig.location} 이 비어 있어도 interview 객체는 그대로 노출 (location 만 null)</li>
     * </ol>
     * 결과 Map 에 키가 없는 application 은 호출 측에서 {@code null} 로 표현되어 "면접 미배정" 을 의미한다.
     */
    private Map<Long, AssignedInterviewQuery> resolveInterviewBatch(List<Long> applicationIds) {
        if (applicationIds.isEmpty()) {
            return Collections.emptyMap();
        }

        List<InterviewSchedule> assignedSchedules = interviewScheduleRepository
                .findByApplicationIdIn(applicationIds).stream()
                .filter(schedule -> schedule.getStatus() == InterviewScheduleStatus.ASSIGNED)
                .toList();
        if (assignedSchedules.isEmpty()) {
            return Collections.emptyMap();
        }

        Set<Long> slotIds = assignedSchedules.stream()
                .map(InterviewSchedule::getSlotId)
                .collect(Collectors.toSet());
        Set<Long> recruitmentIds = assignedSchedules.stream()
                .map(InterviewSchedule::getRecruitmentId)
                .collect(Collectors.toSet());

        Map<Long, InterviewSlot> slotById = interviewSlotRepository.findAllById(slotIds).stream()
                .collect(Collectors.toMap(InterviewSlot::getId, Function.identity()));
        Map<Long, InterviewConfig> configByRecruitmentId =
                interviewConfigRepository.findByRecruitmentIdIn(recruitmentIds).stream()
                        .collect(Collectors.toMap(InterviewConfig::getRecruitmentId, Function.identity()));

        Map<Long, AssignedInterviewQuery> result = new HashMap<>();
        for (InterviewSchedule schedule : assignedSchedules) {
            InterviewSlot slot = slotById.get(schedule.getSlotId());
            if (slot == null) {
                continue;
            }
            // config 또는 config.location 이 null 인 경우에도 interview 자체는 노출하고 location 만 null 로 채운다.
            InterviewConfig config = configByRecruitmentId.get(schedule.getRecruitmentId());
            String location = config == null ? null : config.getLocation();
            result.put(schedule.getApplicationId(), new AssignedInterviewQuery(
                    slot.getStartTime(), slot.getEndTime(), location));
        }
        return result;
    }
}
