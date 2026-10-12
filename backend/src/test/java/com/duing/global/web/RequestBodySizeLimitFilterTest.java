package com.duing.global.web;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import java.io.Writer;
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
    @DisplayName("업로드 경로의 멀티파트는 JSON 한도를 넘겨도 통과한다")
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
    @DisplayName("업로드 외 경로에 멀티파트로 한도를 넘기면 413 으로 거부된다")
    void rejectsOversizedMultipartToNonUploadPath() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/v1/auth/login");
        request.setContentType(MediaType.MULTIPART_FORM_DATA_VALUE + "; boundary=abc123");
        request.setContent(new byte[3 * 1024 * 1024]);
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(HttpStatus.PAYLOAD_TOO_LARGE.value());
        assertThat(chain.getRequest()).isNull();
    }

    @Test
    @DisplayName("길이를 모르는 멀티파트는 업로드 경로가 아니면 413 으로 거부된다")
    void rejectsMultipartOfUnknownLengthToNonUploadPath() throws Exception {
        MockHttpServletRequest request = chunkedRequest(
                "/api/v1/auth/login", MediaType.MULTIPART_FORM_DATA_VALUE + "; boundary=abc123", 1024);
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(HttpStatus.PAYLOAD_TOO_LARGE.value());
        assertThat(chain.getRequest()).isNull();
    }

    @Test
    @DisplayName("chunked 도 한도 이하는 통과한다")
    void passesChunkedBodyUnderLimit() throws Exception {
        MockHttpServletRequest request =
                chunkedRequest("/api/v1/applications", MediaType.APPLICATION_JSON_VALUE, 1024);
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, chainReadingWholeBody());

        assertThat(response.getStatus()).isEqualTo(HttpStatus.OK.value());
    }

    @Test
    @DisplayName("chunked 로 정확히 한도만큼은 통과한다")
    void passesChunkedBodyExactlyAtLimit() throws Exception {
        MockHttpServletRequest request =
                chunkedRequest("/api/v1/applications", MediaType.APPLICATION_JSON_VALUE, (int) MAX_BYTES);
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, chainReadingWholeBody());

        assertThat(response.getStatus()).isEqualTo(HttpStatus.OK.value());
    }

    @Test
    @DisplayName("chunked 로 한도를 넘기면 읽는 도중 413 과 오류 바디로 끊는다")
    void rejectsChunkedBodyOverLimitWhileReading() throws Exception {
        MockHttpServletRequest request =
                chunkedRequest("/api/v1/applications", MediaType.APPLICATION_JSON_VALUE, (int) MAX_BYTES + 1);
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, chainReadingWholeBody());

        assertThat(response.getStatus()).isEqualTo(HttpStatus.PAYLOAD_TOO_LARGE.value());
        assertThat(response.getContentAsString()).contains("최대 크기를 초과");
    }

    @Test
    @DisplayName("chunked 본문을 문자 스트림(getReader)으로 읽어도 한도를 넘기면 413 으로 끊는다")
    void rejectsChunkedBodyOverLimitReadThroughReader() throws Exception {
        MockHttpServletRequest request =
                chunkedRequest("/api/v1/applications", MediaType.APPLICATION_JSON_VALUE, (int) MAX_BYTES + 1);
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response,
                (chainRequest, chainResponse) -> chainRequest.getReader().transferTo(Writer.nullWriter()));

        assertThat(response.getStatus()).isEqualTo(HttpStatus.PAYLOAD_TOO_LARGE.value());
    }

    // MockHttpServletRequest 는 본문을 주면 Content-Length 를 그 길이로 돌려준다 — chunked(길이 미상)는 -1 로 덮어 흉내 낸다.
    private static MockHttpServletRequest chunkedRequest(String uri, String contentType, int bodyBytes) {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", uri) {
            @Override
            public long getContentLengthLong() {
                return -1;
            }

            @Override
            public int getContentLength() {
                return -1;
            }
        };
        request.setContentType(contentType);
        request.setContent(new byte[bodyBytes]);
        return request;
    }

    // 컨트롤러처럼 본문을 끝까지 읽는 체인.
    private static FilterChain chainReadingWholeBody() {
        return (request, response) -> request.getInputStream().readAllBytes();
    }
}
