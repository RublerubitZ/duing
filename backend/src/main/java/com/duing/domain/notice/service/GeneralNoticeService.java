package com.duing.domain.notice.service;

import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.notice.broadcast.service.NoticeBroadcaster;
import com.duing.domain.notice.entity.Notice;
import com.duing.domain.notice.entity.NoticeCategory;
import com.duing.domain.notice.entity.NoticeClubScopeRole;
import com.duing.domain.notice.entity.NoticeContentFormat;
import com.duing.domain.notice.entity.NoticeTargetClub;
import com.duing.domain.notice.entity.NoticeVisibility;
import com.duing.domain.notice.exception.NoticeException;
import com.duing.domain.notice.repository.NoticeRepository;
import com.duing.domain.notice.repository.NoticeTargetClubRepository;
import com.duing.domain.notice.service.dto.command.CreateClubNoticeCommand;
import com.duing.domain.notice.service.dto.command.CreateNoticeCommand;
import com.duing.domain.notice.service.dto.command.UpdateClubNoticeCommand;
import com.duing.domain.notice.service.dto.command.UpdateNoticeCommand;
import com.duing.domain.notice.service.dto.query.NoticeAdminSearchCondition;
import com.duing.domain.notice.service.dto.query.NoticeAdminSummaryQuery;
import com.duing.domain.notice.service.dto.query.NoticeSearchCondition;
import com.duing.domain.notice.service.dto.query.ViewerScope;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralNoticeService implements NoticeService {

    private final NoticeRepository noticeRepository;
    private final NoticeTargetClubRepository targetClubRepository;
    private final ClubRepository clubRepository;
    private final NoticeBroadcaster broadcaster;

    @Value("${duing.notice.cover-image-url-prefix:}")
    private String coverImageUrlPrefix;

    @Override
    @Transactional
    public Long create(CreateNoticeCommand command) {
        validateCoverImageUrl(command.coverImageUrl());
        validateScopedTargets(command.visibility(), command.targetClubIds());

        Notice saved = noticeRepository.save(Notice.create(
                command.title(), command.summary(), command.content(),
                command.coverImageUrl(), command.linkUrl(),
                command.category(), command.tags(),
                command.visibility(), command.clubScopeRole(),
                command.pinned(), command.expiresAt(), command.notifyOnPublish(),
                command.eventStartAt(), command.eventEndAt(),
                command.location(), command.host(), command.audience(), command.contentFormat(),
                command.authorId()
        ));

        if (command.visibility() == NoticeVisibility.CLUB_SCOPED) {
            persistTargetClubs(saved.getId(), command.targetClubIds());
        }
        List<Long> targetClubIds = command.visibility() == NoticeVisibility.CLUB_SCOPED
                ? command.targetClubIds()
                : List.of();
        broadcaster.publish(saved, targetClubIds);
        return saved.getId();
    }

    @Override
    @Transactional
    public void update(UpdateNoticeCommand command) {
        if (command.coverImageUrl() != null) validateCoverImageUrl(command.coverImageUrl());
        Notice found = noticeRepository.findById(command.noticeId())
                .orElseThrow(NoticeException.NoticeNotFoundException::new);

        NoticeVisibility nextVisibility = command.visibility() != null ? command.visibility() : found.getVisibility();
        if (nextVisibility == NoticeVisibility.CLUB_SCOPED) {
            List<Long> nextTargets = command.targetClubIds() != null
                    ? command.targetClubIds()
                    : targetClubRepository.findAllByIdNoticeId(found.getId()).stream().map(NoticeTargetClub::getClubId).toList();
            validateScopedTargets(NoticeVisibility.CLUB_SCOPED, nextTargets);
        }

        found.update(new Notice.UpdatePayload(
                command.title(), command.summary(), command.content(),
                command.coverImageUrl(), command.linkUrl(),
                command.category(), command.tags(),
                command.visibility(), command.clubScopeRole(),
                command.pinned(), command.expiresAt(), command.clearExpiresAt(),
                command.notifyOnPublish(),
                command.eventStartAt(), command.eventEndAt(),
                command.location(), command.host(), command.audience(), command.clearEvent(),
                command.contentFormat()
        ));

        if (command.targetClubIds() != null) {
            targetClubRepository.deleteAllByNoticeId(found.getId());
            if (nextVisibility == NoticeVisibility.CLUB_SCOPED) {
                persistTargetClubs(found.getId(), command.targetClubIds());
            }
        } else if (command.visibility() != null && nextVisibility != NoticeVisibility.CLUB_SCOPED) {
            targetClubRepository.deleteAllByNoticeId(found.getId());
        }
    }

    @Override
    @Transactional
    public void delete(Long noticeId) {
        Notice found = noticeRepository.findById(noticeId)
                .orElseThrow(NoticeException.NoticeNotFoundException::new);
        noticeRepository.delete(found);
    }

    @Override
    public Notice getVisible(Long noticeId, ViewerScope viewer) {
        Notice found = noticeRepository.findById(noticeId)
                .orElseThrow(NoticeException.NoticeNotFoundException::new);
        return noticeRepository.findVisibleById(noticeId, viewer)
                .orElseGet(() -> {
                    if (viewer.isAdmin()) return found;
                    throw new NoticeException.NoticeAccessDeniedException();
                });
    }

    @Override
    public Page<Notice> searchFeed(NoticeSearchCondition condition, ViewerScope viewer, Pageable pageable) {
        return noticeRepository.findFeed(condition, viewer, pageable);
    }

    @Override
    public Page<NoticeAdminSummaryQuery> listForAdmin(NoticeAdminSearchCondition condition, Pageable pageable) {
        return noticeRepository.findAdminList(condition, pageable).map(NoticeAdminSummaryQuery::from);
    }

    @Override
    @Transactional
    public Long createForClub(CreateClubNoticeCommand command) {
        if (command.coverImageUrl() != null && !command.coverImageUrl().isBlank()) {
            validateCoverImageUrl(command.coverImageUrl());
        }
        String safeSummary = command.summary() != null ? command.summary() : "";
        String safeCoverImageUrl = command.coverImageUrl() != null ? command.coverImageUrl() : "";
        Notice saved = noticeRepository.save(Notice.create(
                command.title(), safeSummary, command.content(),
                safeCoverImageUrl, null /* linkUrl */,
                NoticeCategory.GENERAL,
                List.of() /* tags */,
                NoticeVisibility.CLUB_SCOPED,
                NoticeClubScopeRole.ALL_MEMBERS,
                command.pinned(), command.expiresAt(), false /* notifyOnPublish */,
                null, null, null, null, null /* event */, NoticeContentFormat.MARKDOWN,
                command.authorId()
        ));
        saved.assignOwningClub(command.clubId());
        persistTargetClubs(saved.getId(), List.of(command.clubId()));
        broadcaster.publish(saved, List.of(command.clubId()));
        return saved.getId();
    }

    @Override
    @Transactional
    public void updateForClub(UpdateClubNoticeCommand command) {
        Notice found = noticeRepository.findById(command.noticeId())
                .orElseThrow(NoticeException.NoticeNotFoundException::new);
        // 클럽이 작성했고(owning_club_id) 현재도 그 클럽을 대상으로 하는 공지만 그 클럽 운영진이
        // 수정할 수 있다. owning_club_id 로 관리자 브로드캐스트(NULL)·타 클럽 소유 공지를 차단하고,
        // 대상 재검증으로 관리자가 대상을 다른 클럽으로 옮긴 공지에 대한 잔존 권한도 막는다.
        boolean owned = found.getOwningClubId() != null && found.getOwningClubId().equals(command.clubId());
        boolean stillTargetsClub = targetClubRepository.findAllByIdNoticeId(found.getId())
                .stream().anyMatch(targetClub -> targetClub.getClubId().equals(command.clubId()));
        if (!owned || !stillTargetsClub) {
            throw new NoticeException.NoticeAccessDeniedException();
        }
        if (command.coverImageUrl() != null && !command.coverImageUrl().isBlank()) {
            validateCoverImageUrl(command.coverImageUrl());
        }
        found.applyClubScopedUpdate(
                command.title(), command.summary(), command.content(),
                command.coverImageUrl(), command.pinned(), command.expiresAt()
        );
    }

    @Override
    @Transactional
    public void deleteForClub(Long clubId, Long noticeId) {
        Notice found = noticeRepository.findById(noticeId)
                .orElseThrow(NoticeException.NoticeNotFoundException::new);
        // 클럽이 작성했고(owning_club_id) 현재도 그 클럽을 대상으로 하는 공지만 삭제할 수 있다.
        boolean owned = found.getOwningClubId() != null && found.getOwningClubId().equals(clubId);
        boolean stillTargetsClub = targetClubRepository.findAllByIdNoticeId(found.getId())
                .stream().anyMatch(targetClub -> targetClub.getClubId().equals(clubId));
        if (!owned || !stillTargetsClub) {
            throw new NoticeException.NoticeAccessDeniedException();
        }
        noticeRepository.delete(found);
    }

    @Override
    public Page<Notice> findClubScopedForMember(Long clubId, Pageable pageable) {
        return noticeRepository.findClubScopedForMember(clubId, pageable);
    }

    private void validateCoverImageUrl(String url) {
        if (coverImageUrlPrefix == null || coverImageUrlPrefix.isBlank()) return;
        if (url == null || !url.startsWith(coverImageUrlPrefix)) {
            throw new NoticeException.InvalidCoverImageUrlException();
        }
    }

    private void validateScopedTargets(NoticeVisibility visibility, List<Long> targetClubIds) {
        if (visibility != NoticeVisibility.CLUB_SCOPED) return;
        if (targetClubIds == null || targetClubIds.isEmpty()) {
            throw new NoticeException.InvalidNoticeScopeException("CLUB_SCOPED 공지는 1개 이상의 대상 동아리가 필요합니다.");
        }
        List<Long> distinct = targetClubIds.stream().distinct().toList();
        long existing = clubRepository.findAllById(distinct).size();
        if (existing != distinct.size()) {
            throw new NoticeException.InvalidNoticeScopeException("존재하지 않는 동아리 ID 가 포함되어 있습니다.");
        }
    }

    private void persistTargetClubs(Long noticeId, List<Long> targetClubIds) {
        List<NoticeTargetClub> rows = targetClubIds.stream().distinct()
                .map(clubId -> new NoticeTargetClub(noticeId, clubId)).toList();
        targetClubRepository.saveAll(rows);
    }
}
