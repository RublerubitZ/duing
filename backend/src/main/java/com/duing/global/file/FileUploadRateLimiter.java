package com.duing.global.file;

import com.duing.global.file.exception.FileException;
import java.time.LocalDateTime;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

/**
 * 파일 업로드 레이트리밋 — 사용자 단위 슬라이딩 윈도우, in-memory(단일 인스턴스 전제).
 *
 * <p>업로드는 인증 사용자만 가능하므로 사용자 id 로 제한한다. 한 사용자가 5MB 파일을 무한히 올려
 * Cloudflare R2 의 스토리지/전송 비용을 폭증시키는 재정적 DoS 를 막는다. 성공·실패와 무관하게
 * 검증 통과 직전에 시도를 기록한다.
 *
 * <p>{@link com.duing.domain.user.service.EmailVerificationRateLimiter} 의 IP 윈도우와 동일한 전략.
 * 재시작 시 카운터 리셋·멀티 인스턴스(Redis)·만료 엔트리 정리(Caffeine)는 백로그다.
 */
@Component
public class FileUploadRateLimiter {

    static final int PER_MINUTE_LIMIT = 30;
    static final int PER_HOUR_LIMIT = 200;

    private final ConcurrentHashMap<Long, Deque<LocalDateTime>> uploadTimesByUser = new ConcurrentHashMap<>();

    /**
     * 사용자 윈도우를 검사하고 허용이면 이번 업로드를 기록한다. 초과 시 429.
     * compute 콜백은 원자적으로 실행되며, 예외 시 매핑이 변경되지 않아(거절 미기록) 안전하다.
     */
    public void assertWithinLimit(Long userId, LocalDateTime now) {
        if (userId == null) {
            return;
        }
        LocalDateTime hourAgo = now.minusHours(1);
        LocalDateTime minuteAgo = now.minusMinutes(1);
        uploadTimesByUser.compute(userId, (id, uploadTimes) -> {
            Deque<LocalDateTime> windowTimes = uploadTimes == null ? new ArrayDeque<>() : uploadTimes;
            while (!windowTimes.isEmpty() && !windowTimes.peekFirst().isAfter(hourAgo)) {
                windowTimes.pollFirst();
            }
            long lastMinuteCount = windowTimes.stream()
                    .filter(uploadTime -> uploadTime.isAfter(minuteAgo))
                    .count();
            if (lastMinuteCount >= PER_MINUTE_LIMIT || windowTimes.size() >= PER_HOUR_LIMIT) {
                throw new FileException.UploadRateLimitedException();
            }
            windowTimes.addLast(now);
            return windowTimes;
        });
    }

    /** 테스트 전용 — 모든 사용자 카운터를 초기화한다. 프로덕션에서 호출 금지. */
    public void reset() {
        uploadTimesByUser.clear();
    }
}
