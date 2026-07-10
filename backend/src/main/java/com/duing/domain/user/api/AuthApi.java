package com.duing.domain.user.api;

import com.duing.domain.user.controller.dto.request.ConfirmEmailVerificationRequest;
import com.duing.domain.user.controller.dto.request.IssuePhoneVerificationRequest;
import com.duing.domain.user.controller.dto.request.LoginRequest;
import com.duing.domain.user.controller.dto.request.SendEmailVerificationRequest;
import com.duing.domain.user.controller.dto.request.SignupRequest;
import com.duing.domain.user.controller.dto.response.EmailVerificationResponse;
import com.duing.domain.user.controller.dto.response.LoginResponse;
import com.duing.domain.user.controller.dto.response.PhoneVerificationIssueResponse;
import com.duing.domain.user.controller.dto.response.PhoneVerificationStatusResponse;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
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

    @Operation(summary = "로그인", description = "이메일과 비밀번호로 인증 후 JWT를 발급한다.")
    @ApiResponses(@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "로그인 성공"))
    @PostMapping("/auth/login")
    ResponseEntity<ApiResponse<LoginResponse>> login(
            @Valid @RequestBody LoginRequest loginRequest,
            HttpServletRequest httpServletRequest);

    @Operation(summary = "로그아웃",
            description = "현재 사용자의 token_version 을 증가시켜 기존에 발급된 모든 액세스 토큰을 무효화한다.")
    @ApiResponses(@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "로그아웃 성공"))
    @PostMapping("/auth/logout")
    ResponseEntity<ApiResponse<Void>> logout(@AuthenticationPrincipal UserPrincipal currentUser);

    @Operation(summary = "이메일 인증코드 발송",
            description = "회원가입용 6자리 인증코드를 학교 이메일로 발송한다. 코드는 20분 유효, 재발송은 60초 쿨다운. "
                    + "이미 가입된 이메일이면 메일을 보내지 않고 409(EMAIL_ALREADY_REGISTERED) 로 즉시 안내한다.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "201", description = "발송됨"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "이미 가입된 이메일")
    })
    @PostMapping("/auth/email-verifications")
    ResponseEntity<ApiResponse<EmailVerificationResponse>> sendEmailVerification(
            @Valid @RequestBody SendEmailVerificationRequest sendRequest,
            HttpServletRequest httpServletRequest);

    @Operation(summary = "이메일 인증코드 확인",
            description = "발송된 6자리 코드를 검증한다. 5회 실패 시 무효화. 이미 인증된 경우 200(멱등).")
    @ApiResponses(@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "인증 성공"))
    @PostMapping("/auth/email-verifications/confirm")
    ResponseEntity<ApiResponse<Void>> confirmEmailVerification(
            @Valid @RequestBody ConfirmEmailVerificationRequest confirmRequest,
            HttpServletRequest httpServletRequest);

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
                    + "PENDING 이면 서버가 Octomo 수신 여부를 확인한다(세션당 2.5초 스로틀, 일일 상한 초과 시 503).")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "조회 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "존재하지 않는 토큰"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "429", description = "IP 요청 한도 초과"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "503",
                    description = "Octomo 일일 호출 상한 소진 — 잠시 후 재시도")
    })
    @GetMapping("/auth/phone-verifications/{verificationToken}")
    ResponseEntity<ApiResponse<PhoneVerificationStatusResponse>> getPhoneVerificationStatus(
            @PathVariable("verificationToken") String verificationToken,
            HttpServletRequest httpServletRequest);
}
