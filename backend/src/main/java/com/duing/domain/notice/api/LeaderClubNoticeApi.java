package com.duing.domain.notice.api;

import com.duing.domain.notice.controller.dto.request.CreateClubNoticeRequest;
import com.duing.domain.notice.controller.dto.request.UpdateClubNoticeRequest;
import com.duing.domain.notice.controller.dto.response.ClubNoticeDetailResponse;
import com.duing.domain.notice.controller.dto.response.NoticeCardResponse;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;

@Tag(name = "동아리 공지 (회원 페이지)", description = "회원 조회 + LEADER/OFFICER CRUD")
@SecurityRequirement(name = "BearerAuth")
public interface LeaderClubNoticeApi {

    @Operation(summary = "동아리 공지 목록 (회원)")
    @GetMapping("/clubs/{clubId}/notices")
    ResponseEntity<ApiResponse<PageResponse<NoticeCardResponse>>> listForMember(
            @PathVariable Long clubId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "동아리 공지 상세 (MEMBER+)")
    @GetMapping("/clubs/{clubId}/notices/{noticeId}")
    ResponseEntity<ApiResponse<ClubNoticeDetailResponse>> getDetail(
            @PathVariable Long clubId,
            @PathVariable Long noticeId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "동아리 공지 생성 (LEADER/OFFICER)")
    @PostMapping("/clubs/{clubId}/notices")
    ResponseEntity<ApiResponse<Long>> create(
            @PathVariable Long clubId,
            @Valid @RequestBody CreateClubNoticeRequest request,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "동아리 공지 수정 (LEADER/OFFICER)")
    @PatchMapping("/clubs/{clubId}/notices/{noticeId}")
    ResponseEntity<ApiResponse<Void>> update(
            @PathVariable Long clubId,
            @PathVariable Long noticeId,
            @Valid @RequestBody UpdateClubNoticeRequest request,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "동아리 공지 삭제 (LEADER/OFFICER)")
    @DeleteMapping("/clubs/{clubId}/notices/{noticeId}")
    ResponseEntity<ApiResponse<Void>> delete(
            @PathVariable Long clubId,
            @PathVariable Long noticeId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
}
