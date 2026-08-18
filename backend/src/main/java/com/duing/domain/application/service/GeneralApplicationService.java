package com.duing.domain.application.service;

import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationAnswer;
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
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.exception.ClubMemberException;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.domain.clubmember.service.ClubMemberEnrollmentService;
import com.duing.domain.draft.service.ApplicationDraftService;
import com.duing.domain.interview.entity.InterviewRound;
import com.duing.domain.interview.entity.InterviewSchedule;
import com.duing.domain.interview.entity.InterviewScheduleStatus;
import com.duing.domain.interview.entity.InterviewSlot;
import com.duing.domain.interview.entity.RoundMemberStatus;
import com.duing.domain.interview.repository.InterviewAvailabilityRepository;
import com.duing.domain.interview.repository.InterviewRoundMemberRepositoryCustom;
import com.duing.domain.interview.repository.InterviewRoundRepository;
import com.duing.domain.interview.repository.InterviewScheduleRepository;
import com.duing.domain.interview.repository.InterviewSlotRepository;
import com.duing.domain.interview.service.dto.query.InterviewSlotTimeWindow;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.QuestionChoice;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentForm;
import com.duing.domain.recruitment.entity.RecruitmentQuestion;
import com.duing.domain.recruitment.exception.RecruitmentException;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.recruitment.service.ClosedRecruitmentPolicy;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.exception.UserException;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.exception.ApplicationException;
import java.time.Clock;
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
import java.util.stream.IntStream;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralApplicationService implements ApplicationService {

    private static final Logger log = LoggerFactory.getLogger(GeneralApplicationService.class);

    // V6 partial unique 인덱스. (recruitment_id, user_id) WHERE deleted_at IS NULL.
    private static final String APPLICATION_UNIQUE_CONSTRAINT = "uk_application_recruitment_user_active";
    // PostgreSQL unique_violation.
    private static final String POSTGRES_UNIQUE_VIOLATION_SQL_STATE = "23505";
    // 일괄 상태 변경의 건별 실패 사유 — 미존재(NotFound)와 타 클럽 권한없음(NotAMember)을 동일 메시지로
    // 합쳐, 타 클럽 운영진이 임의 ID 로 지원서 존재/소속 여부를 알아내는 열거(oracle)를 막는다.
    private static final String BULK_ITEM_GENERIC_FAILURE = "해당 지원서를 처리할 권한이 없거나 존재하지 않습니다.";

    private final ApplicationRepository applicationRepository;
    private final RecruitmentRepository recruitmentRepository;
    private final UserRepository userRepository;
    private final ClubMemberRepository clubMemberRepository;
    private final ClubAuthService clubAuthService;
    private final ClubMemberEnrollmentService clubMemberEnrollmentService;
    private final ApplicationDraftService applicationDraftService;
    private final ApplicationStatusHistoryRepository applicationStatusHistoryRepository;
    private final ApplicationEvaluationRepository applicationEvaluationRepository;
    private final InterviewAvailabilityRepository interviewAvailabilityRepository;
    private final InterviewScheduleRepository interviewScheduleRepository;
    private final InterviewRoundRepository interviewRoundRepository;
    private final InterviewSlotRepository interviewSlotRepository;
    private final InterviewRoundMemberRepositoryCustom interviewRoundMemberRepository;
    private final Clock clock;

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
        // 질문 정의를 읽기 전에 폼을 공유 잠금해, 읽는 도중 질문이 교체되어
        // 답변이 사라진 질문 id 를 참조하게 되는 경합을 막는다 (질문 변경은 배타 잠금).
        recruitmentRepository.lockFormForSubmission(submitApplicationCommand.recruitmentId());

        EligibilityTarget eligibilityTarget = validateEligibility(
                submitApplicationCommand.userId(), submitApplicationCommand.recruitmentId());
        Recruitment recruitment = eligibilityTarget.recruitment();

        // 정확히 하나의 통로만 채워져 있음은 SubmitApplicationCommand 컴팩트 생성자가 이미 보장한다.
        List<ApplicationAnswer> resolvedAnswers = submitApplicationCommand.answerItems() != null
                ? submitApplicationCommand.answerItems().stream()
                        .map(answerItem -> new ApplicationAnswer(answerItem.questionId(), answerItem.values()))
                        .toList()
                : resolveLegacyAnswers(recruitment, submitApplicationCommand.answers());
        validateAnswersAgainstForm(recruitment, resolvedAnswers);

        Application application =
                Application.submit(recruitment, eligibilityTarget.user(), resolvedAnswers);
        Long savedApplicationId;
        try {
            savedApplicationId = applicationRepository.save(application).getId();
            // 사전 중복 체크(existsBy...)와 INSERT 사이의 동시 제출 경합은 partial unique 인덱스가 막는다.
            // 명시적 flush 로 커밋이 아닌 현재 트랜잭션 안에서 충돌을 잡아, 순차 중복 제출과 동일한
            // 사용자 메시지(DuplicateApplicationException)로 변환한다.
            applicationRepository.flush();
        } catch (DataIntegrityViolationException racedSubmission) {
            if (!isApplicationDuplicate(racedSubmission)) {
                throw racedSubmission;
            }
            throw new ApplicationDomainException.DuplicateApplicationException();
        }

        applicationDraftService.discard(submitApplicationCommand.userId(), submitApplicationCommand.recruitmentId());
        return savedApplicationId;
    }

    @Override
    public void checkEligibility(Long userId, Long recruitmentId) {
        validateEligibility(userId, recruitmentId);
    }

    /**
     * 지원 사전 가드의 단일 소스. checkEligibility(사전 확인)와 submit(최종 검증)이
     * 이 메서드만 호출한다 — 검증 로직을 두 곳에 두는 것을 금지한다 (스펙 §1.2).
     * 사전 확인 통과 후 제출 사이에 상태가 변해도(TOCTOU) submit 이 같은 메서드를
     * 다시 통과하므로 최종 일관성이 보장된다.
     */
    private EligibilityTarget validateEligibility(Long userId, Long recruitmentId) {
        Recruitment recruitment = recruitmentRepository.findById(recruitmentId)
                .orElseThrow(RecruitmentException.RecruitmentNotFoundException::new);

        // 비공개 상태 동아리의 모집에는 지원할 수 없다 — 존재 은닉을 위해 404 (공개 상세와 동일 의미론).
        if (!recruitment.getClub().getStatus().isPubliclyVisible()) {
            throw new RecruitmentException.RecruitmentNotFoundException();
        }

        // 마감 판정은 KST(seoulClock) 기준 — prod JVM 은 UTC 라 무클럭 now() 는 자정~09시 사이 하루 늦게 마감된다.
        if (!recruitment.isEffectivelyOpen(LocalDate.now(clock))) {
            throw new ApplicationDomainException.RecruitmentClosedException();
        }

        if (recruitment.getApplicationMode() == ApplicationMode.EXTERNAL) {
            throw new ApplicationDomainException.ExternalFormSubmitException();
        }

        User user = userRepository.findById(userId)
                .orElseThrow(UserException.UserNotFoundException::new);

        if (applicationRepository.existsByRecruitmentIdAndUserId(recruitment.getId(), user.getId())) {
            throw new ApplicationDomainException.DuplicateApplicationException();
        }

        validateClubMembershipPolicy(recruitment, user);

        return new EligibilityTarget(recruitment, user);
    }

    /** validateEligibility 통과 결과 — submit 이 후속 저장에 재사용한다. */
    private record EligibilityTarget(Recruitment recruitment, User user) {}

    @Override
    public List<ApplicationSummaryQuery> getMyApplications(Long userId, Set<ApplicationStatus> statuses) {
        List<Application> applications =
                applicationRepository.findByUserIdAndStatusInOrderByCreatedAtDesc(userId, statuses);
        if (applications.isEmpty()) {
            return List.of();
        }

        // 응답 카드의 nested interview 채움용 batch lookup — application 별 개별 쿼리(N+1) 회피.
        // ASSIGNED schedule 이 있으면 interview 가 채워지고 (location 은 nullable),
        // CANCELLED 만 / 미배정인 경우만 null 로 응답한다 (Codex review BE-3 — round.location null 도 interview 노출 유지).
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
        // - availabilityDeadline: 지원자에게 보이는 라운드의 마감 시각.
        //   isVisibleToApplicant 술어(DRAFT 제외)를 사용해 발송 전 라운드 정보가 새지 않는다 (스펙 §5.4·§9.3).
        // useInterview=false 모집은 면접 관련 레포지토리 호출 자체를 생략한다.
        if (!application.getRecruitment().isUseInterview()) {
            return MyApplicationDetailQuery.fromAll(application, 0, null, null);
        }

        long interviewAvailabilityCount =
                interviewAvailabilityRepository.countByApplicationId(applicationId);
        LocalDateTime availabilityDeadline = interviewRoundRepository
                .findVisibleToApplicantRoundByApplicationId(applicationId)
                .map(InterviewRound::getAvailabilityDeadline)
                .orElse(null);
        AssignedInterviewQuery interview = resolveAssignedInterview(applicationId);

        return MyApplicationDetailQuery.fromAll(
                application,
                Math.toIntExact(interviewAvailabilityCount),
                interview,
                availabilityDeadline);
    }

    @Override
    @Transactional
    public void withdraw(Long applicationId, Long currentUserId) {
        Application application = applicationRepository.findById(applicationId)
                .orElseThrow(ApplicationDomainException.ApplicationNotFoundException::new);
        if (!application.getUser().getId().equals(currentUserId)) {
            throw new ApplicationDomainException.ForbiddenApplicationAccessException();
        }
        // 마감된 모집의 지원은 아카이브 데이터라 철회로 사라지지 않는다. 상태 가드보다 앞에 두어
        // "심사 중에만 철회 가능" 대신 마감 사실을 우선 안내한다 (recruitment lazy SELECT 1회 추가 — 무해).
        if (ClosedRecruitmentPolicy.isClosed(application.getRecruitment())) {
            throw new ApplicationDomainException.CannotWithdrawClosedRecruitmentException();
        }
        // 운영진이 아직 결정을 내리지 않은 동안(SUBMITTED·ON_HOLD)에만 학생이 스스로 철회할 수 있다.
        // ON_HOLD 는 지원자에게 SUBMITTED 와 구분되지 않는 상태이므로(스펙 §1-1) 철회 가능 여부도 같아야 한다.
        if (application.getStatus() != ApplicationStatus.SUBMITTED
                && application.getStatus() != ApplicationStatus.ON_HOLD) {
            throw new ApplicationDomainException.CannotWithdrawApplicationException();
        }
        // 소프트 삭제(@SQLDelete). 부분 유니크 인덱스(WHERE deleted_at IS NULL) 덕에 같은 공고 재지원이 가능하다.
        applicationRepository.delete(application);
        // 운영진이 동시에 상태를 전이하면 @Version 불일치로 soft-delete UPDATE 가 0 row → 충돌.
        // 명시적 flush 로 트랜잭션 안에서 잡아 친절한 409 로 변환한다 (updateStatus 와 동일 패턴).
        try {
            applicationRepository.flush();
        } catch (ObjectOptimisticLockingFailureException concurrentUpdate) {
            throw new ApplicationDomainException.ConcurrentStatusUpdateException();
        }
    }

    @Override
    public List<ApplicantQuery> getApplicants(Long recruitmentId, Long currentUserId, ApplicantSearchCondition condition) {
        Recruitment recruitment = recruitmentRepository.findById(recruitmentId)
                .orElseThrow(RecruitmentException.RecruitmentNotFoundException::new);
        clubAuthService.requireManager(currentUserId, recruitment.getClub().getId());

        // 객관식 답변은 jsonb 에 choiceId(UUID) 로 저장되므로, 목록 미리보기도 상세와 동일하게
        // 폼 질문을 통해 라벨로 해석해야 한다. 폼이 없는 모집(EXTERNAL 등)은 빈 목록이라 답변도 비어 나간다.
        List<RecruitmentQuestion> formQuestions = questionsOf(recruitment);
        return applicationRepository.searchApplicants(recruitmentId, currentUserId, condition).stream()
                .map(row -> ApplicantQuery.of(row, formQuestions))
                .toList();
    }

    @Override
    public ApplicantDetailQuery getApplicantDetail(Long applicationId, Long currentUserId) {
        // 인가를 데이터 페치보다 먼저 수행한다. 비인가 요청이 지원자 개인정보(전화번호 등)를
        // 메모리에 올리지 않도록, 소속 동아리 ID 만 가볍게 조회해 운영진 권한을 먼저 확인한 뒤 전체를 페치한다.
        Long clubId = applicationRepository.findClubIdByApplicationId(applicationId)
                .orElseThrow(ApplicationDomainException.ApplicationNotFoundException::new);
        clubAuthService.requireManager(currentUserId, clubId);

        // 경량 조회→인가 사이에 동시 soft-delete 가 일어난 경우에만 비어 있을 수 있으며, 404 응답이 안전하다.
        Application application = applicationRepository.findWithRecruitmentAndClubById(applicationId)
                .orElseThrow(ApplicationDomainException.ApplicationNotFoundException::new);

        List<ApplicationStatusHistory> historyRows =
                applicationStatusHistoryRepository.findByApplicationIdOrderByCreatedAtDesc(applicationId);
        List<ApplicationEvaluation> evaluations =
                applicationEvaluationRepository.findByApplicationIdWithEvaluator(applicationId);

        // 운영진 상세 카드에 노출할 "지원자가 선택한 면접 가능시간 + 현재 배정 슬롯 + 배정 면접 일정 + 라운드 요약".
        // useInterview=false 모집은 면접 도메인 자체가 없으므로 추가 쿼리 호출 자체를 생략하고
        // 빈 리스트 / null 로 응답한다 (Task 1 의 useInterview 가드 패턴과 동일).
        // 또한 InterviewSchedule.cancel() 은 status 만 CANCELLED 로 바꾸는 도메인 취소이고
        // soft delete 가 아니므로 assignedSlot 쿼리는 status=ASSIGNED 조건을 명시한다.
        List<ApplicantDetailQuery.AvailabilityItem> interviewAvailabilities;
        ApplicantDetailQuery.AvailabilityItem assignedSlot;
        AssignedInterviewQuery interview;
        ApplicantDetailQuery.InterviewRoundBriefQuery interviewRoundBrief;
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
            interview = resolveAssignedInterview(applicationId);
            interviewRoundBrief = resolvePlacementActiveMembership(applicationId);
        } else {
            interviewAvailabilities = List.of();
            assignedSlot = null;
            interview = null;
            interviewRoundBrief = null;
        }

        return ApplicantDetailQuery.fromAll(application, historyRows, evaluations, currentUserId,
                interviewAvailabilities, assignedSlot, interview, interviewRoundBrief);
    }

    @Override
    @Transactional
    public void updateStatus(UpdateApplicationStatusCommand updateApplicationStatusCommand) {
        Application application = applicationRepository.findById(updateApplicationStatusCommand.applicationId())
                .orElseThrow(ApplicationDomainException.ApplicationNotFoundException::new);
        clubAuthService.requireManager(updateApplicationStatusCommand.currentUserId(), application.getRecruitment().getClub().getId());
        // 마감된 모집은 아카이브라 새 활동은 막지만, 남은 지원서의 최종 결과 확정만은 허용한다 —
        // 아무도 처리할 수 없으면 지원자는 결과를 못 받고 운영진도 손댈 수 없는 교착이 된다.
        // 벌크도 건별로 이 메서드를 경유하므로 여기 한 곳이면 충분하고, 실패 사유는 failures[] 로 전파된다.
        // 판정은 raw status 기준 — 마감일이 지나도 수동 마감 전이면 심사 진행 중이라 전 기능이 열려 있다.
        Recruitment recruitment = application.getRecruitment();
        ClosedRecruitmentPolicy.requireFinalizingOnly(recruitment, updateApplicationStatusCommand.status());

        ApplicationStatus previousStatus = application.getStatus();
        application.transitionTo(
                updateApplicationStatusCommand.status(),
                recruitment.isUseInterview(),
                ClosedRecruitmentPolicy.isClosed(recruitment));

        User changedBy = userRepository.findById(updateApplicationStatusCommand.currentUserId())
                .orElseThrow(UserException.UserNotFoundException::new);
        applicationStatusHistoryRepository.save(
                ApplicationStatusHistory.record(application, previousStatus, updateApplicationStatusCommand.status(), changedBy)
        );

        // 합격 처리 시 지원자를 모집의 targetRole 에 맞춰 동아리 회원으로 자동 등록한다.
        // upgrade-or-insert 와 동시 등록 경합 처리는 ClubMemberEnrollmentService 가 단독으로 책임진다.
        // 지원 승인 경로는 기수를 부여하지 않으므로 generation 은 null 로 넘긴다.
        if (updateApplicationStatusCommand.status() == ApplicationStatus.ACCEPTED) {
            clubMemberEnrollmentService.enroll(
                    application.getRecruitment().getClub(),
                    application.getUser(),
                    application.getRecruitment().getTargetRole().toClubMemberRole(),
                    null);
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
                // 미존재/타 클럽 권한없음은 열거 방지를 위해 일반 메시지로 합치고, 그 외(잘못된 전이·동시수정
                // 등 이미 권한이 확인된 사용자에게 정당한 정보)는 구체 메시지를 그대로 노출한다.
                String reason = isExistenceOrAuthorizationFailure(domainFailure)
                        ? BULK_ITEM_GENERIC_FAILURE
                        : domainFailure.getMessage();
                failures.add(new BulkUpdateApplicationStatusResult.Failure(applicationId, reason));
            } catch (AccessDeniedException authorizationFailure) {
                // 운영진 역할 부족 — 존재/소속 정보가 새지 않도록 미존재·비멤버와 동일한 일반 메시지로 응답한다
                // (시스템 오류가 아니므로 warn 로그도 남기지 않는다).
                failures.add(new BulkUpdateApplicationStatusResult.Failure(
                        applicationId, BULK_ITEM_GENERIC_FAILURE));
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

    // 지원서 미존재와 타 클럽 권한없음만 일반 메시지로 합칠 대상으로 분류한다(메시지 문자열이 아닌
    // 예외 타입으로 판별 — 향후 메시지 변경에도 안전). 역할 부족(AccessDeniedException)은
    // ApplicationException 이 아니므로 별도 catch 에서 같은 일반 메시지로 처리한다.
    private static boolean isExistenceOrAuthorizationFailure(ApplicationException domainFailure) {
        return domainFailure instanceof ApplicationDomainException.ApplicationNotFoundException
                || domainFailure instanceof ClubMemberException.NotAMember;
    }

    @Override
    @Transactional
    public void rejectActiveOnClubClosure(List<Long> recruitmentIds) {
        if (recruitmentIds.isEmpty()) {
            return;
        }
        List<Application> applications = applicationRepository
                .findByRecruitmentIdInAndStatusIn(recruitmentIds, ApplicationStatus.activeSet());
        for (Application application : applications) {
            application.transitionTo(ApplicationStatus.REJECTED, application.getRecruitment().isUseInterview());
        }
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
     * 운영진 상세 카드의 면접 라운드 요약 단건 헬퍼.
     * placement-active 멤버십(§5.4 — DRAFT 포함, EXCLUDED·CANCELLED 제외)이 있으면 brief 를 채우고,
     * 없으면 null (= 대기열/선정 전) 을 반환한다.
     * <p>
     * {@code unresponded} 는 저장 필드가 아니라 파생값이다 — INVITED && now > availabilityDeadline.
     * availabilityDeadline 이 null 인 DRAFT 라운드는 마감이 미설정 상태이므로 unresponded 가 false.
     */
    private ApplicantDetailQuery.InterviewRoundBriefQuery resolvePlacementActiveMembership(Long applicationId) {
        return interviewRoundMemberRepository
                .findPlacementActiveMembershipByApplicationId(applicationId)
                .map(membership -> {
                    InterviewRound round = membership.round();
                    RoundMemberStatus memberStatus = membership.member().getStatus();
                    boolean unresponded = memberStatus == RoundMemberStatus.INVITED
                            && round.getAvailabilityDeadline() != null
                            && LocalDateTime.now(clock).isAfter(round.getAvailabilityDeadline());
                    String alternativeText = memberStatus == RoundMemberStatus.NO_AVAILABLE_SLOT
                            ? membership.member().getAlternativeAvailabilityText()
                            : null;
                    return new ApplicantDetailQuery.InterviewRoundBriefQuery(
                            round.getId(),
                            round.getTitle(),
                            round.getStatus(),
                            memberStatus,
                            unresponded,
                            alternativeText);
                })
                .orElse(null);
    }

    /**
     * 동시 제출로 인한 application 중복 삽입 only true.
     * 향후 application 에 새 unique / CHECK / FK 가 추가되어도 그 위반은 그대로 위로 전파된다.
     */
    private static boolean isApplicationDuplicate(DataIntegrityViolationException exception) {
        Throwable mostSpecific = exception.getMostSpecificCause();
        if (!(mostSpecific instanceof java.sql.SQLException sqlException)) {
            return false;
        }
        if (!POSTGRES_UNIQUE_VIOLATION_SQL_STATE.equals(sqlException.getSQLState())) {
            return false;
        }
        String message = sqlException.getMessage();
        return message != null && message.contains(APPLICATION_UNIQUE_CONSTRAINT);
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
            default -> throw new IllegalStateException(
                    "지원 자격 정책이 정의되지 않은 모집 대상입니다: " + recruitment.getTargetRole());
        }
    }

    /** legacy string[] 답변을 위치 순으로 질문 id 에 매핑한다. TODO(legacy-questions-v1): 신 FE 전환 후 제거. */
    private List<ApplicationAnswer> resolveLegacyAnswers(Recruitment recruitment, List<String> legacyAnswers) {
        List<RecruitmentQuestion> questions = questionsOf(recruitment);
        List<String> answers = legacyAnswers == null ? List.of() : legacyAnswers;
        if (questions.size() != answers.size()) {
            throw new ApplicationDomainException.InvalidAnswersException();
        }
        return IntStream.range(0, questions.size())
                .mapToObj(index -> new ApplicationAnswer(
                        questions.get(index).id(), Collections.singletonList(answers.get(index))))
                .toList();
    }

    private List<RecruitmentQuestion> questionsOf(Recruitment recruitment) {
        RecruitmentForm form = recruitment.getForm();
        return form == null ? List.of() : form.getQuestions();
    }

    private void validateAnswersAgainstForm(Recruitment recruitment, List<ApplicationAnswer> answers) {
        List<RecruitmentQuestion> questions = questionsOf(recruitment);
        if (questions.size() != answers.size()) {
            throw new ApplicationDomainException.InvalidAnswersException();
        }
        Map<String, ApplicationAnswer> answerByQuestionId = new HashMap<>();
        for (ApplicationAnswer answer : answers) {
            if (answer.questionId() == null
                    || answerByQuestionId.put(answer.questionId(), answer) != null) {
                throw new ApplicationDomainException.InvalidAnswersException();
            }
        }
        for (RecruitmentQuestion question : questions) {
            ApplicationAnswer answer = answerByQuestionId.get(question.id());
            if (answer == null) {
                throw new ApplicationDomainException.InvalidAnswersException();
            }
            validateAnswerForQuestion(question, answer);
        }
    }

    /**
     * 스펙 §2.6 유형별 규칙 — 필수/선택 × TEXT/SINGLE_CHOICE/MULTIPLE_CHOICE.
     * values 원소의 null 정규화(→ 빈 문자열)와 values 자체의 null 정규화(→ 빈 목록)는
     * {@link ApplicationAnswer} 컴팩트 생성자가 이미 끝낸 상태로 들어온다.
     */
    private void validateAnswerForQuestion(RecruitmentQuestion question, ApplicationAnswer answer) {
        List<String> values = answer.values();
        switch (question.type()) {
            case TEXT -> {
                if (values.size() > 1) {
                    throw new ApplicationDomainException.InvalidAnswersException();
                }
                String content = values.isEmpty() ? "" : values.get(0);
                if (question.required() && content.isBlank()) {
                    throw new ApplicationDomainException.RequiredAnswerMissingException();
                }
            }
            case SINGLE_CHOICE -> {
                if (values.size() > 1) {
                    throw new ApplicationDomainException.InvalidChoiceSelectionException();
                }
                if (question.required() && values.isEmpty()) {
                    throw new ApplicationDomainException.RequiredAnswerMissingException();
                }
                requireChoiceIdsBelongToQuestion(question, values);
            }
            case MULTIPLE_CHOICE -> {
                if (question.required() && values.isEmpty()) {
                    throw new ApplicationDomainException.RequiredAnswerMissingException();
                }
                if (values.size() != Set.copyOf(values).size()) {
                    throw new ApplicationDomainException.InvalidChoiceSelectionException();
                }
                requireChoiceIdsBelongToQuestion(question, values);
            }
            // enum 3 값을 모두 다루지만, 새 유형이 추가될 때 검증 없이 조용히 통과하지 않도록 명시적으로 막는다
            // (validateClubMembershipPolicy 와 동일한 방어).
            default -> throw new IllegalStateException(
                    "답변 검증 규칙이 정의되지 않은 질문 유형입니다: " + question.type());
        }
    }

    /** "바로 그 질문의" 선택지인지 검증 — 타 질문의 choiceId·미지 choiceId 를 모두 거부한다 (스펙 §2.6). */
    private void requireChoiceIdsBelongToQuestion(RecruitmentQuestion question, List<String> selectedChoiceIds) {
        Set<String> allowedChoiceIds = question.choices().stream()
                .map(QuestionChoice::id)
                .collect(Collectors.toSet());
        if (!allowedChoiceIds.containsAll(selectedChoiceIds)) {
            throw new ApplicationDomainException.InvalidChoiceSelectionException();
        }
    }

    /**
     * 응답 DTO 의 nested {@code interview} 채움용 단건 헬퍼.
     * ASSIGNED 상태 schedule 이 있고 그 schedule 에 매핑된 슬롯이 존재하면 {@link AssignedInterviewQuery} 를 반환한다.
     * location 은 schedule 이 속한 {@code InterviewRound.location} 에서 가져오며, round 가 없거나
     * location 이 비어 있어도 interview 자체는 노출하고 location 만 null 로 채운다 (Codex review BE-3 유지).
     * <p>
     * {@code InterviewSchedule} 의 CANCELLED 는 MVP 미사용 예약값이지만 방어적으로 status 조건을 명시한다.
     */
    private AssignedInterviewQuery resolveAssignedInterview(Long applicationId) {
        return interviewScheduleRepository.findByApplicationId(applicationId)
                .filter(schedule -> schedule.getStatus() == InterviewScheduleStatus.ASSIGNED)
                .flatMap(schedule -> interviewSlotRepository.findById(schedule.getSlotId())
                        .map(slot -> new AssignedInterviewQuery(
                                slot.getStartTime(),
                                slot.getEndTime(),
                                interviewRoundRepository.findById(schedule.getRoundId())
                                        .map(InterviewRound::getLocation)
                                        .orElse(null))))
                .orElse(null);
    }

    /**
     * 응답 리스트 DTO 의 nested {@code interview} 채움용 batch 헬퍼.
     * 지원 ID 다건을 한 번에 끌어와 N+1 을 회피한다 — InterviewReminderJob 패턴과 동일.
     * <ol>
     *   <li>application_id IN (...) AND status=ASSIGNED InterviewSchedule 일괄 조회</li>
     *   <li>대상 schedule 들의 slot_id / round_id 를 batch 로 join</li>
     *   <li>{@code InterviewRound.location} 이 비어 있어도 interview 객체는 그대로 노출 (location 만 null)</li>
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
        Set<Long> roundIds = assignedSchedules.stream()
                .map(InterviewSchedule::getRoundId)
                .collect(Collectors.toSet());

        Map<Long, InterviewSlot> slotById = interviewSlotRepository.findAllById(slotIds).stream()
                .collect(Collectors.toMap(InterviewSlot::getId, Function.identity()));
        Map<Long, InterviewRound> roundById = interviewRoundRepository.findAllById(roundIds).stream()
                .collect(Collectors.toMap(InterviewRound::getId, Function.identity()));

        Map<Long, AssignedInterviewQuery> result = new HashMap<>();
        for (InterviewSchedule schedule : assignedSchedules) {
            InterviewSlot slot = slotById.get(schedule.getSlotId());
            if (slot == null) {
                continue;
            }
            InterviewRound round = roundById.get(schedule.getRoundId());
            String location = round == null ? null : round.getLocation();
            result.put(schedule.getApplicationId(), new AssignedInterviewQuery(
                    slot.getStartTime(), slot.getEndTime(), location));
        }
        return result;
    }
}
