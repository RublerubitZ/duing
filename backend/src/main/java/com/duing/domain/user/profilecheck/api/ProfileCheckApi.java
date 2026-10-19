package com.duing.domain.user.profilecheck.api;

import com.duing.domain.user.profilecheck.controller.dto.request.ConfirmProfileCheckRequest;
import com.duing.domain.user.profilecheck.controller.dto.response.ProfileCheckStatusResponse;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;

@Tag(name = "학기별 정보 확인 팝업", description = "새 학기 내 정보(학년·단과대학·전공) 확인 팝업 조회·확인")
public interface ProfileCheckApi {

    @Operation(summary = "내 정보 확인 팝업 조회",
            description = "지금 나에게 띄울 팝업이 있으면 pending=true 와 학기·문구·현재 정보·제안 학년을 반환한다. "
                    + "팝업이 꺼졌거나 학기가 지났거나 이번 학기에 이미 확인했으면(프로필 저장·가입 포함) pending=false 다.")
    @SecurityRequirement(name = "BearerAuth")
    @GetMapping("/users/me/profile-check")
    ResponseEntity<ApiResponse<ProfileCheckStatusResponse>> getProfileCheck(
            @AuthenticationPrincipal UserPrincipal currentUser);

    @Operation(summary = "내 정보 확인",
            description = "이번 학기 정보 확인을 기록한다. grade 를 보내면 서버 제안 학년과 같을 때만 그 학년으로 바꾼다(아니면 400). "
                    + "이미 확인한 학기면 아무 것도 바꾸지 않고 204, 팝업이 꺼졌거나 학기가 다르면 409 PROFILE_CHECK_CLOSED.")
    @SecurityRequirement(name = "BearerAuth")
    @PutMapping("/users/me/profile-check")
    ResponseEntity<Void> confirmProfileCheck(
            @Valid @RequestBody ConfirmProfileCheckRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser);
}
