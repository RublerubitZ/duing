package com.duing.domain.user.api;

import com.duing.domain.user.controller.dto.request.LoginRequest;
import com.duing.domain.user.controller.dto.request.SignupRequest;
import com.duing.domain.user.controller.dto.response.LoginResponse;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

@Tag(name = "인증", description = "회원가입 및 로그인")
public interface AuthApi {

    @Operation(summary = "회원가입", description = "학번/이름/이메일/비밀번호로 STUDENT 계정을 생성한다.")
    @ApiResponses(@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "201", description = "생성됨"))
    @PostMapping("/auth/signup")
    ResponseEntity<ApiResponse<Long>> signup(@Valid @RequestBody SignupRequest signupRequest);

    @Operation(summary = "로그인", description = "이메일과 비밀번호로 인증 후 JWT를 발급한다.")
    @ApiResponses(@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "로그인 성공"))
    @PostMapping("/auth/login")
    ResponseEntity<ApiResponse<LoginResponse>> login(@Valid @RequestBody LoginRequest loginRequest);
}
