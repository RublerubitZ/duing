package com.duing.domain.notification.api;

import com.duing.domain.notification.controller.dto.response.NotificationResponse;
import com.duing.domain.notification.controller.dto.response.UnreadCountResponse;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;

@Tag(name = "알림", description = "인-앱 알림 API")
@SecurityRequirement(name = "BearerAuth")
public interface NotificationApi {

    @Operation(summary = "알림 목록 조회", description = "내 알림을 최신순으로 페이지 반환. unreadOnly=true 시 읽지 않은 알림만 반환.")
    @GetMapping
    ResponseEntity<ApiResponse<PageResponse<NotificationResponse>>> list(
            @RequestParam(defaultValue = "false") boolean unreadOnly,
            Pageable pageable,
            @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "읽지 않은 알림 수 조회")
    @GetMapping("/unread-count")
    ResponseEntity<ApiResponse<UnreadCountResponse>> unreadCount(
            @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "알림 읽음 처리 (멱등)", description = "해당 알림을 읽음으로 표시. 이미 읽었거나 본인 알림이 아닌 경우에도 204.")
    @PatchMapping("/{id}/read")
    ResponseEntity<Void> read(
            @PathVariable Long id,
            @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "전체 알림 읽음 처리 (멱등)", description = "내 모든 알림을 읽음으로 표시.")
    @PatchMapping("/read-all")
    ResponseEntity<Void> readAll(
            @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "Broadcast 알림 읽음 처리 (멱등)", description = "공지 broadcast 를 본인 기준으로 읽음 마킹.")
    @PatchMapping("/broadcasts/{broadcastId}/read")
    ResponseEntity<Void> readBroadcast(
            @PathVariable Long broadcastId,
            @AuthenticationPrincipal UserPrincipal currentUser
    );
}