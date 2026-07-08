package com.duing.domain.user.service;

import com.duing.domain.user.exception.UserException;
import java.time.LocalDateTime;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

/**
 * 로그인 실패 레이트리밋 — IP 단위 슬라이딩 윈도우, in-memory(단일 인스턴스 전제).
 *
 * <p>계정 단위 잠금({@link com.duing.domain.user.entity.User#recordFailedLogin})이 특정 계정에 대한
 * 표적 무차별 대입을 막는다면, 이 IP 윈도우는 한 출발지에서 여러 계정을 훑는 credential stuffing /
 * password spraying 을 제한한다.
 *
 * <p><b>실패한 로그인만 기록한다.</b> 성공 로그인까지 함께 세면, 교내 WiFi(NAT)·통신사 CGNAT 처럼
 * 다수 사용자가 하나의 공인 IP 를 공유하는 환경에서 정상 로그인만으로 시간당 한도에 도달해 그 IP 의
 * 학생 전체가 429 로 집단 차단된다(모집 오픈 피크의 자해). 스프레잉/스터핑은 본질적으로 다수의 실패를
 * 만들므로, 실패만 세어도 공격은 계속 차단하면서 정상 사용자는 성공 로그인을 무제한으로 할 수 있다.
 *
 * <p>두 단계로 강제한다. 자격 증명 확인 <em>이전</em>에 {@link #assertWithinLimit} 로 이미 초과된 IP 를
 * 조기 차단하고(비싼 BCrypt 를 아낀다), 실패가 확정되면 {@link #recordFailureOrThrow} 로 <em>원자적으로</em>
 * 검사하며 기록한다. 후자는 검사+기록을 한 번의 compute 로 처리하므로, 동시 요청이 이른 검사를 함께
 * 통과한 뒤 몰려도 윈도우가 한도를 넘겨 기록되지 않는다 — 한도에 도달하면 그 실패는 기록하지 않고 429 로
 * 돌린다. 성공 로그인은 어느 경로에서도 기록하지 않는다.
 *
 * <p><b>왜 예약·복원이 아닌가.</b> 대안으로 시작 시점에 원자적으로 예약(count++)하고 성공하면 되돌리는
 * (release) 방식({@link EmailVerificationRateLimiter} 의 전역 쿼터 패턴)이 있으나, 그 방식은 동시 요청이
 * 각자 예약을 쌓아 <em>성공 로그인</em>도 잠깐 카운트에 잡힌다. 그러면 공유 IP(교내 NAT)에서 다수가 동시에
 * <em>성공</em> 로그인하는 순간 429 가 터져, 이 클래스가 없애려던 바로 그 문제가 재발한다. 그래서 성공은
 * 어떤 순간에도 세지 않도록 "실패 시에만 원자적으로 검사·기록"으로 갔다. 남는 비용은 동시 실패 한 파도가
 * 각자 BCrypt 를 수행한 뒤에야 캡이 걸린다는 점뿐인데(이후 파도는 이른 검사에서 BCrypt 이전에 차단됨),
 * 계정 단위 잠금(5회→15분)이 계정별 무차별 대입을 별도로 막으므로 수용 가능하다.
 *
 * <p>재시작 시 카운터 리셋과 멀티 인스턴스(Redis) 대응은 백로그다. clientIp 가 비어 있으면(획득 불가)
 * 제한을 적용하지 않는다.
 */
@Component
public class LoginAttemptRateLimiter {

    static final int PER_MINUTE_LIMIT = 10;
    static final int PER_HOUR_LIMIT = 100;

    private final ConcurrentHashMap<String, Deque<LocalDateTime>> failureTimesByIp = new ConcurrentHashMap<>();

    /**
     * IP 의 최근 실패 횟수가 한도(분당·시간당)를 초과했는지 검사한다. 초과 시 429. 기록하지는 않는다.
     * 자격 증명 확인 이전에 호출해, 이미 스프레잉으로 판정된 IP 를 조기 차단한다.
     */
    public void assertWithinLimit(String clientIp, LocalDateTime now) {
        if (clientIp == null || clientIp.isBlank()) {
            return;
        }
        LocalDateTime hourAgo = now.minusHours(1);
        LocalDateTime minuteAgo = now.minusMinutes(1);
        failureTimesByIp.compute(clientIp, (ip, failureTimes) -> {
            if (failureTimes == null) {
                return null;
            }
            pruneOlderThan(failureTimes, hourAgo);
            long lastMinuteFailures = failureTimes.stream()
                    .filter(failureTime -> failureTime.isAfter(minuteAgo))
                    .count();
            if (lastMinuteFailures >= PER_MINUTE_LIMIT || failureTimes.size() >= PER_HOUR_LIMIT) {
                throw new UserException.TooManyLoginAttemptsException();
            }
            // 시간 지난 항목을 모두 비운 경우 매핑을 제거해 유휴 IP 의 빈 큐가 쌓이지 않게 한다.
            return failureTimes.isEmpty() ? null : failureTimes;
        });
    }

    /**
     * 실패한 로그인 1건을 IP 윈도우에 원자적으로 검사하며 기록한다. 존재하지 않는 계정·비밀번호 불일치·
     * 잠긴 계정 시도 등 자격 증명 실패에서만 호출한다(성공 로그인은 기록하지 않는다).
     *
     * <p>검사와 append 를 한 번의 compute 로 처리하므로, 동시 실패 요청이 이른 {@link #assertWithinLimit}
     * 를 함께 통과한 뒤 몰려도 윈도우가 한도를 넘겨 기록되지 않는다. 한도에 도달했으면 이 실패는 기록하지
     * 않고 429 를 던져, 초과분을 자격 증명 오류(401) 대신 레이트리밋으로 돌린다.
     */
    public void recordFailureOrThrow(String clientIp, LocalDateTime now) {
        if (clientIp == null || clientIp.isBlank()) {
            return;
        }
        LocalDateTime hourAgo = now.minusHours(1);
        LocalDateTime minuteAgo = now.minusMinutes(1);
        failureTimesByIp.compute(clientIp, (ip, failureTimes) -> {
            Deque<LocalDateTime> window = failureTimes == null ? new ArrayDeque<>() : failureTimes;
            pruneOlderThan(window, hourAgo);
            long lastMinuteFailures = window.stream()
                    .filter(failureTime -> failureTime.isAfter(minuteAgo))
                    .count();
            if (lastMinuteFailures >= PER_MINUTE_LIMIT || window.size() >= PER_HOUR_LIMIT) {
                // 이미 한도 도달 — 이 실패는 기록하지 않고 429 로 차단한다(throw 시 compute 는 매핑을 되돌린다).
                throw new UserException.TooManyLoginAttemptsException();
            }
            window.addLast(now);
            return window;
        });
    }

    private void pruneOlderThan(Deque<LocalDateTime> window, LocalDateTime hourAgo) {
        while (!window.isEmpty() && !window.peekFirst().isAfter(hourAgo)) {
            window.pollFirst();
        }
    }

    /**
     * 테스트 전용 — 모든 IP 카운터를 초기화한다. 프로덕션에서 호출 금지.
     */
    public void reset() {
        failureTimesByIp.clear();
    }
}
