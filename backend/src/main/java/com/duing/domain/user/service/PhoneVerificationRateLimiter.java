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
 * <p><b>발급(분 60/시 600)도 남용 백스톱이지 1인 상한이 아니다.</b> 예전 값(분 10/시 60)의 근거는
 * "발급은 1인 1회면 충분하고 재시도는 쿨다운(60초)이 따로 막는다" 였는데, 그 논증은 <em>한 사람의
 * 재시도</em>를 다룰 뿐 <em>한 IP 뒤의 N명</em>을 다루지 않는다 — 상태조회 창에서 고친 것과 같은
 * 추론 오류라 함께 넓혔다(공유 IP 에서 분당 10명·시간당 60명이 실효 가입 상한이었다).
 * 1인 단위 통제는 이 창이 아니라 번호별 쿨다운(60초)과 번호+IP당 발급(시간당 5회)이 맡는다.
 * <b>대가를 명시해 둔다.</b> 발급은 permitAll 이고 {@code qr=true} 는 요청마다 Octomo QR 콜 1건을
 * 쓴다 — 번호를 매번 새로 주면 번호별 쿨다운도 (번호,IP) 창도 걸리지 않으므로, 단일 IP 가 <b>전역</b>
 * 일일 쿼터({@code MO_DAILY_CALL_LIMIT}, 기본 1,000)를 태우는 시간이 약 17시간에서 약 1.7시간으로
 * 줄어든다. 소진되면 전 사용자의 상태조회가 그날 503 이 된다. 이 창을 좁히면 정상 단체 가입이 먼저
 * 죽으므로 여기서 막을 문제가 아니다 — <b>후속 과제는 엣지 레이트리밋 도입</b>이며, 현재
 * {@code deploy/Caddyfile} 에 레이트리밋이 <b>없다</b> — 스톡 {@code caddy:2-alpine} 에는 해당 모듈이
 * 없어 엣지 제한은 Cloudflare 쪽에서 걸어야 한다(위임할 대상이 아직 배포돼 있지 않다는 뜻이다). 그때까지의 실질적 완화는 벤더 플랜·일일 상한 조정뿐이다. <b>상태조회의 실제 상한은 IP 가 아니라 세션(token) 창(분 30/시 200)이다</b> —
 * 1인 폴링(3s→5s→8s, [문자를 보냈어요] 이후 40초 뒤 자동정지 = 9회)에 재시도 여유를 더한 값이다.
 * 다중 탭 여유가 근거가 아니다 — 그건 IP 축 시절의 정당화였고, 토큰은 훅 내부 state 로만 살아
 * 새 탭은 새 토큰을 발급받아 이전 토큰을 무효화하며 숨겨진 탭은 폴링 자체를 하지 않는다
 * (refetchIntervalInBackground=false). 즉 탭이 늘어도 <em>한 토큰</em>의 부하는 늘지 않고,
 * 늘어나는 IP 축 트래픽은 아래 백스톱이 받는다. 예전에는 이
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
 * 인스턴스 전환 시 Redis 교체는 백로그다 (spec §11.1). 토큰 창은 실재하는 세션에만 설치되지만 그
 * 상한은 "가입 건수" 가 아니라 <b>발급되어 한 번이라도 폴링된 토큰 수</b>다 — 발급이 permitAll 이고
 * 매번 새 UUID 라 남용 시에도 자란다(엔트리당 수백 바이트~1KB — 키·deque 만 300바이트 남짓이고
 * 창 안 타임스탬프가 {@code LocalDateTime} 하나당 ≈ 72바이트씩 더 붙는다. 발급 창 600/시 기준
 * IP당 수백 KB/시). 정상 트래픽에서는 하루 수 MB 이하라 재기동 주기 안에서 무해하다. 정리가 필요해지면
 * {@link MoPollThrottle} 이 같은 토큰 키공간에 이미 쓰는 지연 sweep 패턴을 그대로 붙이면 된다.
 *
 * <p>이번 한도 상향으로 <b>IP 맵의 키당 최악값도 함께 커졌다</b> — {@code statusTimesByIp} 는 200 →
 * 10,000 엔트리(≈720KB, 50배), {@code issueTimesByIp} 는 60 → 600(10배). 일일 벤더 쿼터가 훨씬 먼저
 * 막으므로 정상 트래픽에서는 도달하지 않는 값이지만, 위 "하루 수 MB" 산정은 토큰 맵 기준이라 이 둘을
 * 포함하지 않는다. 또 {@link #assertAndRecordWithin} 은 창이 비어도 엔트리를 지우지 않는다(검사 전용
 * 형제 메서드들과 달리) — 키 공간이 IP 라 자연 유계였던 전제가, 클라이언트 IP 를 지정할 수 있는
 * 경로가 생기면 무너진다. 그 경로를 닫는 것은 {@code deploy/Caddyfile} 주석의 방화벽 항목이다.
 */
@Component
public class PhoneVerificationRateLimiter {

    static final int ISSUE_PER_MINUTE_LIMIT = 60;
    static final int ISSUE_PER_HOUR_LIMIT = 600;
    /**
     * 상태조회 IP 창 — 정상 트래픽을 재는 자가 아니라 남용 백스톱이다. 의미 있는 캡은 분 창(버스트
     * 8건/초)이고, 시간 창은 <b>정상 가입이 절대 닿지 않을 높이</b>로 잡는다 — 공유 IP 하나 뒤에서
     * 시간당 수백 명이 가입해도(1인 ≈ 10회) 걸리지 않는다. 낮게 잡으면 이 창이 다시 "공유 IP 인원수
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

    /** 발급 IP 윈도우(분 60/시 600)를 검사하고 허용이면 기록한다. 초과 시 429. */
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
     * 발급 IP 윈도우(분 60/시 600) 검사만 한다 — 기록은 {@link #assertAndRecordIssueIpRequest} 가 단독으로 한다.
     *
     * <p>재설정 시작의 <b>선검사</b> 전용이다. 그 경로는 학번 키 창({@link #assertAndRecordPasswordResetStart})을
     * 먼저 설치한 뒤 issue() 안에서야 IP 창을 만나는데, 학번 창은 새 키마다 항상 통과(시간당 3회)라
     * 선검사가 없으면 비인증 요청 하나당 학번 엔트리 하나가 무조건 설치된다 — 8자리 학번 공간(1e8)과
     * 만료 엔트리 미정리가 겹쳐 단일 IP 로 힙을 고갈시킬 수 있다.
     *
     * <p>여기서 <b>기록하지 않는</b> 것은 "요청당 IP 예산 1 소모" 계약을 지키기 위해서다. 재설정 시작은
     * 모든 분기(미가입·탈퇴·placeholder·정상)가 예외 없이 issue() 를 타므로 양쪽에서 기록해도 소모량은
     * 균일하게 2가 되어 계정 열거 오라클이 생기지는 않지만, 재설정에 걸리는 실효 IP 예산이
     * 시간당 600에서 300으로 반감된다. 이 메서드가 지탱하는 방어는 계정 열거가 아니라 <b>학번 창 설치 전 게이트</b>
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
