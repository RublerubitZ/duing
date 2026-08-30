package com.duing.domain.user.api;

import com.duing.domain.user.controller.dto.request.CompletePasswordResetRequest;
import com.duing.domain.user.controller.dto.request.IssuePhoneVerificationRequest;
import com.duing.domain.user.controller.dto.request.LoginRequest;
import com.duing.domain.user.controller.dto.request.PasswordResetStartRequest;
import com.duing.domain.user.controller.dto.request.PhoneVerificationStatusRequest;
import com.duing.domain.user.controller.dto.request.RefreshRequest;
import com.duing.domain.user.controller.dto.request.SignupRequest;
import com.duing.domain.user.controller.dto.response.LoginResponse;
import com.duing.domain.user.controller.dto.response.PasswordResetStartResponse;
import com.duing.domain.user.controller.dto.response.PhoneVerificationIssueResponse;
import com.duing.domain.user.controller.dto.response.PhoneVerificationStatusResponse;
import com.duing.domain.user.controller.dto.response.RefreshResponse;
import com.duing.domain.user.controller.dto.response.WebLoginResponse;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;

@Tag(name = "인증", description = "회원가입, 로그인 및 휴대폰 MO 인증")
public interface AuthApi {

    @Operation(summary = "회원가입",
            description = "학번(8자리)/이름/비밀번호와 MO 인증 토큰(verificationToken)으로 STUDENT 계정을 생성한다. "
                    + "전화번호는 인증 세션에서 확정된 값이 저장되며, 사용된 세션은 즉시 소비(삭제)된다.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "201", description = "생성됨"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403",
                    description = "미인증·만료·용도 불일치 세션(PHONE_NOT_VERIFIED)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "이미 가입된 학번 또는 전화번호")
    })
    @PostMapping("/auth/signup")
    ResponseEntity<ApiResponse<Long>> signup(
            @Valid @RequestBody SignupRequest signupRequest,
            HttpServletRequest httpServletRequest);

    @Operation(summary = "로그인", description = "학번(8자리)과 비밀번호로 인증 후 JWT를 발급한다.")
    @ApiResponses(@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "로그인 성공"))
    @PostMapping("/auth/login")
    ResponseEntity<ApiResponse<LoginResponse>> login(
            @Valid @RequestBody LoginRequest loginRequest,
            HttpServletRequest httpServletRequest);

    @Operation(summary = "웹 로그인", description = "학번과 비밀번호로 인증 후 HttpOnly Cookie를 발급한다.")
    @ApiResponses(@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "로그인 성공"))
    @PostMapping("/auth/web/login")
    ResponseEntity<ApiResponse<WebLoginResponse>> webLogin(
            @Valid @RequestBody LoginRequest loginRequest,
            HttpServletRequest httpServletRequest,
            HttpServletResponse httpServletResponse);

    @Operation(summary = "로그아웃",
            description = "access 토큰의 sid 로 현재 기기의 세션과 리프레시 토큰을 폐기한다. 세션을 특정할 수 없는 "
                    + "구 토큰은 token_version 을 올려 전 기기에서 로그아웃된다(전환기 폴백).")
    @ApiResponses(@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "로그아웃 성공"))
    @PostMapping("/auth/logout")
    ResponseEntity<ApiResponse<Void>> logout(@AuthenticationPrincipal UserPrincipal currentUser);

    @Operation(summary = "웹 로그아웃",
            description = "현재 기기의 세션·리프레시 토큰을 폐기하고 웹 인증 Cookie 3종을 삭제한다.")
    @ApiResponses(@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "204", description = "로그아웃 완료"))
    @PostMapping("/auth/web/logout")
    ResponseEntity<Void> webLogout(
            @AuthenticationPrincipal UserPrincipal currentUser,
            HttpServletRequest httpServletRequest,
            HttpServletResponse httpServletResponse);

    @Operation(summary = "토큰 갱신(모바일)",
            description = "리프레시 토큰을 회전시켜 새 access·refresh 쌍을 발급한다. 기존 리프레시 토큰은 "
                    + "즉시 폐기되며, 폐기된 토큰의 재사용은 세션 폐기로 이어진다.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "갱신 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401",
                    description = "만료·폐기 리프레시 토큰(AUTH_SESSION_EXPIRED) 또는 재사용 탐지"
                            + "(REFRESH_TOKEN_REUSED). REFRESH_TOKEN_REUSED 는 패밀리당 최초 탐지 1회이며, "
                            + "탐지로 세션이 폐기된 뒤의 재제시는 AUTH_SESSION_EXPIRED 로 응답한다.")
    })
    @PostMapping("/auth/refresh")
    ResponseEntity<ApiResponse<RefreshResponse>> refresh(
            @Valid @RequestBody RefreshRequest refreshRequest,
            HttpServletRequest httpServletRequest);

    @Operation(summary = "토큰 갱신(웹)",
            description = "refresh Cookie 를 회전시켜 인증 Cookie 3종을 재발급한다. rememberMe 지속성 모드를 유지한다.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "204", description = "갱신 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401",
                    description = "만료·폐기 리프레시 토큰(AUTH_SESSION_EXPIRED) 또는 재사용 탐지"
                            + "(REFRESH_TOKEN_REUSED) — 두 경우 모두 인증 Cookie 3종을 즉시 만료시킨다. "
                            + "REFRESH_TOKEN_REUSED 는 패밀리당 최초 탐지 1회이며, 탐지로 세션이 폐기된 뒤의 "
                            + "재제시는 AUTH_SESSION_EXPIRED 로 응답한다.")
    })
    @PostMapping("/auth/web/refresh")
    ResponseEntity<Void> webRefresh(
            HttpServletRequest httpServletRequest,
            HttpServletResponse httpServletResponse);

    @Operation(summary = "휴대폰 MO 인증 시작",
            description = "회원가입용 MO 인증 세션을 발급한다. 사용자가 수신 대표번호로 코드를 문자 전송하면 "
                    + "상태 조회가 VERIFIED 로 바뀐다. 세션 5분 유효, 재발급 60초 쿨다운. "
                    + "이미 가입된 번호는 409(PHONE_ALREADY_REGISTERED). "
                    + "qr=true 면 SMSTO 딥링크 QR(data URL)을 함께 반환한다(발급 실패 시 null — 텍스트 폴백).")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "201", description = "발급됨"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "이미 가입된 번호"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "429",
                    description = "재발급 쿨다운(60초) 또는 IP 요청 한도 초과")
    })
    @PostMapping("/auth/phone-verifications")
    ResponseEntity<ApiResponse<PhoneVerificationIssueResponse>> issuePhoneVerification(
            @Valid @RequestBody IssuePhoneVerificationRequest issueRequest,
            @RequestParam(name = "qr", defaultValue = "false") boolean includeQr,
            HttpServletRequest httpServletRequest);

    @Operation(summary = "휴대폰 MO 인증 상태 조회",
            description = "발급 토큰으로 인증 상태(PENDING/VERIFIED/EXPIRED)를 조회한다. 프론트 폴링용(3초 간격 권장) — "
                    + "PENDING 이면 서버가 Octomo 수신 여부를 확인한다(세션당 2.5초 스로틀, 일일 상한 초과 시 503). "
                    + "토큰이 URL 에 남지 않도록 body 로 받는 조회용 POST 다(#626).")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "조회 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "존재하지 않는 토큰"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "429",
                    description = "세션 토큰 폴링 한도 초과(주 원인) 또는 IP 백스톱 초과"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "503",
                    description = "Octomo 일일 호출 상한 소진 — 잠시 후 재시도")
    })
    @PostMapping("/auth/phone-verifications/status")
    ResponseEntity<ApiResponse<PhoneVerificationStatusResponse>> getPhoneVerificationStatus(
            @Valid @RequestBody PhoneVerificationStatusRequest statusRequest,
            HttpServletRequest httpServletRequest);

    @Operation(summary = "비밀번호 재설정 시작",
            description = "학번으로 계정을 찾아 등록된 번호로 PASSWORD_RESET MO 인증 세션을 발급한다 — 번호는 "
                    + "입력받지 않으며 응답에 마스킹된 번호를 안내한다. 이후 폴링은 공용 상태조회 API 를 쓴다. "
                    + "학번당 시간당 3회 제한. 계정 존재 여부와 무관하게 202 를 반환한다(계정 열거 방지) — "
                    + "미가입 학번에는 학번에서 파생한 안내용 번호로 세션이 발급되며 응답 형태가 동일하다.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "202", description = "발급됨"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "429", description = "학번·IP 한도 또는 쿨다운")
    })
    @PostMapping("/auth/password-resets")
    ResponseEntity<ApiResponse<PasswordResetStartResponse>> startPasswordReset(
            @Valid @RequestBody PasswordResetStartRequest startRequest,
            @RequestParam(name = "qr", defaultValue = "false") boolean includeQr,
            HttpServletRequest httpServletRequest);

    @Operation(summary = "비밀번호 재설정 완료",
            description = "PASSWORD_RESET MO 인증 세션(인증 후 10분 내)으로 새 비밀번호를 설정한다. 완료 시 "
                    + "token_version 을 올려 전 기기에서 로그아웃되며, 세션은 즉시 소비된다. "
                    + "미인증·만료·용도 불일치 세션은 403(PHONE_NOT_VERIFIED), 대상 계정 소실은 400.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "204", description = "재설정됨"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "계정을 확인할 수 없음 또는 형식 오류"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "유효하지 않은 인증 세션")
    })
    @PostMapping("/auth/password-resets/complete")
    ResponseEntity<Void> completePasswordReset(
            @Valid @RequestBody CompletePasswordResetRequest completeRequest,
            HttpServletRequest httpServletRequest);
}
