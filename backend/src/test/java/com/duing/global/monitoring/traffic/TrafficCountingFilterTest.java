package com.duing.global.monitoring.traffic;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletResponse;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class TrafficCountingFilterTest {

    private final TrafficCountingFilter filter = new TrafficCountingFilter();

    @Test
    @DisplayName("헬스체크를 포함한 모든 요청을 세고, 최종 응답이 429 면 거절로도 센다")
    void countsRequestsAndRejections() throws Exception {
        respondWith("/api/v1/clubs", HttpStatus.OK);
        respondWith("/actuator/health", HttpStatus.OK);
        respondWith("/api/v1/clubs", HttpStatus.UNAUTHORIZED);
        respondWith("/api/v1/clubs", HttpStatus.TOO_MANY_REQUESTS);

        assertThat(filter.drain()).isEqualTo(new TrafficCountingFilter.Window(4, 1));
    }

    @Test
    @DisplayName("체인이 예외를 던져도 요청으로 세고 예외는 그대로 올린다")
    void countsRequestWhenChainThrows() {
        FilterChain failingChain = (request, response) -> {
            throw new ServletException("boom");
        };

        assertThatThrownBy(() -> filter.doFilter(new MockHttpServletRequest(), new MockHttpServletResponse(), failingChain))
                .isInstanceOf(ServletException.class)
                .hasMessage("boom");

        assertThat(filter.drain()).isEqualTo(new TrafficCountingFilter.Window(1, 0));
    }

    @Test
    @DisplayName("drain 은 센 값을 돌려주고 0 으로 되돌린다")
    void drainResetsCounters() throws Exception {
        respondWith("/api/v1/clubs", HttpStatus.TOO_MANY_REQUESTS);

        assertThat(filter.drain()).isEqualTo(new TrafficCountingFilter.Window(1, 1));
        assertThat(filter.drain()).isEqualTo(new TrafficCountingFilter.Window(0, 0));
    }

    private void respondWith(String requestUri, HttpStatus status) throws Exception {
        FilterChain chain = (request, response) -> ((HttpServletResponse) response).setStatus(status.value());
        filter.doFilter(new MockHttpServletRequest("GET", requestUri), new MockHttpServletResponse(), chain);
    }
}
