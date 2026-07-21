package com.duing.domain.user.service;

import com.duing.domain.user.exception.PhoneVerificationException;
import java.time.LocalDateTime;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

/**
 * MO 인증 IP 레이트리밋(발급·상태조회) + 재설정 시작 학번 리밋 — in-memory, 단일 인스턴스 전제 (spec §11).
 *
 * <p>발급(분 10/시 60)은 문자 발송이 없어 이메일 인증의 발송 창(20/120)보다 좁게 잡아도 캠퍼스
 * 공유 IP 의 단체 가입을 막지 않는다 — 발급 자체는 1인 1회면 충분하고 재시도는 쿨다운(60초)이 별도로
 * 제한하기 때문이다. 상태조회(분 30/시 200)는 confirm 창 값을 계승 — 3초 폴링(분당 20회)에 다중 탭
 * 여유를 더한 값이다. 재설정 시작(학번당 시 3회)은 IP 가 아닌 학번을 키로 잡아 계정 열거·문자 폭탄을
 * 완화한다 (spec §11 "학번 — 재설정 시작"). 번호+IP당 발급(시간당 5회)은 쿨다운(60초)과 별개의 <b>총량</b>
 * 상한 — 재발급 반복의 QR 벤더 콜·세션 덮어쓰기 남용을 봉인하며, 성공한 발급만 계수한다(검사
 * {@link #assertIssuePhoneWithinLimit} 와 기록 {@link #recordIssuePhoneRequest} 분리 — 쿨다운 429
 * 재시도가 한도를 소진해 정상 사용자가 잠기지 않도록). 키에 IP 를 섞는 이유: 번호 단독 키는 타 IP
 * 공격자가 미등록 피해자 번호로 5회 발급해 그 번호의 가입을 시간 단위로 잠그는 신규 DoS 가 된다 —
 * IP 를 섞으면 정당 소유자의 창은 남고, 단일 IP 의 남용만 캡된다(분산 공격은 일일 벤더 쿼터가 백스톱).
 * 각 창은 독립이며 <b>허용된 요청만</b> 기록한다 (거절 미기록 — 메모리 고갈 방지).
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
    static final int RESET_START_PER_HOUR_LIMIT = 3;
    static final int ISSUE_PER_PHONE_HOUR_LIMIT = 5;

    private final ConcurrentHashMap<String, Deque<LocalDateTime>> issueTimesByIp = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Deque<LocalDateTime>> statusTimesByIp = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Deque<LocalDateTime>> resetStartTimesByStudentId =
            new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Deque<LocalDateTime>> issueTimesByPhoneAndIp =
            new ConcurrentHashMap<>();

    /** 발급 IP 윈도우(분 10/시 60)를 검사하고 허용이면 기록한다. 초과 시 429. */
    public void assertAndRecordIssueIpRequest(String clientIp, LocalDateTime now) {
        assertAndRecordWithin(issueTimesByIp, clientIp, now, ISSUE_PER_MINUTE_LIMIT, ISSUE_PER_HOUR_LIMIT);
    }

    /** 상태조회 IP 윈도우(분 30/시 200) — 폴링(3초 간격) 대비 여유를 둔다. 초과 시 429. */
    public void assertAndRecordStatusIpRequest(String clientIp, LocalDateTime now) {
        assertAndRecordWithin(statusTimesByIp, clientIp, now, STATUS_PER_MINUTE_LIMIT, STATUS_PER_HOUR_LIMIT);
    }

    /** 재설정 시작 학번 윈도우(시간당 3회) — 계정 열거·문자 폭탄 완화 (spec §10.2·§11). 초과 시 429. */
    public void assertAndRecordPasswordResetStart(String studentId, LocalDateTime now) {
        assertAndRecordWithin(resetStartTimesByStudentId, studentId, now,
                RESET_START_PER_HOUR_LIMIT, RESET_START_PER_HOUR_LIMIT);
    }

    /**
     * 번호+IP당 발급 총량(시간당 5회) 검사만 한다 — 기록은 upsert 성공 후 {@link #recordIssuePhoneRequest}.
     * 검사·기록 사이의 동시 유입은 upsert 행잠금(60초 쿨다운)이 성공을 직렬화하므로 상한을 의미 있게
     * 넘지 못한다. 초과 시 429 (쿨다운과 구분되는 코드 — 사용자 안내 분리).
     */
    public void assertIssuePhoneWithinLimit(String phone, String clientIp, LocalDateTime now) {
        boolean[] limitExceeded = {false};
        issueTimesByPhoneAndIp.compute(phoneIpKey(phone, clientIp), (key, issueTimes) -> {
            if (issueTimes == null) {
                return null;
            }
            LocalDateTime hourAgo = now.minusHours(1);
            while (!issueTimes.isEmpty() && !issueTimes.peekFirst().isAfter(hourAgo)) {
                issueTimes.pollFirst();
            }
            limitExceeded[0] = issueTimes.size() >= ISSUE_PER_PHONE_HOUR_LIMIT;
            return issueTimes.isEmpty() ? null : issueTimes;
        });
        if (limitExceeded[0]) {
            throw new PhoneVerificationException.PhoneIssueLimitExceededException();
        }
    }

    /** 성공한 발급(upsert 커밋)만 번호+IP 창에 기록한다 — 쿨다운·중복 409 로 끝난 시도는 계수하지 않는다. */
    public void recordIssuePhoneRequest(String phone, String clientIp, LocalDateTime now) {
        issueTimesByPhoneAndIp.compute(phoneIpKey(phone, clientIp), (key, issueTimes) -> {
            Deque<LocalDateTime> windowTimes = issueTimes == null ? new ArrayDeque<>() : issueTimes;
            windowTimes.addLast(now);
            return windowTimes;
        });
    }

    private static String phoneIpKey(String phone, String clientIp) {
        return clientIp + "|" + phone;
    }

    /**
     * 슬라이딩 윈도우 공통 로직 — 경계 exclusive(정각은 창 밖), 거절된 요청은 미기록.
     * compute 콜백이라 검사+기록이 키 단위로 원자적이다. 예외 시 키→Deque 매핑 참조는 유지되지만
     * 콜백 안에서 이미 수행한 만료 엔트리 트리밍(pollFirst)은 Deque 내부 상태라 그대로 반영된다 —
     * 만료분 제거는 수락/거절과 무관하게 항상 옳은 동작이므로 카운트 정확성에 영향이 없다.
     */
    private void assertAndRecordWithin(ConcurrentHashMap<String, Deque<LocalDateTime>> timesByKey,
                                       String windowKey, LocalDateTime now, int perMinuteLimit, int perHourLimit) {
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
        resetStartTimesByStudentId.clear();
        issueTimesByPhoneAndIp.clear();
    }
}
