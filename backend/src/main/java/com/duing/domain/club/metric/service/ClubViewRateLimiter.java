package com.duing.domain.club.metric.service;

import com.duing.domain.club.exception.ClubException;
import java.time.LocalDateTime;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

/**
 * 익명 동아리 조회 기록의 IP 레이트리밋 — in-memory, 단일 인스턴스 전제
 * ({@code FederationFaqFeedbackRateLimiter} 와 동일 구조·전제).
 *
 * <p><b>이 창이 막는 것은 순위 조작이 아니라 행 증식이다.</b> 조회 기록은 인증 없이 누구나 부를 수 있고
 * dedup 키인 visitorKey 는 클라이언트가 만들어 보내므로, 키를 매번 바꾸면 하루 UNIQUE 를 비껴가
 * 무제한 INSERT 가 가능하다 — 그대로 두면 테이블·백업·쿼터가 먼저 무너진다. 창은 그 총량 상한이다.
 *
 * <p><b>순위 조작은 이 창으로 막지 않는다.</b> 막으려면 (IP, 동아리) 복합 축으로 하루 상한을 걸어야
 * 하는데, 교내 NAT 뒤에서 수백 명이 같은 IP 를 공유하는 환경에서는 정상 학생이 집단으로 잘려
 * 관심도가 오히려 실제보다 낮게 집계된다({@code LoginAttemptRateLimiter} 가 문서화한 자해와 같은 형태).
 * 동아리 29곳 규모에서 조작의 보상이 "홈 카드 4칸 중 1칸"인 것을 감안한 의도적 트레이드오프다.
 * ponytail: 조작 정황이 실제로 관측되면 (IP, 동아리) 일 상한 또는 서버 발급 방문자 쿠키로 올릴 것.
 *
 * <p>한도는 교내 NAT 를 넉넉히 통과하도록 잡았다 — 한 IP 뒤 40명이 시간당 각 25개 동아리를 열어도
 * 통과한다. 각 창은 <b>허용된 요청만</b> 기록한다(거절 미기록 — 메모리 고갈 방지).
 * 재시작 시 리셋은 수용한다. 만료 IP 엔트리 정리와 멀티 인스턴스 전환 시 Redis 교체는 백로그다.
 */
@Component
public class ClubViewRateLimiter {

    static final int PER_MINUTE_LIMIT = 100;
    static final int PER_HOUR_LIMIT = 1000;

    // clientIp 를 못 얻은 요청이 키 없음으로 창을 통째로 우회하지 못하도록 한 버킷에 모은다.
    private static final String UNKNOWN_CLIENT_IP = "unknown";

    private final ConcurrentHashMap<String, Deque<LocalDateTime>> viewTimesByIp = new ConcurrentHashMap<>();

    /**
     * 조회 기록 IP 윈도우(분 100/시 1000)를 검사하고 허용이면 기록한다. 초과 시 429.
     * 경계는 exclusive(정각은 창 밖)이고, compute 콜백이라 검사+기록이 키 단위로 원자적이다.
     */
    public void assertAndRecordView(String clientIp, LocalDateTime now) {
        LocalDateTime hourAgo = now.minusHours(1);
        LocalDateTime minuteAgo = now.minusMinutes(1);
        String windowKey = StringUtils.hasText(clientIp) ? clientIp : UNKNOWN_CLIENT_IP;
        viewTimesByIp.compute(windowKey, (key, viewTimes) -> {
            Deque<LocalDateTime> windowTimes = viewTimes == null ? new ArrayDeque<>() : viewTimes;
            while (!windowTimes.isEmpty() && !windowTimes.peekFirst().isAfter(hourAgo)) {
                windowTimes.pollFirst();
            }
            long lastMinuteCount = windowTimes.stream()
                    .filter(viewTime -> viewTime.isAfter(minuteAgo))
                    .count();
            if (lastMinuteCount >= PER_MINUTE_LIMIT || windowTimes.size() >= PER_HOUR_LIMIT) {
                throw new ClubException.ClubViewRateLimitedException();
            }
            windowTimes.addLast(now);
            return windowTimes;
        });
    }

    /** 테스트 전용 — @SpringBootTest 컨텍스트 공유로 누적된 창을 초기화한다. 프로덕션 호출 금지. */
    public void reset() {
        viewTimesByIp.clear();
    }
}
