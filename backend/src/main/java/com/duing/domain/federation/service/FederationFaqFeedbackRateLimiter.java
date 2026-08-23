package com.duing.domain.federation.service;

import com.duing.domain.federation.exception.FederationFaqException;
import java.time.LocalDateTime;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

/**
 * 익명 FAQ 피드백 제출의 IP 레이트리밋 — in-memory, 단일 인스턴스 전제
 * ({@code JoinCodeRateLimiter} 와 동일 구조·전제).
 *
 * <p><b>왜 필요한가</b>: 익명 분기의 유일한 dedup 키인 sessionKey 는 클라이언트가 스스로 만들어 보내는
 * 값이다. 매 요청 다른 키를 보내면 부분 유니크 {@code uq_fff_faq_session (faq_id, session_key)} 를
 * 비껴가 같은 사람이 같은 FAQ 에 행을 무제한 INSERT 할 수 있다 — 인증·CSRF·DB 제약 중 어느 것도 이
 * 경로를 막지 않으므로 IP 창이 이 경로의 유일한 총량 상한이다.
 *
 * <p><b>왜 IP 단일 축인가</b>: 키를 (IP, FAQ) 복합으로 잡으면 공격자가 faqId 를 순회해
 * {@code 한도 × 발행 FAQ 수} 만큼 뚫려 상한이 FAQ 수에 비례해 커지고, 맵 엔트리도 FAQ 수배로 늘어난다
 * (만료 엔트리 정리는 아직 백로그라 그 자체가 메모리 부채다). IP 단일 축이면 상한이 정확히 한도다.
 * 분 30/시 200 은 레포의 관대한 공개 창(코드 확인·MO 상태조회·파일 업로드)과 같은 수치 — 한 화면
 * 20건(공개 FAQ 페이지 크기) 전량 제출에 마음 바꾸기를 더해도 정상 UX 는 넉넉히 통과한다.
 *
 * <p><b>로그인 사용자는 대상이 아니다</b>: userId 는 서버가 발급하고 {@code uq_fff_faq_user} 가 FAQ 당
 * 1행을 강제하므로 행 증식이 원천 불가다. 로그인까지 IP 로 묶으면 교내 NAT/CGNAT 공유 IP 에서 정상
 * 학생이 집단 차단되는 자해가 된다({@code LoginAttemptRateLimiter} 가 문서화한 사고와 같은 형태).
 *
 * <p>각 창은 <b>허용된 요청만</b> 기록한다(거절 미기록 — 메모리 고갈 방지). 재시작 시 리셋은 수용한다.
 * 만료 IP 엔트리 정리와 멀티 인스턴스 전환 시 Redis 교체는 백로그다.
 */
@Component
public class FederationFaqFeedbackRateLimiter {

    static final int PER_MINUTE_LIMIT = 30;
    static final int PER_HOUR_LIMIT = 200;

    // clientIp 를 못 얻은 요청이 키 없음으로 창을 통째로 우회하지 못하도록 한 버킷에 모은다.
    private static final String UNKNOWN_CLIENT_IP = "unknown";

    private final ConcurrentHashMap<String, Deque<LocalDateTime>> feedbackTimesByIp = new ConcurrentHashMap<>();

    /**
     * 익명 피드백 제출 IP 윈도우(분 30/시 200)를 검사하고 허용이면 기록한다. 초과 시 429.
     * 경계는 exclusive(정각은 창 밖)이고, compute 콜백이라 검사+기록이 키 단위로 원자적이다.
     */
    public void assertAndRecordAnonymousFeedback(String clientIp, LocalDateTime now) {
        LocalDateTime hourAgo = now.minusHours(1);
        LocalDateTime minuteAgo = now.minusMinutes(1);
        String windowKey = StringUtils.hasText(clientIp) ? clientIp : UNKNOWN_CLIENT_IP;
        feedbackTimesByIp.compute(windowKey, (key, submissionTimes) -> {
            Deque<LocalDateTime> windowTimes = submissionTimes == null ? new ArrayDeque<>() : submissionTimes;
            while (!windowTimes.isEmpty() && !windowTimes.peekFirst().isAfter(hourAgo)) {
                windowTimes.pollFirst();
            }
            long lastMinuteCount = windowTimes.stream()
                    .filter(submissionTime -> submissionTime.isAfter(minuteAgo))
                    .count();
            if (lastMinuteCount >= PER_MINUTE_LIMIT || windowTimes.size() >= PER_HOUR_LIMIT) {
                throw new FederationFaqException.FaqFeedbackRateLimitedException();
            }
            windowTimes.addLast(now);
            return windowTimes;
        });
    }

    /** 테스트 전용 — @SpringBootTest 컨텍스트 공유로 누적된 창을 초기화한다. 프로덕션 호출 금지. */
    public void reset() {
        feedbackTimesByIp.clear();
    }
}
