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
import com.duing.domain.federation.service.dto.query.AdminFederationInquiryRow;
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
    }

    @Override
    @Transactional
    public void delete(Long inquiryId, Long authorId) {
        FederationInquiry inquiry = getOwned(inquiryId, authorId);
        // 전 상태 허용(스펙 §4 삭제 정책 — soft delete 라 감사 이력 보존). 동시 답변 커밋과의 레이스는
        // @SQLDelete 의 version 조건이 감지 → 전역 핸들러가 409 변환.
        inquiryRepository.delete(inquiry);
    }

    @Override
    public Page<AdminFederationInquiryRow> searchForAdmin(
            FederationInquiryAdminSearchCondition condition, Pageable pageable) {
        Page<FederationInquiry> page = inquiryRepository.searchForAdmin(condition, pageable);
        // 탈퇴 회원은 @SQLRestriction 으로 findAllById 결과에서 빠진다 → AdminLabels.DELETED 폴백
        // (leftJoin 대신 페이지 내 id 일괄 조회 — GeneralLeaderSuccessionService 관례).
        List<Long> authorIds = page.getContent().stream().map(FederationInquiry::getAuthorId).distinct().toList();
        Map<Long, User> authorById = userRepository.findAllById(authorIds).stream()
                .collect(Collectors.toMap(User::getId, user -> user));
        return page.map(inquiry -> {
            User author = authorById.get(inquiry.getAuthorId());
            return new AdminFederationInquiryRow(
                    inquiry,
                    author != null ? author.getName() : AdminLabels.DELETED,
                    author != null ? author.getStudentId() : AdminLabels.DELETED);
        });
    }

    @Override
    public FederationInquiryDetailQuery getForAdmin(Long inquiryId) {
        FederationInquiry inquiry = getInquiryForAdmin(inquiryId);
        return new FederationInquiryDetailQuery(
                inquiry, answerRepository.findByInquiryId(inquiry.getId()).orElse(null));
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
        if (inquiry.getStatus() == FederationInquiryStatus.IN_PROGRESS) {
            return; // 다른 관리자가 이미 시작 — 멱등 no-op(쓰기 전 조기 반환이라 안전)
        }
        // version echo — 관리자 화면 렌더 후 학생이 수정한 stale-render 창을 노력 투입 전에 차단(스펙 §4).
        if (version == null || !version.equals(inquiry.getVersion())) {
            throw new FederationInquiryException.InquiryContentChangedException();
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
            throw new FederationInquiryException.InquiryAlreadyAnsweredException();
        }
        // RECEIVED 직행(전이 API 생략 fallback)은 작성 시간 전체가 stale-view 에 노출 — echo 필수.
        // IN_PROGRESS 경로는 전이 시점 잠금(학생 수정 차단)이 이미 보장하므로 echo 불요(스펙 §4).
        if (inquiry.getStatus() == FederationInquiryStatus.RECEIVED
                && (command.version() == null || !command.version().equals(inquiry.getVersion()))) {
            throw new FederationInquiryException.InquiryContentChangedException();
        }
        if (answerRepository.findByInquiryId(inquiry.getId()).isPresent()) {
            throw new FederationInquiryException.InquiryAlreadyAnsweredException();
        }
        FederationInquiryAnswer answer = answerRepository.save(
                FederationInquiryAnswer.create(inquiry.getId(), command.content(), command.answeredBy()));
        inquiry.markAnswered(); // dirty checking — version 증가(JPQL 벌크 금지)
        try {
            // 동시 답변(다른 관리자)·학생 수정/삭제와의 경합을 커밋 전에 감지.
            // DB partial unique(uq_federation_inquiry_answer)가 최종 백스톱.
            answerRepository.flush();
            inquiryRepository.flush();
        } catch (ObjectOptimisticLockingFailureException | org.springframework.dao.DataIntegrityViolationException race) {
            throw new FederationInquiryException.InquiryAlreadyAnsweredException();
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
