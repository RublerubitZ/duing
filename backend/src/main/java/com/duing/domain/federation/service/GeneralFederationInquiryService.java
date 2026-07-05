package com.duing.domain.federation.service;

import com.duing.domain.federation.entity.FederationInquiry;
import com.duing.domain.federation.entity.FederationInquiryAnswer;
import com.duing.domain.federation.entity.FederationInquiryStatus;
import com.duing.domain.federation.exception.FederationInquiryException;
import com.duing.domain.federation.repository.FederationInquiryAnswerRepository;
import com.duing.domain.federation.repository.FederationInquiryRepository;
import com.duing.domain.federation.service.dto.command.AnswerFederationInquiryCommand;
import com.duing.domain.federation.service.dto.command.ChangeInquiryStatusCommand;
import com.duing.domain.federation.service.dto.command.CreateFederationInquiryCommand;
import com.duing.domain.federation.service.dto.command.UpdateFederationInquiryCommand;
import com.duing.domain.federation.service.dto.command.UpdateInquiryAnswerCommand;
import com.duing.domain.federation.service.dto.query.AdminFederationInquiryDetailQuery;
import com.duing.domain.federation.service.dto.query.AdminFederationInquiryQuery;
import com.duing.domain.federation.service.dto.query.FederationInquiryAdminSearchCondition;
import com.duing.domain.federation.service.dto.query.FederationInquiryDetailQuery;
import com.duing.domain.notification.event.FederationInquiryAnsweredEvent;
import com.duing.domain.notification.event.FederationInquiryClosedEvent;
import com.duing.domain.notification.event.FederationInquiryReceivedEvent;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.constant.AdminLabels;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralFederationInquiryService implements FederationInquiryService {

    // 도배 가드 상한 — (a) 열린 RECEIVED, (b) 24시간 생성(삭제 포함, '삭제→재작성' 루프 차단)
    private static final int MAX_OPEN_INQUIRIES = 5;
    private static final int MAX_DAILY_CREATIONS = 10;

    private final FederationInquiryRepository inquiryRepository;
    private final FederationInquiryAnswerRepository answerRepository;
    private final UserRepository userRepository;
    private final ApplicationEventPublisher eventPublisher;

    @Override
    @Transactional
    public Long create(CreateFederationInquiryCommand command) {
        // count-then-insert TOCTOU 로 동시 요청 수만큼 초과 가능 — 스팸 완화용 소프트 가드라 수용.
        if (inquiryRepository.countByAuthorIdAndStatus(command.authorId(), FederationInquiryStatus.RECEIVED)
                >= MAX_OPEN_INQUIRIES
                || inquiryRepository.countRecentIncludingDeleted(command.authorId()) >= MAX_DAILY_CREATIONS) {
            throw new FederationInquiryException.TooManyOpenInquiriesException();
        }
        FederationInquiry inquiry = inquiryRepository.save(
                FederationInquiry.create(command.authorId(), command.title(), command.content()));
        eventPublisher.publishEvent(new FederationInquiryReceivedEvent(inquiry.getId(), inquiry.getTitle()));
        return inquiry.getId();
    }

    @Override
    public Page<FederationInquiry> listMine(Long authorId, FederationInquiryStatus status, Pageable pageable) {
        return inquiryRepository.searchMine(authorId, status, pageable);
    }

    @Override
    public FederationInquiryDetailQuery getMine(Long inquiryId, Long authorId) {
        FederationInquiry inquiry = getOwned(inquiryId, authorId);
        return new FederationInquiryDetailQuery(
                inquiry, answerRepository.findByInquiryId(inquiry.getId()).orElse(null));
    }

    @Override
    @Transactional
    public void update(UpdateFederationInquiryCommand command) {
        FederationInquiry inquiry = getOwned(command.inquiryId(), command.authorId());
        inquiry.updateContent(command.title(), command.content());
        // 관리자 전이·답변 커밋과의 레이스를 flush 로 감지해 도메인 메시지로 변환(withdraw 전례).
        try {
            inquiryRepository.flush();
        } catch (ObjectOptimisticLockingFailureException concurrentChange) {
            throw new FederationInquiryException.ConcurrentInquiryUpdateException();
        }
    }

    @Override
    @Transactional
    public void delete(Long inquiryId, Long authorId) {
        FederationInquiry inquiry = getOwned(inquiryId, authorId);
        // 전 상태 허용(스펙 §4 삭제 정책 — soft delete 라 감사 이력 보존). 동시 답변 커밋과의 레이스는
        // @SQLDelete 의 version 조건이 감지 → flush 로 잡아 도메인 메시지로 변환.
        inquiryRepository.delete(inquiry);
        try {
            inquiryRepository.flush();
        } catch (ObjectOptimisticLockingFailureException concurrentChange) {
            throw new FederationInquiryException.ConcurrentInquiryUpdateException();
        }
    }

    @Override
    public Page<AdminFederationInquiryQuery> searchForAdmin(
            FederationInquiryAdminSearchCondition condition, Pageable pageable) {
        Page<FederationInquiry> page = inquiryRepository.searchForAdmin(condition, pageable);
        // 탈퇴 회원은 @SQLRestriction 으로 findAllById 결과에서 빠진다 → AdminLabels.DELETED 폴백
        // (leftJoin 대신 페이지 내 id 일괄 조회 — GeneralLeaderSuccessionService 관례).
        List<Long> authorIds = page.getContent().stream().map(FederationInquiry::getAuthorId).distinct().toList();
        Map<Long, User> authorById = userRepository.findAllById(authorIds).stream()
                .collect(Collectors.toMap(User::getId, user -> user));
        return page.map(inquiry -> {
            User author = authorById.get(inquiry.getAuthorId());
            return new AdminFederationInquiryQuery(
                    inquiry,
                    author != null ? author.getName() : AdminLabels.DELETED,
                    author != null ? author.getStudentId() : AdminLabels.DELETED);
        });
    }

    @Override
    public AdminFederationInquiryDetailQuery getForAdmin(Long inquiryId) {
        FederationInquiry inquiry = getInquiryForAdmin(inquiryId);
        // 탈퇴 회원은 @SQLRestriction 으로 findById 결과에서 빠진다 → AdminLabels.DELETED 폴백
        // (searchForAdmin 목록과 동일한 해석을 서비스 한 곳에서 — 단건이라 findById 로 충분).
        User author = userRepository.findById(inquiry.getAuthorId()).orElse(null);
        return new AdminFederationInquiryDetailQuery(
                inquiry,
                answerRepository.findByInquiryId(inquiry.getId()).orElse(null),
                author != null ? author.getName() : AdminLabels.DELETED,
                author != null ? author.getStudentId() : AdminLabels.DELETED);
    }

    @Override
    @Transactional
    public void changeStatus(ChangeInquiryStatusCommand command) {
        FederationInquiry inquiry = getInquiryForAdmin(command.inquiryId());
        switch (command.status()) {
            case IN_PROGRESS -> startProgress(inquiry, command.version());
            case CLOSED -> close(inquiry, command.closedReason());
            // ANSWERED 는 답변 등록으로만 진입, RECEIVED 역전이는 미지원(스펙 §4)
            default -> throw new FederationInquiryException.InvalidInquiryStatusException(
                    "직접 지정할 수 없는 상태입니다: " + command.status());
        }
    }

    private void startProgress(FederationInquiry inquiry, Long version) {
        // version echo 를 멱등 반환보다 먼저 — 이미 답변중이어도 stale 화면(옛 내용을 보고 있는
        // 관리자)은 409 로 걸러 refetch 를 유도한다. 멱등 204 는 최신 화면임이 확인된 경우만.
        if (version == null || !version.equals(inquiry.getVersion())) {
            throw new FederationInquiryException.InquiryContentChangedException();
        }
        if (inquiry.getStatus() == FederationInquiryStatus.IN_PROGRESS) {
            return; // 다른 관리자가 이미 시작 — 최신 화면 검증 후의 멱등 no-op
        }
        inquiry.startProgress();
        // 동시 전이 경합은 flush 로 현재 트랜잭션 안에서 감지한다. rollback-only 특성상 204 수렴은
        // 불가능하므로 409 로 반환 — 패자의 재시도는 위 멱등 no-op 으로 수렴한다(계획 서문 참조).
        try {
            inquiryRepository.flush();
        } catch (ObjectOptimisticLockingFailureException concurrentTransition) {
            throw new FederationInquiryException.InquiryContentChangedException();
        }
    }

    private void close(FederationInquiry inquiry, String closedReason) {
        boolean hadAnswer = answerRepository.findByInquiryId(inquiry.getId()).isPresent();
        inquiry.close(closedReason);
        // 동시 답변·다른 관리자 종결과의 레이스를 flush 로 감지해 도메인 메시지로 변환(withdraw 전례).
        try {
            inquiryRepository.flush();
        } catch (ObjectOptimisticLockingFailureException concurrentChange) {
            throw new FederationInquiryException.ConcurrentInquiryUpdateException();
        }
        if (!hadAnswer) {
            // 무답변 종결만 알림 — 답변 후 종결은 이미 답변 알림을 받았다(스펙 §5 알림 표).
            eventPublisher.publishEvent(new FederationInquiryClosedEvent(
                    inquiry.getId(), inquiry.getAuthorId(), inquiry.getTitle(), closedReason));
        }
    }

    @Override
    @Transactional
    public Long answer(AnswerFederationInquiryCommand command) {
        FederationInquiry inquiry = getInquiryForAdmin(command.inquiryId());
        if (!inquiry.getStatus().canReceiveAnswer()) {
            throw inquiry.getStatus() == FederationInquiryStatus.ANSWERED
                    ? new FederationInquiryException.InquiryAlreadyAnsweredException()
                    : new FederationInquiryException.InvalidInquiryStatusException(
                            "종료된 문의에는 답변을 등록할 수 없습니다.");
        }
        // RECEIVED 직행(전이 API 생략 fallback)은 작성 시간 전체가 stale-view 에 노출 — echo 필수.
        // IN_PROGRESS 경로는 전이 시점 잠금(학생 수정 차단)이 이미 보장하므로 echo 불요(스펙 §4)
        // — 전이 게이트(startProgress)가 version 을 검증하므로 IN_PROGRESS 진입 자체가 최신 화면 증명.
        if (inquiry.getStatus() == FederationInquiryStatus.RECEIVED
                && (command.version() == null || !command.version().equals(inquiry.getVersion()))) {
            throw new FederationInquiryException.InquiryContentChangedException();
        }
        if (answerRepository.findByInquiryId(inquiry.getId()).isPresent()) {
            throw new FederationInquiryException.InquiryAlreadyAnsweredException();
        }
        FederationInquiryAnswer answer;
        try {
            // IDENTITY 전략은 save 시점에 INSERT 가 즉시 실행 — partial unique 백스톱과
            // 낙관락 충돌을 모두 이 블록에서 잡기 위해 save 와 flush 를 함께 둔다.
            answer = answerRepository.save(FederationInquiryAnswer.create(
                    inquiry.getId(), command.content(), command.answeredBy()));
            inquiry.markAnswered(); // dirty checking — version 증가(JPQL 벌크 금지)
            inquiryRepository.flush();
        } catch (DataIntegrityViolationException duplicateAnswer) {
            // uq_federation_inquiry_answer 백스톱 — 다른 관리자가 먼저 답변을 커밋함
            throw new FederationInquiryException.InquiryAlreadyAnsweredException();
        } catch (ObjectOptimisticLockingFailureException concurrentChange) {
            // 학생 수정·삭제 또는 다른 관리자의 종결과 겹침 — 재조회 유도
            throw new FederationInquiryException.InquiryContentChangedException();
        }
        eventPublisher.publishEvent(new FederationInquiryAnsweredEvent(
                inquiry.getId(), inquiry.getAuthorId(), inquiry.getTitle(), answer.getId()));
        return answer.getId();
    }

    @Override
    @Transactional
    public void updateAnswer(UpdateInquiryAnswerCommand command) {
        FederationInquiry inquiry = getInquiryForAdmin(command.inquiryId());
        if (inquiry.getStatus() != FederationInquiryStatus.ANSWERED) {
            // CLOSED 후 답변 수정 금지 — 종료된 문의가 소리 없이 바뀌는 것을 막는다(스펙 §4).
            throw new FederationInquiryException.InvalidInquiryStatusException(
                    "답변완료 상태에서만 답변을 수정할 수 있습니다: " + inquiry.getStatus());
        }
        FederationInquiryAnswer answer = answerRepository.findByInquiryId(inquiry.getId())
                .orElseThrow(FederationInquiryException.FederationInquiryNotFoundException::new);
        answer.updateContent(command.content()); // 재알림 없음 — dedupKey 에 answerId 포함(스펙 §5)
    }

    // 학생 경로 — 순수 작성자 전용, 비작성자·미존재 모두 404 로 존재 은닉(ADMIN 도 admin 경로만 사용).
    private FederationInquiry getOwned(Long inquiryId, Long authorId) {
        return inquiryRepository.findById(inquiryId)
                .filter(inquiry -> inquiry.isAuthor(authorId))
                .orElseThrow(FederationInquiryException.FederationInquiryNotFoundException::new);
    }

    // admin 경로 — 삭제 건은 410(작성자가 삭제한 문의), 원래 없던 건은 404 로 구분.
    private FederationInquiry getInquiryForAdmin(Long inquiryId) {
        return inquiryRepository.findById(inquiryId).orElseThrow(() ->
                inquiryRepository.existsDeletedById(inquiryId)
                        ? new FederationInquiryException.InquiryDeletedException()
                        : new FederationInquiryException.FederationInquiryNotFoundException());
    }
}
