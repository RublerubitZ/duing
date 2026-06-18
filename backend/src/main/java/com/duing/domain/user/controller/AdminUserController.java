package com.duing.domain.user.controller;

import com.duing.domain.user.api.AdminUserApi;
import com.duing.domain.user.controller.dto.response.AdminUserSearchResponse;
import com.duing.domain.user.service.UserService;
import com.duing.domain.user.service.dto.command.ForceLogoutCommand;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
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

    @Override
    public ResponseEntity<ApiResponse<Void>> forceLogout(
            @PathVariable Long userId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        userService.forceLogout(new ForceLogoutCommand(userId, currentUser.id()));
        return ResponseEntity.noContent().build();
    }
}
