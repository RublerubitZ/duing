package com.duing.domain.promotion.controller;

import com.duing.domain.notice.entity.Notice;
import com.duing.domain.notice.entity.NoticeVisibility;
import com.duing.domain.notice.repository.NoticeRepository;
import com.duing.domain.promotion.api.AdminPromotionApi;
import com.duing.domain.promotion.controller.dto.request.CreatePromotionRequest;
import com.duing.domain.promotion.controller.dto.request.UpdatePromotionRequest;
import com.duing.domain.promotion.controller.dto.response.AdminPromotionResponse;
import com.duing.domain.promotion.service.PromotionService;
import com.duing.domain.promotion.service.dto.query.PromotionAdminListQuery;
import com.duing.domain.promotion.service.dto.query.PromotionAdminSearchCondition;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.constant.AdminLabels;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import jakarta.validation.Valid;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
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

    private final PromotionService promotionService;
    private final NoticeRepository noticeRepository;

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
        var queryPage = promotionService.listForAdmin(
                new PromotionAdminSearchCondition(active, clubId), pageable);

        Set<Long> noticeIds = new HashSet<>();
        for (PromotionAdminListQuery query : queryPage.getContent()) {
            if (query.noticeId() != null) noticeIds.add(query.noticeId());
        }
        Map<Long, Notice> noticeMap = noticeRepository.findAllById(noticeIds).stream()
                .collect(Collectors.toMap(Notice::getId, Function.identity()));

        return ResponseEntity.ok(ApiResponse.success(PageResponse.from(
                queryPage.map(query -> AdminPromotionResponse.from(
                        query, resolveAdminNoticeRef(query.noticeId(), noticeMap))))));
    }

    @Override
    public ResponseEntity<ApiResponse<AdminPromotionResponse>> getPromotion(Long promotionId) {
        PromotionAdminListQuery query = promotionService.getAdminItemById(promotionId);
        AdminPromotionResponse.NoticeRef noticeRef = null;
        if (query.noticeId() != null) {
            noticeRef = noticeRepository.findById(query.noticeId())
                    .map(notice -> {
                        boolean accessible = notice.getVisibility() == NoticeVisibility.PUBLIC;
                        return new AdminPromotionResponse.NoticeRef(
                                notice.getId(), notice.getTitle(), notice.getVisibility(), accessible);
                    })
                    .orElseGet(() -> new AdminPromotionResponse.NoticeRef(
                            query.noticeId(), AdminLabels.DELETED, null, false));
        }
        return ResponseEntity.ok(ApiResponse.success(AdminPromotionResponse.from(query, noticeRef)));
    }

    private AdminPromotionResponse.NoticeRef resolveAdminNoticeRef(
            Long noticeId, Map<Long, Notice> noticeMap
    ) {
        if (noticeId == null) return null;
        Notice notice = noticeMap.get(noticeId);
        if (notice == null) {
            return new AdminPromotionResponse.NoticeRef(noticeId, AdminLabels.DELETED, null, false);
        }
        boolean accessible = notice.getVisibility() == NoticeVisibility.PUBLIC;
        return new AdminPromotionResponse.NoticeRef(
                notice.getId(), notice.getTitle(), notice.getVisibility(), accessible);
    }
}
