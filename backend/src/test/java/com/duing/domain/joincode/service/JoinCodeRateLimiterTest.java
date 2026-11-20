package com.duing.domain.joincode.service;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.domain.joincode.exception.JoinRequestException;
import java.time.LocalDateTime;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * 슬라이딩 윈도우 자체의 동작(경계 exclusive·거절 미기록·키 격리)은
 * {@code PhoneVerificationRateLimiterTest} 가 검증하므로, 여기서는 세 창에 각각 어떤 키·한도가
 * 연결됐는지(수치·키 오배선)와 창 독립성만 잠근다.
 */
class JoinCodeRateLimiterTest {

    private static final Long STUDENT_ID = 1L;
    private static final Long OTHER_STUDENT_ID = 2L;
    private static final String CLIENT_IP = "10.0.0.1";
    private static final String OTHER_CLIENT_IP = "10.0.0.2";
    private static final LocalDateTime NOW = LocalDateTime.of(2026, 8, 3, 12, 0);

    private final JoinCodeRateLimiter rateLimiter = new JoinCodeRateLimiter();

    @Test
    @DisplayName("로그인 사용자의 코드 확인은 1분에 30회까지 허용하고 31번째는 429 를 던진다")
    void signedInCodeCheckLimitsPerMinute() {
        for (int attempt = 0; attempt < JoinCodeRateLimiter.CHECK_PER_MINUTE_LIMIT; attempt++) {
            rateLimiter.assertAndRecordCodeCheck(STUDENT_ID, CLIENT_IP, NOW.plusNanos(attempt));
        }
        assertThatThrownBy(() -> rateLimiter.assertAndRecordCodeCheck(STUDENT_ID, CLIENT_IP, NOW.plusSeconds(30)))
                .isInstanceOf(JoinRequestException.JoinCodeRateLimitedException.class);
    }

    @Test
    @DisplayName("로그인 사용자의 코드 확인은 1시간에 200회를 넘을 수 없다")
    void signedInCodeCheckLimitsPerHour() {
        for (int attempt = 0; attempt < JoinCodeRateLimiter.CHECK_PER_HOUR_LIMIT; attempt++) {
            // 분당 한도(30)에 걸리지 않도록 3초 간격으로 분산한다 (200회 × 3초 = 10분).
            rateLimiter.assertAndRecordCodeCheck(STUDENT_ID, CLIENT_IP, NOW.plusSeconds(attempt * 3L));
        }
        assertThatThrownBy(() -> rateLimiter.assertAndRecordCodeCheck(STUDENT_ID, CLIENT_IP, NOW.plusMinutes(15)))
                .isInstanceOf(JoinRequestException.JoinCodeRateLimitedException.class);
    }

    @Test
    @DisplayName("비로그인 코드 확인은 IP 마다 1분에 30회까지이고, 다른 IP 는 따로 센다")
    void anonymousCodeCheckLimitsPerIpPerMinute() {
        for (int attempt = 0; attempt < JoinCodeRateLimiter.CHECK_PER_MINUTE_LIMIT; attempt++) {
            rateLimiter.assertAndRecordCodeCheck(null, CLIENT_IP, NOW.plusNanos(attempt));
        }
        assertThatThrownBy(() -> rateLimiter.assertAndRecordCodeCheck(null, CLIENT_IP, NOW.plusSeconds(30)))
                .isInstanceOf(JoinRequestException.JoinCodeRateLimitedException.class);
        assertThatCode(() -> rateLimiter.assertAndRecordCodeCheck(null, OTHER_CLIENT_IP, NOW.plusSeconds(30)))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("비로그인 코드 확인은 같은 IP 에서 1시간에 200회를 넘을 수 없다")
    void anonymousCodeCheckLimitsPerIpPerHour() {
        for (int attempt = 0; attempt < JoinCodeRateLimiter.CHECK_PER_HOUR_LIMIT; attempt++) {
            rateLimiter.assertAndRecordCodeCheck(null, CLIENT_IP, NOW.plusSeconds(attempt * 3L));
        }
        assertThatThrownBy(() -> rateLimiter.assertAndRecordCodeCheck(null, CLIENT_IP, NOW.plusMinutes(15)))
                .isInstanceOf(JoinRequestException.JoinCodeRateLimitedException.class);
    }

    @Test
    @DisplayName("같은 IP 라도 로그인 확인과 비로그인 확인은 서로의 창을 쓰지 않는다")
    void signedInAndAnonymousChecksDoNotShareWindow() {
        // 비로그인 창이 가득 찬 IP 에서도 로그인 사용자는 통과한다.
        for (int attempt = 0; attempt < JoinCodeRateLimiter.CHECK_PER_MINUTE_LIMIT; attempt++) {
            rateLimiter.assertAndRecordCodeCheck(null, CLIENT_IP, NOW.plusNanos(attempt));
        }
        assertThatCode(() -> rateLimiter.assertAndRecordCodeCheck(STUDENT_ID, CLIENT_IP, NOW.plusSeconds(1)))
                .doesNotThrowAnyException();

        // 로그인 사용자가 자기 창을 다 쓴 IP 에서도 비로그인 방문자는 통과한다.
        for (int attempt = 0; attempt < JoinCodeRateLimiter.CHECK_PER_MINUTE_LIMIT; attempt++) {
            rateLimiter.assertAndRecordCodeCheck(OTHER_STUDENT_ID, OTHER_CLIENT_IP, NOW.plusNanos(attempt));
        }
        assertThatCode(() -> rateLimiter.assertAndRecordCodeCheck(null, OTHER_CLIENT_IP, NOW.plusSeconds(1)))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("같은 사용자의 코드 확인은 IP 가 바뀌어도 한 창으로 센다")
    void signedInCodeCheckIgnoresClientIp() {
        for (int attempt = 0; attempt < JoinCodeRateLimiter.CHECK_PER_MINUTE_LIMIT; attempt++) {
            rateLimiter.assertAndRecordCodeCheck(STUDENT_ID, "10.0.1." + (attempt + 1), NOW.plusNanos(attempt));
        }
        assertThatThrownBy(() -> rateLimiter.assertAndRecordCodeCheck(STUDENT_ID, "10.0.2.1", NOW.plusSeconds(30)))
                .isInstanceOf(JoinRequestException.JoinCodeRateLimitedException.class);
    }

    @Test
    @DisplayName("가입 요청 생성은 사용자마다 1분에 10회까지이고, 다른 사용자는 따로 센다")
    void requestCreationLimitsPerUserPerMinute() {
        for (int attempt = 0; attempt < JoinCodeRateLimiter.REQUEST_CREATION_PER_MINUTE_LIMIT; attempt++) {
            rateLimiter.assertAndRecordRequestCreation(STUDENT_ID, NOW.plusNanos(attempt));
        }
        assertThatThrownBy(() -> rateLimiter.assertAndRecordRequestCreation(STUDENT_ID, NOW.plusSeconds(2)))
                .isInstanceOf(JoinRequestException.JoinCodeRateLimitedException.class);
        assertThatCode(() -> rateLimiter.assertAndRecordRequestCreation(OTHER_STUDENT_ID, NOW.plusSeconds(2)))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("같은 사용자의 가입 요청 생성은 1시간에 60회를 넘을 수 없다")
    void requestCreationLimitsPerUserPerHour() {
        for (int attempt = 0; attempt < JoinCodeRateLimiter.REQUEST_CREATION_PER_HOUR_LIMIT; attempt++) {
            // 분당 한도(10)에 걸리지 않도록 7초 간격으로 분산한다 (60회 × 7초 = 7분).
            rateLimiter.assertAndRecordRequestCreation(STUDENT_ID, NOW.plusSeconds(attempt * 7L));
        }
        assertThatThrownBy(() -> rateLimiter.assertAndRecordRequestCreation(STUDENT_ID, NOW.plusMinutes(10)))
                .isInstanceOf(JoinRequestException.JoinCodeRateLimitedException.class);
    }

    @Test
    @DisplayName("같은 사용자라도 가입 요청 생성 창(분 10/시 60)은 코드 확인 창과 독립이다")
    void requestCreationWindowIsIndependent() {
        for (int attempt = 0; attempt < JoinCodeRateLimiter.CHECK_PER_MINUTE_LIMIT; attempt++) {
            rateLimiter.assertAndRecordCodeCheck(STUDENT_ID, CLIENT_IP, NOW.plusNanos(attempt));
        }
        // 확인 창이 가득 차도 요청 생성은 별도 창으로 허용된다.
        assertThatCode(() -> rateLimiter.assertAndRecordRequestCreation(STUDENT_ID, NOW.plusSeconds(1)))
                .doesNotThrowAnyException();

        for (int attempt = 1; attempt < JoinCodeRateLimiter.REQUEST_CREATION_PER_MINUTE_LIMIT; attempt++) {
            rateLimiter.assertAndRecordRequestCreation(STUDENT_ID, NOW.plusSeconds(1).plusNanos(attempt));
        }
        assertThatThrownBy(() -> rateLimiter.assertAndRecordRequestCreation(STUDENT_ID, NOW.plusSeconds(2)))
                .isInstanceOf(JoinRequestException.JoinCodeRateLimitedException.class);
    }

    @Test
    @DisplayName("reset 은 세 창을 모두 초기화한다 (통합 테스트 격리용)")
    void resetClearsAllWindows() {
        for (int attempt = 0; attempt < JoinCodeRateLimiter.CHECK_PER_MINUTE_LIMIT; attempt++) {
            rateLimiter.assertAndRecordCodeCheck(null, CLIENT_IP, NOW.plusNanos(attempt));
            rateLimiter.assertAndRecordCodeCheck(STUDENT_ID, CLIENT_IP, NOW.plusNanos(attempt));
        }
        for (int attempt = 0; attempt < JoinCodeRateLimiter.REQUEST_CREATION_PER_MINUTE_LIMIT; attempt++) {
            rateLimiter.assertAndRecordRequestCreation(STUDENT_ID, NOW.plusNanos(attempt));
        }
        rateLimiter.reset();

        assertThatCode(() -> rateLimiter.assertAndRecordCodeCheck(null, CLIENT_IP, NOW.plusSeconds(1)))
                .doesNotThrowAnyException();
        assertThatCode(() -> rateLimiter.assertAndRecordCodeCheck(STUDENT_ID, CLIENT_IP, NOW.plusSeconds(1)))
                .doesNotThrowAnyException();
        assertThatCode(() -> rateLimiter.assertAndRecordRequestCreation(STUDENT_ID, NOW.plusSeconds(1)))
                .doesNotThrowAnyException();
    }
}
