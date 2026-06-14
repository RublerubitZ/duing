package com.duing.domain.user.service;

import com.duing.domain.user.exception.UserException;
import java.time.LocalDateTime;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

/**
 * 로그인 시도 레이트리밋 — IP 단위 슬라이딩 윈도우, in-memory(단일 인스턴스 전제).
 *
 * <p>계정 단위 잠금({@link com.duing.domain.user.entity.User#recordFailedLogin})이 특정 계정에 대한
 * 표적 무차별 대입을 막는다면, 이 IP 윈도우는 한 출발지에서 여러 계정을 훑는 credential stuffing /
 * password spraying 을 제한한다. 성공·실패를 가리지 않고 모든 로그인 시도를 기록한다.
 *
 * <p>{@link EmailVerificationRateLimiter} 의 IP 윈도우와 동일한 전략을 따른다. 재시작 시 카운터
 * 리셋과 멀티 인스턴스(Redis) 대응은 백로그다. clientIp 가 비어 있으면(획득 불가) 제한을 적용하지 않는다.
 */
@Component
public class LoginAttemptRateLimiter {

    static final int PER_MINUTE_LIMIT = 10;
    static final int PER_HOUR_LIMIT = 100;

    private final ConcurrentHashMap<String, Deque<LocalDateTime>> attemptTimesByIp = new ConcurrentHashMap<>();

    /**
     * IP 윈도우를 검사하고 허용이면 이번 시도를 기록한다. 초과 시 429.
     * compute 콜백은 원자적으로 실행되며, 예외 시 매핑이 변경되지 않아(거절 미기록) 안전하다.
     */
    public void assertAndRecordAttempt(String clientIp, LocalDateTime now) {
        if (clientIp == null || clientIp.isBlank()) {
            return;
        }
        LocalDateTime hourAgo = now.minusHours(1);
        LocalDateTime minuteAgo = now.minusMinutes(1);
        attemptTimesByIp.compute(clientIp, (ip, attemptTimes) -> {
            Deque<LocalDateTime> windowTimes = attemptTimes == null ? new ArrayDeque<>() : attemptTimes;
            while (!windowTimes.isEmpty() && !windowTimes.peekFirst().isAfter(hourAgo)) {
                windowTimes.pollFirst();
            }
            long lastMinuteCount = windowTimes.stream()
                    .filter(attemptTime -> attemptTime.isAfter(minuteAgo))
                    .count();
            if (lastMinuteCount >= PER_MINUTE_LIMIT || windowTimes.size() >= PER_HOUR_LIMIT) {
                throw new UserException.TooManyLoginAttemptsException();
            }
            windowTimes.addLast(now);
            return windowTimes;
        });
    }

    /**
     * 테스트 전용 — 모든 IP 카운터를 초기화한다. 프로덕션에서 호출 금지.
     */
    public void reset() {
        attemptTimesByIp.clear();
    }
}
