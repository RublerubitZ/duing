package com.duing.domain.user.service;

import com.duing.domain.user.exception.PhoneVerificationException;
import java.time.LocalDateTime;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

/**
 * MO 인증 레이트리밋 — 발급은 IP 축, 상태조회는 세션(token) 축, 재설정 시작은 학번 축.
 * in-memory, 단일 인스턴스 전제 (spec §11).
 *
 * <p>발급(분 10/시 60)은 문자 발송이 없어 이메일 인증의 발송 창(20/120)보다 좁게 잡아도 캠퍼스
 * 공유 IP 의 단체 가입을 막지 않는다 — 발급 자체는 1인 1회면 충분하고 재시도는 쿨다운(60초)이 별도로
 * 제한하기 때문이다. <b>상태조회의 실제 상한은 IP 가 아니라 세션(token) 창(분 30/시 200)이다</b> —
 * 1인 폴링(3s→5s→8s, 40초 뒤 자동정지 ≈ 10회)에 다중 탭·[지금 확인] 여유를 더한 값으로, 예전에는 이
 * 값을 IP 에 걸었으나 그 근거는 <em>1인</em> 폴링량이라 교내 WiFi·통신사 CGNAT 처럼 수백 명이 한 IP 를
 * 공유하는 환경을 보지 못했다(분 30 ÷ 1인 10회 = 동시 3명, 시 200 ÷ 10 = 시간당 20명에서 정상 가입자가
 * 서로를 429 로 막는다 — {@code LoginAttemptRateLimiter} 가 문서화한 공유 IP 자해와 같은 형태).
 * IP 창(분 500/시 10,000)은 남용 백스톱으로만 남긴다 — 실재하지 않는 토큰의 스팸은 토큰 창이
 * 설치되기 전이라 이 창만이 셀 수 있고(그래서 조회보다 <b>먼저</b> 기록한다), 동시에 토큰 창은 실재하는
 * 토큰에만 설치되어 랜덤 토큰으로 맵을 증식시키는 경로를 남기지 않는다.
 * 재설정 시작(학번당 시 3회)은 IP 가 아닌 학번을 키로 잡아 계정 열거·문자 폭탄을
 * 완화한다 (spec §11 "학번 — 재설정 시작"). 번호+IP당 발급(시간당 5회)은 쿨다운(60초)과 별개의 <b>총량</b>
 * 상한 — 재발급 반복의 QR 벤더 콜·세션 덮어쓰기 남용을 봉인하며, 성공한 발급만 계수한다(검사
 * {@link #assertIssuePhoneWithinLimit} 와 기록 {@link #recordIssuePhoneRequest} 분리 — 쿨다운 429
 * 재시도가 한도를 소진해 정상 사용자가 잠기지 않도록). 키에 IP 를 섞는 이유: 번호 단독 키는 타 IP
 * 공격자가 미등록 피해자 번호로 5회 발급해 그 번호의 가입을 시간 단위로 잠그는 신규 DoS 가 된다 —
 * IP 를 섞으면 정당 소유자의 창은 남고, 단일 IP 의 남용만 캡된다(분산 공격은 일일 벤더 쿼터가 백스톱).
 * 각 창은 독립이며 <b>허용된 요청만</b> 기록한다 (거절 미기록 — 메모리 고갈 방지).
 *
 * <p>재시작 시 리셋은 수용한다. 만료된 IP·토큰 엔트리 정리(Caffeine expireAfterAccess 등)와 멀티
 * 인스턴스 전환 시 Redis 교체는 백로그다 (spec §11.1). 토큰 창은 실재하는 세션에만 설치되므로 증식
 * 상한이 실제 가입 건수라, 재시작 주기 안에서 문제가 되는 크기에 이르지 않는다.
 */
@Component
public class PhoneVerificationRateLimiter {

    static final int ISSUE_PER_MINUTE_LIMIT = 10;
    static final int ISSUE_PER_HOUR_LIMIT = 60;
    /**
     * 상태조회 IP 창 — 정상 트래픽을 재는 자가 아니라 남용 백스톱이다. 의미 있는 캡은 분 창(버스트
     * 8건/초)이고, 시간 창은 <b>정상 가입이 절대 닿지 않을 높이</b>로 잡는다 — 공유 IP 하나 뒤에서
     * 시간당 1,000명이 가입해도(1인 ≈ 10회) 걸리지 않는다. 낮게 잡으면 이 창이 다시 "공유 IP 인원수
     * 제한"으로 되돌아가 우리가 고친 바로 그 자해가 된다. 실제 가입 총량은 벤더 일일 쿼터
     * ({@code MO_DAILY_CALL_LIMIT})가 통제하며, 그것이 유일하게 의도된 상한이다.
     */
    static final int STATUS_IP_PER_MINUTE_LIMIT = 500;
    static final int STATUS_IP_PER_HOUR_LIMIT = 10_000;
    /** 상태조회 토큰 창 — 폴링의 실제 상한. 1인 폴링량 기준이므로 공유 IP 인원수와 무관하다. */
    static final int STATUS_TOKEN_PER_MINUTE_LIMIT = 30;
    static final int STATUS_TOKEN_PER_HOUR_LIMIT = 200;
    static final int RESET_START_PER_HOUR_LIMIT = 3;
    static final int ISSUE_PER_PHONE_HOUR_LIMIT = 5;

    private final ConcurrentHashMap<String, Deque<LocalDateTime>> issueTimesByIp = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Deque<LocalDateTime>> statusTimesByIp = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Deque<LocalDateTime>> statusTimesByToken = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Deque<LocalDateTime>> resetStartTimesByStudentId =
            new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Deque<LocalDateTime>> issueTimesByPhoneAndIp =
            new ConcurrentHashMap<>();

    /** 발급 IP 윈도우(분 10/시 60)를 검사하고 허용이면 기록한다. 초과 시 429. */
    public void assertAndRecordIssueIpRequest(String clientIp, LocalDateTime now) {
        assertAndRecordWithin(issueTimesByIp, clientIp, now, ISSUE_PER_MINUTE_LIMIT, ISSUE_PER_HOUR_LIMIT);
    }

    /**
     * 상태조회 IP 백스톱(분 500/시 10,000). 호출부는 <b>토큰 조회보다 먼저</b> 부른다 — 실재하지 않는
     * 토큰의 스팸을 세는 창이 이것뿐이기 때문이다(토큰 창은 404 이후라 설치되지 않는다). 초과 시 429.
     */
    public void assertAndRecordStatusIpRequest(String clientIp, LocalDateTime now) {
        assertAndRecordWithin(statusTimesByIp, clientIp, now,
                STATUS_IP_PER_MINUTE_LIMIT, STATUS_IP_PER_HOUR_LIMIT);
    }

    /**
     * 상태조회 토큰 윈도우(분 30/시 200) — 폴링의 실제 상한. 호출부는 <b>토큰 실재를 확인한 뒤</b>
     * 부른다: 랜덤 토큰마다 창이 설치되면 만료 엔트리 미정리와 겹쳐 힙이 샌다
     * ({@link #assertIssueIpWithinLimit} 가 학번 창에 대해 문서화한 것과 같은 경로). 초과 시 429.
     */
    public void assertAndRecordStatusTokenRequest(String verificationToken, LocalDateTime now) {
        assertAndRecordWithin(statusTimesByToken, verificationToken, now,
                STATUS_TOKEN_PER_MINUTE_LIMIT, STATUS_TOKEN_PER_HOUR_LIMIT);
    }

    /** 재설정 시작 학번 윈도우(시간당 3회) — 계정 열거·문자 폭탄 완화 (spec §10.2·§11). 초과 시 429. */
    public void assertAndRecordPasswordResetStart(String studentId, LocalDateTime now) {
        assertAndRecordWithin(resetStartTimesByStudentId, studentId, now,
                RESET_START_PER_HOUR_LIMIT, RESET_START_PER_HOUR_LIMIT);
    }

    /**
     * 발급 IP 윈도우(분 10/시 60) 검사만 한다 — 기록은 {@link #assertAndRecordIssueIpRequest} 가 단독으로 한다.
     *
     * <p>재설정 시작의 <b>선검사</b> 전용이다. 그 경로는 학번 키 창({@link #assertAndRecordPasswordResetStart})을
     * 먼저 설치한 뒤 issue() 안에서야 IP 창을 만나는데, 학번 창은 새 키마다 항상 통과(시간당 3회)라
     * 선검사가 없으면 비인증 요청 하나당 학번 엔트리 하나가 무조건 설치된다 — 8자리 학번 공간(1e8)과
     * 만료 엔트리 미정리가 겹쳐 단일 IP 로 힙을 고갈시킬 수 있다.
     *
     * <p>여기서 <b>기록하지 않는</b> 것은 "요청당 IP 예산 1 소모" 계약을 지키기 위해서다. 재설정 시작은
     * 모든 분기(미가입·탈퇴·placeholder·정상)가 예외 없이 issue() 를 타므로 양쪽에서 기록해도 소모량은
     * 균일하게 2가 되어 계정 열거 오라클이 생기지는 않지만, 재설정에 걸리는 실효 IP 예산이 시간당
     * 60에서 30으로 반감된다. 이 메서드가 지탱하는 방어는 계정 열거가 아니라 <b>학번 창 설치 전 게이트</b>
     * 하나뿐이라는 점을 혼동하지 말 것 — 지우면 열거가 아니라 힙이 샌다.
     */
    public void assertIssueIpWithinLimit(String clientIp, LocalDateTime now) {
        boolean[] limitExceeded = {false};
        issueTimesByIp.compute(clientIp, (key, issueTimes) -> {
            if (issueTimes == null) {
                return null;
            }
            LocalDateTime hourAgo = now.minusHours(1);
            LocalDateTime minuteAgo = now.minusMinutes(1);
            while (!issueTimes.isEmpty() && !issueTimes.peekFirst().isAfter(hourAgo)) {
                issueTimes.pollFirst();
            }
            long lastMinuteCount = issueTimes.stream()
                    .filter(issueTime -> issueTime.isAfter(minuteAgo))
                    .count();
            limitExceeded[0] = lastMinuteCount >= ISSUE_PER_MINUTE_LIMIT
                    || issueTimes.size() >= ISSUE_PER_HOUR_LIMIT;
            return issueTimes.isEmpty() ? null : issueTimes;
        });
        if (limitExceeded[0]) {
            throw new PhoneVerificationException.VerificationRateLimitedException();
        }
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
        statusTimesByToken.clear();
        resetStartTimesByStudentId.clear();
        issueTimesByPhoneAndIp.clear();
    }
}
