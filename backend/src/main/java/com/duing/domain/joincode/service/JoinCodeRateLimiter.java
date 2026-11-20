package com.duing.domain.joincode.service;

import com.duing.domain.joincode.exception.JoinRequestException;
import com.duing.global.ratelimit.ClientIpKeys;
import com.duing.global.ratelimit.RateLimitMaps;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.concurrent.ConcurrentMap;
import org.springframework.stereotype.Component;

/**
 * 학생용 가입 코드 API 의 사용자·IP 레이트리밋 — in-memory, 단일 인스턴스 전제
 * ({@code PhoneVerificationRateLimiter} 와 동일 구조·전제).
 *
 * <p>코드 확인(분 30/시 200)은 비로그인도 호출할 수 있는 공개 엔드포인트라 6자 코드 공간의 무차별
 * 열거를 억제하는 것이 목적이다 — MO 상태조회의 <b>세션 토큰</b> 창과 같은 수치로(그쪽 IP 축은
 * 2026-08-30 에 백스톱으로 넓어져 분 500/시 10,000 이다), 로그인 복귀·재방문에 따른 정상 재확인은
 * 넉넉히 통과한다.
 *
 * <p><b>로그인 요청은 사용자(userId) 단위로, 비로그인 확인만 IP 단위로 센다.</b> 한 IP 로 세면 교내 NAT·CGNAT 뒤
 * 학생들이 한 창을 나눠 써 그 IP 의 인원수가 곧 가입 상한이 된다({@code PhoneVerificationRateLimiter} 의 발급 창이
 * 고친 것과 같은 추론 오류). 요청 생성(분 10/시 60)은 인증 필수라 언제나 사용자 창이다. 같은 사용자는 IP 가 바뀌어도
 * 한 창이고, 만료·위조 토큰은 익명으로 처리되므로({@code JwtAuthenticationFilter}) 그 확인은 IP 창으로 센다.
 * 비로그인 요청에서 믿을 수 있는 식별자는 접속 IP 뿐이라 그 창은 IP 로 둔다. 로그인 확인에 IP 창을 겹쳐 두지 않는
 * 것은 한 IP 의 조회 총량을 {@code ApiReadRateLimitFilter} 가 따로 묶기 때문이다 — 여기에 다시 두면 그 수치에서
 * 한 IP 의 인원수 상한이 되살아난다. 각 창은 독립이며 <b>허용된 요청만</b> 기록한다
 * (거절 미기록 — 메모리 고갈 방지).
 *
 * <p>재시작 시 리셋은 수용한다. 기록 맵은 마지막 기록 뒤 1시간(+1분 여유)이 지나면 키째 만료된다({@link RateLimitMaps}).
 * 멀티 인스턴스 전환 시 Redis 교체는 백로그다.
 */
@Component
public class JoinCodeRateLimiter {

    static final int CHECK_PER_MINUTE_LIMIT = 30;
    static final int CHECK_PER_HOUR_LIMIT = 200;
    static final int REQUEST_CREATION_PER_MINUTE_LIMIT = 10;
    static final int REQUEST_CREATION_PER_HOUR_LIMIT = 60;

    // 가장 긴 창(시간 창)이자 기록 맵 ttl — 세 맵의 판정과 만료가 이 값 하나를 쓴다(근거는 RateLimitMaps).
    private static final Duration LONGEST_WINDOW = Duration.ofHours(1);

    private final ConcurrentMap<Long, Deque<LocalDateTime>> checkTimesByUserId =
            RateLimitMaps.expiringMap(LONGEST_WINDOW);
    private final ConcurrentMap<String, Deque<LocalDateTime>> checkTimesByIp =
            RateLimitMaps.expiringMap(LONGEST_WINDOW);
    private final ConcurrentMap<Long, Deque<LocalDateTime>> requestCreationTimesByUserId =
            RateLimitMaps.expiringMap(LONGEST_WINDOW);

    /**
     * 코드 확인 윈도우(분 30/시 200)를 검사하고 허용이면 기록한다 — 로그인이면 사용자별, 비로그인({@code userId}
     * null)이면 IP 별. 초과 시 429.
     */
    public void assertAndRecordCodeCheck(Long userId, String clientIp, LocalDateTime now) {
        if (userId != null) {
            assertAndRecordWithin(checkTimesByUserId, userId, now, CHECK_PER_MINUTE_LIMIT, CHECK_PER_HOUR_LIMIT);
            return;
        }
        assertAndRecordWithin(checkTimesByIp, ClientIpKeys.normalize(clientIp), now,
                CHECK_PER_MINUTE_LIMIT, CHECK_PER_HOUR_LIMIT);
    }

    /** 가입 요청 생성 사용자별 윈도우(분 10/시 60)를 검사하고 허용이면 기록한다. 초과 시 429. */
    public void assertAndRecordRequestCreation(Long userId, LocalDateTime now) {
        assertAndRecordWithin(requestCreationTimesByUserId, userId, now,
                REQUEST_CREATION_PER_MINUTE_LIMIT, REQUEST_CREATION_PER_HOUR_LIMIT);
    }

    /**
     * 슬라이딩 윈도우 공통 로직 — 경계 exclusive(정각은 창 밖), 거절된 요청은 미기록.
     * compute 콜백이라 검사+기록이 키 단위로 원자적이다.
     */
    private <K> void assertAndRecordWithin(ConcurrentMap<K, Deque<LocalDateTime>> timesByKey,
                                           K windowKey, LocalDateTime now,
                                           int perMinuteLimit, int perHourLimit) {
        LocalDateTime hourAgo = now.minus(LONGEST_WINDOW);
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
        checkTimesByUserId.clear();
        checkTimesByIp.clear();
        requestCreationTimesByUserId.clear();
    }
}
