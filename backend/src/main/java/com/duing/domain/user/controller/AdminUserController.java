package com.duing.domain.user.controller;

import com.duing.domain.user.api.AdminUserApi;
import com.duing.domain.user.controller.dto.response.AdminUserSearchResponse;
import com.duing.domain.user.service.UserService;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class AdminUserController implements AdminUserApi {

    private final UserService userService;

    @Override
    public ResponseEntity<ApiResponse<PageResponse<AdminUserSearchResponse>>> searchUsers(
            @RequestParam String q,
            Pageable pageable
    ) {
        Page<AdminUserSearchResponse> page = userService.searchForAdmin(q, pageable)
                .map(AdminUserSearchResponse::from);
        return ResponseEntity.ok(ApiResponse.success(PageResponse.from(page)));
    }
}
