package com.duing.domain.recruitment.service;

import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.exception.ClubException;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.club.service.ClubVisibilityPolicy;
import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.domain.joincode.repository.ClubJoinRequestRepository;
import com.duing.domain.joincode.service.JoinCodeService;
import com.duing.domain.notification.event.RecruitmentOpenedEvent;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.QuestionChoice;
import com.duing.domain.recruitment.entity.QuestionType;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentForm;
import com.duing.domain.recruitment.entity.RecruitmentQuestion;
import com.duing.domain.recruitment.exception.RecruitmentException;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.recruitment.service.dto.command.CreateRecruitmentCommand;
import com.duing.domain.recruitment.service.dto.command.QuestionItemCommand;
import com.duing.domain.recruitment.service.dto.command.UpdateRecruitmentCommand;
import com.duing.domain.recruitment.service.dto.query.RecruitmentDetailQuery;
import com.duing.domain.recruitment.service.dto.query.RecruitmentSummaryQuery;
import com.duing.global.config.PublicApiCacheConfig;
import com.duing.global.exception.PostgresConstraintViolations;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralRecruitmentService implements RecruitmentService {

    // V38 partial unique 인덱스. (club_id) WHERE status='OPEN' AND deleted_at IS NULL.
    private static final String RECRUITMENT_ACTIVE_UNIQUE_CONSTRAINT = "uk_recruitment_club_active";

    private final RecruitmentRepository recruitmentRepository;
    private final ApplicationRepository applicationRepository;
    // 삭제 정책(스펙 v2 4.2)이 모집에 딸린 가입 요청 상태를 함께 판정한다.
    private final ClubJoinRequestRepository clubJoinRequestRepository;
    // 삭제에 딸린 가입 링크 폐기는 코드 도메인에 맡긴다 — 감사 이벤트도 그쪽에서 남는다(스펙 v2 4.1).
    private final JoinCodeService joinCodeService;
    private final ClubRepository clubRepository;
    private final ClubAuthService clubAuthService;
    private final ClubVisibilityPolicy clubVisibilityPolicy;
    private final ApplicationEventPublisher eventPublisher;
    // 모집 활성/마감 판정용 — 저장용 타임스탬프(softDelete 등)에는 쓰지 않는다.
    private final Clock clock;

    @Override
    @Transactional
    public Long create(CreateRecruitmentCommand createRecruitmentCommand) {
        // 행 잠금 — 운영 중단 전환(updateStatus, findByIdForUpdate)과 직렬화해
        // "ACTIVE 확인 통과 후 전환 커밋 → INACTIVE 동아리에 OPEN 모집 INSERT" 경합을 차단한다.
        Club club = clubRepository.findByIdForUpdate(createRecruitmentCommand.clubId())
                .orElseThrow(ClubException.ClubNotFoundException::new);

        // 동아리 운영진(LEADER/OFFICER)만 모집 공고를 생성할 수 있다.
        clubAuthService.requireManager(createRecruitmentCommand.currentUserId(), club.getId());

        requireActiveClubUnderLock(club);

        // uk_recruitment_club_active (V38) 는 endDate 와 무관하게 status='OPEN' 만 보고 1건만 허용한다.
        // 한편 사용자/사전 체크가 인식하는 "활성" 의 의미는 status=OPEN AND endDate>=today 라서
        // endDate 가 지났지만 status 가 OPEN 인 행이 있으면 사전 체크는 통과하고 INSERT 가 인덱스에
        // 걸리는 모순이 생긴다. 이 경우 운영자가 보기엔 이미 끝난 모집이므로 자동 close 후 새 INSERT 를
        // 진행해 사용자 멘탈모델과 DB 인덱스의 의미차를 흡수한다. 진짜 활성인 경우엔 그대로 거부.
        requireEndDateNotPast(createRecruitmentCommand.endDate());
        LocalDate today = LocalDate.now(clock);
        recruitmentRepository.findOpenByClubId(club.getId()).ifPresent(existingOpen -> {
            boolean isStillActive = existingOpen.getEndDate() == null
                    || !existingOpen.getEndDate().isBefore(today);
            if (isStillActive) {
                throw new RecruitmentException.DuplicateActiveRecruitmentException();
            }
            // 만료된 OPEN — close UPDATE 가 새 INSERT 보다 먼저 DB 에 가도록 명시적 flush.
            // Hibernate 기본 액션 순서 INSERT→UPDATE 에서 자기 자신과 unique 충돌 차단 (replaceActive 와 동일 패턴).
            existingOpen.close(LocalDateTime.now(clock));
            recruitmentRepository.flush();
        });

        return buildAndPersist(club, createRecruitmentCommand);
    }

    /**
     * 공개 모집 달력 — 개인화가 전혀 없어 앱 마이크로 캐시(60초 TTL) 대상이다. 캐시 값에는
     * displayStatus·effectivelyOpen 이 "조회 시점의 오늘"로 굳어 들어가므로, KST 자정 경계에서
     * 최대 TTL 초 낡은 표시가 가능하다 — 클럽 목록 캐시와 동일하게 수용한 정책이다.
     */
    @Override
    @Cacheable(cacheNames = PublicApiCacheConfig.RECRUITMENT_CALENDAR_CACHE)
    public List<RecruitmentSummaryQuery> getCalendar(YearMonth yearMonth) {
        LocalDate periodStart = yearMonth.atDay(1);
        LocalDate periodEnd = yearMonth.atEndOfMonth();
        LocalDate today = LocalDate.now(clock);

        // 스칼라 projection — 엔티티로 읽으면 행마다 form eager +1 쿼리와 full Club 로드가 붙는다.
        return recruitmentRepository.findSummariesOverlappingPeriod(periodStart, periodEnd).stream()
                .map(summaryRow -> RecruitmentSummaryQuery.from(summaryRow, today))
                .toList();
    }

    @Override
    public RecruitmentDetailQuery getById(Long recruitmentId) {
        Recruitment recruitment = recruitmentRepository.findById(recruitmentId)
                .orElseThrow(RecruitmentException.RecruitmentNotFoundException::new);
        // 비공개 상태 동아리의 모집은 존재를 숨긴다(404). 이 메서드의 호출처는 공개 컨트롤러 1곳뿐이다.
        // 모집을 물었으므로 RecruitmentNotFound 가 은닉 의미론 — ClubVisibilityPolicy 게이트 대신 판정만 공유한다.
        if (!recruitment.getClub().getStatus().isPubliclyVisible()) {
            throw new RecruitmentException.RecruitmentNotFoundException();
        }
        Integer applicantCount = recruitment.isShowApplicantCount()
                ? (int) applicationRepository.countByRecruitmentId(recruitmentId)
                : null;
        // 면접 마감은 라운드(interview_round.availability_deadline) 단위로 관리된다.
        // 모집 상세의 단일 deadline 노출은 라운드 모델에서 의미가 없어 null 고정 —
        // 응답 필드는 FE 재배선(라운드 dashboard 전환) 전까지 호환용으로만 유지한다.
        LocalDateTime interviewAvailabilityDeadline = null;
        return RecruitmentDetailQuery.from(
                recruitment, LocalDate.now(clock), applicantCount, interviewAvailabilityDeadline);
    }

    @Override
    public List<RecruitmentSummaryQuery> getByClubId(Long clubId) {
        // 공개 엔드포인트 전용 — 비공개 동아리는 게이트가 404 로 숨긴다.
        clubVisibilityPolicy.requirePubliclyVisible(clubId);
        LocalDate today = LocalDate.now(clock);
        return recruitmentRepository
                .findSummariesByClubIdOrderByStatusOpenFirstAndStartDateDesc(clubId)
                .stream()
                .map(summaryRow -> RecruitmentSummaryQuery.from(summaryRow, today))
                .toList();
    }

    @Override
    @Transactional
    public void update(UpdateRecruitmentCommand updateRecruitmentCommand) {
        Recruitment recruitment = recruitmentRepository.findById(updateRecruitmentCommand.recruitmentId())
                .orElseThrow(RecruitmentException.RecruitmentNotFoundException::new);

        Long clubId = recruitment.getClub().getId();
        clubAuthService.requireManager(updateRecruitmentCommand.currentUserId(), clubId);

        // 종료일을 과거로 "변경"하는 것만 차단 — 만료-OPEN 공고의 다른 필드 편집(기존 과거 종료일 재전송)은 허용.
        // CLOSED(409)와 상시모집 전환 금지(전용 400)는 기존 예외가 더 정확하므로 그쪽 판정에 양보한다.
        LocalDate requestedEndDate = updateRecruitmentCommand.endDate();
        if (recruitment.getStatus() != RecruitmentStatus.CLOSED
                && recruitment.getEndDate() != null
                && requestedEndDate != null
                && !requestedEndDate.equals(recruitment.getEndDate())
                && requestedEndDate.isBefore(LocalDate.now(clock))) {
            throw new RecruitmentException.PastEndDateException();
        }

        // 두 통로를 함께 보내면 어느 쪽이 진실인지 알 수 없다 — 조용히 한쪽을 버리면 질문이 소실된다.
        if (updateRecruitmentCommand.questions() != null && updateRecruitmentCommand.questionItems() != null) {
            throw new RecruitmentException.InvalidQuestionDefinitionException(
                    "questions 와 questionItems 는 함께 보낼 수 없습니다.");
        }

        List<RecruitmentQuestion> resolvedQuestions = null;
        if (updateRecruitmentCommand.questions() != null || updateRecruitmentCommand.questionItems() != null) {
            if (recruitment.getApplicationMode() != ApplicationMode.SELF) {
                throw new RecruitmentException.InvalidApplicationModeException(
                        "자체 폼 모집에서만 질문을 수정할 수 있습니다.");
            }
            // 자체 폼은 질문 0개로 존재할 수 없다 — 생성 경로(CreateRecruitmentCommand 컴팩트 생성자)의 불변식을
            // 수정 경로에도 세운다. 없으면 questions:[] / questionItems:[] 가 replaceQuestions(빈 목록)까지 도달해
            // 질문 0개짜리 자체 폼이 만들어지고, 그 뒤 answerItems:[] 제출이 개수 비교(0 == 0)를 통과한다.
            // 해석(resolve)·행 잠금보다 앞에 둔다 — (1) 지원자 수와 무관하게 요청 자체가 무효라 400 이어야 하고
            // (지원자 존재 409 는 "지원자를 지우면 통과한다" 는 잘못된 신호를 준다), (2) legacy 통로는 빈 배열에
            // "구 버전 형식으로는…" 이라는 엉뚱한 메시지를 먼저 던지며, (3) 성공할 수 없는 요청에 행 잠금을
            // 잡지 않는다. 비어 있지 않은 목록은 해석 후에도 비지 않으므로(1:1 매핑) 원본 목록으로 판정해도 충분하다.
            boolean clearsAllQuestions = updateRecruitmentCommand.questionItems() != null
                    ? updateRecruitmentCommand.questionItems().isEmpty()
                    : updateRecruitmentCommand.questions().isEmpty();
            if (clearsAllQuestions) {
                throw new RecruitmentException.InvalidApplicationModeException(
                        "자체 폼 모집은 최소 1개 이상의 질문이 필요합니다.");
            }
            // 진행 중인 제출(공유 잠금)이 끝날 때까지 대기한 뒤 지원자 수를 확인한다.
            // 이 잠금이 없으면 "0명 확인 → 교체 커밋" 사이에 들어온 제출의 답변이
            // 교체된 질문 id 를 참조하지 못해 유실된 것처럼 보인다.
            recruitmentRepository.lockFormForQuestionChange(recruitment.getId());

            resolvedQuestions = updateRecruitmentCommand.questionItems() != null
                    ? resolveQuestionItems(recruitment.getForm(), updateRecruitmentCommand.questionItems())
                    : resolveLegacyQuestions(recruitment.getForm(), updateRecruitmentCommand.questions());
            // 지원서 답변(Application.answers)은 questionId 기반이라, 질문의 추가·삭제·순서·문구가
            // 바뀌면(=새 id 발급) 기존 지원서의 답변이 사라진 질문 id 를 가리키게 되어 합불 판정 데이터가
            // 왜곡된다. 실제로 질문이 바뀌는 경우에만, 이미 제출된 지원서가 있으면 수정을 막는다(동일 질문
            // 재전송은 허용해 다른 필드 수정과 함께 questions 를 실어 보내도 문제되지 않게 한다).
            // #603 확장: id 를 보존해 보낸 수정도 텍스트·유형·필수 여부·선택지가 바뀌면 이미 제출된 답변의
            // 의미가 달라지므로(예: 선택지 라벨 교체) 똑같이 막는다 (스펙 §2.3). record equals 가 choices 의
            // id·label·순서까지 비교하므로 별도 필드별 비교가 필요 없다.
            // delete() 가드와 달리 이 수정은 OPEN 상태에서 일어나 제출과 동시에 진행될 수 있는데,
            // 위 lockFormForQuestionChange(FOR UPDATE)가 제출측 공유 잠금(FOR SHARE)과 직렬화하므로
            // "지원자 0명 확인 → 질문 교체 커밋" 사이에 지원서가 INSERT 되는 경합 창은 닫혀 있다.
            // 아래 countByRecruitmentId 는 반드시 잠금 획득 뒤에 실행되어야 한다 — 순서를 바꾸면 가드가 다시 뚫린다.
            // 참고: recruitment.getForm() 은 위 findById 가 이미 적재한 값이라(mappedBy @OneToOne 은
            // 바이트코드 강화 없이는 eager) 다른 운영진의 동시 수정 기준으로는 낡을 수 있다. 그래도 답변이
            // 죽은 질문을 가리키는 일은 없다 — 낡은 값과 동일하게 재전송되면 questionsChanged=false 라
            // Hibernate 가 UPDATE 자체를 내지 않고, 조금이라도 다르면 questionsChanged=true 라 이 잠금
            // 뒤의 지원자 수 확인이 실행되어 막힌다. 남는 것은 지원자 0명일 때의 수정끼리 last-writer-wins
            // 뿐이며(RecruitmentForm 에 @Version 없음) 답변 유실과는 무관하다.
            boolean questionsChanged = recruitment.getForm() == null
                    || !recruitment.getForm().getQuestions().equals(resolvedQuestions);
            if (questionsChanged
                    && applicationRepository.countByRecruitmentId(recruitment.getId()) > 0) {
                throw new RecruitmentException.QuestionsNotEditableWithApplicationsException();
            }
        }

        recruitment.update(updateRecruitmentCommand, resolvedQuestions);
    }

    /**
     * legacy string[] 질문 수정 통로 (스펙 §2.5 안전 규칙 1·2·3).
     * 규칙 1: 텍스트가 현재 질문과 순서까지 동일하면 no-op(id 보존) — 구 FE 가 다른 필드 수정과 함께
     *         동일 질문을 재전송하는 일반 경로를 보호한다.
     * 규칙 2: 현재 폼이 legacy 형태(전부 필수 주관식·선택지 없음)가 아니면 거부 — 구 FE 가 선택형 질문을
     *         주관식으로 덮어써 선택지가 소실되는 것을 막는다.
     * 규칙 3: 다르면 전체 교체(신규 id 발급, 위 #603 가드 적용).
     * TODO(legacy-questions-v1): 신 FE 전환 후 제거.
     */
    private List<RecruitmentQuestion> resolveLegacyQuestions(RecruitmentForm form, List<String> legacyTexts) {
        List<RecruitmentQuestion> currentQuestions = form == null ? List.of() : form.getQuestions();
        List<String> currentTexts = currentQuestions.stream().map(RecruitmentQuestion::text).toList();
        if (currentTexts.equals(legacyTexts)) {
            return currentQuestions;
        }
        boolean currentAllLegacyShape = currentQuestions.stream().allMatch(question ->
                question.type() == QuestionType.TEXT && question.required() && question.choices().isEmpty());
        if (!currentAllLegacyShape) {
            throw new RecruitmentException.InvalidQuestionDefinitionException(
                    "구 버전 형식으로는 선택형 질문이 있는 지원서를 수정할 수 없습니다.");
        }
        return legacyTexts.stream().map(RecruitmentQuestion::createText).toList();
    }

    /**
     * 구조화 질문 수정 통로의 id 왕복 해석 — 기존 id 는 절대 재생성하지 않고, 현재 폼에 없는 id 는 400 (스펙 §2.2).
     * 요청 안에서 같은 기존 id 를 두 번 보내면 resolved 에 중복 id 가 생겨 validateDefinitions 가 잡는다.
     */
    private List<RecruitmentQuestion> resolveQuestionItems(RecruitmentForm form, List<QuestionItemCommand> items) {
        Map<String, RecruitmentQuestion> currentQuestionById = form == null ? Map.of()
                : form.getQuestions().stream()
                        // 저장된 데이터의 질문 id 중복은 validateDefinitions 가 쓰기 시점에 막지만, 이미 저장된
                        // 데이터를 믿지 않고 merge function 으로 방어한다 — 없으면 IllegalStateException(500).
                        .collect(Collectors.toMap(RecruitmentQuestion::id, Function.identity(),
                                (first, duplicate) -> first));
        List<RecruitmentQuestion> resolvedQuestions = new ArrayList<>();
        for (QuestionItemCommand questionItem : items) {
            if (questionItem.id() == null) {
                resolvedQuestions.add(RecruitmentQuestion.create(questionItem.text(), questionItem.type(),
                        questionItem.required(), resolveChoices(null, questionItem.choices())));
                continue;
            }
            RecruitmentQuestion existingQuestion = currentQuestionById.get(questionItem.id());
            if (existingQuestion == null) {
                throw new RecruitmentException.InvalidQuestionDefinitionException("존재하지 않는 질문 id 입니다.");
            }
            resolvedQuestions.add(new RecruitmentQuestion(existingQuestion.id(), questionItem.text(),
                    questionItem.type(), questionItem.required(),
                    resolveChoices(existingQuestion, questionItem.choices())));
        }
        RecruitmentQuestion.validateDefinitions(resolvedQuestions);
        return resolvedQuestions;
    }

    /** 선택지 id 왕복 해석. existingQuestion 이 null 이면 신규 질문이라 모든 선택지가 새 id 를 받는다. */
    private List<QuestionChoice> resolveChoices(RecruitmentQuestion existingQuestion,
                                                List<QuestionItemCommand.ChoiceItemCommand> choices) {
        Set<String> existingChoiceIds = existingQuestion == null ? Set.of()
                : existingQuestion.choices().stream().map(QuestionChoice::id).collect(Collectors.toSet());
        return choices.stream()
                .map(choice -> {
                    if (choice.id() == null) {
                        return QuestionChoice.create(choice.label());
                    }
                    // "그 질문의" 선택지인지까지 검증 — 타 질문 선택지 id 유입 차단 (스펙 §2.2).
                    if (!existingChoiceIds.contains(choice.id())) {
                        throw new RecruitmentException.InvalidQuestionDefinitionException(
                                "존재하지 않는 선택지 id 입니다.");
                    }
                    return new QuestionChoice(choice.id(), choice.label());
                })
                .toList();
    }

    @Override
    @Transactional
    public void close(Long recruitmentId, Long currentUserId) {
        // 행 잠금 — 면접 라운드 생성(createRound)과 직렬화한다 (아카이브 스펙 §9 후속). 잠그지 않으면
        // "라운드 생성이 OPEN 을 확인 → 마감 커밋 → 라운드 INSERT" 순서가 성립해 마감된 모집에 라운드가
        // 잔존한다. 잠금 대상·순서는 delete() 와 같은 모집 행 하나이고, 이 트랜잭션은 이후 다른 행을
        // 배타 잠금하지 않으므로(권한 확인은 잠금 없는 조회) 사이클이 생기지 않는다.
        Recruitment recruitment = recruitmentRepository.findByIdForUpdate(recruitmentId)
                .orElseThrow(RecruitmentException.RecruitmentNotFoundException::new);

        Long clubId = recruitment.getClub().getId();
        clubAuthService.requireManager(currentUserId, clubId);

        recruitment.close(LocalDateTime.now(clock));
    }

    @Override
    @Transactional
    public void stopIntake(Long recruitmentId, Long currentUserId) {
        // 행 잠금 — close()·delete() 와 같은 모집 행 잠금으로 동시 마감·삭제·교체와 직렬화한다.
        // 예: close 가 먼저 커밋되면 이 요청은 잠금 해제 후 CLOSED 를 읽어 409 로 거절된다.
        Recruitment recruitment = recruitmentRepository.findByIdForUpdate(recruitmentId)
                .orElseThrow(RecruitmentException.RecruitmentNotFoundException::new);

        Long clubId = recruitment.getClub().getId();
        clubAuthService.requireManager(currentUserId, clubId);

        recruitment.stopIntake(LocalDate.now(clock));
    }

    @Override
    @Transactional
    public void delete(Long recruitmentId, Long currentUserId) {
        // 행 잠금 — 가입 코드 발급과 직렬화해, 아래 "활성 코드 폐기" 이후에 새 코드가 끼어들어
        // 삭제된 모집의 고아 코드로 남는 경쟁을 차단한다. 발급은 OPEN·삭제는 CLOSED 전제라
        // 정책상 상호 배타지만(스펙 v2 4.2), 마감과 겹치는 경쟁까지 막는 심층 방어로 잠금을 유지한다.
        Recruitment recruitment = recruitmentRepository.findByIdForUpdate(recruitmentId)
                .orElseThrow(RecruitmentException.RecruitmentNotFoundException::new);

        Long clubId = recruitment.getClub().getId();
        clubAuthService.requireManager(currentUserId, clubId);

        // 마감(CLOSED)된 공고만 삭제할 수 있다. OPEN 공고는 지원이 동시에 들어올 수 있어
        // "지원자 0명 확인 → soft-delete" 사이에 INSERT 된 지원서가 고아가 되는 경쟁이 생긴다.
        // 마감 후에는 새 지원이 불가능하므로 0명이 안정적이다 — 진행 중 공고는 먼저 마감한다.
        if (recruitment.getStatus() != RecruitmentStatus.CLOSED) {
            throw new RecruitmentException.OpenRecruitmentNotDeletableException();
        }

        // 마감 전 들어온 지원이 1건이라도 있으면 지원서·상태이력·면접 데이터가 고아가 되므로 삭제를 막는다.
        // 잘못/중복 생성한 빈 공고만 삭제 대상이다.
        if (applicationRepository.countByRecruitmentId(recruitmentId) > 0) {
            throw new RecruitmentException.ApplicationsExistException();
        }

        // 가입 코드는 모집의 부속물이므로 삭제 트랜잭션에서 함께 폐기한다(스펙 v2 4.2) — 고아 코드로
        // 학생이 계속 유입되는 것을 막는다. 폐기 주체는 삭제 수행자다(V100 감사 컬럼) — 코드가 왜
        // 죽었는지 행만 보고 알 수 있게 한다. 폐기 절차·감사 기록은 코드 도메인이 소유한다.
        // 폐기 UPDATE 가 코드 행을 잠그는 덕에(신청 생성은 같은 행을 FOR UPDATE 로 읽는다) 아래 대기 요청
        // 확인이 동시 신청을 놓치지 않는다 — 순서를 뒤집으면 확인 직후 접수된 요청이 삭제된 모집에 매달린다.
        // 같은 트랜잭션이라 아래 대기 요청 가드로 롤백되면 폐기와 감사 이벤트도 함께 사라진다.
        joinCodeService.revokeActiveByRecruitment(clubId, recruitmentId, currentUserId);

        // 대기 중인 가입 요청은 학생이 코드 자리를 차감한 채 응답을 기다리는 상태다 — 삭제로 응답 경로를
        // 없애지 않는다(먼저 승인·거절). 예외로 트랜잭션이 롤백되므로 위 폐기도 함께 되돌아간다.
        // 처리 완료(APPROVED/REJECTED) 이력만 남았다면 삭제를 허용한다 — 코드·요청 행은 물리 삭제하지
        // 않으므로 감사 이력은 그대로 보존되고, 요청 콘솔은 동아리 단위 조회라 열람도 유지된다.
        if (clubJoinRequestRepository.existsPendingByRecruitmentId(recruitmentId)) {
            throw new RecruitmentException.PendingJoinRequestsExistException();
        }

        // @SQLDelete 로 soft-delete 된다. RecruitmentForm 은 cascade 로 함께 정리된다.
        recruitmentRepository.delete(recruitment);
    }

    @Override
    @Transactional
    public Long replaceActive(CreateRecruitmentCommand command) {
        // 행 잠금 — 운영 중단 전환(updateStatus, findByIdForUpdate)과 직렬화해
        // "ACTIVE 확인 통과 후 전환 커밋 → INACTIVE 동아리에 OPEN 모집 INSERT" 경합을 차단한다.
        Club club = clubRepository.findByIdForUpdate(command.clubId())
                .orElseThrow(ClubException.ClubNotFoundException::new);

        clubAuthService.requireManager(command.currentUserId(), club.getId());

        requireActiveClubUnderLock(club);

        requireEndDateNotPast(command.endDate());

        // close() 는 메모리상의 status 만 바꾸므로 그 다음 buildAndPersist 의 INSERT 가
        // flush 될 때 Hibernate 기본 액션 순서(INSERT → UPDATE) 상 UPDATE 가 뒤로 밀려
        // uk_recruitment_club_active 와 자기 자신이 충돌한다. close 직후 명시적 flush 로
        // UPDATE 를 먼저 DB 에 반영한 뒤 INSERT 를 진행한다.
        recruitmentRepository.findActiveByClubId(club.getId())
                .ifPresent(existingActive -> {
                    existingActive.close(LocalDateTime.now(clock));
                    recruitmentRepository.flush();
                });

        return buildAndPersist(club, command);
    }

    @Override
    @Transactional
    public List<Long> closeAllOnClubClosure(Long clubId) {
        List<Recruitment> recruitments =
                recruitmentRepository.findByClubIdOrderByStatusOpenFirstAndStartDateDesc(clubId);
        // 한 번의 폐쇄로 닫히는 모집들은 같은 종료 시각을 갖는다 — 루프마다 시계를 읽으면 가입 링크의
        // 기간 기준점이 모집마다 미세하게 어긋난다.
        LocalDateTime closedAt = LocalDateTime.now(clock);
        for (Recruitment recruitment : recruitments) {
            if (recruitment.getStatus() == RecruitmentStatus.OPEN) {
                recruitment.close(closedAt);
            }
        }
        return recruitments.stream().map(Recruitment::getId).toList();
    }

    @Override
    @Transactional
    public int closeAllOnClubDeactivation(Long clubId) {
        return recruitmentRepository.closeAllOpenByClubId(clubId, LocalDateTime.now(clock));
    }

    // 모집의 soft-delete 는 지원/면접 cascade(반환된 id 사용) 가 끝난 뒤 호출해야 한다. 모집을 먼저
    // 삭제하면 지원/면접 조회가 @SQLRestriction 으로 모집을 찾지 못해 cascade 가 누락된다. 폐쇄된
    // 동아리의 모집이 살아남아 공개 캘린더/상세/목록 조회를 500 으로 만드는 것을 막기 위해, cascade
    // 종료 후 일괄 soft-delete 하여 @SQLRestriction 이 모든 공개 경로에서 제외하도록 한다.
    @Override
    @Transactional
    public void softDeleteAllOnClubClosure(List<Long> recruitmentIds) {
        if (recruitmentIds.isEmpty()) {
            return;
        }
        recruitmentRepository.softDeleteByIds(recruitmentIds, LocalDateTime.now());
    }

    /**
     * 운영 중(ACTIVE) 동아리만 모집을 열 수 있다 — 운영 중단 전환의 "모집 활동 정지" 불변식 (스펙 Part A/C).
     * findByIdForUpdate 로 잠근 club 을 전달해야 운영 중단 전환과 직렬화된다 — 잠금 없는 엔티티로 검사하면
     * 검사와 INSERT 커밋 사이에 전환이 끼어들어 INACTIVE 동아리에 OPEN 모집이 남을 수 있다.
     * ClubAuthService(requireManager)에 내장된 기본 게이트(Part C)는 잠금 없이 별도 조회로 판정하므로
     * 이 잠금 하 원자 판정을 대체하지 못한다 — 기본 게이트가 있다는 이유로 제거하면 PR-1 동시성 보호가 사라진다.
     */
    private void requireActiveClubUnderLock(Club club) {
        if (club.getStatus() != ClubStatus.ACTIVE) {
            throw new AccessDeniedException("운영 중(ACTIVE) 동아리에서만 모집을 열 수 있습니다.");
        }
    }

    /**
     * 종료일이 이미 지난 공고는 생성 즉시 만료-OPEN(한 번도 열리지 않는 마감 공고)이 된다 —
     * 생성 경로(create·replaceActive) 공통 가드. 전임 모집 자동 마감보다 먼저 호출해
     * 잘못된 요청이 기존 모집을 건드리지 못하게 한다.
     */
    private void requireEndDateNotPast(LocalDate endDate) {
        if (endDate != null && endDate.isBefore(LocalDate.now(clock))) {
            throw new RecruitmentException.PastEndDateException();
        }
    }

    private Long buildAndPersist(Club club, CreateRecruitmentCommand command) {
        Recruitment recruitment;
        try {
            recruitment = Recruitment.createWithOptions(
                    club,
                    command.title(),
                    command.content(),
                    command.startDate(),
                    command.endDate(),
                    command.capacity(),
                    command.applicationMode(),
                    command.externalFormUrl(),
                    command.useInterview(),
                    command.targetRole(),
                    command.interviewStartDate(),
                    command.interviewEndDate(),
                    command.showApplicantCount()
            );
        } catch (IllegalArgumentException exception) {
            throw new RecruitmentException.InvalidRecruitmentPeriodException();
        }

        if (command.applicationMode() == ApplicationMode.SELF) {
            RecruitmentForm form = RecruitmentForm.create(recruitment, command.questions());
            recruitment.attachForm(form);
        }

        // 동시 생성 race 는 uk_recruitment_club_active partial unique 로 차단된다.
        // 명시적 flush 로 commit 이 아닌 현재 트랜잭션 안에서 충돌을 잡아
        // DuplicateActiveRecruitmentException 으로 변환한다. 다른 종류의
        // DataIntegrityViolationException (FK / CHECK / 다른 unique 등) 은 그대로 전파.
        Recruitment saved;
        try {
            saved = recruitmentRepository.save(recruitment);
            recruitmentRepository.flush();
        } catch (DataIntegrityViolationException racedActiveInsertion) {
            if (!isRecruitmentActiveDuplicate(racedActiveInsertion)) {
                throw racedActiveInsertion;
            }
            throw new RecruitmentException.DuplicateActiveRecruitmentException();
        }

        if (saved.getStatus() == RecruitmentStatus.OPEN
                && !saved.getStartDate().isAfter(LocalDate.now(clock))) {
            eventPublisher.publishEvent(new RecruitmentOpenedEvent(
                    saved.getId(),
                    club.getId(),
                    club.getName(),
                    saved.getTitle(),
                    saved.getEndDate()));
        }

        return saved.getId();
    }

    /**
     * 활성 모집 unique 인덱스(uk_recruitment_club_active) 위반인지만 true.
     * 다른 unique / CHECK / FK 위반은 false 를 돌려 호출 측에서 그대로 전파시킨다.
     */
    private static boolean isRecruitmentActiveDuplicate(DataIntegrityViolationException exception) {
        return PostgresConstraintViolations.isUniqueViolationOf(exception, RECRUITMENT_ACTIVE_UNIQUE_CONSTRAINT);
    }
}
