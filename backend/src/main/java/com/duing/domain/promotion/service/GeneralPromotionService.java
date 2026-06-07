package com.duing.domain.promotion.service;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.exception.ClubException;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.promotion.entity.Promotion;
import com.duing.domain.promotion.exception.PromotionException;
import com.duing.domain.promotion.repository.PromotionRepository;
import com.duing.domain.promotion.service.dto.command.CreatePromotionCommand;
import com.duing.domain.promotion.service.dto.command.UpdatePromotionCommand;
import com.duing.domain.promotion.service.dto.query.PromotionAdminListQuery;
import com.duing.domain.promotion.service.dto.query.PromotionAdminSearchCondition;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.constant.AdminLabels;
import java.util.HashSet;
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

    @Override
    @Transactional
    public Long create(CreatePromotionCommand command) {
        if (command.clubId() != null && clubRepository.findById(command.clubId()).isEmpty()) {
            throw new ClubException.ClubNotFoundException();
        }
        return promotionRepository.save(Promotion.create(
                command.clubId(), command.title(), command.bannerImageUrl(), command.linkUrl(),
                command.active(), command.displayOrder(), command.createdBy(),
                command.tag(), command.subtitle(), command.ctaLabel(), command.emoji(),
                command.palette(), command.startAt(), command.endAt(),
                null, null
        )).getId();
    }

    @Override
    @Transactional
    public void update(UpdatePromotionCommand command) {
        Promotion promotion = promotionRepository.findById(command.promotionId())
                .orElseThrow(PromotionException.PromotionNotFoundException::new);

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
                null, null,
                command.startAt(), command.endAt(),
                command.clearBannerImageUrl(), command.clearLinkUrl(),
                command.clearTag(), command.clearSubtitle(),
                command.clearCtaLabel(), command.clearEmoji(),
                command.clearStartAt(), command.clearEndAt(),
                null
        ));
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
    public Page<Promotion> findPublic(Pageable pageable) {
        return promotionRepository.findPublicActive(pageable);
    }

    @Override
    public PromotionAdminListQuery getAdminItemById(Long promotionId) {
        Promotion promotion = promotionRepository.findById(promotionId)
                .orElseThrow(PromotionException.PromotionNotFoundException::new);
        Club club = promotion.getClubId() == null
                ? null
                : clubRepository.findById(promotion.getClubId()).orElse(null);
        User createdBy = userRepository.findById(promotion.getCreatedBy()).orElse(null);
        return PromotionAdminListQuery.of(
                promotion,
                resolveClubRef(promotion.getClubId(), club),
                resolveUserRef(promotion.getCreatedBy(), createdBy));
    }

    @Override
    public Page<PromotionAdminListQuery> listForAdmin(
            PromotionAdminSearchCondition condition, Pageable pageable
    ) {
        Page<Promotion> promotionPage = promotionRepository.searchForAdmin(condition, pageable);

        Set<Long> clubIds = new HashSet<>();
        Set<Long> userIds = new HashSet<>();
        for (Promotion promotion : promotionPage.getContent()) {
            if (promotion.getClubId() != null) clubIds.add(promotion.getClubId());
            userIds.add(promotion.getCreatedBy());
        }
        Map<Long, Club> clubMap = clubRepository.findAllById(clubIds).stream()
                .collect(Collectors.toMap(Club::getId, Function.identity()));
        Map<Long, User> userMap = userRepository.findAllById(userIds).stream()
                .collect(Collectors.toMap(User::getId, Function.identity()));

        return promotionPage.map(promotion -> PromotionAdminListQuery.of(
                promotion,
                resolveClubRef(promotion.getClubId(), clubMap.get(promotion.getClubId())),
                resolveUserRef(promotion.getCreatedBy(), userMap.get(promotion.getCreatedBy()))));
    }

    private PromotionAdminListQuery.ClubRef resolveClubRef(Long clubId, Club club) {
        if (clubId == null) return null;
        if (club == null) return new PromotionAdminListQuery.ClubRef(clubId, AdminLabels.DELETED);
        return new PromotionAdminListQuery.ClubRef(club.getId(), club.getName());
    }

    private PromotionAdminListQuery.UserRef resolveUserRef(Long userId, User user) {
        if (user == null) return new PromotionAdminListQuery.UserRef(userId, AdminLabels.DELETED);
        return new PromotionAdminListQuery.UserRef(user.getId(), user.getName());
    }
}
