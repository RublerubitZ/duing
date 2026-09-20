package com.duing.global.privacy;

import java.time.LocalDateTime;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

/**
 * 원본 전화번호 열람 API 의 사용자 단위 레이트리밋 — in-memory, 단일 인스턴스 전제
 * ({@code JoinCodeRateLimiter}·{@code FileUploadRateLimiter} 와 같은 구조).
 *
 * <p>창의 키는 IP 가 아니라 <b>요청자 userId</b> 다. 모든 호출 경로가 인증 필수라 userId 가 항상 확정되고,
 * 교내 NAT 뒤에서는 운영진 여럿이 한 IP 를 공유해 IP 축으로 잡으면 정상 열람까지 함께 막힌다.
 *
 * <p>지원자·부원·가입 요청자 번호 열람과 번호 포함 명단 내보내기는 <b>같은 창</b>을 쓴다 — 지키려는 값이
 * "한 사람이 긁어갈 수 있는 번호 총량"이라 경로별로 창을 나누면 합산 상한이 그만큼 배가 된다. 분 30 은 지원자
 * 목록을 1초에 한 명씩 눌러도 30초를 통과하는 값이고, 시 300 은 사실상 스크래핑만 걸린다. 내보내기는 인원수가
 * 아니라 1건을 1회로 계상한다(대규모 정상 내보내기를 막지 않기 위해 — 규모는 감사 detail 의 count 가 남긴다).
 *
 * <p>슬라이딩 윈도우 본문은 기존 리미터 4개가 각자 복제해 온 코드를 그대로 옮긴 것이다 — 리미터마다 한도·예외가
 * 달라 공용 추상화를 만들지 않는 것이 이 레포의 관례다. 재시작 시 카운터 리셋은 수용하며, 만료 엔트리 정리와
 * 멀티 인스턴스 전환 시 Redis 교체는 다른 리미터들과 함께 묶인 백로그다.
 */
@Component
public class PhoneRevealRateLimiter {

    static final int PER_MINUTE_LIMIT = 30;
    static final int PER_HOUR_LIMIT = 300;

    private final ConcurrentHashMap<Long, Deque<LocalDateTime>> revealTimesByUserId = new ConcurrentHashMap<>();

    /**
     * 열람자 창(분 30/시 300)을 검사하고 허용이면 이번 열람을 기록한다. 초과 시 429.
     * compute 콜백이라 검사+기록이 키 단위로 원자적이고, 예외로 빠져나가면 매핑이 그대로라 거절은 기록되지 않는다.
     */
    public void assertAndRecord(Long userId, LocalDateTime now) {
        LocalDateTime hourAgo = now.minusHours(1);
        LocalDateTime minuteAgo = now.minusMinutes(1);
        revealTimesByUserId.compute(userId, (key, recordedTimes) -> {
            Deque<LocalDateTime> windowTimes = recordedTimes == null ? new ArrayDeque<>() : recordedTimes;
            while (!windowTimes.isEmpty() && !windowTimes.peekFirst().isAfter(hourAgo)) {
                windowTimes.pollFirst();
            }
            long lastMinuteCount = windowTimes.stream()
                    .filter(revealTime -> revealTime.isAfter(minuteAgo))
                    .count();
            if (lastMinuteCount >= PER_MINUTE_LIMIT || windowTimes.size() >= PER_HOUR_LIMIT) {
                throw new PhoneRevealRateLimitedException();
            }
            windowTimes.addLast(now);
            return windowTimes;
        });
    }

    /** 테스트 전용 — @SpringBootTest 컨텍스트 공유로 누적된 창을 초기화한다. 프로덕션 호출 금지. */
    public void reset() {
        revealTimesByUserId.clear();
    }
}
