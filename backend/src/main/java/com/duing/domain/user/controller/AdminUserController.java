package com.duing.domain.user.controller;

import com.duing.domain.user.api.AdminUserApi;
import com.duing.domain.user.controller.dto.request.ChangeUserStatusRequest;
import com.duing.domain.user.controller.dto.request.UpdateAdminNoteRequest;
import com.duing.domain.user.controller.dto.response.AdminUserDetailResponse;
import com.duing.domain.user.controller.dto.response.AdminUserPhoneResponse;
import com.duing.domain.user.controller.dto.response.AdminUserSearchResponse;
import com.duing.domain.user.entity.UserStatus;
import com.duing.domain.user.service.AdminUserCommandService;
import com.duing.domain.user.service.AdminUserQueryService;
import com.duing.domain.user.service.UserService;
import com.duing.domain.user.service.dto.command.ForceLogoutCommand;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.CacheControl;
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
public class AdminUserController implements AdminUserApi {

    private final UserService userService;
    private final AdminUserQueryService adminUserQueryService;
    private final AdminUserCommandService adminUserCommandService;

    @Override
    public ResponseEntity<ApiResponse<PageResponse<AdminUserSearchResponse>>> searchUsers(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) UserStatus status,
            Pageable pageable
    ) {
        Page<AdminUserSearchResponse> page = userService.searchForAdmin(q, status, pageable)
                .map(AdminUserSearchResponse::from);
        return ResponseEntity.ok(ApiResponse.success(PageResponse.from(page)));
    }

    @Override
    public ResponseEntity<ApiResponse<AdminUserDetailResponse>> getUserDetail(@PathVariable Long userId) {
        return ResponseEntity.ok(
                ApiResponse.success(AdminUserDetailResponse.from(adminUserQueryService.getDetail(userId))));
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> forceLogout(
            @PathVariable Long userId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        userService.forceLogout(new ForceLogoutCommand(userId, currentUser.id()));
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> changeUserStatus(
            @PathVariable Long userId,
            @RequestBody @Valid ChangeUserStatusRequest changeUserStatusRequest,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        adminUserCommandService.changeStatus(
                changeUserStatusRequest.toCommand(userId, currentUser.id()));
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> updateAdminNote(
            @PathVariable Long userId,
            @RequestBody @Valid UpdateAdminNoteRequest updateAdminNoteRequest,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        adminUserCommandService.updateAdminNote(
                updateAdminNoteRequest.toCommand(userId, currentUser.id()));
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<AdminUserPhoneResponse>> getUserPhone(
            @PathVariable Long userId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        String phone = adminUserCommandService.revealPhone(userId, currentUser.id());
        // 개인정보 응답이 브라우저·중간 캐시에 남지 않게 한다(회장 번호 조회와 동일한 정책).
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(ApiResponse.success(AdminUserPhoneResponse.from(phone)));
    }
}
