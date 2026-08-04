package com.duing.domain.joincode.controller;

import com.duing.domain.joincode.api.JoinCodeApi;
import com.duing.domain.joincode.controller.dto.response.JoinCodeCheckResponse;
import com.duing.domain.joincode.service.JoinRequestService;
import com.duing.domain.joincode.service.dto.command.CreateJoinRequestCommand;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class JoinCodeController implements JoinCodeApi {

    private final JoinRequestService joinRequestService;

    @Override
    public ResponseEntity<ApiResponse<JoinCodeCheckResponse>> checkJoinCode(
            @PathVariable String code,
            @AuthenticationPrincipal UserPrincipal currentUser,
            HttpServletRequest httpServletRequest
    ) {
        // permitAll 경로 — 비로그인이면 currentUser 가 null(FederationFaqController 전례).
        Long currentUserId = currentUser != null ? currentUser.id() : null;
        JoinCodeCheckResponse checked = JoinCodeCheckResponse.from(joinRequestService.check(
                code, currentUserId, httpServletRequest.getRemoteAddr()));
        return ResponseEntity.ok(ApiResponse.success(checked));
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> createJoinRequest(
            @PathVariable String code,
            @AuthenticationPrincipal UserPrincipal currentUser,
            HttpServletRequest httpServletRequest
    ) {
        joinRequestService.createRequest(new CreateJoinRequestCommand(
                code, currentUser.id(), httpServletRequest.getRemoteAddr()));
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success());
    }
}
