package com.duing.domain.notice.api;

import com.duing.domain.notice.controller.dto.request.CreateNoticeRequest;
import com.duing.domain.notice.controller.dto.request.UpdateNoticeRequest;
import com.duing.domain.notice.controller.dto.response.AdminNoticeSummaryResponse;
import com.duing.domain.notice.controller.dto.response.NoticeDetailResponse;
import com.duing.domain.notice.entity.NoticeCategory;
import com.duing.domain.notice.entity.NoticeVisibility;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;

@Tag(name = "공지(총동연)", description = "총동연 전용 공지 관리 API")
@SecurityRequirement(name = "BearerAuth")
public interface AdminNoticeApi {

    @Operation(summary = "공지 생성", description = "ADMIN 이 공지를 작성한다. visibility/clubScope 검증 수행. (알림 fan-out 은 P2 에서 연결)")
    @PostMapping("/admin/notices")
    ResponseEntity<ApiResponse<Long>> createNotice(
            @Valid @RequestBody CreateNoticeRequest request,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "공지 수정")
    @PatchMapping("/admin/notices/{noticeId}")
    ResponseEntity<ApiResponse<Void>> updateNotice(
            @PathVariable Long noticeId,
            @Valid @RequestBody UpdateNoticeRequest request
    );

    @Operation(summary = "공지 소프트 삭제")
    @DeleteMapping("/admin/notices/{noticeId}")
    ResponseEntity<ApiResponse<Void>> deleteNotice(@PathVariable Long noticeId);

    @Operation(summary = "공지 관리 목록")
    @GetMapping("/admin/notices")
    ResponseEntity<ApiResponse<PageResponse<AdminNoticeSummaryResponse>>> getAdminNotices(
            @RequestParam(required = false) NoticeCategory category,
            @RequestParam(required = false) NoticeVisibility visibility,
            @RequestParam(required = false) String keyword,
            @RequestParam(defaultValue = "false") boolean includeExpired,
            @Parameter(hidden = true) Pageable pageable
    );

    @Operation(summary = "공지 상세 (관리)")
    @GetMapping("/admin/notices/{noticeId}")
    ResponseEntity<ApiResponse<NoticeDetailResponse>> getAdminNoticeDetail(@PathVariable Long noticeId);
}
