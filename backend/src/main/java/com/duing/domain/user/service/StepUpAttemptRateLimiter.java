package com.duing.domain.user.service;

import com.duing.domain.user.exception.UserException;
import com.duing.global.ratelimit.RateLimitMaps;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.concurrent.ConcurrentMap;
import org.springframework.stereotype.Component;

/**
 * 현재 비밀번호 확인(step-up) 실패 제한 — 사용자(userId) 단위 슬라이딩 윈도우, in-memory(단일 인스턴스 전제).
 *
 * <p>비밀번호 변경·전화번호 변경은 현재 비밀번호를 다시 묻는다. 세션을 가진 사람(탈취한 쿠키·켜 둔 PC)이 이 확인을
 * 무제한으로 두드려 비밀번호를 추측하지 못하게 실패만 센다(#1321 L-5). 두 경로가 <b>같은 창</b>을 쓴다 — 지키는 값이
 * "한 계정에 대한 비밀번호 추측 총량"이라 경로별로 나누면 합산 상한이 배가 된다.
 *
 * <p>로그인 계정 잠금(users.locked_until)과 섞지 않는다 — 섞으면 세션을 가진 사람이 일부러 틀려 피해자의 로그인을
 * 잠글 수 있다. 성공한 확인은 세지 않는다(성공하면 두 경로 모두 전 세션을 폐기해 재로그인시킨다).
 *
 * <p>구조는 {@link LoginAttemptRateLimiter} 와 같다(이른 검사 + 실패 시 원자적 검사·기록). 리미터마다 한도·예외가
 * 달라 공용 추상화를 두지 않는다. 재시작 시 카운터 리셋은 다른 리미터와 같이 수용한다.
 */
@Component
public class StepUpAttemptRateLimiter {

    static final int PER_MINUTE_LIMIT = 5;
    static final int PER_HOUR_LIMIT = 20;

    // 가장 긴 창(시간 창)이자 기록 맵 ttl — 판정과 만료가 이 값 하나를 쓴다(근거는 RateLimitMaps).
    private static final Duration LONGEST_WINDOW = Duration.ofHours(1);

    private final ConcurrentMap<Long, Deque<LocalDateTime>> failureTimesByUserId =
            RateLimitMaps.expiringMap(LONGEST_WINDOW);

    /** 실패가 이미 한도면 429 — 비싼 BCrypt 비교 전에 부른다. 기록하지 않는다. */
    public void assertWithinLimit(Long userId, LocalDateTime now) {
        LocalDateTime hourAgo = now.minus(LONGEST_WINDOW);
        LocalDateTime minuteAgo = now.minusMinutes(1);
        failureTimesByUserId.compute(userId, (key, failureTimes) -> {
            if (failureTimes == null) {
                return null;
            }
            pruneOlderThan(failureTimes, hourAgo);
            long lastMinuteFailures = failureTimes.stream()
                    .filter(failureTime -> failureTime.isAfter(minuteAgo))
                    .count();
            if (lastMinuteFailures >= PER_MINUTE_LIMIT || failureTimes.size() >= PER_HOUR_LIMIT) {
                throw new UserException.TooManyStepUpAttemptsException();
            }
            // 시간 지난 항목을 모두 비운 경우 매핑을 제거해 유휴 사용자의 빈 큐가 쌓이지 않게 한다.
            return failureTimes.isEmpty() ? null : failureTimes;
        });
    }

    /** 확인 실패 1건을 원자적으로 검사하며 기록한다. 이미 한도면 기록하지 않고 429. */
    public void recordFailureOrThrow(Long userId, LocalDateTime now) {
        LocalDateTime hourAgo = now.minus(LONGEST_WINDOW);
        LocalDateTime minuteAgo = now.minusMinutes(1);
        failureTimesByUserId.compute(userId, (key, failureTimes) -> {
            Deque<LocalDateTime> window = failureTimes == null ? new ArrayDeque<>() : failureTimes;
            pruneOlderThan(window, hourAgo);
            long lastMinuteFailures = window.stream()
                    .filter(failureTime -> failureTime.isAfter(minuteAgo))
                    .count();
            if (lastMinuteFailures >= PER_MINUTE_LIMIT || window.size() >= PER_HOUR_LIMIT) {
                // 이미 한도 도달 — 이 실패는 기록하지 않고 429 로 막는다(throw 시 compute 는 매핑을 되돌린다).
                throw new UserException.TooManyStepUpAttemptsException();
            }
            window.addLast(now);
            return window;
        });
    }

    private void pruneOlderThan(Deque<LocalDateTime> window, LocalDateTime hourAgo) {
        while (!window.isEmpty() && !window.peekFirst().isAfter(hourAgo)) {
            window.pollFirst();
        }
    }

    /** 테스트 전용 — 프로덕션에서 호출 금지. */
    public void reset() {
        failureTimesByUserId.clear();
    }
}
