package com.duing.domain.joincode.api;

import com.duing.domain.joincode.controller.dto.response.JoinCodeCheckResponse;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;

@Tag(name = "가입 코드 (학생)", description = "가입 코드 확인·가입 요청 생성")
public interface JoinCodeApi {

    @Operation(summary = "가입 코드 확인",
            description = "동아리명·기수·사용 가능 여부를 반환한다. 비로그인도 호출할 수 있으며 이때"
                    + " alreadyMember·myRequestStatus 는 null 이다. 코드는 대소문자를 가리지 않는다."
                    + " 미존재 코드는 404, IP 레이트리밋(분 30/시 200) 초과는 429.")
    @GetMapping("/join-codes/{code}")
    ResponseEntity<ApiResponse<JoinCodeCheckResponse>> checkJoinCode(
            @PathVariable String code,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser,
            HttpServletRequest httpServletRequest
    );

    @Operation(summary = "가입 요청 생성",
            description = "코드로 가입 요청(PENDING)을 접수한다. 승인 전까지 사용 인원은 차감되지 않는다."
                    + " 미존재 코드는 404, 사용할 수 없는 코드·이미 가입된 동아리·대기 중인 요청 존재 시 409,"
                    + " IP 레이트리밋(분 10/시 60) 초과는 429.")
    @SecurityRequirement(name = "bearerAuth")
    @PostMapping("/join-codes/{code}/requests")
    ResponseEntity<ApiResponse<Void>> createJoinRequest(
            @PathVariable String code,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser,
            HttpServletRequest httpServletRequest
    );
}
