package com.duing.domain.promotion.service;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.exception.ClubException;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.notice.entity.Notice;
import com.duing.domain.notice.entity.NoticeVisibility;
import com.duing.domain.notice.exception.NoticeException;
import com.duing.domain.notice.repository.NoticeRepository;
import com.duing.domain.promotion.entity.Promotion;
import com.duing.domain.promotion.exception.PromotionException;
import com.duing.domain.promotion.repository.PromotionRepository;
import com.duing.domain.promotion.service.dto.command.CreatePromotionCommand;
import com.duing.domain.promotion.service.dto.command.UpdatePromotionCommand;
import com.duing.domain.promotion.service.dto.query.PromotionAdminListQuery;
import com.duing.domain.promotion.service.dto.query.PromotionAdminSearchCondition;
import com.duing.domain.promotion.service.dto.query.PromotionCardQuery;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.constant.AdminLabels;
import com.duing.global.file.UploadedObjectService;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralPromotionService implements PromotionService {

    private final PromotionRepository promotionRepository;
    private final ClubRepository clubRepository;
    private final UserRepository userRepository;
    private final NoticeRepository noticeRepository;
    private final UploadedObjectService uploadedObjectService;

    @Override
    @Transactional
    public Long create(CreatePromotionCommand command) {
        validateSingleLinkTarget(command.linkUrl(), command.noticeId(), command.clubId());
        validateNoticeIsPublic(command.noticeId());
        if (command.clubId() != null && clubRepository.findById(command.clubId()).isEmpty()) {
            throw new ClubException.ClubNotFoundException();
        }
        Promotion saved = promotionRepository.save(Promotion.create(
                command.clubId(), command.title(), command.bannerImageUrl(), command.linkUrl(),
                command.active(), command.displayOrder(), command.createdBy(),
                command.tag(), command.subtitle(), command.ctaLabel(), command.emoji(),
                command.palette(), command.startAt(), command.endAt(),
                command.renderMode(), command.imageAltText(),
                command.noticeId()
        ));
        uploadedObjectService.activate(command.bannerImageUrl());
        return saved.getId();
    }

    @Override
    @Transactional
    public void update(UpdatePromotionCommand command) {
        Promotion promotion = promotionRepository.findById(command.promotionId())
                .orElseThrow(PromotionException.PromotionNotFoundException::new);

        validateSingleLinkTarget(command.linkUrl(), command.noticeId(), command.clubId());
        validateNoticeIsPublic(command.noticeId());

        if (command.clubId() != null
                && !Boolean.TRUE.equals(command.clearClubId())
                && clubRepository.findById(command.clubId()).isEmpty()) {
            throw new ClubException.ClubNotFoundException();
        }

        promotion.update(new Promotion.UpdatePayload(
                command.title(), command.bannerImageUrl(), command.linkUrl(),
                command.clubId(), command.active(), command.displayOrder(), command.clearClubId(),
                command.tag(), command.subtitle(), command.ctaLabel(), command.emoji(),
                command.palette(),
                command.renderMode(), command.imageAltText(),
                command.startAt(), command.endAt(),
                command.clearBannerImageUrl(), command.clearLinkUrl(),
                command.clearTag(), command.clearSubtitle(),
                command.clearCtaLabel(), command.clearEmoji(),
                command.clearStartAt(), command.clearEndAt(),
                command.clearImageAltText(),
                command.noticeId(), command.clearNoticeId()
        ));
        uploadedObjectService.activate(command.bannerImageUrl());
    }

    @Override
    @Transactional
    public void delete(Long promotionId) {
        Promotion promotion = promotionRepository.findById(promotionId)
                .orElseThrow(PromotionException.PromotionNotFoundException::new);
        promotionRepository.delete(promotion);
    }

    @Override
    public Promotion getById(Long promotionId) {
        return promotionRepository.findById(promotionId)
                .orElseThrow(PromotionException.PromotionNotFoundException::new);
    }

    @Override
    public Page<PromotionCardQuery> findPublicCards(Pageable pageable) {
        Page<Promotion> promotionPage = promotionRepository.findPublicActive(pageable);

        Set<Long> clubIds = new HashSet<>();
        Set<Long> noticeIds = new HashSet<>();
        for (Promotion promotion : promotionPage.getContent()) {
            if (promotion.getClubId() != null) clubIds.add(promotion.getClubId());
            if (promotion.getNoticeId() != null) noticeIds.add(promotion.getNoticeId());
        }
        Map<Long, Club> clubMap = clubRepository.findAllById(clubIds).stream()
                .collect(Collectors.toMap(Club::getId, Function.identity()));
        Map<Long, Notice> noticeMap = noticeRepository.findAllById(noticeIds).stream()
                .collect(Collectors.toMap(Notice::getId, Function.identity()));

        return promotionPage.map(promotion -> PromotionCardQuery.of(
                promotion,
                resolvePublicClubRef(promotion.getClubId(), clubMap.get(promotion.getClubId())),
                resolveCardNoticeRef(promotion.getNoticeId(), noticeMap.get(promotion.getNoticeId()))));
    }

    @Override
    public PromotionAdminListQuery getAdminItemById(Long promotionId) {
        Promotion promotion = promotionRepository.findById(promotionId)
                .orElseThrow(PromotionException.PromotionNotFoundException::new);
        Club club = promotion.getClubId() == null
                ? null
                : clubRepository.findById(promotion.getClubId()).orElse(null);
        User createdBy = userRepository.findById(promotion.getCreatedBy()).orElse(null);
        Notice notice = promotion.getNoticeId() == null
                ? null
                : noticeRepository.findById(promotion.getNoticeId()).orElse(null);
        return PromotionAdminListQuery.of(
                promotion,
                resolveClubRef(promotion.getClubId(), club),
                resolveUserRef(promotion.getCreatedBy(), createdBy),
                resolveAdminNoticeRef(promotion.getNoticeId(), notice));
    }

    @Override
    public Page<PromotionAdminListQuery> listForAdmin(
            PromotionAdminSearchCondition condition, Pageable pageable
    ) {
        Page<Promotion> promotionPage = promotionRepository.searchForAdmin(condition, pageable);

        Set<Long> clubIds = new HashSet<>();
        Set<Long> userIds = new HashSet<>();
        Set<Long> noticeIds = new HashSet<>();
        for (Promotion promotion : promotionPage.getContent()) {
            if (promotion.getClubId() != null) clubIds.add(promotion.getClubId());
            userIds.add(promotion.getCreatedBy());
            if (promotion.getNoticeId() != null) noticeIds.add(promotion.getNoticeId());
        }
        Map<Long, Club> clubMap = clubRepository.findAllById(clubIds).stream()
                .collect(Collectors.toMap(Club::getId, Function.identity()));
        Map<Long, User> userMap = userRepository.findAllById(userIds).stream()
                .collect(Collectors.toMap(User::getId, Function.identity()));
        Map<Long, Notice> noticeMap = noticeRepository.findAllById(noticeIds).stream()
                .collect(Collectors.toMap(Notice::getId, Function.identity()));

        return promotionPage.map(promotion -> PromotionAdminListQuery.of(
                promotion,
                resolveClubRef(promotion.getClubId(), clubMap.get(promotion.getClubId())),
                resolveUserRef(promotion.getCreatedBy(), userMap.get(promotion.getCreatedBy())),
                resolveAdminNoticeRef(promotion.getNoticeId(), noticeMap.get(promotion.getNoticeId()))));
    }

    private void validateSingleLinkTarget(String linkUrl, Long noticeId, Long clubId) {
        int count = 0;
        if (linkUrl != null && !linkUrl.isBlank()) count++;
        if (noticeId != null) count++;
        if (clubId != null) count++;
        if (count > 1) {
            throw new PromotionException.MultipleLinkTargetsException();
        }
    }

    private void validateNoticeIsPublic(Long noticeId) {
        if (noticeId == null) return;
        Notice notice = noticeRepository.findById(noticeId)
                .orElseThrow(NoticeException.NoticeNotFoundException::new);
        if (!isNoticeAccessible(notice)) {
            throw new PromotionException.NonPublicNoticeLinkException();
        }
    }

    /**
     * 배너가 가리키는 공지를 열람할 수 있는지 판정하는 단일 지점 — PUBLIC 만 접근 가능하고,
     * 삭제·미존재(null)는 접근 불가로 수렴한다. 공개·어드민 응답이 같은 판정을 공유하고
     * 마스킹 정책(공개=title 비움 / 어드민=원값·삭제 라벨)만 각 ref 조립에서 갈린다.
     */
    private boolean isNoticeAccessible(Notice notice) {
        return notice != null && notice.getVisibility() == NoticeVisibility.PUBLIC;
    }

    private PromotionCardQuery.NoticeRef resolveCardNoticeRef(Long noticeId, Notice notice) {
        if (noticeId == null) return null;
        boolean accessible = isNoticeAccessible(notice);
        return new PromotionCardQuery.NoticeRef(noticeId, accessible ? notice.getTitle() : "", accessible);
    }

    private PromotionAdminListQuery.NoticeRef resolveAdminNoticeRef(Long noticeId, Notice notice) {
        if (noticeId == null) return null;
        if (notice == null) {
            return new PromotionAdminListQuery.NoticeRef(noticeId, AdminLabels.DELETED, null, false);
        }
        return new PromotionAdminListQuery.NoticeRef(
                notice.getId(), notice.getTitle(), notice.getVisibility(), isNoticeAccessible(notice));
    }

    private PromotionCardQuery.ClubRef resolvePublicClubRef(Long clubId, Club club) {
        // 공개 응답에서는 삭제 노이즈를 노출하지 않는다 — clubId 가 있어도 row 가 사라졌으면 ref 를 숨김.
        if (clubId == null || club == null) return null;
        return new PromotionCardQuery.ClubRef(club.getId(), club.getName());
    }

    private PromotionAdminListQuery.ClubRef resolveClubRef(Long clubId, Club club) {
        if (clubId == null) return null;
        if (club == null) return new PromotionAdminListQuery.ClubRef(clubId, AdminLabels.DELETED);
        return new PromotionAdminListQuery.ClubRef(club.getId(), club.getName());
    }

    @Override
    @Transactional
    public void removeAllOnClubClosure(Long clubId) {
        promotionRepository.deleteAll(promotionRepository.findAllByClubId(clubId));
    }

    private PromotionAdminListQuery.UserRef resolveUserRef(Long userId, User user) {
        if (user == null) return new PromotionAdminListQuery.UserRef(userId, AdminLabels.DELETED);
        return new PromotionAdminListQuery.UserRef(user.getId(), user.getName());
    }
}
