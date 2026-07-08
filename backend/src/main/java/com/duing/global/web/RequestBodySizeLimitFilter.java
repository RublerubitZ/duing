package com.duing.global.web;

import com.duing.global.response.ApiResponse;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * 요청 바디 크기 상한 필터.
 *
 * <p>비인증 사용자가 보낸 대용량 JSON 바디를 애플리케이션이 통째로 역직렬화하다 단일 인스턴스 메모리가
 * 고갈(OOM)되는 것을 막는다. 한도를 넘는 요청은 컨트롤러에 닿기 전 즉시 413 으로 거부한다.
 *
 * <p>방어는 두 겹이다 — 운영은 Caddy(request_body max_size)가 엣지에서 모든 요청을 먼저 캡하고,
 * 이 필터는 프록시가 없는 로컬/직접 접근 경로와 심층 방어를 위해 앱 레이어에서 다시 확인한다.
 *
 * <p>멀티파트(파일 업로드)는 제외한다 — 그 경로는 서블릿 multipart 한도(10MB)와 업로드 정책(5MB,
 * {@code FileController})이 별도로 강제하므로, 여기서 JSON 한도(기본 2MB)를 적용하면 정상 이미지
 * 업로드가 깨진다.
 *
 * <p>Content-Length 를 알 수 없는 chunked 전송은 앱 레이어에서 통과시킨다(값 -1). 운영에서는 Caddy 가
 * chunked 를 포함한 모든 바디를 상한으로 강제하므로 실질 노출이 없고, 앱 레이어를 스트림 카운팅까지
 * 확장하는 대신 엣지 캡에 의존한다.
 *
 * <p>보안 필터 체인보다 먼저 실행되도록({@link Ordered#HIGHEST_PRECEDENCE}) 인증 처리 이전에 과대
 * 바디를 거른다.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
@RequiredArgsConstructor
public class RequestBodySizeLimitFilter extends OncePerRequestFilter {

    private static final String MULTIPART_PREFIX = "multipart/";

    private final ObjectMapper objectMapper;
    private final CorsConfigurationSource corsConfigurationSource;

    // JSON 등 비멀티파트 바디의 상한. 정상 요청(공지 본문·지원서 답변 등)은 수백 KB 를 넘지 않으므로
    // 2MB 는 넉넉하다. 운영에서 조정이 필요하면 DUING_REQUEST_MAX_BODY_BYTES 로 오버라이드한다.
    @Value("${duing.request.max-body-bytes:2097152}")
    private long maxBodyBytes;

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        if (!isMultipart(request) && request.getContentLengthLong() > maxBodyBytes) {
            writePayloadTooLarge(request, response);
            return;
        }
        filterChain.doFilter(request, response);
    }

    private boolean isMultipart(HttpServletRequest request) {
        String contentType = request.getContentType();
        return contentType != null
                && contentType.toLowerCase().startsWith(MULTIPART_PREFIX);
    }

    private void writePayloadTooLarge(HttpServletRequest request, HttpServletResponse response)
            throws IOException {
        // 이 필터는 보안 체인의 CorsFilter 보다 먼저 실행되므로, 여기서 단락(short-circuit)한 413 응답에는
        // CORS 헤더가 붙지 않는다. 그러면 크로스 오리진(프론트→API) 요청의 브라우저가 이 응답을 JS 에서
        // 읽지 못하고 불투명(opaque) 오류로 처리해 한국어 안내가 사라진다. SecurityConfig 와 동일한
        // CorsConfigurationSource 로 허용 오리진을 검증해(중복 정의 없이) 그 경우에만 CORS 헤더를 세팅한다.
        applyCorsHeaders(request, response);
        response.setStatus(HttpStatus.PAYLOAD_TOO_LARGE.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        objectMapper.writeValue(response.getWriter(),
                ApiResponse.error("요청 본문이 허용된 최대 크기를 초과했습니다."));
    }

    private void applyCorsHeaders(HttpServletRequest request, HttpServletResponse response) {
        String origin = request.getHeader(HttpHeaders.ORIGIN);
        if (!StringUtils.hasText(origin)) {
            return;
        }
        CorsConfiguration corsConfiguration = corsConfigurationSource.getCorsConfiguration(request);
        if (corsConfiguration == null) {
            return;
        }
        String allowedOrigin = corsConfiguration.checkOrigin(origin);
        if (allowedOrigin == null) {
            return;
        }
        response.setHeader(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, allowedOrigin);
        response.setHeader(HttpHeaders.VARY, HttpHeaders.ORIGIN);
        if (Boolean.TRUE.equals(corsConfiguration.getAllowCredentials())) {
            response.setHeader(HttpHeaders.ACCESS_CONTROL_ALLOW_CREDENTIALS, "true");
        }
    }
}
