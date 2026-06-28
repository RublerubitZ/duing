package com.duing.domain.notice.controller;

import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.notice.api.NoticeApi;
import com.duing.domain.notice.controller.dto.response.NoticeCardResponse;
import com.duing.domain.notice.controller.dto.response.NoticeDetailResponse;
import com.duing.domain.notice.entity.Notice;
import com.duing.domain.notice.entity.NoticeCategory;
import com.duing.domain.notice.entity.NoticeTargetClub;
import com.duing.domain.notice.repository.NoticeTargetClubRepository;
import com.duing.domain.notice.service.NoticeService;
import com.duing.domain.notice.service.dto.query.NoticeSearchCondition;
import com.duing.domain.notice.service.dto.query.NoticeSource;
import com.duing.domain.notice.service.dto.query.ViewerScope;
import com.duing.domain.user.entity.UserRole;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
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
    private final NoticeTargetClubRepository targetClubRepository;
    private final ClubMemberRepository clubMemberRepository;

    @Override
    public ResponseEntity<ApiResponse<PageResponse<NoticeCardResponse>>> getNotices(
            @RequestParam(required = false) NoticeCategory category,
            @RequestParam(required = false) List<String> tags,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) NoticeSource source,
            Pageable pageable,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        ViewerScope viewer = buildViewerScope(currentUser);
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
        ViewerScope viewer = buildViewerScope(currentUser);
        Notice notice = noticeService.getVisible(noticeId, viewer);
        List<Long> targetClubIds = targetClubRepository.findAllByIdNoticeId(notice.getId())
                .stream().map(NoticeTargetClub::getClubId).toList();
        boolean exposeAdmin = viewer.isAdmin();
        String clubName = notice.getOwningClubId() == null ? null
                : noticeService.findClubNamesByIds(List.of(notice.getOwningClubId()))
                        .get(notice.getOwningClubId());
        return ResponseEntity.ok(ApiResponse.success(
                NoticeDetailResponse.from(notice, targetClubIds, exposeAdmin, clubName)));
    }

    private ViewerScope buildViewerScope(UserPrincipal currentUser) {
        if (currentUser == null) return ViewerScope.anonymous();
        UserRole role = UserRole.valueOf(currentUser.role());
        Long userId = currentUser.id();
        if (role == UserRole.ADMIN) {
            return new ViewerScope(UserRole.ADMIN, userId, Set.of(), Set.of());
        }
        Set<Long> memberClubIds = new HashSet<>(clubMemberRepository.findClubIdsByUserId(userId));
        Set<Long> officerClubIds = new HashSet<>(clubMemberRepository.findOfficerClubIdsByUserId(userId));
        return new ViewerScope(role, userId, memberClubIds, officerClubIds);
    }
}
