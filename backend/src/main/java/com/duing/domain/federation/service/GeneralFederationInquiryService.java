package com.duing.domain.federation.service;

import com.duing.domain.federation.entity.FederationInquiry;
import com.duing.domain.federation.entity.FederationInquiryAnswer;
import com.duing.domain.federation.entity.FederationInquiryAttachment;
import com.duing.domain.federation.entity.FederationInquiryStatus;
import com.duing.domain.federation.exception.FederationInquiryException;
import com.duing.domain.federation.repository.FederationInquiryAnswerRepository;
import com.duing.domain.federation.repository.FederationInquiryAttachmentRepository;
import com.duing.domain.federation.repository.FederationInquiryRepository;
import com.duing.domain.federation.service.dto.command.AnswerFederationInquiryCommand;
import com.duing.domain.federation.service.dto.command.ChangeInquiryStatusCommand;
import com.duing.domain.federation.service.dto.command.CreateFederationInquiryCommand;
import com.duing.domain.federation.service.dto.command.UpdateFederationInquiryCommand;
import com.duing.domain.federation.service.dto.command.UpdateInquiryAnswerCommand;
import com.duing.domain.federation.service.dto.query.AdminFederationInquiryDetailQuery;
import com.duing.domain.federation.service.dto.query.AdminFederationInquiryQuery;
import com.duing.domain.federation.service.dto.query.FederationInquiryAdminSearchCondition;
import com.duing.domain.federation.service.dto.query.FederationInquiryAttachmentDownload;
import com.duing.domain.federation.service.dto.query.FederationInquiryDetailQuery;
import com.duing.domain.notification.event.FederationInquiryAnsweredEvent;
import com.duing.domain.notification.event.FederationInquiryClosedEvent;
import com.duing.domain.notification.event.FederationInquiryReceivedEvent;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.constant.AdminLabels;
import com.duing.global.file.FileStorageService;
import com.duing.global.file.FileUploadPolicy;
import com.duing.global.file.StoredFile;
import com.duing.global.file.UploadedObjectService;
import com.duing.global.file.controller.dto.FilePurpose;
import java.util.ArrayList;
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

    // 첨부 URL 은 반드시 이 목적으로 업로드된 키(FilePurpose.FEDERATION_INQUIRY)여야 한다 —
    // 타 purpose(club/logo 등) 키를 그대로 붙여 넣는 것을 막는다.
    private static final String ATTACHMENT_KEY_PREFIX = FilePurpose.FEDERATION_INQUIRY.directory() + "/";

    private final FederationInquiryRepository inquiryRepository;
    private final FederationInquiryAnswerRepository answerRepository;
    private final FederationInquiryAttachmentRepository attachmentRepository;
    private final UserRepository userRepository;
    private final ApplicationEventPublisher eventPublisher;
    private final FileStorageService fileStorageService;
    private final UploadedObjectService uploadedObjectService;

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
        if (command.attachmentUrls() != null && !command.attachmentUrls().isEmpty()) {
            attachmentRepository.saveAll(buildAttachments(inquiry, command.attachmentUrls()));
        }
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
                inquiry, answerRepository.findByInquiryId(inquiry.getId()).orElse(null),
                attachmentRepository.findAllByInquiryIdAndAnswerIdIsNullOrderBySortOrderAsc(inquiry.getId()));
    }

    @Override
    @Transactional
    public void update(UpdateFederationInquiryCommand command) {
        FederationInquiry inquiry = getOwned(command.inquiryId(), command.authorId());
        inquiry.updateContent(command.title(), command.content());
        if (command.attachmentUrls() != null) {
            replaceAttachments(inquiry, command.attachmentUrls());
        }
        // 관리자 전이·답변 커밋과의 레이스를 flush 로 감지해 도메인 메시지로 변환(withdraw 전례).
        try {
            inquiryRepository.flush();
        } catch (ObjectOptimisticLockingFailureException concurrentChange) {
            throw new FederationInquiryException.ConcurrentInquiryUpdateException();
        }
    }

    @Override
    public FederationInquiryAttachmentDownload downloadAttachment(
            Long inquiryId, Long attachmentId, Long currentUserId, UserRole currentUserRole) {
        FederationInquiry inquiry = inquiryRepository.findById(inquiryId)
                .orElseThrow(FederationInquiryException.FederationInquiryNotFoundException::new);
        // ADMIN 이 아니면 작성자 본인만 — 그 외는 미존재와 동일하게 404 로 응답해 존재를 은닉한다.
        if (currentUserRole != UserRole.ADMIN && !inquiry.isAuthor(currentUserId)) {
            throw new FederationInquiryException.FederationInquiryNotFoundException();
        }
        FederationInquiryAttachment attachment = attachmentRepository
                .findByIdAndInquiryId(attachmentId, inquiryId)
                .orElseThrow(FederationInquiryException.FederationInquiryNotFoundException::new);
        StoredFile storedFile = fileStorageService.download(attachment.getStorageKey());
        if (storedFile == null) {
            // 스토리지에서 사라진 키(운영 이슈 등) — 존재 은닉 관례와 동일하게 404 로 취급한다.
            throw new FederationInquiryException.FederationInquiryNotFoundException();
        }
        return new FederationInquiryAttachmentDownload(attachment.getFileName(), storedFile);
    }

    // 첨부 URL → 스토리지 키 변환·검증 후 신규 attachment 엔티티 목록을 만든다(아직 저장 전).
    // fileName·contentType 은 storage key 자체(=비밀)에서 도출하지 않는다 — 노출돼도 무해한
    // 값(순번 라벨·확장자 기반 MIME)만 사용해 응답에 원본 위치가 드러나지 않게 한다.
    private List<FederationInquiryAttachment> buildAttachments(FederationInquiry inquiry, List<String> attachmentUrls) {
        List<FederationInquiryAttachment> attachments = new ArrayList<>();
        for (int index = 0; index < attachmentUrls.size(); index++) {
            String storageKey = validateAndExtractStorageKey(attachmentUrls.get(index));
            String contentType = resolveContentType(storageKey);
            Long fileSize = fileStorageService.sizeOf(storageKey);
            if (fileSize == null) {
                // 프리픽스는 맞지만 스토리지에 실체가 없는 키(위조 등) — 유효하지 않은 첨부로 취급.
                throw new FederationInquiryException.InvalidInquiryException();
            }
            attachments.add(FederationInquiryAttachment.create(
                    inquiry, storageKey, "첨부 이미지 " + (index + 1), contentType, fileSize, index));
        }
        // 업로드 추적 활성화(#791) — 잠금 순서 결정화를 위해 서비스가 사전순 정렬해 한 번에 잠근다(스펙 §3.3).
        uploadedObjectService.activate(attachmentUrls.toArray(String[]::new));
        return attachments;
    }

    private String validateAndExtractStorageKey(String attachmentUrl) {
        String storageKey = fileStorageService.toStorageKey(attachmentUrl);
        // ".." 세그먼트 포함 키 거부 — S3 는 리터럴 키라 자연 방어되지만, local 은 sizeOf/download 가
        // Path#normalize 로 해석하므로 provider 구현 세부에 기대지 않고 서비스 레벨에서 원천 차단한다.
        if (storageKey == null || !storageKey.startsWith(ATTACHMENT_KEY_PREFIX) || storageKey.contains("..")) {
            throw new FederationInquiryException.InvalidInquiryException();
        }
        return storageKey;
    }

    private String resolveContentType(String storageKey) {
        int dotIndex = storageKey.lastIndexOf('.');
        String extension = dotIndex >= 0 ? storageKey.substring(dotIndex + 1).toLowerCase() : "";
        String contentType = FileUploadPolicy.MIME_BY_EXTENSION.get(extension);
        if (contentType == null) {
            throw new FederationInquiryException.InvalidInquiryException();
        }
        return contentType;
    }

    // 수정(RECEIVED 전용, 호출자가 상태 검증 완료)의 첨부는 PUT 의미론 — 전체 교체.
    // 스토리지 물리 삭제는 트랜잭션 안전성(롤백 시 파일 복구 불가) 때문에 하지 않는다 — ClubPhoto
    // 전례(GeneralClubPhotoService.delete() 참조)와 동일. 물리 삭제를 flush(낙관락 충돌 감지)보다
    // 먼저 실행하면, 409 로 롤백될 때 DB 행은 되살아나는데 파일만 사라지는 원자성 결함이 생긴다.
    // 기존 행은 전부 soft delete 하고 새 목록을 insert 하며, 고아 객체 정리는 후속 파기 배치 몫이다
    // (domain.federation.job.FederationInquiryPurgeJob 이 그 후속 — attachment.deleted_at 경과분을
    // findPurgeTargets 로 조회해 스토리지 객체·행을 함께 파기한다).
    private void replaceAttachments(FederationInquiry inquiry, List<String> attachmentUrls) {
        List<FederationInquiryAttachment> existingAttachments =
                attachmentRepository.findAllByInquiryIdAndAnswerIdIsNullOrderBySortOrderAsc(inquiry.getId());
        List<FederationInquiryAttachment> newAttachments = buildAttachments(inquiry, attachmentUrls);

        existingAttachments.forEach(attachmentRepository::delete);
        if (!newAttachments.isEmpty()) {
            attachmentRepository.saveAll(newAttachments);
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
                author != null ? author.getStudentId() : AdminLabels.DELETED,
                attachmentRepository.findAllByInquiryIdAndAnswerIdIsNullOrderBySortOrderAsc(inquiry.getId()));
    }

    @Override
    @Transactional
    public void changeStatus(ChangeInquiryStatusCommand command) {
        FederationInquiry inquiry = getInquiryForAdmin(command.inquiryId());
        switch (command.status()) {
            case IN_PROGRESS -> startProgress(inquiry, command.version());
            case CLOSED -> close(inquiry, command.closedReason(), command.version());
            case RECEIVED -> revertToReceived(inquiry, command.version());
            // ANSWERED 는 답변 등록으로만 진입(수동 지정 불가)
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
            // 다른 관리자가 이미 시작 — 최신 화면 검증 후의 멱등 no-op. 멱등 204 는 echo 로 "최신
            // 화면"임만 보증하며, 직후 반대 전이가 커밋되면 최종 상태는 다를 수 있다(순차 요청과
            // 등가 — 낙관락 모델의 본질, FE 는 mutation 후 refetch 로 수렴한다).
            return;
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

    // 관리자 "접수로 되돌리기" CTA — startProgress 와 완전 대칭 구조(echo → 멱등 → flush).
    private void revertToReceived(FederationInquiry inquiry, Long version) {
        // echo 검증을 멱등 반환보다 먼저 — stale 화면(옛 내용을 보고 있는 관리자)의 되돌리기 요청은
        // 409 로 걸러 refetch 를 유도한다(startProgress 근거 동일).
        if (version == null || !version.equals(inquiry.getVersion())) {
            throw new FederationInquiryException.InquiryContentChangedException();
        }
        if (inquiry.getStatus() == FederationInquiryStatus.RECEIVED) {
            // 다른 관리자가 이미 되돌림 — 최신 화면 검증 후의 멱등 no-op. 멱등 204 는 echo 로 "최신
            // 화면"임만 보증하며, 직후 반대 전이가 커밋되면 최종 상태는 다를 수 있다(순차 요청과
            // 등가 — 낙관락 모델의 본질, FE 는 mutation 후 refetch 로 수렴한다).
            return;
        }
        inquiry.revertToReceived();
        // 동시 전이 경합은 flush 로 현재 트랜잭션 안에서 감지한다(startProgress 전례 그대로).
        try {
            inquiryRepository.flush();
        } catch (ObjectOptimisticLockingFailureException concurrentTransition) {
            throw new FederationInquiryException.InquiryContentChangedException();
        }
        // 알림 발행 없음 — 스펙 §5 알림 표(접수→ADMIN/답변→작성자/무답변 종결→작성자)에 revert 없음.
        // 학생에게는 조용히 수정 가능이 복원된다(비밀문의 특성상 상태 노출 최소화).
    }

    // 조건부 echo 의 공통 stale 판정(answer·close 공유) — version 이 제공됐는데 최신이 아니면 true.
    // 미제공(null)은 stale 로 보지 않는다: 배포된 FE 가 version 을 동봉하기 전까지의 하위호환 경로.
    private boolean isVersionStale(FederationInquiry inquiry, Long version) {
        return version != null && !version.equals(inquiry.getVersion());
    }

    private void close(FederationInquiry inquiry, String closedReason, Long version) {
        // 조건부 echo — IN_PROGRESS → RECEIVED 역전이 도입으로 "stale IN_PROGRESS 화면의 관리자가
        // (다른 관리자의 revert → 학생 수정 이후) 옛 내용 기준으로 문의를 그대로 종결"하는 경로가
        // 넓어졌다. answer() 와 동일한 2단계 봉합: version 이 제공된 경우에만 불일치를 409 로 거르고,
        // 미제공은 기존대로 통과시켜 하위호환을 지킨다 — FE 후속 작업에서 항상 version 을 동봉하면
        // 방어가 완성된다.
        if (isVersionStale(inquiry, version)) {
            throw new FederationInquiryException.InquiryContentChangedException();
        }
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
        // RECEIVED 직행(전이 API 생략 fallback)은 작성 시간 전체가 stale-view 에 노출 — echo 필수(미제공도 거부).
        //
        // IN_PROGRESS 경로의 기존 전제("전이 게이트가 version 을 검증하므로 IN_PROGRESS 진입 자체가
        // 최신 화면 증명이라 echo 불요")는 IN_PROGRESS → RECEIVED 역전이가 없다는 가정 위에 있었다.
        // 역전이 도입 후에는 구멍이 생긴다: 관리자 A 가 IN_PROGRESS 에서 답변을 작성하는 도중 →
        // 관리자 B 가 RECEIVED 로 되돌림 → 학생이 수정(version 증가) → 관리자 C 가 재진입(IN_PROGRESS)
        // → A 의 stale 답변 POST 가 echo 없이 그대로 통과한다.
        // 2단계 봉합: 지금은 "version 이 제공된 경우에만" 검증한다(RECEIVED 는 기존대로 미제공도 거부).
        // 배포된 FE 는 아직 IN_PROGRESS 답변에 version 을 보내지 않으므로 무조건 요구하면 배포 사이
        // 답변 등록이 전부 409 가 된다 — 하위호환을 위해 "제공 시에만" 으로 시작하고, FE 후속 작업에서
        // 항상 version 을 동봉하면 무조건 검증으로 강화한다.
        if ((inquiry.getStatus() == FederationInquiryStatus.RECEIVED && command.version() == null)
                || isVersionStale(inquiry, command.version())) {
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
