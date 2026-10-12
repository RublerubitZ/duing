package com.duing.domain.user.service;

import com.duing.global.ratelimit.RateLimitMaps;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.concurrent.ConcurrentMap;
import org.springframework.stereotype.Component;

/**
 * 가입되지 않은 학번의 가상 로그인 잠금 — 실계정 잠금({@link com.duing.domain.user.entity.User#recordFailedLogin},
 * 5회 → 15분)과 같은 규칙을 메모리에서 흉내 낸다(#1321 L-4).
 *
 * <p>없으면 같은 학번으로 여섯 번째 틀렸을 때 실계정은 429(잠김), 미가입 학번은 401 이라 응답만으로 가입 여부가
 * 드러난다. 규칙 상수는 호출부가 실계정과 같은 값을 넘겨 한 곳({@code GeneralUserService})에서만 정의한다.
 *
 * <p>ponytail: 24시간은 {@link RateLimitMaps} 계약의 "가장 긴 창"이 아니라 잊는 시간이라, 만료가 판정을 바꾼다.
 * 실계정 실패 카운터는 기한 없이 남으므로 "4회 실패 → 24시간 대기 → 2회" 프로브와 재시작 직후 15분(실계정 잠금은
 * DB 에 남고 가상 잠금은 사라진다)은 여전히 구분된다. IP 실패 창(분 10·시 100)이 처리량을 묶어 실익이 작다고 보고
 * 수용한다. 키 상한 2만을 넘기면 덜 쓰인 키가 초기화된다. 넓히려면 DB 테이블로 옮긴다.
 */
@Component
public class UnknownStudentLoginLock {

    private static final Duration MEMORY = Duration.ofHours(24);

    private final ConcurrentMap<String, State> stateByStudentId = RateLimitMaps.expiringMap(MEMORY);

    public boolean isLocked(String studentId, LocalDateTime now) {
        State state = stateByStudentId.get(studentId);
        return state != null && state.lockedUntil() != null && state.lockedUntil().isAfter(now);
    }

    /** {@code User#recordFailedLogin} 과 같은 규칙 — 연속 실패가 maxAttempts 에 도달하면 잠그고 카운터를 0 으로 돌린다. */
    public void recordFailure(String studentId, int maxAttempts, Duration lockDuration, LocalDateTime now) {
        stateByStudentId.compute(studentId, (key, state) -> {
            int failedAttempts = (state == null ? 0 : state.failedAttempts()) + 1;
            if (failedAttempts >= maxAttempts) {
                return new State(0, now.plus(lockDuration));
            }
            return new State(failedAttempts, state == null ? null : state.lockedUntil());
        });
    }

    /** 테스트 전용 — 프로덕션에서 호출 금지. */
    public void reset() {
        stateByStudentId.clear();
    }

    private record State(int failedAttempts, LocalDateTime lockedUntil) {
    }
}
