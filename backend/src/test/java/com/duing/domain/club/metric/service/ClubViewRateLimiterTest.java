package com.duing.domain.club.metric.service;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.domain.club.exception.ClubException;
import java.time.LocalDateTime;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * 조회 기록 IP 창의 경계값 검증 — 스프링 컨텍스트 없이 순수 단위 테스트로 둔다.
 * <p>이 창의 목적은 순위 조작 차단이 아니라 인증 없는 쓰기 경로의 행 증식 상한이다
 * ({@link ClubViewRateLimiter} 주석 참고). 그래서 한도는 교내 NAT 를 넉넉히 통과하도록 크게 잡혀 있고,
 * 여기서는 "한도까지는 통과하고 넘으면 429" 라는 경계만 확인한다.
 */
class ClubViewRateLimiterTest {

    private ClubViewRateLimiter clubViewRateLimiter;

    @BeforeEach
    void setUp() {
        clubViewRateLimiter = new ClubViewRateLimiter();
    }

    @Test
    @DisplayName("분당 한도까지는 통과하고 한도를 넘는 요청부터 429 로 거절된다")
    void rejectsRequestsBeyondPerMinuteLimit() {
        LocalDateTime now = LocalDateTime.of(2026, 3, 1, 12, 0);
        for (int attempt = 0; attempt < ClubViewRateLimiter.PER_MINUTE_LIMIT; attempt++) {
            clubViewRateLimiter.assertAndRecordView("10.0.0.1", now);
        }

        assertThatThrownBy(() -> clubViewRateLimiter.assertAndRecordView("10.0.0.1", now))
                .isInstanceOf(ClubException.ClubViewRateLimitedException.class);
    }

    @Test
    @DisplayName("분 창이 지나면 같은 IP 의 요청이 다시 통과한다")
    void allowsRequestsAgainAfterMinuteWindowPasses() {
        LocalDateTime now = LocalDateTime.of(2026, 3, 1, 12, 0);
        for (int attempt = 0; attempt < ClubViewRateLimiter.PER_MINUTE_LIMIT; attempt++) {
            clubViewRateLimiter.assertAndRecordView("10.0.0.1", now);
        }

        assertThatCode(() -> clubViewRateLimiter.assertAndRecordView("10.0.0.1", now.plusMinutes(1).plusSeconds(1)))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("한 IP 가 한도를 채워도 다른 IP 의 요청은 영향을 받지 않는다")
    void limitIsScopedPerIp() {
        LocalDateTime now = LocalDateTime.of(2026, 3, 1, 12, 0);
        for (int attempt = 0; attempt < ClubViewRateLimiter.PER_MINUTE_LIMIT; attempt++) {
            clubViewRateLimiter.assertAndRecordView("10.0.0.1", now);
        }

        assertThatCode(() -> clubViewRateLimiter.assertAndRecordView("10.0.0.2", now))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("clientIp 를 얻지 못한 요청들도 하나의 버킷으로 묶여 창을 우회하지 못한다")
    void requestsWithoutClientIpShareOneBucket() {
        LocalDateTime now = LocalDateTime.of(2026, 3, 1, 12, 0);
        for (int attempt = 0; attempt < ClubViewRateLimiter.PER_MINUTE_LIMIT; attempt++) {
            clubViewRateLimiter.assertAndRecordView(null, now);
        }

        assertThatThrownBy(() -> clubViewRateLimiter.assertAndRecordView("", now))
                .isInstanceOf(ClubException.ClubViewRateLimitedException.class);
    }
}
