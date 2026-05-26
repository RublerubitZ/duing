package com.duing.domain.promotion.service;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.exception.ClubException;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.domain.promotion.entity.PromotionRequest;
import com.duing.domain.promotion.entity.PromotionRequestStatus;
import com.duing.domain.promotion.exception.PromotionException;
import com.duing.domain.promotion.repository.PromotionRequestRepository;
import com.duing.domain.promotion.service.dto.command.CreatePromotionRequestCommand;
import com.duing.domain.promotion.service.dto.command.ProcessPromotionRequestCommand;
import com.duing.domain.promotion.service.dto.query.PromotionRequestAdminDetailQuery;
import com.duing.domain.promotion.service.dto.query.PromotionRequestAdminSearchCondition;
import com.duing.domain.promotion.service.dto.query.PromotionRequestAdminSummaryQuery;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.constant.AdminLabels;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralPromotionRequestService implements PromotionRequestService {

    private final PromotionRequestRepository requestRepository;
    private final ClubRepository clubRepository;
    private final UserRepository userRepository;
    private final ClubAuthService clubAuthService;

    @Override
    @Transactional
    public Long create(CreatePromotionRequestCommand command) {
        if (clubRepository.findById(command.clubId()).isEmpty()) {
            throw new ClubException.ClubNotFoundException();
        }
        clubAuthService.requireManager(command.requesterUserId(), command.clubId());

        requestRepository.findByClubIdAndStatus(command.clubId(), PromotionRequestStatus.PENDING)
                .ifPresent(existing -> {
                    throw new PromotionException.DuplicatePendingPromotionRequestException();
                });

        try {
            return requestRepository.save(PromotionRequest.create(
                    command.clubId(), command.requesterUserId(),
                    command.title(), command.description(),
                    command.suggestedBannerImageUrl(), command.suggestedLinkUrl()
            )).getId();
        } catch (DataIntegrityViolationException race) {
            throw new PromotionException.DuplicatePendingPromotionRequestException();
        }
    }

    @Override
    @Transactional
    public void process(ProcessPromotionRequestCommand command) {
        PromotionRequest request = requestRepository.findByIdForUpdate(command.requestId())
                .orElseThrow(PromotionException.PromotionRequestNotFoundException::new);
        request.process(command.handlerAdminId(), command.status(), command.actionNote());
    }

    @Override
    public PromotionRequest getById(Long requestId) {
        return requestRepository.findById(requestId)
                .orElseThrow(PromotionException.PromotionRequestNotFoundException::new);
    }

    @Override
    public Page<PromotionRequestAdminSummaryQuery> listForAdmin(
            PromotionRequestAdminSearchCondition condition, Pageable pageable
    ) {
        Page<PromotionRequest> requestPage = requestRepository.searchForAdmin(condition, pageable);

        Set<Long> clubIds = new HashSet<>();
        Set<Long> userIds = new HashSet<>();
        for (PromotionRequest request : requestPage.getContent()) {
            clubIds.add(request.getClubId());
            userIds.add(request.getRequesterUserId());
        }
        Map<Long, Club> clubMap = clubRepository.findAllById(clubIds).stream()
                .collect(Collectors.toMap(Club::getId, Function.identity()));
        Map<Long, User> userMap = userRepository.findAllById(userIds).stream()
                .collect(Collectors.toMap(User::getId, Function.identity()));

        return requestPage.map(request -> PromotionRequestAdminSummaryQuery.of(
                request,
                resolveSummaryClubRef(request.getClubId(), clubMap.get(request.getClubId())),
                resolveSummaryUserRef(request.getRequesterUserId(), userMap.get(request.getRequesterUserId()))));
    }

    @Override
    public PromotionRequestAdminDetailQuery getDetailForAdmin(Long requestId) {
        PromotionRequest request = requestRepository.findById(requestId)
                .orElseThrow(PromotionException.PromotionRequestNotFoundException::new);

        Set<Long> userIds = new HashSet<>();
        userIds.add(request.getRequesterUserId());
        if (request.getHandledBy() != null) userIds.add(request.getHandledBy());
        Map<Long, User> userMap = userRepository.findAllById(userIds).stream()
                .collect(Collectors.toMap(User::getId, Function.identity()));

        Club club = clubRepository.findById(request.getClubId()).orElse(null);
        PromotionRequestAdminDetailQuery.ClubRef clubRef = club == null
                ? new PromotionRequestAdminDetailQuery.ClubRef(request.getClubId(), AdminLabels.DELETED)
                : new PromotionRequestAdminDetailQuery.ClubRef(club.getId(), club.getName());

        PromotionRequestAdminDetailQuery.UserRef requesterRef = resolveDetailUserRef(
                request.getRequesterUserId(), userMap.get(request.getRequesterUserId()));
        PromotionRequestAdminDetailQuery.UserRef handlerRef = request.getHandledBy() == null
                ? null
                : resolveDetailUserRef(request.getHandledBy(), userMap.get(request.getHandledBy()));

        return PromotionRequestAdminDetailQuery.of(request, clubRef, requesterRef, handlerRef);
    }

    private PromotionRequestAdminSummaryQuery.ClubRef resolveSummaryClubRef(Long clubId, Club club) {
        if (club == null) return new PromotionRequestAdminSummaryQuery.ClubRef(clubId, AdminLabels.DELETED);
        return new PromotionRequestAdminSummaryQuery.ClubRef(club.getId(), club.getName());
    }

    private PromotionRequestAdminSummaryQuery.UserRef resolveSummaryUserRef(Long userId, User user) {
        if (user == null) return new PromotionRequestAdminSummaryQuery.UserRef(userId, AdminLabels.DELETED);
        return new PromotionRequestAdminSummaryQuery.UserRef(user.getId(), user.getName());
    }

    private PromotionRequestAdminDetailQuery.UserRef resolveDetailUserRef(Long userId, User user) {
        if (user == null) return new PromotionRequestAdminDetailQuery.UserRef(userId, AdminLabels.DELETED);
        return new PromotionRequestAdminDetailQuery.UserRef(user.getId(), user.getName());
    }
}
