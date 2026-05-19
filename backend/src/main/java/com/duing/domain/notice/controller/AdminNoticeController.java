package com.duing.domain.notice.controller;

import com.duing.domain.notice.api.AdminNoticeApi;
import com.duing.domain.notice.controller.dto.request.CreateNoticeRequest;
import com.duing.domain.notice.controller.dto.request.UpdateNoticeRequest;
import com.duing.domain.notice.controller.dto.response.AdminNoticeSummaryResponse;
import com.duing.domain.notice.controller.dto.response.NoticeDetailResponse;
import com.duing.domain.notice.entity.Notice;
import com.duing.domain.notice.entity.NoticeCategory;
import com.duing.domain.notice.entity.NoticeTargetClub;
import com.duing.domain.notice.entity.NoticeVisibility;
import com.duing.domain.notice.repository.NoticeTargetClubRepository;
import com.duing.domain.notice.service.NoticeService;
import com.duing.domain.notice.service.dto.query.NoticeAdminSearchCondition;
import com.duing.domain.notice.service.dto.query.ViewerScope;
import com.duing.domain.user.entity.UserRole;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import java.util.List;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class AdminNoticeController implements AdminNoticeApi {

    private final NoticeService noticeService;
    private final NoticeTargetClubRepository targetClubRepository;

    @Override
    public ResponseEntity<ApiResponse<Long>> createNotice(
            CreateNoticeRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        Long noticeId = noticeService.create(request.toCommand(currentUser.id()));
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(noticeId));
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> updateNotice(@PathVariable Long noticeId, @RequestBody UpdateNoticeRequest request) {
        noticeService.update(request.toCommand(noticeId));
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> deleteNotice(@PathVariable Long noticeId) {
        noticeService.delete(noticeId);
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<PageResponse<AdminNoticeSummaryResponse>>> getAdminNotices(
            @RequestParam(required = false) NoticeCategory category,
            @RequestParam(required = false) NoticeVisibility visibility,
            @RequestParam(required = false) String keyword,
            @RequestParam(defaultValue = "false") boolean includeExpired,
            Pageable pageable
    ) {
        NoticeAdminSearchCondition condition = new NoticeAdminSearchCondition(category, visibility, keyword, includeExpired);
        Page<AdminNoticeSummaryResponse> page = noticeService.searchForAdmin(condition, pageable)
                .map(AdminNoticeSummaryResponse::from);
        return ResponseEntity.ok(ApiResponse.success(PageResponse.from(page)));
    }

    @Override
    public ResponseEntity<ApiResponse<NoticeDetailResponse>> getAdminNoticeDetail(@PathVariable Long noticeId) {
        ViewerScope adminScope = new ViewerScope(UserRole.ADMIN, null, Set.of(), Set.of());
        Notice notice = noticeService.getVisible(noticeId, adminScope);
        List<Long> targetClubIds = targetClubRepository.findAllByIdNoticeId(notice.getId())
                .stream().map(NoticeTargetClub::getClubId).toList();
        return ResponseEntity.ok(ApiResponse.success(NoticeDetailResponse.from(notice, targetClubIds, true)));
    }
}
