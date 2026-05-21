package com.duing.domain.promotion.controller;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.promotion.api.AdminPromotionApi;
import com.duing.domain.promotion.controller.dto.request.CreatePromotionRequest;
import com.duing.domain.promotion.controller.dto.request.UpdatePromotionRequest;
import com.duing.domain.promotion.controller.dto.response.AdminPromotionResponse;
import com.duing.domain.promotion.entity.Promotion;
import com.duing.domain.promotion.service.PromotionService;
import com.duing.domain.promotion.service.dto.query.PromotionAdminSearchCondition;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import jakarta.validation.Valid;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class AdminPromotionController implements AdminPromotionApi {

    private static final String DELETED_LABEL = "(삭제됨)";

    private final PromotionService promotionService;
    private final ClubRepository clubRepository;
    private final UserRepository userRepository;

    @Override
    public ResponseEntity<ApiResponse<Long>> createPromotion(
            @Valid @RequestBody CreatePromotionRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        Long id = promotionService.create(request.toCommand(currentUser.id()));
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(id));
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> updatePromotion(
            Long promotionId, @Valid @RequestBody UpdatePromotionRequest request
    ) {
        promotionService.update(request.toCommand(promotionId));
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> deletePromotion(Long promotionId) {
        promotionService.delete(promotionId);
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<PageResponse<AdminPromotionResponse>>> listPromotions(
            Boolean active, Long clubId, Pageable pageable
    ) {
        Page<Promotion> page = promotionService.searchForAdmin(
                new PromotionAdminSearchCondition(active, clubId), pageable);

        Set<Long> clubIds = new HashSet<>();
        Set<Long> userIds = new HashSet<>();
        for (Promotion promotion : page.getContent()) {
            if (promotion.getClubId() != null) clubIds.add(promotion.getClubId());
            userIds.add(promotion.getCreatedBy());
        }
        Map<Long, Club> clubMap = clubRepository.findAllById(clubIds).stream()
                .collect(Collectors.toMap(Club::getId, Function.identity()));
        Map<Long, User> userMap = userRepository.findAllById(userIds).stream()
                .collect(Collectors.toMap(User::getId, Function.identity()));

        Page<AdminPromotionResponse> mapped = page.map(promotion -> AdminPromotionResponse.of(
                promotion,
                clubRef(promotion.getClubId(),
                        promotion.getClubId() == null ? null : clubMap.get(promotion.getClubId())),
                userRef(promotion.getCreatedBy(), userMap.get(promotion.getCreatedBy()))));
        return ResponseEntity.ok(ApiResponse.success(PageResponse.from(mapped)));
    }

    private AdminPromotionResponse.ClubRef clubRef(Long clubId, Club club) {
        if (clubId == null) return null;
        if (club == null) return new AdminPromotionResponse.ClubRef(clubId, DELETED_LABEL);
        return new AdminPromotionResponse.ClubRef(club.getId(), club.getName());
    }

    private AdminPromotionResponse.UserRef userRef(Long userId, User user) {
        if (user == null) return new AdminPromotionResponse.UserRef(userId, DELETED_LABEL);
        return new AdminPromotionResponse.UserRef(user.getId(), user.getName());
    }
}
