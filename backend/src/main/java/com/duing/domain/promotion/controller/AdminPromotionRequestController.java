package com.duing.domain.promotion.controller;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.promotion.api.AdminPromotionRequestApi;
import com.duing.domain.promotion.controller.dto.request.ProcessPromotionRequestRequest;
import com.duing.domain.promotion.controller.dto.response.PromotionRequestDetailResponse;
import com.duing.domain.promotion.controller.dto.response.PromotionRequestSummaryResponse;
import com.duing.domain.promotion.entity.PromotionRequest;
import com.duing.domain.promotion.entity.PromotionRequestStatus;
import com.duing.domain.promotion.service.PromotionRequestService;
import com.duing.domain.promotion.service.dto.query.PromotionRequestAdminSearchCondition;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class AdminPromotionRequestController implements AdminPromotionRequestApi {

    private static final String DELETED_LABEL = "(삭제됨)";

    private final PromotionRequestService requestService;
    private final ClubRepository clubRepository;
    private final UserRepository userRepository;

    @Override
    public ResponseEntity<ApiResponse<PageResponse<PromotionRequestSummaryResponse>>> listRequests(
            PromotionRequestStatus status, Long clubId, Pageable pageable
    ) {
        Page<PromotionRequest> page = requestService.searchForAdmin(
                new PromotionRequestAdminSearchCondition(status, clubId), pageable);

        Set<Long> clubIds = new HashSet<>();
        Set<Long> userIds = new HashSet<>();
        for (PromotionRequest request : page.getContent()) {
            clubIds.add(request.getClubId());
            userIds.add(request.getRequesterUserId());
        }
        Map<Long, Club> clubMap = clubRepository.findAllById(clubIds).stream()
                .collect(Collectors.toMap(Club::getId, Function.identity()));
        Map<Long, User> userMap = userRepository.findAllById(userIds).stream()
                .collect(Collectors.toMap(User::getId, Function.identity()));

        Page<PromotionRequestSummaryResponse> mapped = page.map(request ->
                PromotionRequestSummaryResponse.of(
                        request,
                        summaryClubRef(request.getClubId(), clubMap.get(request.getClubId())),
                        summaryUserRef(request.getRequesterUserId(), userMap.get(request.getRequesterUserId()))));
        return ResponseEntity.ok(ApiResponse.success(PageResponse.from(mapped)));
    }

    @Override
    public ResponseEntity<ApiResponse<PromotionRequestDetailResponse>> getRequest(Long requestId) {
        PromotionRequest request = requestService.getById(requestId);

        Set<Long> userIds = new HashSet<>();
        userIds.add(request.getRequesterUserId());
        if (request.getHandledBy() != null) userIds.add(request.getHandledBy());
        Map<Long, User> userMap = userRepository.findAllById(userIds).stream()
                .collect(Collectors.toMap(User::getId, Function.identity()));

        Club club = clubRepository.findById(request.getClubId()).orElse(null);
        PromotionRequestDetailResponse.ClubRef clubRef = club == null
                ? new PromotionRequestDetailResponse.ClubRef(request.getClubId(), DELETED_LABEL)
                : new PromotionRequestDetailResponse.ClubRef(club.getId(), club.getName());

        PromotionRequestDetailResponse.UserRef requesterRef = detailUserRef(
                request.getRequesterUserId(), userMap.get(request.getRequesterUserId()));
        PromotionRequestDetailResponse.UserRef handlerRef = request.getHandledBy() == null
                ? null
                : detailUserRef(request.getHandledBy(), userMap.get(request.getHandledBy()));

        return ResponseEntity.ok(ApiResponse.success(PromotionRequestDetailResponse.of(
                request, clubRef, requesterRef, handlerRef)));
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> processRequest(
            Long requestId, ProcessPromotionRequestRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        requestService.process(request.toCommand(requestId, currentUser.id()));
        return ResponseEntity.noContent().build();
    }

    private PromotionRequestSummaryResponse.ClubRef summaryClubRef(Long clubId, Club club) {
        if (club == null) return new PromotionRequestSummaryResponse.ClubRef(clubId, DELETED_LABEL);
        return new PromotionRequestSummaryResponse.ClubRef(club.getId(), club.getName());
    }

    private PromotionRequestSummaryResponse.UserRef summaryUserRef(Long userId, User user) {
        if (user == null) return new PromotionRequestSummaryResponse.UserRef(userId, DELETED_LABEL);
        return new PromotionRequestSummaryResponse.UserRef(user.getId(), user.getName());
    }

    private PromotionRequestDetailResponse.UserRef detailUserRef(Long userId, User user) {
        if (user == null) return new PromotionRequestDetailResponse.UserRef(userId, DELETED_LABEL);
        return new PromotionRequestDetailResponse.UserRef(user.getId(), user.getName());
    }
}
