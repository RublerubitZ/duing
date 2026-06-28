package com.duing.domain.notice.api;

import com.duing.domain.notice.controller.dto.response.NoticeCardResponse;
import com.duing.domain.notice.controller.dto.response.NoticeDetailResponse;
import com.duing.domain.notice.entity.NoticeCategory;
import com.duing.domain.notice.service.dto.query.NoticeSource;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;

@Tag(name = "공지", description = "공지 조회 API (공개 + 로그인 가시성)")
public interface NoticeApi {

    @Operation(summary = "공지 피드", description = "viewer 가시 범위 + (만료 제외) 필터링한 목록. "
            + "source=SCHOOL 은 학교(관리자) 공지, source=CLUB 은 가입 동아리 공지만 반환한다(미지정 시 전체).")
    @GetMapping("/notices")
    ResponseEntity<ApiResponse<PageResponse<NoticeCardResponse>>> getNotices(
            @RequestParam(required = false) NoticeCategory category,
            @RequestParam(required = false) List<String> tags,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) NoticeSource source,
            @Parameter(hidden = true) Pageable pageable,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "공지 상세")
    @GetMapping("/notices/{noticeId}")
    ResponseEntity<ApiResponse<NoticeDetailResponse>> getNoticeDetail(
            @PathVariable Long noticeId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
}
