package com.duing.domain.user.service;

import com.duing.domain.user.exception.PhoneVerificationException;
import java.time.LocalDateTime;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

/**
 * MO 인증 발급·상태조회 IP 레이트리밋 — in-memory, 단일 인스턴스 전제 (spec §11).
 *
 * <p>발급(분 10/시 60)은 문자 발송이 없어 이메일 인증의 발송 창(20/120)보다 좁게 잡아도 캠퍼스
 * 공유 IP 의 단체 가입을 막지 않는다 — 발급 자체는 1인 1회면 충분하고 재시도는 쿨다운(60초)이 별도로
 * 제한하기 때문이다. 상태조회(분 30/시 200)는 confirm 창 값을 계승 — 3초 폴링(분당 20회)에 다중 탭
 * 여유를 더한 값이다. 두 창은 독립이며 <b>허용된 요청만</b> 기록한다(거절 미기록 — 메모리 고갈 방지).
 *
 * <p>재시작 시 리셋은 수용한다. 만료된 IP 엔트리 정리(Caffeine expireAfterAccess 등)와 멀티 인스턴스
 * 전환 시 Redis 교체는 백로그다 (spec §11.1).
 */
@Component
public class PhoneVerificationRateLimiter {

    static final int ISSUE_PER_MINUTE_LIMIT = 10;
    static final int ISSUE_PER_HOUR_LIMIT = 60;
    static final int STATUS_PER_MINUTE_LIMIT = 30;
    static final int STATUS_PER_HOUR_LIMIT = 200;

    private final ConcurrentHashMap<String, Deque<LocalDateTime>> issueTimesByIp = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Deque<LocalDateTime>> statusTimesByIp = new ConcurrentHashMap<>();

    /** 발급 IP 윈도우(분 10/시 60)를 검사하고 허용이면 기록한다. 초과 시 429. */
    public void assertAndRecordIssueIpRequest(String clientIp, LocalDateTime now) {
        assertAndRecordWithin(issueTimesByIp, clientIp, now, ISSUE_PER_MINUTE_LIMIT, ISSUE_PER_HOUR_LIMIT);
    }

    /** 상태조회 IP 윈도우(분 30/시 200) — 폴링(3초 간격) 대비 여유를 둔다. 초과 시 429. */
    public void assertAndRecordStatusIpRequest(String clientIp, LocalDateTime now) {
        assertAndRecordWithin(statusTimesByIp, clientIp, now, STATUS_PER_MINUTE_LIMIT, STATUS_PER_HOUR_LIMIT);
    }

    /**
     * 슬라이딩 윈도우 공통 로직 — 경계 exclusive(정각은 창 밖), 거절된 요청은 미기록.
     * compute 콜백이라 검사+기록이 키 단위로 원자적이다. 예외 시 키→Deque 매핑 참조는 유지되지만
     * 콜백 안에서 이미 수행한 만료 엔트리 트리밍(pollFirst)은 Deque 내부 상태라 그대로 반영된다 —
     * 만료분 제거는 수락/거절과 무관하게 항상 옳은 동작이므로 카운트 정확성에 영향이 없다.
     */
    private void assertAndRecordWithin(ConcurrentHashMap<String, Deque<LocalDateTime>> timesByIp,
                                       String clientIp, LocalDateTime now, int perMinuteLimit, int perHourLimit) {
        LocalDateTime hourAgo = now.minusHours(1);
        LocalDateTime minuteAgo = now.minusMinutes(1);
        timesByIp.compute(clientIp, (ip, requestTimes) -> {
            Deque<LocalDateTime> windowTimes = requestTimes == null ? new ArrayDeque<>() : requestTimes;
            while (!windowTimes.isEmpty() && !windowTimes.peekFirst().isAfter(hourAgo)) {
                windowTimes.pollFirst();
            }
            long lastMinuteCount = windowTimes.stream()
                    .filter(requestTime -> requestTime.isAfter(minuteAgo))
                    .count();
            if (lastMinuteCount >= perMinuteLimit || windowTimes.size() >= perHourLimit) {
                throw new PhoneVerificationException.VerificationRateLimitedException();
            }
            windowTimes.addLast(now);
            return windowTimes;
        });
    }

    /** 테스트 전용 — @SpringBootTest 컨텍스트 공유로 누적된 창을 초기화한다. 프로덕션 호출 금지. */
    public void reset() {
        issueTimesByIp.clear();
        statusTimesByIp.clear();
    }
}
