package com.duing.domain.user.service;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.domain.user.exception.EmailVerificationException;
import java.time.LocalDateTime;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class EmailVerificationRateLimiterTest {

    private static final LocalDateTime BASE = LocalDateTime.of(2026, 6, 13, 12, 0, 0);
    private static final String IP = "203.0.113.10";

    private EmailVerificationRateLimiter rateLimiter;

    @BeforeEach
    void setUp() {
        rateLimiter = new EmailVerificationRateLimiter();
    }

    @Test
    @DisplayName("같은 IP 에서 1분 내 5회까지 허용되고 6번째는 거부된다")
    void perMinuteLimitIsFive() {
        for (int request = 0; request < 5; request++) {
            rateLimiter.assertAndRecordIpRequest(IP, BASE.plusSeconds(request));
        }
        assertThatThrownBy(() -> rateLimiter.assertAndRecordIpRequest(IP, BASE.plusSeconds(10)))
                .isInstanceOf(EmailVerificationException.VerificationRateLimitedException.class);
    }

    @Test
    @DisplayName("정확히 1분이 지난 시점의 요청은 새 윈도우로 허용된다")
    void requestAtExactMinuteBoundaryIsAllowed() {
        for (int request = 0; request < 5; request++) {
            rateLimiter.assertAndRecordIpRequest(IP, BASE.plusSeconds(request));
        }
        // 윈도우는 exclusive — BASE+60초 시점에 BASE+0초 기록은 윈도우 밖이라 5개 미만이 되어 허용
        assertThatCode(() -> rateLimiter.assertAndRecordIpRequest(IP, BASE.plusSeconds(60)))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("1분 윈도우가 지나면 같은 IP 도 다시 허용된다")
    void perMinuteWindowSlides() {
        for (int request = 0; request < 5; request++) {
            rateLimiter.assertAndRecordIpRequest(IP, BASE.plusSeconds(request));
        }
        assertThatCode(() -> rateLimiter.assertAndRecordIpRequest(IP, BASE.plusSeconds(61)))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("같은 IP 에서 1시간 내 50회를 넘으면 거부된다")
    void perHourLimitIsFifty() {
        for (int request = 0; request < 50; request++) {
            rateLimiter.assertAndRecordIpRequest(IP, BASE.plusSeconds(request * 12L));
        }
        assertThatThrownBy(() -> rateLimiter.assertAndRecordIpRequest(IP, BASE.plusMinutes(11)))
                .isInstanceOf(EmailVerificationException.VerificationRateLimitedException.class);
    }

    @Test
    @DisplayName("다른 IP 는 서로 제한에 영향을 주지 않는다")
    void limitsAreIsolatedPerIp() {
        for (int request = 0; request < 5; request++) {
            rateLimiter.assertAndRecordIpRequest(IP, BASE.plusSeconds(request));
        }
        assertThatCode(() -> rateLimiter.assertAndRecordIpRequest("198.51.100.7", BASE.plusSeconds(10)))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("일일 5000건까지 예약되고 5001번째는 503, 다음 날에는 다시 예약된다")
    void reserveGlobalQuotaEnforcesDailyLimitAndResetsNextDay() {
        for (int sendAttempt = 0; sendAttempt < 5_000; sendAttempt++) {
            rateLimiter.reserveGlobalQuota(BASE);
        }
        assertThatThrownBy(() -> rateLimiter.reserveGlobalQuota(BASE))
                .isInstanceOf(EmailVerificationException.EmailSendQuotaExceededException.class);

        assertThatCode(() -> rateLimiter.reserveGlobalQuota(BASE.plusDays(1)))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("자정 경계에 늦게 도착한 전날 요청은 새 날짜 카운터를 0으로 되돌리지 않고 함께 소비된다")
    void latePreviousDayRequestConsumesCurrentCounter() {
        LocalDateTime nextDay = BASE.plusDays(1).withHour(0).withMinute(0).withSecond(0);
        // 새 날짜로 4999건 예약
        for (int sendAttempt = 0; sendAttempt < 4_999; sendAttempt++) {
            rateLimiter.reserveGlobalQuota(nextDay);
        }
        // 늦게 도착한 전날 요청도 같은(현재) 카운터를 소비 → 5000번째
        rateLimiter.reserveGlobalQuota(BASE);
        // 5001번째는 503 — 전날 요청이 카운터를 0으로 되돌리지 않았음을 증명
        assertThatThrownBy(() -> rateLimiter.reserveGlobalQuota(nextDay))
                .isInstanceOf(EmailVerificationException.EmailSendQuotaExceededException.class);
    }

    @Test
    @DisplayName("롤오버 후 다수의 전날 요청도 현재 일일 상한을 우회하지 못한다")
    void manyStaleDateRequestsCannotBypassDailyQuota() {
        LocalDateTime nextDay = BASE.plusDays(1).withHour(0).withMinute(0).withSecond(0);
        rateLimiter.reserveGlobalQuota(nextDay); // 새 날짜 카운터 설치 (1건)
        // 전날 시각으로 4999건 — 모두 현재 카운터를 소비해야 한다 (무증가 통과 금지)
        for (int sendAttempt = 0; sendAttempt < 4_999; sendAttempt++) {
            rateLimiter.reserveGlobalQuota(BASE);
        }
        // 총 5000 → 다음 전날 요청은 503
        assertThatThrownBy(() -> rateLimiter.reserveGlobalQuota(BASE))
                .isInstanceOf(EmailVerificationException.EmailSendQuotaExceededException.class);
    }
}
