package com.duing.domain.user.service;

import com.duing.domain.user.exception.PhoneVerificationException;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.concurrent.ConcurrentHashMap;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Octomo 실호출 보호 장치 — in-memory, 단일 인스턴스 전제 (spec §6·11).
 *
 * <p>① 세션(token)당 최소 간격 — 실호출 누적 횟수에 따라 넓어지는 백오프 사다리: 처음 5콜은 2.5초
 * (프론트 3초 폴링보다 약간 짧아 정상 폴링은 통과), 8콜까지 4.5초, 이후 7.5초. 문자 수신은 대부분
 * 초반에 확인되므로 후반 간격을 넓혀 방치 세션·[지금 확인] 연타·다중 탭이 Octomo 콜로 증폭되는 것을
 * 막는다(토큰당 정상상태 분당 최대 8콜 — 워밍업 첫 1분은 빠른 티어가 겹쳐 일시적으로 ~13콜).
 * 재발급은 새 토큰이라 사다리가 처음부터 다시 시작된다 — 새 코드 직후는
 * 빠른 확인이 맞다. ② 전역 일일 상한(기본 1,000콜, {@code MO_DAILY_CALL_LIMIT} 로 조절): 폭주·루프
 * 버그로부터 벤더 쿼터(Free 월 1만 콜)를 보호하는 안전판 — 초과 시 503 이며 80% 도달 시 하루 1회
 * 조기 경보(ERROR→Sentry)를 남겨 당일 소진을 예측할 시간을 준다. <b>피크(모집 시즌) 상향은 반드시
 * 벤더 플랜(월 쿼터) 상향과 세트</b> — 상한만 올리면 월 쿼터를 며칠에 태워 월말까지 전면 장애가 된다.
 *
 * <p>벤더 호출이 실패하면 호출부가 {@link #releaseDailyQuota} 로 쿼터를 반환한다 — Octomo 장애가
 * 하루 예산을 태워 복구 후에도 503 이 지속되는 자기 소진을 막는다. 실패 콜도 사다리 단계는 전진한다
 * (장애 중 조회 빈도를 낮추는 방향이라 안전). 간격 기록은 토큰 키공간이 무한해 임계 초과 시 오래된
 * 엔트리를 지연 정리한다(무한 누적 방지). 멀티 인스턴스 대응(Redis)은 백로그다 (spec §11.1).
 */
@Slf4j
@Component
public class MoPollThrottle {

    static final Duration MIN_POLL_INTERVAL = Duration.ofMillis(2500);
    static final Duration MID_POLL_INTERVAL = Duration.ofMillis(4500);
    static final Duration SLOW_POLL_INTERVAL = Duration.ofMillis(7500);
    /** 백오프 사다리 경계 — 실호출 5콜까지 2.5초, 8콜까지 4.5초, 이후 7.5초. 프론트 폴링(3s→5s→8s)과 정렬. */
    static final int FAST_TIER_CALL_LIMIT = 5;
    static final int MID_TIER_CALL_LIMIT = 8;
    /** 간격 엔트리 지연 정리 임계 — PENDING 세션은 최대 5분이라 10분 지난 엔트리는 확실히 무의미하다. */
    static final int TOKEN_SWEEP_THRESHOLD = 10_000;
    static final Duration TOKEN_ENTRY_RETENTION = Duration.ofMinutes(10);

    /** 토큰당 폴링 창 — 마지막 실호출 시각과 누적 실호출 수(백오프 단계 판정용). */
    private record PollWindow(LocalDateTime lastPolledAt, int grantedCallCount) {}

    private final ConcurrentHashMap<String, PollWindow> pollWindowByToken = new ConcurrentHashMap<>();
    private final int dailyCallLimit;
    private final int dailyCallWarningThreshold;
    private LocalDate quotaDate;
    private int dailyCallCount;
    private boolean quotaWarningLogged;
    private boolean quotaExhaustionLogged;

    public MoPollThrottle(@Value("${mo.daily-call-limit:1000}") int dailyCallLimit) {
        this.dailyCallLimit = dailyCallLimit;
        this.dailyCallWarningThreshold = dailyCallLimit * 8 / 10;
    }

    /**
     * 세션당 최소 간격(백오프 사다리)을 검사하고, 허용이면 이번 시각·누적 횟수를 기록한다. compute
     * 콜백이라 검사+기록이 원자적이다. 성공 시에만 {@link #reserveDailyQuota} 를 호출하는 것이 계약이다 —
     * 스로틀에 걸린 폴링이 일일 쿼터를 소비하면 안 된다.
     */
    public boolean tryAcquire(String token, LocalDateTime now) {
        sweepStaleTokenEntries(now);
        boolean[] acquired = {false};
        pollWindowByToken.compute(token, (key, pollWindow) -> {
            if (pollWindow == null) {
                acquired[0] = true;
                return new PollWindow(now, 1);
            }
            Duration requiredInterval = minIntervalFor(pollWindow.grantedCallCount());
            if (!now.isBefore(pollWindow.lastPolledAt().plus(requiredInterval))) {
                acquired[0] = true;
                return new PollWindow(now, pollWindow.grantedCallCount() + 1);
            }
            return pollWindow;
        });
        return acquired[0];
    }

    private static Duration minIntervalFor(int grantedCallCount) {
        if (grantedCallCount < FAST_TIER_CALL_LIMIT) {
            return MIN_POLL_INTERVAL;
        }
        if (grantedCallCount < MID_TIER_CALL_LIMIT) {
            return MID_POLL_INTERVAL;
        }
        return SLOW_POLL_INTERVAL;
    }

    /**
     * 전역 일일 쿼터를 예약한다 — 검사·날짜 롤오버·증가가 하나의 임계구역이라 자정 경계 동시 유입에도
     * 하루 예산을 넘지 않는다 (호출 빈도가 낮은 경로라 락 경합은 무시 가능). 날짜는 호출부가 주입한
     * 시각(운영은 seoulClock=KST) 기준으로 전진만 한다 — 늦게 도착한 전날 요청은 현재 카운터를 소비한다
     * (과대 계상이 안전한 방향).
     * 계약: 폴링(exists) 경로는 {@link #tryAcquire} 통과 후에만 호출한다 (간격 미통과 폴링이 쿼터를
     * 소비하지 않도록). QR 발급 경로는 세션 간격 개념이 없어 직접 예약한다 — 어느 쪽이든 실제 Octomo
     * 콜 1건 = 예약 1건이 계약이다.
     */
    public synchronized void reserveDailyQuota(LocalDateTime now) {
        LocalDate requestDate = now.toLocalDate();
        if (quotaDate == null || quotaDate.isBefore(requestDate)) {
            quotaDate = requestDate;
            dailyCallCount = 0;
            quotaWarningLogged = false;
            quotaExhaustionLogged = false;
        }
        if (dailyCallCount >= dailyCallLimit) {
            if (!quotaExhaustionLogged) {
                quotaExhaustionLogged = true;
                // ERROR 는 Sentry 이벤트가 된다 — 소진 시 하루 1회만 경보한다 (스팸 방지).
                log.error("Octomo 일일 호출 상한({}건) 소진 — 인증 상태조회가 503 으로 제한된다. Pro 플랜 전환을 검토하라.",
                        dailyCallLimit);
            }
            throw new PhoneVerificationException.SmsPollQuotaExceededException();
        }
        dailyCallCount++;
        if (!quotaWarningLogged && dailyCallCount >= dailyCallWarningThreshold) {
            quotaWarningLogged = true;
            // 소진 전 조기 경보(하루 1회) — 당일 소진이 예상되면 대응(MO_DAILY_CALL_LIMIT 상향)을 판단할
            // 시간을 준다. 상향은 벤더 플랜(월 쿼터) 여유 확인이 선행돼야 한다.
            log.error("Octomo 일일 호출이 상한({}건)의 80% 에 도달했다 — 당일 소진이 예상되면 벤더 플랜 여유를 확인하고 MO_DAILY_CALL_LIMIT 상향을 검토하라.",
                    dailyCallLimit);
        }
    }

    /**
     * 예약한 쿼터 1건을 반환한다 — 벤더 호출 실패 시 호출부가 보상한다. 장애가 반복돼도 하루 예산이
     * 소진되지 않아, 벤더 복구 후 정상 인증이 그날 내내 503 으로 막히는 자기 소진을 방지한다
     * (구 이메일 인증 리미터의 releaseGlobalQuota 에서 온 패턴). 예약과 같은 날짜에만 반환한다.
     */
    public synchronized void releaseDailyQuota(LocalDateTime now) {
        if (quotaDate != null && quotaDate.equals(now.toLocalDate()) && dailyCallCount > 0) {
            dailyCallCount--;
        }
    }

    /**
     * 간격 엔트리 지연 정리 — 토큰은 무한 생성 가능하므로(발급 permitAll) 임계 초과 시에만 O(n) 청소한다.
     * removeIf 는 ConcurrentHashMap 에서 동시성 안전(weakly consistent)하다.
     */
    private void sweepStaleTokenEntries(LocalDateTime now) {
        if (pollWindowByToken.size() > TOKEN_SWEEP_THRESHOLD) {
            LocalDateTime cutoff = now.minus(TOKEN_ENTRY_RETENTION);
            pollWindowByToken.entrySet().removeIf(entry -> entry.getValue().lastPolledAt().isBefore(cutoff));
        }
    }

    /** 테스트 전용 — 오늘 소비된 일일 쿼터 수. 프로덕션 호출 금지. */
    public synchronized int consumedDailyCalls() {
        return dailyCallCount;
    }

    /** 테스트 전용 — 현재 추적 중인 토큰 간격 엔트리 수. */
    int trackedTokenCount() {
        return pollWindowByToken.size();
    }

    /** 테스트 전용 — 간격 기록·일일 카운터 초기화. 프로덕션 호출 금지. */
    public synchronized void reset() {
        pollWindowByToken.clear();
        quotaDate = null;
        dailyCallCount = 0;
        quotaWarningLogged = false;
        quotaExhaustionLogged = false;
    }
}
