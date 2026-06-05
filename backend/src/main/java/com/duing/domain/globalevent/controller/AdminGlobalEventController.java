package com.duing.domain.globalevent.controller;

import com.duing.domain.globalevent.api.AdminGlobalEventApi;
import com.duing.domain.globalevent.controller.dto.request.CreateGlobalEventRequest;
import com.duing.domain.globalevent.controller.dto.request.UpdateGlobalEventRequest;
import com.duing.domain.globalevent.controller.dto.response.AdminGlobalEventDetailResponse;
import com.duing.domain.globalevent.controller.dto.response.AdminGlobalEventSummaryResponse;
import com.duing.domain.globalevent.controller.dto.response.GlobalEventCategoryStatsResponse;
import com.duing.domain.globalevent.entity.GlobalEvent;
import com.duing.domain.globalevent.entity.GlobalEventCategory;
import com.duing.domain.globalevent.service.GlobalEventService;
import com.duing.domain.globalevent.service.dto.query.GlobalEventAdminSearchCondition;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class AdminGlobalEventController implements AdminGlobalEventApi {

    private final GlobalEventService eventService;
    private final UserRepository userRepository;

    @Override
    public ResponseEntity<ApiResponse<PageResponse<AdminGlobalEventSummaryResponse>>> list(
            GlobalEventCategory category, String keyword, Pageable pageable
    ) {
        Page<GlobalEvent> page = eventService.listAdmin(
                new GlobalEventAdminSearchCondition(category, keyword), pageable
        );
        Page<AdminGlobalEventSummaryResponse> mapped = page.map(AdminGlobalEventSummaryResponse::from);
        return ResponseEntity.ok(ApiResponse.success(PageResponse.from(mapped)));
    }

    @Override
    public ResponseEntity<ApiResponse<GlobalEventCategoryStatsResponse>> categoryStats() {
        return ResponseEntity.ok(
                ApiResponse.success(GlobalEventCategoryStatsResponse.from(eventService.categoryStats()))
        );
    }

    @Override
    public ResponseEntity<ApiResponse<AdminGlobalEventDetailResponse>> getDetail(Long eventId) {
        GlobalEvent event = eventService.getAdmin(eventId);
        User creator = userRepository.findById(event.getCreatedBy())
                .orElseThrow(() -> new IllegalStateException("global event creator missing: " + event.getCreatedBy()));
        return ResponseEntity.ok(
                ApiResponse.success(AdminGlobalEventDetailResponse.from(event, creator))
        );
    }

    @Override
    public ResponseEntity<ApiResponse<Long>> create(
            CreateGlobalEventRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        Long eventId = eventService.create(request.toCommand(currentUser.id()));
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(eventId));
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> update(Long eventId, UpdateGlobalEventRequest request) {
        eventService.update(request.toCommand(eventId));
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> delete(Long eventId) {
        eventService.delete(eventId);
        return ResponseEntity.noContent().build();
    }
}
