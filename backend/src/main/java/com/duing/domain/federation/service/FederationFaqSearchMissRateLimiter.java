package com.duing.domain.federation.service;

import java.time.LocalDateTime;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

/**
 * FAQ 무결과 검색어 <b>기록</b>의 IP 레이트리밋 — in-memory, 단일 인스턴스 전제
 * ({@code JoinCodeRateLimiter} 와 동일 구조·전제).
 *
 * <p><b>왜 필요한가</b>: 무결과 검색어 집계는 익명 공개 GET 이 트리거하는 유일한 DB write 다. 같은
 * 키워드 반복은 UNIQUE + ON CONFLICT 가 카운트 증가로 흡수하지만, <b>서로 다른 랜덤 키워드를 대량
 * 생성</b>하면 고유 키워드 수만큼 행이 늘어난다. 그 축을 막는 것이 이 창의 유일한 목적이다.
 *
 * <p><b>왜 429 를 던지지 않고 boolean 을 반환하는가 — 재논쟁 방지용 근거</b>: 기존 리미터 4종은 모두
 * "행위 자체"를 막으므로 429 가 맞다. 그러나 이 창이 막는 것은 검색이 아니라 <b>부수적인 기록</b>이다.
 * 여기서 예외를 던지면 {@link FederationFaqSearchMissRecorder} 가 선언한 불변식 "기록 실패는 절대 검색
 * 응답을 깨지 않는다(신호 유실 &lt; 검색 가용성)" 이 깨져, 공개 FAQ <b>검색 자체가 429 로 죽는다</b> —
 * 방어책이 기능을 파괴하는 정반대 결과다. 초과분은 조용히 기록만 건너뛴다. 캠퍼스 공용 NAT 에서
 * 여럿이 동시에 무결과 검색을 해도 검색은 항상 정상 동작하고 일부 집계만 유실된다.
 *
 * <p><b>한도 분 10/시 60</b>: FE 검색은 제출형(Enter·버튼)이라 키스트로크 폭주가 없고, <b>결과가 있는
 * 검색은 창을 소모하지 않는다</b>({@link FederationFaqSearchMissRecorder} 의 판정 순서 참조). 창을 쓰는
 * 것은 "0건이 난 검색"뿐이라 정상 학생은 분당 1~3회에 머문다. 레포에서 가장 좁은 IP 창(MO 발급·가입
 * 요청 생성)과 같은 수치다.
 *
 * <p><b>허용된 요청만</b> 기록한다(거절 미기록 — 메모리 고갈 방지). 재시작 시 리셋은 수용한다.
 * 만료 IP 엔트리 정리와 멀티 인스턴스 전환 시 Redis 교체는 백로그다.
 */
@Component
public class FederationFaqSearchMissRateLimiter {

    static final int PER_MINUTE_LIMIT = 10;
    static final int PER_HOUR_LIMIT = 60;

    // clientIp 를 못 얻은 요청이 키 없음으로 창을 통째로 우회하지 못하도록 한 버킷에 모은다.
    private static final String UNKNOWN_CLIENT_IP = "unknown";

    private final ConcurrentHashMap<String, Deque<LocalDateTime>> recordTimesByIp = new ConcurrentHashMap<>();

    /**
     * 무결과 기록 IP 윈도우(분 10/시 60)를 검사하고 허용이면 기록한다.
     * 경계는 exclusive(정각은 창 밖)이고, compute 콜백이라 검사+기록이 키 단위로 원자적이다.
     *
     * @return 이번 기록을 허용하면 true, 한도를 넘어 건너뛰어야 하면 false (예외를 던지지 않는다)
     */
    public boolean allowAndRecord(String clientIp, LocalDateTime now) {
        LocalDateTime hourAgo = now.minusHours(1);
        LocalDateTime minuteAgo = now.minusMinutes(1);
        String windowKey = StringUtils.hasText(clientIp) ? clientIp : UNKNOWN_CLIENT_IP;
        // compute 콜백은 값(Deque)만 반환할 수 있어 허용 여부를 홀더로 꺼낸다. 콜백이 키 단위로
        // 원자 실행되므로 이 홀더에는 경합이 없다.
        AtomicBoolean allowed = new AtomicBoolean(false);
        recordTimesByIp.compute(windowKey, (key, recordTimes) -> {
            Deque<LocalDateTime> windowTimes = recordTimes == null ? new ArrayDeque<>() : recordTimes;
            while (!windowTimes.isEmpty() && !windowTimes.peekFirst().isAfter(hourAgo)) {
                windowTimes.pollFirst();
            }
            long lastMinuteCount = windowTimes.stream()
                    .filter(recordTime -> recordTime.isAfter(minuteAgo))
                    .count();
            if (lastMinuteCount < PER_MINUTE_LIMIT && windowTimes.size() < PER_HOUR_LIMIT) {
                windowTimes.addLast(now);
                allowed.set(true);
            }
            return windowTimes;
        });
        return allowed.get();
    }

    /** 테스트 전용 — @SpringBootTest 컨텍스트 공유로 누적된 창을 초기화한다. 프로덕션 호출 금지. */
    public void reset() {
        recordTimesByIp.clear();
    }
}
