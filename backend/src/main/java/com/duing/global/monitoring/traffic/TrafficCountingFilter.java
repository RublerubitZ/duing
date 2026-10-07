package com.duing.global.monitoring.traffic;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.concurrent.atomic.AtomicLong;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * api 요청 수·429 응답 수를 센다 — {@link TrafficSurgeMonitor} 가 매분 {@link #drain} 으로 비워 트래픽 이상을 판정한다.
 *
 * <p>모든 경로를 센다 — 헬스체크는 분당 몇 건이라 기준에 영향이 없고, 빼면 그 경로로 오는 폭주를 못 본다. 429 는 체인이
 * 끝난 뒤의 최종 상태로 판정한다(레이트리미터 예외를 전역 예외 처리기가 429 로 바꾼 결과). 체인이 예외를 던져도 센다.
 * 같은 HIGHEST_PRECEDENCE 인 {@code RequestBodySizeLimitFilter} 와의 순서는 빈 등록 순서라 정해져 있지 않다 — 그쪽이
 * 먼저 돌면 그 413 단락은 세지 못한다(드묾). 수치는 이 인스턴스 것이다 — 인스턴스를 늘리면 판정도 인스턴스별이 된다.
 * IP·경로는 세지 않는다.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
@ConditionalOnProperty(prefix = "duing.monitoring.traffic-surge", name = "enabled", havingValue = "true")
public class TrafficCountingFilter extends OncePerRequestFilter {

    private final AtomicLong requests = new AtomicLong();
    private final AtomicLong rejections = new AtomicLong();

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        try {
            filterChain.doFilter(request, response);
        } finally {
            requests.incrementAndGet();
            if (response.getStatus() == HttpStatus.TOO_MANY_REQUESTS.value()) {
                rejections.incrementAndGet();
            }
        }
    }

    /** 직전 drain 뒤로 센 값을 돌려주고 0 으로 되돌린다. 두 값을 따로 비워 경계의 몇 건이 다음 창으로 넘어갈 수 있다(판정에 무해). */
    Window drain() {
        return new Window(requests.getAndSet(0), rejections.getAndSet(0));
    }

    record Window(long requests, long rejections) {
    }
}
