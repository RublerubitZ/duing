package com.duing.domain.promotion.service;

import com.duing.domain.club.exception.ClubException;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.domain.promotion.entity.PromotionRequest;
import com.duing.domain.promotion.entity.PromotionRequestStatus;
import com.duing.domain.promotion.exception.PromotionException;
import com.duing.domain.promotion.repository.PromotionRequestRepository;
import com.duing.domain.promotion.service.dto.command.CreatePromotionRequestCommand;
import com.duing.domain.promotion.service.dto.command.ProcessPromotionRequestCommand;
import com.duing.domain.promotion.service.dto.query.PromotionRequestAdminSearchCondition;
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
    public Page<PromotionRequest> searchForAdmin(
            PromotionRequestAdminSearchCondition condition, Pageable pageable
    ) {
        return requestRepository.searchForAdmin(condition, pageable);
    }
}
