package com.duing.domain.user.service;

import com.duing.domain.user.exception.EmailVerificationException;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.stereotype.Component;

/**
 * 인증 메일 발송 레이트리밋 — in-memory, 단일 인스턴스 전제 (spec §4.2).
 *
 * <p>IP 슬라이딩 윈도우(1분 5회 / 1시간 50회)는 <b>허용된 요청만</b> 기록한다. 거절(429)된
 * 요청은 기록하지 않는다 — 단일 IP 가 무한히 때려 deque 를 채우는 메모리 고갈을 막고,
 * 허용 카운트(분당 5 / 시간당 50)만으로도 이메일 열거 시도가 충분히 제한되기 때문이다.
 *
 * <p>전역 일일 상한(5,000건)은 Resend 쿼터 보호용이며, 발송 직전에 단일 원자 연산
 * {@link #reserveGlobalQuota}로 예약한다(검사+증가 일체) — 동시 요청이 상한을 넘기는
 * TOCTOU 를 차단한다. 예약 성공 후 발송이 실패해도 쿼터는 소비된 것으로 둔다.
 *
 * <p>재시작 시 카운터 리셋은 수용한다. 만료된 IP 엔트리 정리(Caffeine expireAfterAccess
 * 등)와 멀티 인스턴스 대응(Redis)은 백로그다.
 */
@Component
public class EmailVerificationRateLimiter {

    static final int PER_MINUTE_LIMIT = 5;
    static final int PER_HOUR_LIMIT = 50;
    static final int DAILY_GLOBAL_LIMIT = 5_000;

    private final ConcurrentHashMap<String, Deque<LocalDateTime>> requestTimesByIp = new ConcurrentHashMap<>();
    private final AtomicReference<DailyCounter> dailyCounter = new AtomicReference<>();

    /**
     * IP 윈도우를 검사하고, 허용이면 이번 요청을 기록한다. 초과 시 429.
     * compute 콜백은 원자적으로 실행되며, 예외 시 매핑이 변경되지 않아(거절 미기록) 안전하다.
     */
    public void assertAndRecordIpRequest(String clientIp, LocalDateTime now) {
        LocalDateTime hourAgo = now.minusHours(1);
        LocalDateTime minuteAgo = now.minusMinutes(1);
        requestTimesByIp.compute(clientIp, (ip, requestTimes) -> {
            Deque<LocalDateTime> windowTimes = requestTimes == null ? new ArrayDeque<>() : requestTimes;
            // 1시간 지난 기록 제거 (경계 시각 정각은 윈도우 밖으로 본다 — exclusive)
            while (!windowTimes.isEmpty() && !windowTimes.peekFirst().isAfter(hourAgo)) {
                windowTimes.pollFirst();
            }
            long lastMinuteCount = windowTimes.stream()
                    .filter(requestTime -> requestTime.isAfter(minuteAgo))
                    .count();
            if (lastMinuteCount >= PER_MINUTE_LIMIT || windowTimes.size() >= PER_HOUR_LIMIT) {
                throw new EmailVerificationException.VerificationRateLimitedException();
            }
            windowTimes.addLast(now);
            return windowTimes;
        });
    }

    /**
     * 전역 일일 쿼터를 원자적으로 예약한다 (검사+증가 일체). 한도 초과 시 503.
     * 발송 직전에 호출한다 — 중복/쿨다운으로 발송에 이르지 못한 요청은 쿼터를 소비하지 않는다.
     */
    public void reserveGlobalQuota(LocalDateTime now) {
        LocalDate requestDate = now.toLocalDate();
        // 저장된 날짜가 요청 날짜보다 과거일 때만 새 카운터로 교체 — monotonic 전진.
        DailyCounter counter = dailyCounter.updateAndGet(existing ->
                (existing == null || existing.date().isBefore(requestDate))
                        ? new DailyCounter(requestDate, new AtomicInteger(0))
                        : existing);
        // 카운터가 이미 더 미래 날짜라면(자정 경계에 늦게 온 과거 요청 등) 그 카운터를 그대로 소비한다.
        // stale-date 요청을 무증가 통과시키면 일일 상한을 우회하므로, 약간의 과대 계상을 감수하고
        // 현재 카운터에 예약한다 — 쿼터 "보호" 목적상 과대 계상은 안전한 방향이다.
        int reserved = counter.count().incrementAndGet();
        if (reserved > DAILY_GLOBAL_LIMIT) {
            counter.count().decrementAndGet();
            throw new EmailVerificationException.EmailSendQuotaExceededException();
        }
    }

    /**
     * 예약된 쿼터 1건을 복구한다 — 발송 실패 시 {@link #reserveGlobalQuota} 를 보상한다.
     * 예약과 같은 날짜의 카운터에만 적용한다(자정 경계에서 다음날 카운터를 침범하지 않도록).
     */
    public void releaseGlobalQuota(LocalDateTime now) {
        DailyCounter counter = dailyCounter.get();
        if (counter != null && counter.date().equals(now.toLocalDate())) {
            counter.count().decrementAndGet();
        }
    }

    private record DailyCounter(LocalDate date, AtomicInteger count) {}
}
