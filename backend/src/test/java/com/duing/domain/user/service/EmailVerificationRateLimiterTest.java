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
    // 시간당 한도 검증용 간격 — 어느 1분 창에도 5건뿐이라 발송·confirm 어느 분당 한도에도 안 걸리면서,
    // 각 시간당 한도(100·200)를 1시간 안에 채운다(최대 200건 × 12초 = 2400초 < 3600초).
    private static final long HOURLY_FILL_SPACING_SECONDS = 12L;

    private EmailVerificationRateLimiter rateLimiter;

    @BeforeEach
    void setUp() {
        rateLimiter = new EmailVerificationRateLimiter();
    }

    @Test
    @DisplayName("발송 윈도우는 분당 한도까지 허용하고 그 다음은 거부된다")
    void sendPerMinuteLimitIsEnforced() {
        for (int request = 0; request < EmailVerificationRateLimiter.PER_MINUTE_LIMIT; request++) {
            rateLimiter.assertAndRecordIpRequest(IP, BASE.plusSeconds(request));
        }
        assertThatThrownBy(() -> rateLimiter.assertAndRecordIpRequest(IP, BASE.plusSeconds(59)))
                .isInstanceOf(EmailVerificationException.VerificationRateLimitedException.class);
    }

    @Test
    @DisplayName("confirm 윈도우는 분당 한도까지 허용하고 그 다음은 거부된다")
    void confirmPerMinuteLimitIsEnforced() {
        for (int request = 0; request < EmailVerificationRateLimiter.CONFIRM_PER_MINUTE_LIMIT; request++) {
            rateLimiter.assertAndRecordConfirmIpRequest(IP, BASE.plusSeconds(request));
        }
        assertThatThrownBy(() -> rateLimiter.assertAndRecordConfirmIpRequest(IP, BASE.plusSeconds(59)))
                .isInstanceOf(EmailVerificationException.VerificationRateLimitedException.class);
    }

    @Test
    @DisplayName("발송 윈도우와 confirm 윈도우는 서로 독립적으로 카운트된다")
    void sendAndConfirmWindowsAreIndependent() {
        // 발송 윈도우를 가득 채워도 confirm 은 별도 윈도우라 영향받지 않는다.
        for (int request = 0; request < EmailVerificationRateLimiter.PER_MINUTE_LIMIT; request++) {
            rateLimiter.assertAndRecordIpRequest(IP, BASE.plusSeconds(request));
        }
        assertThatCode(() -> rateLimiter.assertAndRecordConfirmIpRequest(IP, BASE.plusSeconds(1)))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("confirm 윈도우는 시간당 한도를 넘으면 거부된다")
    void confirmPerHourLimitIsEnforced() {
        for (int request = 0; request < EmailVerificationRateLimiter.CONFIRM_PER_HOUR_LIMIT; request++) {
            rateLimiter.assertAndRecordConfirmIpRequest(IP, BASE.plusSeconds(request * HOURLY_FILL_SPACING_SECONDS));
        }
        assertThatThrownBy(() -> rateLimiter.assertAndRecordConfirmIpRequest(IP, BASE.plusMinutes(59)))
                .isInstanceOf(EmailVerificationException.VerificationRateLimitedException.class);
    }

    @Test
    @DisplayName("정확히 1분이 지난 시점의 요청은 새 윈도우로 허용된다")
    void requestAtExactMinuteBoundaryIsAllowed() {
        for (int request = 0; request < EmailVerificationRateLimiter.PER_MINUTE_LIMIT; request++) {
            rateLimiter.assertAndRecordIpRequest(IP, BASE.plusSeconds(request));
        }
        // 윈도우는 exclusive — BASE+60초 시점에 BASE+0초 기록은 윈도우 밖이라 한도 미만이 되어 허용
        assertThatCode(() -> rateLimiter.assertAndRecordIpRequest(IP, BASE.plusSeconds(60)))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("1분 윈도우가 지나면 같은 IP 도 다시 허용된다")
    void perMinuteWindowSlides() {
        for (int request = 0; request < EmailVerificationRateLimiter.PER_MINUTE_LIMIT; request++) {
            rateLimiter.assertAndRecordIpRequest(IP, BASE.plusSeconds(request));
        }
        assertThatCode(() -> rateLimiter.assertAndRecordIpRequest(IP, BASE.plusSeconds(61)))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("발송 윈도우는 시간당 한도를 넘으면 거부된다")
    void sendPerHourLimitIsEnforced() {
        for (int request = 0; request < EmailVerificationRateLimiter.PER_HOUR_LIMIT; request++) {
            rateLimiter.assertAndRecordIpRequest(IP, BASE.plusSeconds(request * HOURLY_FILL_SPACING_SECONDS));
        }
        assertThatThrownBy(() -> rateLimiter.assertAndRecordIpRequest(IP, BASE.plusMinutes(59)))
                .isInstanceOf(EmailVerificationException.VerificationRateLimitedException.class);
    }

    @Test
    @DisplayName("다른 IP 는 서로 제한에 영향을 주지 않는다")
    void limitsAreIsolatedPerIp() {
        for (int request = 0; request < EmailVerificationRateLimiter.PER_MINUTE_LIMIT; request++) {
            rateLimiter.assertAndRecordIpRequest(IP, BASE.plusSeconds(request));
        }
        assertThatCode(() -> rateLimiter.assertAndRecordIpRequest("198.51.100.7", BASE.plusSeconds(1)))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("일일 5000건까지 예약되고 5001번째는 503, 다음 날에는 다시 예약된다")
    void reserveGlobalQuotaEnforcesDailyLimitAndResetsNextDay() {
        for (int sendAttempt = 0; sendAttempt < EmailVerificationRateLimiter.DAILY_GLOBAL_LIMIT; sendAttempt++) {
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
        for (int sendAttempt = 0; sendAttempt < EmailVerificationRateLimiter.DAILY_GLOBAL_LIMIT - 1; sendAttempt++) {
            rateLimiter.reserveGlobalQuota(nextDay);
        }
        // 늦게 도착한 전날 요청도 같은(현재) 카운터를 소비 → 마지막 1건
        rateLimiter.reserveGlobalQuota(BASE);
        // 한도 초과 요청은 503 — 전날 요청이 카운터를 0으로 되돌리지 않았음을 증명
        assertThatThrownBy(() -> rateLimiter.reserveGlobalQuota(nextDay))
                .isInstanceOf(EmailVerificationException.EmailSendQuotaExceededException.class);
    }

    @Test
    @DisplayName("롤오버 후 다수의 전날 요청도 현재 일일 상한을 우회하지 못한다")
    void manyStaleDateRequestsCannotBypassDailyQuota() {
        LocalDateTime nextDay = BASE.plusDays(1).withHour(0).withMinute(0).withSecond(0);
        rateLimiter.reserveGlobalQuota(nextDay); // 새 날짜 카운터 설치 (1건)
        // 전날 시각으로 나머지를 채운다 — 모두 현재 카운터를 소비해야 한다 (무증가 통과 금지)
        for (int sendAttempt = 0; sendAttempt < EmailVerificationRateLimiter.DAILY_GLOBAL_LIMIT - 1; sendAttempt++) {
            rateLimiter.reserveGlobalQuota(BASE);
        }
        // 총 상한 도달 → 다음 전날 요청은 503
        assertThatThrownBy(() -> rateLimiter.reserveGlobalQuota(BASE))
                .isInstanceOf(EmailVerificationException.EmailSendQuotaExceededException.class);
    }

    @Test
    @DisplayName("예약한 쿼터를 복구하면 그만큼 다시 예약할 수 있다")
    void releaseRestoresReservedQuota() {
        for (int sendAttempt = 0; sendAttempt < EmailVerificationRateLimiter.DAILY_GLOBAL_LIMIT; sendAttempt++) {
            rateLimiter.reserveGlobalQuota(BASE);
        }
        // 1건 복구 → 다시 1건 예약 가능
        rateLimiter.releaseGlobalQuota(BASE);
        assertThatCode(() -> rateLimiter.reserveGlobalQuota(BASE)).doesNotThrowAnyException();
        // 다시 한도 도달 → 503
        assertThatThrownBy(() -> rateLimiter.reserveGlobalQuota(BASE))
                .isInstanceOf(EmailVerificationException.EmailSendQuotaExceededException.class);
    }

    @Test
    @DisplayName("다른 날짜의 복구 요청은 현재 카운터를 침범하지 않는다")
    void releaseIgnoresDifferentDate() {
        rateLimiter.reserveGlobalQuota(BASE);
        // 다음 날짜로 복구 시도 — 현재(BASE 날짜) 카운터를 건드리면 안 된다
        rateLimiter.releaseGlobalQuota(BASE.plusDays(1));
        // BASE 카운터는 1 그대로이므로 나머지를 더 예약한 뒤 한도 초과가 503
        for (int sendAttempt = 0; sendAttempt < EmailVerificationRateLimiter.DAILY_GLOBAL_LIMIT - 1; sendAttempt++) {
            rateLimiter.reserveGlobalQuota(BASE);
        }
        assertThatThrownBy(() -> rateLimiter.reserveGlobalQuota(BASE))
                .isInstanceOf(EmailVerificationException.EmailSendQuotaExceededException.class);
    }
}
