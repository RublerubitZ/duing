package com.duing.global.auth;

import com.duing.global.response.ApiResponse;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class JwtAuthenticationEntryPoint implements AuthenticationEntryPoint {

    public static final String UNAUTHENTICATED_MESSAGE = "인증이 필요합니다.";

    private final WebAuthCookieService cookieService;
    private final ObjectMapper objectMapper;

    @Override
    public void commence(
            HttpServletRequest request,
            HttpServletResponse response,
            AuthenticationException authenticationException
    ) throws IOException {
        // 쿠키 인증 401은 무효가 확정된 access Cookie만 지운다. refresh Cookie 까지 지우면
        // access 만료(30분) 후 첫 401 응답이 갱신 수단을 없애 /auth/web/refresh 가
        // AUTH_SESSION_EXPIRED 로 떨어지고, FE 전역 핸들러가 즉시 강제 로그아웃한다.
        // 세션이 실제로 끝났을 때의 3종 삭제는 webRefresh 실패 catch·로그아웃 경로가 전담한다.
        if (request.getAttribute(AuthTransport.REQUEST_ATTRIBUTE) == AuthTransport.COOKIE) {
            cookieService.clearAccess(response);
        }
        response.setStatus(HttpStatus.UNAUTHORIZED.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        objectMapper.writeValue(response.getWriter(), ApiResponse.error(UNAUTHENTICATED_MESSAGE));
    }
}
