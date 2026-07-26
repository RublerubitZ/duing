package com.duing.domain.user.api;

import com.duing.domain.user.controller.dto.response.AdminUserSearchResponse;
import com.duing.domain.user.entity.UserStatus;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;

@Tag(name = "사용자(총동연)", description = "총동연 전용 사용자 검색 API")
@SecurityRequirement(name = "BearerAuth")
public interface AdminUserApi {

    @Operation(summary = "사용자 검색 (ADMIN)",
            description = "회원 관리 목록과 동아리장 후보 검색이 함께 쓴다. q 는 선택 — 생략하면 전체를 대상으로 하고, "
                    + "studentId 는 prefix 일치, name 은 contains(case-insensitive) 일치. "
                    + "status 를 생략하면 상태를 가리지 않는다(= 전체). 기본 정렬은 최근 가입순.")
    @GetMapping("/admin/users")
    ResponseEntity<ApiResponse<PageResponse<AdminUserSearchResponse>>> searchUsers(
            @Parameter(description = "검색어 (학번 prefix 또는 이름 부분 일치). 생략 가능")
            @RequestParam(required = false) String q,
            @Parameter(description = "계정 상태 필터. 생략하면 전체", example = "SUSPENDED")
            @RequestParam(required = false) UserStatus status,
            @Parameter(hidden = true) Pageable pageable
    );

    @Operation(summary = "사용자 강제 로그아웃 (ADMIN)",
            description = "대상 사용자의 token_version 을 올려 발급된 모든 액세스 토큰을 즉시 무효화하고, "
                    + "대상 사용자의 모든 세션·리프레시 토큰도 함께 폐기한다. "
                    + "토큰 탈취·기기 분실 대응용. 대상이 재로그인하기 전까지 모든 보호 API 에서 401 을 받는다.")
    @PostMapping("/admin/users/{userId}/force-logout")
    ResponseEntity<ApiResponse<Void>> forceLogout(
            @Parameter(description = "강제 로그아웃 대상 사용자 ID", required = true)
            @PathVariable Long userId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
}
