package com.duing.domain.notice.controller;

import com.duing.domain.notice.api.NoticeApi;
import com.duing.domain.notice.controller.dto.response.NoticeCardResponse;
import com.duing.domain.notice.controller.dto.response.NoticeDetailResponse;
import com.duing.domain.notice.entity.Notice;
import com.duing.domain.notice.entity.NoticeCategory;
import com.duing.domain.notice.service.NoticeService;
import com.duing.domain.notice.service.dto.query.NoticeSearchCondition;
import com.duing.domain.notice.service.dto.query.NoticeSource;
import com.duing.domain.notice.service.dto.query.ViewerScope;
import com.duing.domain.user.entity.UserRole;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import java.util.List;
import java.util.Map;
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
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class NoticeController implements NoticeApi {

    private final NoticeService noticeService;

    @Override
    public ResponseEntity<ApiResponse<PageResponse<NoticeCardResponse>>> getNotices(
            @RequestParam(required = false) NoticeCategory category,
            @RequestParam(required = false) List<String> tags,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) NoticeSource source,
            Pageable pageable,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        ViewerScope viewer = viewerScopeOf(currentUser);
        NoticeSearchCondition condition = new NoticeSearchCondition(category, tags, keyword, source);
        Page<Notice> noticePage = noticeService.searchFeed(condition, viewer, pageable);
        // 동아리 공지 카드에 동아리명을 붙이기 위해 페이지 내 owningClubId 들을 한 번에 조회한다(N+1 방지).
        Map<Long, String> clubNames = noticeService.findClubNamesByIds(
                noticePage.getContent().stream().map(Notice::getOwningClubId).toList());
        Page<NoticeCardResponse> page = noticePage.map(notice -> NoticeCardResponse.from(
                notice,
                // 학교 공지는 owningClubId 가 null — 불변 Map.of() 는 get(null) 에 NPE 를 던지므로 null 을 먼저 거른다.
                notice.getOwningClubId() == null ? null : clubNames.get(notice.getOwningClubId())));
        return ResponseEntity.ok(ApiResponse.success(PageResponse.from(page)));
    }

    @Override
    public ResponseEntity<ApiResponse<NoticeDetailResponse>> getNoticeDetail(
            @PathVariable Long noticeId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        ViewerScope viewer = viewerScopeOf(currentUser);
        Notice notice = noticeService.getVisible(noticeId, viewer);
        List<Long> targetClubIds = noticeService.findTargetClubIds(notice.getId());
        boolean exposeAdmin = viewer.isAdmin();
        String clubName = notice.getOwningClubId() == null ? null
                : noticeService.findClubNamesByIds(List.of(notice.getOwningClubId()))
                        .get(notice.getOwningClubId());
        return ResponseEntity.ok(ApiResponse.success(
                NoticeDetailResponse.from(notice, targetClubIds, exposeAdmin, clubName)));
    }

    /** 인증 주체를 서비스에 넘겨 스코프를 받는다 — 비로그인은 role=null. */
    private ViewerScope viewerScopeOf(UserPrincipal currentUser) {
        return currentUser == null
                ? noticeService.resolveViewerScope(null, null)
                : noticeService.resolveViewerScope(currentUser.id(), UserRole.valueOf(currentUser.role()));
    }
}
