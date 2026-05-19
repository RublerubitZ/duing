package com.duing.domain.user.api;

import com.duing.domain.user.controller.dto.response.AdminUserSearchResponse;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;

@Tag(name = "사용자(총동연)", description = "총동연 전용 사용자 검색 API")
@SecurityRequirement(name = "BearerAuth")
public interface AdminUserApi {

    @Operation(summary = "사용자 검색 (ADMIN)",
            description = "동아리 등록 시 leader 후보를 학번/이름/이메일로 검색한다. studentId 는 prefix 일치, name·email 은 contains(case-insensitive) 일치.")
    @GetMapping("/admin/users")
    ResponseEntity<ApiResponse<PageResponse<AdminUserSearchResponse>>> searchUsers(
            @Parameter(description = "검색어 (학번 prefix 또는 이름/이메일 부분 일치)", required = true)
            @RequestParam String q,
            @Parameter(hidden = true) Pageable pageable
    );
}
