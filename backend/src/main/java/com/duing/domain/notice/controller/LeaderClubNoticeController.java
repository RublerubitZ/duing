package com.duing.domain.notice.controller;

import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.domain.notice.api.LeaderClubNoticeApi;
import com.duing.domain.notice.controller.dto.request.CreateClubNoticeRequest;
import com.duing.domain.notice.controller.dto.request.UpdateClubNoticeRequest;
import com.duing.domain.notice.controller.dto.response.ClubNoticeDetailResponse;
import com.duing.domain.notice.controller.dto.response.NoticeCardResponse;
import com.duing.domain.notice.entity.Notice;
import com.duing.domain.notice.service.NoticeService;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class LeaderClubNoticeController implements LeaderClubNoticeApi {

    private final NoticeService noticeService;
    private final ClubAuthService clubAuthService;

    @Override
    public ResponseEntity<ApiResponse<PageResponse<NoticeCardResponse>>> listForMember(
            Long clubId, int page, int size,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        clubAuthService.requireMember(currentUser.id(), clubId);
        var result = noticeService.findClubScopedForMember(clubId, PageRequest.of(page, size))
                .map(NoticeCardResponse::from);
        return ResponseEntity.ok(ApiResponse.success(PageResponse.from(result)));
    }

    @Override
    public ResponseEntity<ApiResponse<ClubNoticeDetailResponse>> getDetail(
            Long clubId, Long noticeId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        clubAuthService.requireMember(currentUser.id(), clubId);
        Notice notice = noticeService.getClubScopedForMember(clubId, noticeId);
        return ResponseEntity.ok(ApiResponse.success(ClubNoticeDetailResponse.from(notice)));
    }

    @Override
    public ResponseEntity<ApiResponse<Long>> create(
            Long clubId, CreateClubNoticeRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        clubAuthService.requireManager(currentUser.id(), clubId);
        Long noticeId = noticeService.createForClub(request.toCommand(clubId, currentUser.id()));
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(noticeId));
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> update(
            Long clubId, Long noticeId, UpdateClubNoticeRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        clubAuthService.requireManager(currentUser.id(), clubId);
        noticeService.updateForClub(request.toCommand(clubId, noticeId));
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> delete(
            Long clubId, Long noticeId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        clubAuthService.requireManager(currentUser.id(), clubId);
        noticeService.deleteForClub(clubId, noticeId);
        return ResponseEntity.noContent().build();
    }
}
