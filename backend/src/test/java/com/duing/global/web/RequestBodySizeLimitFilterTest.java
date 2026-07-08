package com.duing.global.web;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

class RequestBodySizeLimitFilterTest {

    private static final long MAX_BYTES = 2_097_152L; // 2MB
    private static final String ALLOWED_ORIGIN = "https://duings.com";

    private RequestBodySizeLimitFilter filter;

    @BeforeEach
    void setUp() {
        CorsConfiguration corsConfiguration = new CorsConfiguration();
        corsConfiguration.setAllowedOrigins(List.of(ALLOWED_ORIGIN));
        corsConfiguration.setAllowCredentials(true);
        UrlBasedCorsConfigurationSource corsConfigurationSource = new UrlBasedCorsConfigurationSource();
        corsConfigurationSource.registerCorsConfiguration("/**", corsConfiguration);

        filter = new RequestBodySizeLimitFilter(new ObjectMapper(), corsConfigurationSource);
        ReflectionTestUtils.setField(filter, "maxBodyBytes", MAX_BYTES);
    }

    @Test
    @DisplayName("한도를 초과한 JSON 바디는 컨트롤러에 닿기 전 413 과 오류 바디로 거부된다")
    void rejectsOversizedJsonBody() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/v1/applications");
        request.setContentType(MediaType.APPLICATION_JSON_VALUE);
        request.setContent(new byte[(int) MAX_BYTES + 1]);
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(HttpStatus.PAYLOAD_TOO_LARGE.value());
        assertThat(response.getContentType()).startsWith(MediaType.APPLICATION_JSON_VALUE);
        assertThat(response.getContentAsString()).contains("최대 크기를 초과");
        // 체인으로 넘어가지 않아 컨트롤러가 바디를 역직렬화하지 않는다.
        assertThat(chain.getRequest()).isNull();
    }

    @Test
    @DisplayName("한도 이하의 JSON 바디는 그대로 다음 필터로 통과한다")
    void passesNormalJsonBody() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/v1/applications");
        request.setContentType(MediaType.APPLICATION_JSON_VALUE);
        request.setContent(new byte[1024]);
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(HttpStatus.OK.value());
        assertThat(chain.getRequest()).isNotNull();
    }

    @Test
    @DisplayName("정확히 한도와 같은 크기의 바디는 통과한다 — 초과(>)만 차단하는 경계 동작을 고정한다")
    void passesBodyExactlyAtLimit() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/v1/applications");
        request.setContentType(MediaType.APPLICATION_JSON_VALUE);
        request.setContent(new byte[(int) MAX_BYTES]);
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertThat(chain.getRequest()).isNotNull();
    }

    @Test
    @DisplayName("허용 오리진의 크로스 오리진 요청이 413 으로 거부되면 브라우저가 읽을 수 있도록 CORS 헤더가 붙는다")
    void oversizedCrossOriginResponseCarriesCorsHeaders() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/v1/applications");
        request.setContentType(MediaType.APPLICATION_JSON_VALUE);
        request.addHeader(HttpHeaders.ORIGIN, ALLOWED_ORIGIN);
        request.setContent(new byte[(int) MAX_BYTES + 1]);
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(HttpStatus.PAYLOAD_TOO_LARGE.value());
        assertThat(response.getHeader(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN)).isEqualTo(ALLOWED_ORIGIN);
        assertThat(response.getHeader(HttpHeaders.ACCESS_CONTROL_ALLOW_CREDENTIALS)).isEqualTo("true");
    }

    @Test
    @DisplayName("허용되지 않은 오리진의 413 응답에는 CORS 허용 헤더를 붙이지 않는다")
    void oversizedDisallowedOriginResponseHasNoCorsHeaders() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/v1/applications");
        request.setContentType(MediaType.APPLICATION_JSON_VALUE);
        request.addHeader(HttpHeaders.ORIGIN, "https://evil.example.com");
        request.setContent(new byte[(int) MAX_BYTES + 1]);
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(HttpStatus.PAYLOAD_TOO_LARGE.value());
        assertThat(response.getHeader(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN)).isNull();
    }

    @Test
    @DisplayName("멀티파트(파일 업로드)는 JSON 한도를 넘겨도 통과한다 — 업로드 한도는 별도로 강제된다")
    void skipsMultipartEvenWhenOverJsonLimit() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/v1/files");
        request.setContentType(MediaType.MULTIPART_FORM_DATA_VALUE + "; boundary=abc123");
        request.setContent(new byte[(int) MAX_BYTES + 1]);
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertThat(chain.getRequest()).isNotNull();
    }

    @Test
    @DisplayName("Content-Length 를 알 수 없는(chunked) 요청은 앱 레이어에서 통과한다 — 엣지(Caddy)가 상한을 강제한다")
    void passesWhenContentLengthUnknown() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/v1/applications");
        request.setContentType(MediaType.APPLICATION_JSON_VALUE);
        // setContent 를 호출하지 않으면 Content-Length 는 -1(미상)로 남는다.
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertThat(chain.getRequest()).isNotNull();
    }
}
