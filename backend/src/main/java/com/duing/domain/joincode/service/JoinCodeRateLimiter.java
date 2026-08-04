package com.duing.domain.joincode.service;

import com.duing.domain.joincode.exception.JoinRequestException;
import java.time.LocalDateTime;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

/**
 * 학생용 가입 코드 API 의 IP 레이트리밋 — in-memory, 단일 인스턴스 전제
 * ({@code PhoneVerificationRateLimiter} 와 동일 구조·전제).
 *
 * <p>코드 확인(분 30/시 200)은 비로그인도 호출할 수 있는 공개 엔드포인트라 6자 코드 공간의 무차별
 * 열거를 억제하는 것이 목적이다 — MO 상태조회와 같은 수치로, 로그인 복귀·재방문에 따른 정상 재확인은
 * 넉넉히 통과한다. 요청 생성(분 10/시 60)은 MO 발급과 같은 수치 — 1인 1회면 충분한 동작이라 좁게 잡아도
 * 캠퍼스 공유 IP 의 단체 가입을 막지 않는다. 각 창은 독립이며 <b>허용된 요청만</b> 기록한다
 * (거절 미기록 — 메모리 고갈 방지).
 *
 * <p>재시작 시 리셋은 수용한다. 만료 IP 엔트리 정리와 멀티 인스턴스 전환 시 Redis 교체는 백로그다.
 */
@Component
public class JoinCodeRateLimiter {

    static final int CHECK_PER_MINUTE_LIMIT = 30;
    static final int CHECK_PER_HOUR_LIMIT = 200;
    static final int REQUEST_CREATION_PER_MINUTE_LIMIT = 10;
    static final int REQUEST_CREATION_PER_HOUR_LIMIT = 60;

    private final ConcurrentHashMap<String, Deque<LocalDateTime>> checkTimesByIp = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Deque<LocalDateTime>> requestCreationTimesByIp =
            new ConcurrentHashMap<>();

    /** 코드 확인 IP 윈도우(분 30/시 200)를 검사하고 허용이면 기록한다. 초과 시 429. */
    public void assertAndRecordCodeCheck(String clientIp, LocalDateTime now) {
        assertAndRecordWithin(checkTimesByIp, clientIp, now, CHECK_PER_MINUTE_LIMIT, CHECK_PER_HOUR_LIMIT);
    }

    /** 가입 요청 생성 IP 윈도우(분 10/시 60)를 검사하고 허용이면 기록한다. 초과 시 429. */
    public void assertAndRecordRequestCreation(String clientIp, LocalDateTime now) {
        assertAndRecordWithin(requestCreationTimesByIp, clientIp, now,
                REQUEST_CREATION_PER_MINUTE_LIMIT, REQUEST_CREATION_PER_HOUR_LIMIT);
    }

    /**
     * 슬라이딩 윈도우 공통 로직 — 경계 exclusive(정각은 창 밖), 거절된 요청은 미기록.
     * compute 콜백이라 검사+기록이 키 단위로 원자적이다.
     */
    private void assertAndRecordWithin(ConcurrentHashMap<String, Deque<LocalDateTime>> timesByKey,
                                       String windowKey, LocalDateTime now,
                                       int perMinuteLimit, int perHourLimit) {
        LocalDateTime hourAgo = now.minusHours(1);
        LocalDateTime minuteAgo = now.minusMinutes(1);
        timesByKey.compute(windowKey, (key, requestTimes) -> {
            Deque<LocalDateTime> windowTimes = requestTimes == null ? new ArrayDeque<>() : requestTimes;
            while (!windowTimes.isEmpty() && !windowTimes.peekFirst().isAfter(hourAgo)) {
                windowTimes.pollFirst();
            }
            long lastMinuteCount = windowTimes.stream()
                    .filter(requestTime -> requestTime.isAfter(minuteAgo))
                    .count();
            if (lastMinuteCount >= perMinuteLimit || windowTimes.size() >= perHourLimit) {
                throw new JoinRequestException.JoinCodeRateLimitedException();
            }
            windowTimes.addLast(now);
            return windowTimes;
        });
    }

    /** 테스트 전용 — @SpringBootTest 컨텍스트 공유로 누적된 창을 초기화한다. 프로덕션 호출 금지. */
    public void reset() {
        checkTimesByIp.clear();
        requestCreationTimesByIp.clear();
    }
}
