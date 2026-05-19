package com.duing.domain.notification.controller;

import com.duing.domain.notification.api.NotificationApi;
import com.duing.domain.notification.controller.dto.response.NotificationResponse;
import com.duing.domain.notification.controller.dto.response.UnreadCountResponse;
import com.duing.domain.notification.service.NotificationService;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/me/notifications")
@RequiredArgsConstructor
public class NotificationController implements NotificationApi {

    private final NotificationService notificationService;

    @Override
    public ResponseEntity<ApiResponse<PageResponse<NotificationResponse>>> list(
            @RequestParam(defaultValue = "false") boolean unreadOnly,
            Pageable pageable,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        Page<NotificationResponse> responsePage = notificationService.listMine(currentUser.id(), unreadOnly, pageable);
        return ResponseEntity.ok(ApiResponse.success(PageResponse.from(responsePage)));
    }

    @Override
    public ResponseEntity<ApiResponse<UnreadCountResponse>> unreadCount(
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        long count = notificationService.unreadCount(currentUser.id());
        return ResponseEntity.ok(ApiResponse.success(new UnreadCountResponse(count)));
    }

    @Override
    public ResponseEntity<Void> read(
            @PathVariable Long id,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        notificationService.markRead(currentUser.id(), id);
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<Void> readAll(
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        notificationService.markAllRead(currentUser.id());
        return ResponseEntity.noContent().build();
    }
}