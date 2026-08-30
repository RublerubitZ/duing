package com.duing.domain.user.service;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.domain.user.exception.PhoneVerificationException;
import java.time.LocalDateTime;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class PhoneVerificationRateLimiterTest {

    private static final String CLIENT_IP = "10.0.0.1";
    private static final String STUDENT_ID = "20251234";
    private static final String TOKEN = "verification-token";
    private static final LocalDateTime NOW = LocalDateTime.of(2026, 1, 10, 12, 0);

    private final PhoneVerificationRateLimiter rateLimiter = new PhoneVerificationRateLimiter();

    @Test
    @DisplayName("같은 IP 의 발급 요청은 1분에 10회까지 허용하고 11번째는 429 를 던진다")
    void issueWindowLimitsPerMinute() {
        for (int attempt = 0; attempt < PhoneVerificationRateLimiter.ISSUE_PER_MINUTE_LIMIT; attempt++) {
            rateLimiter.assertAndRecordIssueIpRequest(CLIENT_IP, NOW.plusSeconds(attempt));
        }
        assertThatThrownBy(() -> rateLimiter.assertAndRecordIssueIpRequest(CLIENT_IP, NOW.plusSeconds(30)))
                .isInstanceOf(PhoneVerificationException.VerificationRateLimitedException.class);
    }

    @Test
    @DisplayName("1분 창을 벗어난 발급 기록은 분당 한도에서 제외된다 (시간당 한도 내라면 허용)")
    void issueMinuteWindowSlides() {
        for (int attempt = 0; attempt < PhoneVerificationRateLimiter.ISSUE_PER_MINUTE_LIMIT; attempt++) {
            rateLimiter.assertAndRecordIssueIpRequest(CLIENT_IP, NOW.plusSeconds(attempt));
        }
        assertThatCode(() -> rateLimiter.assertAndRecordIssueIpRequest(CLIENT_IP, NOW.plusMinutes(2)))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("같은 IP 의 발급 요청은 1시간에 60회를 넘을 수 없다")
    void issueWindowLimitsPerHour() {
        for (int attempt = 0; attempt < PhoneVerificationRateLimiter.ISSUE_PER_HOUR_LIMIT; attempt++) {
            // 분당 한도(10)에 걸리지 않도록 7초 간격으로 넓게 분산한다 (60회 × 7초 = 7분).
            rateLimiter.assertAndRecordIssueIpRequest(CLIENT_IP, NOW.plusSeconds(attempt * 7L));
        }
        assertThatThrownBy(() -> rateLimiter.assertAndRecordIssueIpRequest(CLIENT_IP, NOW.plusMinutes(10)))
                .isInstanceOf(PhoneVerificationException.VerificationRateLimitedException.class);
    }

    @Test
    @DisplayName("상태조회 IP 백스톱(분 500)은 발급 창과 독립이며 초과하면 429 를 던진다")
    void statusIpBackstopIsIndependent() {
        for (int attempt = 0; attempt < PhoneVerificationRateLimiter.ISSUE_PER_MINUTE_LIMIT; attempt++) {
            rateLimiter.assertAndRecordIssueIpRequest(CLIENT_IP, NOW.plusSeconds(attempt));
        }
        // 발급 창이 가득 차도 상태조회는 별도 창으로 허용된다.
        assertThatCode(() -> rateLimiter.assertAndRecordStatusIpRequest(CLIENT_IP, NOW.plusSeconds(30)))
                .doesNotThrowAnyException();

        for (int attempt = 1; attempt < PhoneVerificationRateLimiter.STATUS_IP_PER_MINUTE_LIMIT; attempt++) {
            rateLimiter.assertAndRecordStatusIpRequest(CLIENT_IP, NOW.plusSeconds(30).plusNanos(attempt));
        }
        assertThatThrownBy(() -> rateLimiter.assertAndRecordStatusIpRequest(CLIENT_IP, NOW.plusSeconds(31)))
                .isInstanceOf(PhoneVerificationException.VerificationRateLimitedException.class);
    }

    @Test
    @DisplayName("공유 IP 뒤 여러 명이 동시에 폴링해도 서로의 상태조회를 막지 않는다 — 창의 축은 IP 가 아니라 세션 토큰이다")
    void sharedIpDoesNotBlockConcurrentPollers() {
        // 교내 WiFi(NAT) 뒤 10명이 각자 40초 창에서 10회씩 폴링하는 상황 — 구 IP 창(분 30)이면 3명째에서 막혔다.
        for (int poller = 0; poller < 10; poller++) {
            String pollerToken = TOKEN + "-" + poller;
            for (int poll = 0; poll < 10; poll++) {
                LocalDateTime polledAt = NOW.plusSeconds(poll * 4L);
                // 서비스와 같은 순서 — IP 백스톱 기록 뒤 토큰 창.
                rateLimiter.assertAndRecordStatusIpRequest(CLIENT_IP, polledAt);
                assertThatCode(() -> rateLimiter.assertAndRecordStatusTokenRequest(pollerToken, polledAt))
                        .doesNotThrowAnyException();
            }
        }
    }

    @Test
    @DisplayName("한 세션의 상태조회가 분당 한도(30회)를 넘으면 429 를 던진다 — 폴링 폭주는 토큰 축에서 막는다")
    void statusTokenWindowLimitsPerMinute() {
        for (int attempt = 0; attempt < PhoneVerificationRateLimiter.STATUS_TOKEN_PER_MINUTE_LIMIT; attempt++) {
            rateLimiter.assertAndRecordStatusTokenRequest(TOKEN, NOW.plusNanos(attempt));
        }
        assertThatThrownBy(() -> rateLimiter.assertAndRecordStatusTokenRequest(TOKEN, NOW.plusSeconds(1)))
                .isInstanceOf(PhoneVerificationException.VerificationRateLimitedException.class);
    }

    @Test
    @DisplayName("다른 세션 토큰은 상태조회 제한에 서로 영향을 주지 않는다")
    void statusTokenLimitsAreIsolatedPerToken() {
        for (int attempt = 0; attempt < PhoneVerificationRateLimiter.STATUS_TOKEN_PER_MINUTE_LIMIT; attempt++) {
            rateLimiter.assertAndRecordStatusTokenRequest(TOKEN, NOW.plusNanos(attempt));
        }
        assertThatCode(() -> rateLimiter.assertAndRecordStatusTokenRequest("other-token", NOW.plusSeconds(1)))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("정확히 1분이 지난 시점의 요청은 가장 오래된 기록이 윈도우 밖으로 빠져 허용된다")
    void issueWindowBoundaryIsExclusive() {
        for (int attempt = 0; attempt < PhoneVerificationRateLimiter.ISSUE_PER_MINUTE_LIMIT; attempt++) {
            rateLimiter.assertAndRecordIssueIpRequest(CLIENT_IP, NOW.plusSeconds(attempt));
        }
        // 윈도우는 exclusive — NOW+60초 시점엔 가장 오래된 NOW+0초 기록이 윈도우 밖이라 한도 미만이 되어 허용
        assertThatCode(() -> rateLimiter.assertAndRecordIssueIpRequest(CLIENT_IP, NOW.plusSeconds(60)))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("다른 IP 는 발급 제한에 서로 영향을 주지 않는다")
    void issueLimitsAreIsolatedPerIp() {
        for (int attempt = 0; attempt < PhoneVerificationRateLimiter.ISSUE_PER_MINUTE_LIMIT; attempt++) {
            rateLimiter.assertAndRecordIssueIpRequest(CLIENT_IP, NOW.plusSeconds(attempt));
        }
        assertThatCode(() -> rateLimiter.assertAndRecordIssueIpRequest("10.0.0.2", NOW.plusSeconds(1)))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("발급 IP 창 선검사는 한도 안에서 몇 번을 호출해도 예산을 소모하지 않는다 — 기록은 발급 쪽이 단독으로 한다")
    void issueIpPreCheckDoesNotConsumeBudget() {
        for (int attempt = 0; attempt < 50; attempt++) {
            rateLimiter.assertIssueIpWithinLimit(CLIENT_IP, NOW);
        }

        // 선검사가 기록까지 했다면 여기서 이미 분당 한도(10)를 넘겨 429 가 났어야 한다.
        assertThatCode(() -> rateLimiter.assertAndRecordIssueIpRequest(CLIENT_IP, NOW))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("발급 IP 창이 가득 차면 선검사가 기록과 같은 임계에서 429 를 던진다")
    void issueIpPreCheckThrowsAtSameThreshold() {
        for (int attempt = 0; attempt < PhoneVerificationRateLimiter.ISSUE_PER_MINUTE_LIMIT; attempt++) {
            rateLimiter.assertAndRecordIssueIpRequest(CLIENT_IP, NOW.plusSeconds(attempt));
        }

        assertThatThrownBy(() -> rateLimiter.assertIssueIpWithinLimit(CLIENT_IP, NOW.plusSeconds(30)))
                .isInstanceOf(PhoneVerificationException.VerificationRateLimitedException.class);
    }

    @Test
    @DisplayName("IP 창이 막아낸 재설정 시작은 학번 창을 소모하지 않는다 — 선검사를 학번 기록보다 앞에 두는 이유")
    void blockedByIpWindowDoesNotConsumeStudentIdWindow() {
        for (int attempt = 0; attempt < PhoneVerificationRateLimiter.ISSUE_PER_MINUTE_LIMIT; attempt++) {
            rateLimiter.assertAndRecordIssueIpRequest(CLIENT_IP, NOW.plusSeconds(attempt));
        }
        // IP 창이 찬 상태에서 재설정 시작을 반복 — 서비스와 같은 순서(선검사 → 학번 기록)를 재현한다.
        for (int attempt = 0; attempt < 20; attempt++) {
            LocalDateTime blockedAt = NOW.plusSeconds(30 + attempt);
            assertThatThrownBy(() -> rateLimiter.assertIssueIpWithinLimit(CLIENT_IP, blockedAt))
                    .isInstanceOf(PhoneVerificationException.VerificationRateLimitedException.class);
        }

        // 학번 창이 온전해야 한다 — 선검사가 뒤에 있었다면 위 20회가 학번 엔트리를 설치하고 한도를 태웠을 것이다.
        for (int attempt = 0; attempt < PhoneVerificationRateLimiter.RESET_START_PER_HOUR_LIMIT; attempt++) {
            rateLimiter.assertAndRecordPasswordResetStart(STUDENT_ID, NOW.plusMinutes(2).plusSeconds(attempt));
        }
        assertThatThrownBy(() -> rateLimiter.assertAndRecordPasswordResetStart(STUDENT_ID, NOW.plusMinutes(3)))
                .isInstanceOf(PhoneVerificationException.VerificationRateLimitedException.class);
    }

    @Test
    @DisplayName("같은 학번의 재설정 시작은 시간당 3회까지 허용하고 4번째는 429 를 던진다")
    void resetStartWindowLimitsPerHour() {
        for (int attempt = 0; attempt < PhoneVerificationRateLimiter.RESET_START_PER_HOUR_LIMIT; attempt++) {
            // 분당·시간당 한도가 같은(3) 축이라 분당 창에 걸리지 않게 20분 간격으로 분산한다.
            rateLimiter.assertAndRecordPasswordResetStart(STUDENT_ID, NOW.plusMinutes(attempt * 20L));
        }
        assertThatThrownBy(() ->
                rateLimiter.assertAndRecordPasswordResetStart(STUDENT_ID, NOW.plusMinutes(50)))
                .isInstanceOf(PhoneVerificationException.VerificationRateLimitedException.class);
    }

    @Test
    @DisplayName("다른 학번은 재설정 시작 제한에 서로 영향을 주지 않는다")
    void resetStartLimitsAreIsolatedPerStudentId() {
        for (int attempt = 0; attempt < PhoneVerificationRateLimiter.RESET_START_PER_HOUR_LIMIT; attempt++) {
            rateLimiter.assertAndRecordPasswordResetStart(STUDENT_ID, NOW.plusSeconds(attempt));
        }
        assertThatCode(() -> rateLimiter.assertAndRecordPasswordResetStart("20259999", NOW.plusSeconds(1)))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("같은 번호+IP 의 성공 발급이 시간당 5회에 이르면 6번째 검사에서 429 를 던진다")
    void issuePhoneWindowLimitsPerHour() {
        for (int issued = 0; issued < PhoneVerificationRateLimiter.ISSUE_PER_PHONE_HOUR_LIMIT; issued++) {
            rateLimiter.recordIssuePhoneRequest("010-1234-5678", CLIENT_IP, NOW.plusMinutes(issued));
        }
        assertThatThrownBy(() ->
                rateLimiter.assertIssuePhoneWithinLimit("010-1234-5678", CLIENT_IP, NOW.plusMinutes(10)))
                .isInstanceOf(PhoneVerificationException.PhoneIssueLimitExceededException.class);
    }

    @Test
    @DisplayName("번호 발급 검사는 기록하지 않는다 — 쿨다운으로 끝난 재시도가 한도를 소진하지 않는다")
    void issuePhoneAssertDoesNotRecord() {
        for (int attempt = 0; attempt < 100; attempt++) {
            rateLimiter.assertIssuePhoneWithinLimit("010-1234-5678", CLIENT_IP, NOW.plusSeconds(attempt));
        }
        // 검사만 100번 해도 창은 비어 있어 여전히 허용된다.
        assertThatCode(() ->
                rateLimiter.assertIssuePhoneWithinLimit("010-1234-5678", CLIENT_IP, NOW.plusMinutes(5)))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("타 IP 의 발급 기록은 같은 번호라도 창을 공유하지 않는다 — 공격자가 소유자를 잠글 수 없다")
    void issuePhoneWindowIsIsolatedPerIp() {
        for (int issued = 0; issued < PhoneVerificationRateLimiter.ISSUE_PER_PHONE_HOUR_LIMIT; issued++) {
            rateLimiter.recordIssuePhoneRequest("010-1234-5678", "10.0.0.99", NOW.plusMinutes(issued));
        }
        // 공격자 IP(10.0.0.99)가 5회를 채워도 소유자 IP 의 발급은 허용된다.
        assertThatCode(() ->
                rateLimiter.assertIssuePhoneWithinLimit("010-1234-5678", CLIENT_IP, NOW.plusMinutes(10)))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("1시간 창을 벗어난 번호 발급 기록은 한도에서 제외되고, 다른 번호는 서로 영향이 없다")
    void issuePhoneWindowSlidesAndIsolates() {
        for (int issued = 0; issued < PhoneVerificationRateLimiter.ISSUE_PER_PHONE_HOUR_LIMIT; issued++) {
            rateLimiter.recordIssuePhoneRequest("010-1234-5678", CLIENT_IP, NOW.plusMinutes(issued));
        }
        assertThatCode(() ->
                rateLimiter.assertIssuePhoneWithinLimit("010-9999-0000", CLIENT_IP, NOW.plusMinutes(10)))
                .doesNotThrowAnyException();
        // 가장 오래된 기록(NOW)이 창 밖으로 빠지는 1시간 뒤에는 다시 허용된다.
        assertThatCode(() ->
                rateLimiter.assertIssuePhoneWithinLimit("010-1234-5678", CLIENT_IP, NOW.plusMinutes(61)))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("reset 은 모든 창을 초기화한다 (통합 테스트 격리용)")
    void resetClearsWindows() {
        for (int attempt = 0; attempt < PhoneVerificationRateLimiter.ISSUE_PER_MINUTE_LIMIT; attempt++) {
            rateLimiter.assertAndRecordIssueIpRequest(CLIENT_IP, NOW.plusSeconds(attempt));
        }
        for (int issued = 0; issued < PhoneVerificationRateLimiter.ISSUE_PER_PHONE_HOUR_LIMIT; issued++) {
            rateLimiter.recordIssuePhoneRequest("010-1234-5678", CLIENT_IP, NOW.plusMinutes(issued));
        }
        rateLimiter.reset();
        assertThatCode(() -> rateLimiter.assertAndRecordIssueIpRequest(CLIENT_IP, NOW.plusSeconds(30)))
                .doesNotThrowAnyException();
        assertThatCode(() ->
                rateLimiter.assertIssuePhoneWithinLimit("010-1234-5678", CLIENT_IP, NOW.plusSeconds(30)))
                .doesNotThrowAnyException();
    }
}
