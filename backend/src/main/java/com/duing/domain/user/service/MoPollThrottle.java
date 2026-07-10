package com.duing.domain.user.service;

import com.duing.domain.user.exception.PhoneVerificationException;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.concurrent.ConcurrentHashMap;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * Octomo 실호출 보호 장치 — in-memory, 단일 인스턴스 전제 (spec §6·11).
 *
 * <p>① 세션(token)당 최소 간격 2.5초: 프론트 3초 폴링보다 약간 짧아 정상 폴링은 통과시키되,
 * 다중 탭·과폴링이 Octomo 콜로 증폭되는 것을 막는다. ② 전역 일일 상한 1,000콜: 폭주·루프 버그로부터
 * Free 쿼터(월 1만 콜)를 보호하는 안전판 — 초과 시 503 이며 로그(ERROR→Sentry)로 Pro 전환을 판단한다.
 *
 * <p>실패한 호출도 쿼터를 소비한 것으로 둔다(반환 없음) — "보호" 목적상 과대 계상이 안전한 방향이다.
 * 완료·만료 세션의 간격 엔트리 정리와 멀티 인스턴스 대응(Redis)은 백로그다 (spec §11.1).
 */
@Slf4j
@Component
public class MoPollThrottle {

    static final Duration MIN_POLL_INTERVAL = Duration.ofMillis(2500);
    static final int DAILY_CALL_LIMIT = 1_000;

    private final ConcurrentHashMap<String, LocalDateTime> lastPolledAtByToken = new ConcurrentHashMap<>();
    private LocalDate quotaDate;
    private int dailyCallCount;
    private boolean quotaExhaustionLogged;

    /**
     * 세션당 최소 간격을 검사하고, 허용이면 이번 시각을 기록한다. compute 콜백이라 검사+기록이 원자적이다.
     * 성공 시에만 {@link #reserveDailyQuota} 를 호출하는 것이 계약이다 — 스로틀에 걸린 폴링이 일일 쿼터를
     * 소비하면 안 된다.
     */
    public boolean tryAcquire(String token, LocalDateTime now) {
        boolean[] acquired = {false};
        lastPolledAtByToken.compute(token, (key, lastPolledAt) -> {
            if (lastPolledAt == null || !now.isBefore(lastPolledAt.plus(MIN_POLL_INTERVAL))) {
                acquired[0] = true;
                return now;
            }
            return lastPolledAt;
        });
        return acquired[0];
    }

    /**
     * 전역 일일 쿼터를 예약한다 — 검사·날짜 롤오버·증가가 하나의 임계구역이라 자정 경계 동시 유입에도
     * 하루 예산을 넘지 않는다 (호출 빈도가 낮은 경로라 락 경합은 무시 가능). 날짜는 서버 시계의 로컬
     * 날짜 기준으로 전진만 한다 — 늦게 도착한 전날 요청은 현재 카운터를 소비한다(과대 계상이 안전한 방향).
     * 계약: {@link #tryAcquire} 통과 후에만 호출한다 (간격 미통과 폴링이 쿼터를 소비하지 않도록).
     */
    public synchronized void reserveDailyQuota(LocalDateTime now) {
        LocalDate requestDate = now.toLocalDate();
        if (quotaDate == null || quotaDate.isBefore(requestDate)) {
            quotaDate = requestDate;
            dailyCallCount = 0;
            quotaExhaustionLogged = false;
        }
        if (dailyCallCount >= DAILY_CALL_LIMIT) {
            if (!quotaExhaustionLogged) {
                quotaExhaustionLogged = true;
                // ERROR 는 Sentry 이벤트가 된다 — 소진 시 하루 1회만 경보한다 (스팸 방지).
                log.error("Octomo 일일 호출 상한({}건) 소진 — 인증 상태조회가 503 으로 제한된다. Pro 플랜 전환을 검토하라.",
                        DAILY_CALL_LIMIT);
            }
            throw new PhoneVerificationException.SmsPollQuotaExceededException();
        }
        dailyCallCount++;
    }

    /** 테스트 전용 — 간격 기록·일일 카운터 초기화. 프로덕션 호출 금지. */
    public synchronized void reset() {
        lastPolledAtByToken.clear();
        quotaDate = null;
        dailyCallCount = 0;
        quotaExhaustionLogged = false;
    }
}
