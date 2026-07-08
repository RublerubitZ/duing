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
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.stereotype.Component;

/**
 * URL 레이어 인가 실패(예: /api/v1/admin/** 에 대한 비 ADMIN 접근) 시 403 을 반환한다.
 *
 * <p>이 핸들러가 없으면 Spring Security 의 ExceptionTranslationFilter 가 인가 거부를 인증 진입점
 * (JwtAuthenticationEntryPoint, 401)으로 넘겨, 컨트롤러 레이어의 @PreAuthorize 거부(GlobalExceptionHandler
 * → 403 ApiResponse)와 상태코드·응답 형식이 어긋난다. URL 레이어 거부도 동일하게 403 + ApiResponse 로
 * 통일해, 백스톱을 추가해도 기존 권한 거부 계약이 바뀌지 않게 한다.
 */
@Component
@RequiredArgsConstructor
public class JwtAccessDeniedHandler implements AccessDeniedHandler {

    public static final String ACCESS_DENIED_MESSAGE = "권한이 없습니다.";

    private final ObjectMapper objectMapper;

    @Override
    public void handle(HttpServletRequest request,
                       HttpServletResponse response,
                       AccessDeniedException accessDeniedException) throws IOException {
        response.setStatus(HttpStatus.FORBIDDEN.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        objectMapper.writeValue(response.getWriter(), ApiResponse.error(ACCESS_DENIED_MESSAGE));
    }
}
