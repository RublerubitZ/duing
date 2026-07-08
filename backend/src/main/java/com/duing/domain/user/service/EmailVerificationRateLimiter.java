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
 * 인증 메일 발송·코드 확인(confirm) 레이트리밋 — in-memory, 단일 인스턴스 전제 (spec §4.2).
 *
 * <p>발송 IP 슬라이딩 윈도우(1분 20회 / 1시간 120회)와 confirm 전용 IP 윈도우(1분 30회 / 1시간 200회)는
 * 서로 독립이며 <b>허용된 요청만</b> 기록한다. 거절(429)된 요청은 기록하지 않는다 — 단일 IP 가 무한히
 * 때려 deque 를 채우는 메모리 고갈을 막고, 허용 카운트만으로도 이메일 열거·코드 무차별 대입이
 * 충분히 제한되기 때문이다.
 *
 * <p><b>IP 한도를 캠퍼스 공유 IP 에 맞춰 잡는다.</b> 교내 WiFi(NAT)·통신사 CGNAT 뒤에서는 신입생 OT 등
 * 단체 가입 때 서로 다른 학생 다수가 한 공인 IP 를 공유한다. 발송 IP 한도가 낮으면 그 IP 의 정상 학생들이
 * 인증 메일을 못 받아 가입이 막힌다. 그래서 발송을 이메일 자체가 아니라 IP 로 촘촘히 막기보다, 실제 남용
 * 방어를 세 겹으로 두고(① @daegu.ac.kr 도메인 제한 — 외부 임의 주소로는 못 보냄, ② 이메일당 60초 재발송
 * 쿨다운 — 같은 주소 스팸 차단, ③ 전역 일일 상한 5,000건 — Resend 비용 상한) IP 창은 단체 가입 버스트를
 * 수용하도록 잡는다. 발송 시간당 120건은 100명 규모 OT 에 정상 재시도(오타 정정·중복 클릭) 여유를 더해
 * 커버하면서도, 한 IP 가 하루 최대 120×24=2,880건으로 전역 상한 5,000 을 단독으로 소진하지 못하게 한다
 * (더 큰 단체가 한 IP 를 공유하면 이 값을 올리되 전역 상한 대비 여유를 확인한다). confirm 은 메일을 보내지
 * 않아 전역 쿼터와 무관하며, 이메일당 5회 시도 제한과 짧은 코드 수명이 무차별 대입을 별도로 막으므로 더 높게 둔다.
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

    // 발송 IP 한도 — 캠퍼스 공유 IP(교내 NAT/CGNAT)의 단체 가입 버스트를 수용한다. 실제 남용은 도메인
    // 제한·이메일당 60초 쿨다운·전역 일일 상한이 막으므로, IP 창은 정상 다수 가입을 막지 않게 넉넉히 둔다.
    static final int PER_MINUTE_LIMIT = 20;
    static final int PER_HOUR_LIMIT = 120;
    static final int DAILY_GLOBAL_LIMIT = 5_000;
    // confirm(코드 확인) 전용 — 발송보다 완화한다. 메일을 보내지 않아 전역 쿼터와 무관하고, 이메일당 5회
    // 시도 제한과 짧은 코드 수명이 무차별 대입을 막으므로, 단체 가입 시 다수의 코드 확인을 넉넉히 허용한다.
    static final int CONFIRM_PER_MINUTE_LIMIT = 30;
    static final int CONFIRM_PER_HOUR_LIMIT = 200;

    private final ConcurrentHashMap<String, Deque<LocalDateTime>> requestTimesByIp = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Deque<LocalDateTime>> confirmTimesByIp = new ConcurrentHashMap<>();
    private final AtomicReference<DailyCounter> dailyCounter = new AtomicReference<>();

    /**
     * 발송 IP 윈도우(분당 5/시간당 50)를 검사하고, 허용이면 이번 요청을 기록한다. 초과 시 429.
     */
    public void assertAndRecordIpRequest(String clientIp, LocalDateTime now) {
        assertAndRecordWithin(requestTimesByIp, clientIp, now, PER_MINUTE_LIMIT, PER_HOUR_LIMIT);
    }

    /**
     * confirm(코드 확인) 전용 IP 윈도우(분당 10/시간당 100). 발송 윈도우와 독립이라
     * 이메일당 5회 시도 제한(VERIFICATION_ATTEMPT_EXCEEDED)을 가리지 않으면서, IP 단위
     * 코드 무차별 대입의 총량을 제한한다. 초과 시 429.
     */
    public void assertAndRecordConfirmIpRequest(String clientIp, LocalDateTime now) {
        assertAndRecordWithin(confirmTimesByIp, clientIp, now, CONFIRM_PER_MINUTE_LIMIT, CONFIRM_PER_HOUR_LIMIT);
    }

    /**
     * 슬라이딩 윈도우 공통 로직 — 허용된 요청만 기록한다(거절은 미기록).
     * compute 콜백은 원자적으로 실행되며, 예외 시 매핑이 변경되지 않아(거절 미기록) 안전하다.
     */
    private void assertAndRecordWithin(ConcurrentHashMap<String, Deque<LocalDateTime>> timesByIp,
                                       String clientIp, LocalDateTime now, int perMinuteLimit, int perHourLimit) {
        LocalDateTime hourAgo = now.minusHours(1);
        LocalDateTime minuteAgo = now.minusMinutes(1);
        timesByIp.compute(clientIp, (ip, requestTimes) -> {
            Deque<LocalDateTime> windowTimes = requestTimes == null ? new ArrayDeque<>() : requestTimes;
            // 1시간 지난 기록 제거 (경계 시각 정각은 윈도우 밖으로 본다 — exclusive)
            while (!windowTimes.isEmpty() && !windowTimes.peekFirst().isAfter(hourAgo)) {
                windowTimes.pollFirst();
            }
            long lastMinuteCount = windowTimes.stream()
                    .filter(requestTime -> requestTime.isAfter(minuteAgo))
                    .count();
            if (lastMinuteCount >= perMinuteLimit || windowTimes.size() >= perHourLimit) {
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

    /**
     * 테스트 전용 — 모든 카운터를 초기화한다. 프로덕션에서 호출 금지.
     * {@code @SpringBootTest} 가 이 빈을 공유하므로 통합 테스트 간 상태 격리에 쓴다.
     */
    public void reset() {
        requestTimesByIp.clear();
        confirmTimesByIp.clear();
        dailyCounter.set(null);
    }

    private record DailyCounter(LocalDate date, AtomicInteger count) {}
}
