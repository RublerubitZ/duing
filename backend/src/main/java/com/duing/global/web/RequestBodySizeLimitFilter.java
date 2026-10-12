package com.duing.global.web;

import com.duing.global.response.ApiResponse;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
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
 * <p>멀티파트는 업로드 경로({@code /api/v1/files})만 제외한다 — 그 경로는 서블릿 multipart 한도(10MB)와
 * 업로드 정책(5MB, {@code FileController})이 별도로 강제하므로, 여기서 JSON 한도(기본 2MB)를 적용하면 정상
 * 이미지 업로드가 깨진다. 다른 경로의 멀티파트는 길이를 알면 상한과 비교하고, 길이를 모르면 거부한다.
 *
 * <p>Content-Length 를 모르는 chunked 전송은 읽는 만큼 세어 상한을 넘는 순간 413 으로 끊는다
 * ({@link BodySizeLimitingRequest}). 운영에서는 엣지 Caddy(request_body max_size 11MB)와 함께 이중 방어가 된다.
 *
 * <p>보안 필터 체인보다 먼저 실행되도록({@link Ordered#HIGHEST_PRECEDENCE}) 인증 처리 이전에 과대
 * 바디를 거른다.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
@RequiredArgsConstructor
public class RequestBodySizeLimitFilter extends OncePerRequestFilter {

    private static final String MULTIPART_PREFIX = "multipart/";
    private static final String UPLOAD_PATH = "/api/v1/files";

    private final ObjectMapper objectMapper;
    private final CorsConfigurationSource corsConfigurationSource;

    // 업로드 경로 멀티파트를 뺀 모든 바디의 상한. 정상 요청(공지 본문·지원서 답변 등)은 수백 KB 를 넘지 않으므로
    // 2MB 는 넉넉하다. 운영에서 조정이 필요하면 DUING_REQUEST_MAX_BODY_BYTES 로 오버라이드한다.
    @Value("${duing.request.max-body-bytes:2097152}")
    private long maxBodyBytes;

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        // 업로드 엔드포인트만 멀티파트 면제 — 서블릿 multipart 한도(10MB)·업로드 정책(5MB)이 따로 강제한다. 정확 일치만
        // 면제하고 인코딩 변형은 면제하지 않는다(fail-closed). 다른 경로의 멀티파트는 디스패처가 핸들러를 찾기 전에
        // 컨테이너가 getParts() 로 끝까지 파싱해 래퍼 계수를 우회하므로 여기서 먼저 거른다(#1322 F-4).
        // 원시 URI 비교라 server.servlet.context-path 를 두면(지금 미설정) 접두가 붙어 업로드가 413 이 된다 — 그때 함께 바꾼다.
        if (isMultipart(request) && UPLOAD_PATH.equals(request.getRequestURI())) {
            filterChain.doFilter(request, response);
            return;
        }
        long contentLength = request.getContentLengthLong();
        if (contentLength > maxBodyBytes || (contentLength < 0 && isMultipart(request))) {
            writePayloadTooLarge(request, response);
            return;
        }
        try {
            // 길이를 모르면(chunked) 읽는 만큼 센다. 본문이 없는 GET 도 길이가 -1 이지만 아무도 읽지 않아 감싸도 무해하다.
            filterChain.doFilter(contentLength < 0 ? new BodySizeLimitingRequest(request, maxBodyBytes) : request,
                    response);
        } catch (RequestBodyTooLargeException tooLarge) {
            // 디스패처 밖(FormContentFilter 등)에서 읽다 넘친 경우 — 디스패처 안에서 메시지 컨버터로 읽다 넘치면
            // GlobalExceptionHandler 가 413 으로 돌린다(원시 본문을 직접 읽는 핸들러는 지금 없다).
            if (!response.isCommitted()) {
                response.reset(); // 하위가 이미 getOutputStream() 을 잡았으면 getWriter() 가 실패한다 — CORS 헤더는 아래에서 다시 붙인다
                writePayloadTooLarge(request, response);
            }
        }
    }

    private boolean isMultipart(HttpServletRequest request) {
        String contentType = request.getContentType();
        return contentType != null
                && contentType.toLowerCase(Locale.ROOT).startsWith(MULTIPART_PREFIX);
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
        objectMapper.writeValue(response.getWriter(), ApiResponse.error(RequestBodyTooLargeException.MESSAGE));
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
