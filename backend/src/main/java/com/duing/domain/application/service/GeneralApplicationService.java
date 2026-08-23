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
import com.duing.domain.interview.service.InterviewAssignmentQueryService;
import com.duing.domain.interview.service.dto.query.ApplicantInterviewProgress;
import com.duing.domain.interview.service.dto.query.AssignedInterviewSlot;
import com.duing.domain.interview.service.dto.query.InterviewRoundBrief;
import com.duing.domain.interview.service.dto.query.ManagerInterviewSnapshot;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentForm;
import com.duing.domain.recruitment.entity.RecruitmentQuestion;
import com.duing.domain.recruitment.entity.TargetRole;
import com.duing.domain.recruitment.exception.RecruitmentException;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.recruitment.service.ClosedRecruitmentPolicy;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.exception.UserException;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.exception.ApplicationException;
import com.duing.global.exception.PostgresConstraintViolations;
import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
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
    private final ApplicationStatusChanger applicationStatusChanger;
    private final ApplicationEvaluationRepository applicationEvaluationRepository;
    private final InterviewAssignmentQueryService interviewAssignmentQueryService;
    private final Clock clock;

    /**
     * 일괄 처리의 건별 트랜잭션을 위해 자기 자신의 프록시를 lazy 주입한다.
     * 생성자 자체에 self-reference 를 넣으면 순환 의존이 되므로 setter 주입을 사용한다.
     * 단위 테스트가 생성자 주입 의존만 넘기는 케이스를 보호하기 위해서이기도 하다 — bulkUpdateStatus 만
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
        ApplicationAnswerValidator.validateAnswersAgainstForm(questionsOf(recruitment), resolvedAnswers);

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
        Map<Long, AssignedInterviewSlot> assignedByApplicationId = interviewAssignmentQueryService
                .findAssignedByApplicationIds(applications.stream().map(Application::getId).toList());

        return applications.stream()
                .map(application -> ApplicationSummaryQuery.from(
                        application,
                        toAssignedInterviewQuery(assignedByApplicationId.get(application.getId()))))
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

        ApplicantInterviewProgress interviewProgress =
                interviewAssignmentQueryService.findApplicantProgress(applicationId);

        return MyApplicationDetailQuery.fromAll(
                application,
                interviewProgress.availabilityCount(),
                toAssignedInterviewQuery(interviewProgress.assigned()),
                interviewProgress.availabilityDeadline());
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
        // 빈 리스트 / null 로 응답한다 (getMyApplicationDetail 의 useInterview 가드 패턴과 동일).
        List<ApplicantDetailQuery.AvailabilityItem> interviewAvailabilities;
        ApplicantDetailQuery.AvailabilityItem assignedSlot;
        AssignedInterviewQuery interview;
        ApplicantDetailQuery.InterviewRoundBriefQuery interviewRoundBrief;
        if (application.getRecruitment().isUseInterview()) {
            // interview 도메인은 자체 표현으로 반환하고, application 도메인이 자기 표현으로 매핑한다.
            // 배정 슬롯과 배정 면접은 같은 조회 결과에서 나와 두 표현으로 나눠 담긴다.
            ManagerInterviewSnapshot interviewSnapshot =
                    interviewAssignmentQueryService.findManagerSnapshot(applicationId);
            interviewAvailabilities = interviewSnapshot.availabilities().stream()
                    .map(window -> new ApplicantDetailQuery.AvailabilityItem(
                            window.slotId(), window.startTime(), window.endTime()))
                    .toList();
            AssignedInterviewSlot assignedInterviewSlot = interviewSnapshot.assigned();
            assignedSlot = assignedInterviewSlot == null ? null
                    : new ApplicantDetailQuery.AvailabilityItem(assignedInterviewSlot.slotId(),
                            assignedInterviewSlot.startTime(), assignedInterviewSlot.endTime());
            interview = toAssignedInterviewQuery(assignedInterviewSlot);
            interviewRoundBrief = toInterviewRoundBriefQuery(interviewSnapshot.roundBrief());
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
        // 반환된 ClubMember 를 그대로 받아 아래 운영진 승급 게이트의 역할 판정에 쓴다 — 추가 조회 없음.
        ClubMember actor = clubAuthService.requireManager(
                updateApplicationStatusCommand.currentUserId(),
                application.getRecruitment().getClub().getId());
        // 마감된 모집은 아카이브라 새 활동은 막지만, 남은 지원서의 최종 결과 확정만은 허용한다 —
        // 아무도 처리할 수 없으면 지원자는 결과를 못 받고 운영진도 손댈 수 없는 교착이 된다.
        // 벌크도 건별로 이 메서드를 경유하므로 여기 한 곳이면 충분하고, 실패 사유는 failures[] 로 전파된다.
        // 판정은 raw status 기준 — 마감일이 지나도 수동 마감 전이면 심사 진행 중이라 전 기능이 열려 있다.
        Recruitment recruitment = application.getRecruitment();
        ClosedRecruitmentPolicy.requireFinalizingOnly(recruitment, updateApplicationStatusCommand.status());

        // 운영진 승급은 회장의 결정이다 — 직접 경로(GeneralClubMemberCommandService.updateRole)가
        // requireLeader 인 것과 등급을 맞춘다. 모집을 경유한다고 등급이 내려가지는 않는다.
        // 합격(ACCEPTED)만 본다: 나머지 전이는 club_members.role 을 건드리지 않는다.
        // 조건 순서(status → targetRole → actor 역할)는 값싼 판정을 앞에 두어, 대다수인 부원 모집·비합격
        // 전이가 enum 비교 한 번으로 빠져나가게 한다.
        // 마감 모집 계약(409)의 우선순위를 유지하려고 requireFinalizingOnly 뒤에 두고,
        // 상태 전이·이력이 먼저 기록되지 않도록 applicationStatusChanger.change 앞에 둔다.
        if (updateApplicationStatusCommand.status() == ApplicationStatus.ACCEPTED
                && recruitment.getTargetRole() == TargetRole.OFFICER
                && actor.getRole() != ClubMemberRole.LEADER) {
            throw new RecruitmentException.OfficerTargetRequiresLeaderException();
        }

        // 전이와 이력 기록은 ApplicationStatusChanger 한 곳에서만 조립한다.
        // 변경 주체 조회는 전이가 FSM 에 막히면 필요 없는 왕복이라 Supplier 로 넘겨 전이 성공 이후로 미룬다.
        applicationStatusChanger.change(
                application,
                updateApplicationStatusCommand.status(),
                recruitment.isUseInterview(),
                ClosedRecruitmentPolicy.isClosed(recruitment),
                () -> userRepository.findById(updateApplicationStatusCommand.currentUserId())
                        .orElseThrow(UserException.UserNotFoundException::new));

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

    /**
     * 동아리 폐쇄에 딸린 일괄 거절. 단건 반려와 똑같이 ApplicationStatusChanger 를 경유해 상태 이력을 남긴다
     * (2026-08-23 정책 확정). 지원자가 받는 결과는 어느 경로든 같은 "불합격"인데 이력만 비어 있으면
     * 지원자 상세의 상태 이력이 그 결과를 설명하지 못한다 — 상태 이력 없이 끝나는 전이는 이제 없다.
     * 이력 주체는 폐쇄를 실행한 총동연 관리자다.
     */
    @Override
    @Transactional
    public void rejectActiveOnClubClosure(List<Long> recruitmentIds, Long actorAdminUserId) {
        if (recruitmentIds.isEmpty()) {
            return;
        }
        List<Application> applications = applicationRepository
                .findByRecruitmentIdInAndStatusIn(recruitmentIds, ApplicationStatus.activeSet());
        if (applications.isEmpty()) {
            return;
        }

        // 이력 주체는 전 건이 같은 폐쇄 실행자라 한 번만 조회해 재사용한다. Changer 가 주체를 Supplier 로
        // 받는 것은 FSM 에 막히는 전이에서 쓸데없는 주체 조회를 피하려는 것인데, 여기서는 전이 대상이
        // 하나라도 있으면 어차피 필요한 조회이고(대상이 없으면 위에서 반환) 전이 자체가 FSM 상 항상
        // 허용되므로(active → REJECTED), 선조회가 그 지연 목적과 어긋나지 않는다.
        User closureActor = userRepository.findById(actorAdminUserId)
                .orElseThrow(UserException.UserNotFoundException::new);
        for (Application application : applications) {
            // recruitmentClosed=false — 기존 2인자 transitionTo 도 내부에서 false 를 넘겼고,
            // active → REJECTED 는 면접 사용·마감 여부와 무관하게 허용돼 전이 동작은 그대로다.
            applicationStatusChanger.change(application, ApplicationStatus.REJECTED,
                    application.getRecruitment().isUseInterview(), false, () -> closureActor);
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
     * interview 도메인 표현 → 응답 DTO 의 nested {@code interview} 표현 매핑.
     * 배정이 없으면(미배정 / CANCELLED 만 존재) {@code null} 을 그대로 흘려보내 "면접 미배정" 을 표현한다.
     * location 이 null 이어도 배정 자체는 노출한다 (Codex review BE-3).
     */
    private static AssignedInterviewQuery toAssignedInterviewQuery(AssignedInterviewSlot assignedInterviewSlot) {
        return assignedInterviewSlot == null ? null
                : new AssignedInterviewQuery(assignedInterviewSlot.startTime(),
                        assignedInterviewSlot.endTime(), assignedInterviewSlot.location());
    }

    /** interview 도메인 표현 → 운영진 상세의 라운드 요약 표현 매핑. 멤버십이 없으면 null (= 대기열/선정 전). */
    private static ApplicantDetailQuery.InterviewRoundBriefQuery toInterviewRoundBriefQuery(
            InterviewRoundBrief interviewRoundBrief) {
        return interviewRoundBrief == null ? null
                : new ApplicantDetailQuery.InterviewRoundBriefQuery(
                        interviewRoundBrief.roundId(),
                        interviewRoundBrief.title(),
                        interviewRoundBrief.roundStatus(),
                        interviewRoundBrief.memberStatus(),
                        interviewRoundBrief.unresponded(),
                        interviewRoundBrief.alternativeAvailabilityText());
    }

    /**
     * 동시 제출로 인한 application 중복 삽입 only true.
     * 향후 application 에 새 unique / CHECK / FK 가 추가되어도 그 위반은 그대로 위로 전파된다.
     */
    private static boolean isApplicationDuplicate(DataIntegrityViolationException exception) {
        return PostgresConstraintViolations.isUniqueViolationOf(exception, APPLICATION_UNIQUE_CONSTRAINT);
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

}
