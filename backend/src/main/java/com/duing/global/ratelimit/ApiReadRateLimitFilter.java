package com.duing.global.ratelimit;

import com.duing.global.response.ApiResponse;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.util.Locale;
import java.util.Objects;
import java.util.OptionalInt;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.atomic.AtomicInteger;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * 조회 요청(GET·HEAD) 전체의 IP 분당 총량 상한 — in-memory, 단일 인스턴스 전제.
 *
 * <p><b>막는 것은 한 IP 가 분 단위로 이어 가는 폭주다.</b> 공개 조회는 인증 없이 누구나 부를 수 있고, 60초 캐시
 * ({@code PublicApiCacheConfig})는 같은 질의의 반복만 걷어 낸다 — 검색어·페이지·정렬을 바꿔 가며 긁으면 요청마다
 * DB 까지 닿아 Supabase egress 와 풀러 연결을 쓴다. 이 창은 한 IP 가 그렇게 쓸 수 있는 분당 총량을 묶는다
 * (1초 안에 몰아 보내는 버스트는 한도까지 그대로 통과한다 — 초 단위 제한이 아니다).
 *
 * <p><b>egress 총량 상한은 아니다.</b> 교내 NAT 뒤에서 여러 학생이 같은 IP 를 쓰므로 한도를 사람 한 명 기준으로 잡으면
 * 모집 기간에 정상 학생이 집단으로 잘린다({@code LoginAttemptRateLimiter} 가 문서화한 자해와 같은 형태).
 * 기본 한도 분당 1000건(초당 약 17건)의 근거는 운영 실측(2026-11-13, 집계만)이다 — 로그인 기록 3개월(2026-08-15~,
 * 2학기 모집 기간 포함)에서 한 IP(IPv6 는 이 필터와 같이 /64 로 묶음)를 같이 쓴 사용자는 시간당 최대 3명·하루 최대 8명이었다. 8명이 동시에 콘솔을 바쁘게
 * 써도(1인 분당 수십 건) 수백 건이라 그 몇 배의 여유를 둔 값이고, 사이트 전체 트래픽 이상 감지 기준(분당 3000)의 1/3 이다.
 * 비로그인 방문자의 IP 공유는 잰 값이 없다(조회 기록에 IP 가 없다) — 가두모집처럼 한 Wi-Fi 에 수십 명이 몰리는 날은
 * 한도에 닿을 수 있으니 그런 날은 미리 올린다. 한도 바로 아래로 종일 긁는 수집은 통과한다(하루 최대 약 144만 건).
 * shortcut: IP 한 축·분 창 하나, 느린 수집이나 여러 IP 로 나눈 수집이 실제로 관측되면 시간·일 창을 더하거나 엣지로
 * (Caddy rate_limit 은 서드파티 모듈이라 공식 이미지에 없다 — 커스텀 빌드가 필요하다)
 *
 * <p>인증 여부로 가르지 않는다 — 공개 경로는 깨진 토큰을 익명으로 처리하므로, 토큰이 있다고 면제하면 아무 값이나
 * 실어 우회할 수 있다. 경로로도 가르지 않는다 — 스프링은 경로를 디코딩해 맞추므로({@code /%61pi/v1/…} 도 컨트롤러에
 * 닿는다) 원시 URI 접두로 고르면 인코딩 한 글자로 비껴간다. 그래서 GET·HEAD 는 전부 센다(헬스체크·정적 파일 포함 —
 * 각자 자기 IP 의 창만 쓴다). 쓰기 요청은 세지 않는다(로그인·인증번호·조회 기록 등은 각자의 창이 있다).
 *
 * <p>고정 창(분 단위 카운터)이라 분 경계에서 순간적으로 한도의 2배까지 통과할 수 있다. 창은 <b>허용된 요청만</b>
 * 센다(거절은 세지 않는다 — 카운터가 한도+1 에서 멈춘다). 재시작 시 리셋은 수용한다.
 *
 * <p>보안 체인의 {@code CorsFilter} 뒤, 인증 필터 앞에 둔다({@code SecurityConfig}) — 429 응답에 CORS 헤더가 붙어
 * 브라우저가 안내를 읽을 수 있고, 거절되는 요청은 토큰 검증까지 가지 않는다.
 *
 * <p>매분 {@code TrafficSurgeMonitor} 가 {@link #drainPeakPerIpCount} 로 어느 IP 든 한 분 창에서 도달한 최대 건수를
 * 가져가 매시·일간 요약에 한도와 나란히 싣는다 — 한도가 실제 사용과 얼마나 떨어져 있는지 보는 근거다. IP 는 넘기지 않는다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ApiReadRateLimitFilter extends OncePerRequestFilter {

    static final String MESSAGE = "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.";

    // 한도 설정값을 읽지 못했을 때 켜는 한도 — 프로파일 기본값(로컬 0)이 아니라 이 상수다.
    static final int DEFAULT_LIMIT_PER_MINUTE = 1000;

    private static final Duration WINDOW = Duration.ofMinutes(1);

    // clientIp 를 못 얻은 요청이 키 없음으로 창을 통째로 우회하지 못하도록 한 버킷에 모은다.
    private static final String UNKNOWN_CLIENT_IP = "unknown";

    // ERROR 줄에 싣는 받은 값의 최대 글자 수 — .env 가 깨져 다음 줄의 값이 붙어 올 수 있고, ERROR 는 Sentry 로 나간다.
    // 자른 뒤 제어 문자는 ? 로 바꾼다 — 줄바꿈이 로그 줄을 쪼개지 않게.
    private static final int LOGGED_VALUE_MAX_LENGTH = 16;

    private final ObjectMapper objectMapper;
    private final Clock clock;

    // 0 이하면 끈다. setLimitPerMinute 가 채운다 — 비었거나 정수가 아니면 꺼지지 않고 DEFAULT_LIMIT_PER_MINUTE 로 켠다.
    // 운영에서 한도가 정상 사용자를 자르면 DUING_RATE_LIMIT_API_READ_PER_MINUTE 로 올리거나 0 으로 끄고
    // 컨테이너를 다시 만든다(docker compose up -d — restart 는 env_file 을 다시 읽지 않는다). 재배포는 필요 없다.
    private int limitPerMinute;

    // 한도 설정값을 정수로 읽지 못했으면 받은 원래 값(기동 로그용), 읽었으면 null.
    private String unreadableLimitValue;

    private final ConcurrentMap<String, MinuteCount> countsByIp = RateLimitMaps.expiringMap(WINDOW);

    // 어느 IP 든 한 분 창에서 도달한 최대 건수 — TrafficSurgeMonitor 가 매분 drainPeakPerIpCount 로 가져간다. IP 는 담지 않는다.
    private final AtomicInteger peakPerIpCount = new AtomicInteger();

    private record MinuteCount(long minute, int count) {
    }

    // 문자열로 받아 직접 읽는다 — int 로 받으면 빈 값·'1,000' 에서 기동이 실패하고 compose 가 재시작만 되풀이한다.
    @Value("${duing.rate-limit.api-read-per-minute:1000}")
    void setLimitPerMinute(String configuredLimit) {
        OptionalInt parsedLimit = parseLimit(configuredLimit);
        limitPerMinute = parsedLimit.orElse(DEFAULT_LIMIT_PER_MINUTE);
        unreadableLimitValue = parsedLimit.isPresent() ? null : Objects.requireNonNullElse(configuredLimit, "");
    }

    /** 적용 중인 분당 한도 — 0 이하면 꺼짐. */
    public int limitPerMinute() {
        return limitPerMinute;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void logStatus() {
        if (limitPerMinute <= 0) {
            log.info("[조회 요청 제한] 비활성 — 한도 0 이하(로컬·CI 기본)");
            return;
        }
        String limitText = String.format(Locale.ROOT, "%,d", limitPerMinute);
        if (unreadableLimitValue == null) {
            log.info("[조회 요청 제한] 활성 — 한 IP 분당 {}건", limitText);
            return;
        }
        log.info("[조회 요청 제한] 활성 — 한 IP 분당 {}건(설정값을 읽지 못해 기본값)", limitText);
        String loggedValue = unreadableLimitValue.substring(0,
                Math.min(unreadableLimitValue.length(), LOGGED_VALUE_MAX_LENGTH)).replaceAll("\\p{Cntrl}", "?");
        log.error("[조회 요청 제한] 한도 설정값을 정수로 읽지 못해 기본값 {}건으로 기동함 — 받은 값 '{}'({}자), 끄려면 0",
                limitText, loggedValue, String.format(Locale.ROOT, "%,d", unreadableLimitValue.length()));
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String method = request.getMethod();
        boolean readMethod = "GET".equals(method) || "HEAD".equals(method);
        return limitPerMinute <= 0 || !readMethod;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        long nowMillis = clock.millis();
        long currentMinute = nowMillis / WINDOW.toMillis();
        // 프록시 뒤에서는 forward-headers-strategy=native 가 신뢰 프록시의 X-Forwarded-For 만 반영하므로
        // getRemoteAddr() 이 위조할 수 없는 유일한 출처다(ClubController 의 조회 기록과 같은 근거).
        String clientIp = request.getRemoteAddr();
        String windowKey = StringUtils.hasText(clientIp) ? ClientIpKeys.normalize(clientIp) : UNKNOWN_CLIENT_IP;

        // compute 콜백이라 검사+기록이 키 단위로 원자적이다. 한도를 넘긴 뒤에는 한도+1 에서 멈춘다.
        MinuteCount minuteCount = countsByIp.compute(windowKey, (key, previous) -> {
            if (previous == null || previous.minute() != currentMinute) {
                return new MinuteCount(currentMinute, 1);
            }
            if (previous.count() > limitPerMinute) {
                return previous;
            }
            int nextCount = previous.count() + 1;
            if (nextCount > limitPerMinute) {
                // 그 분의 첫 거절에만 남긴다. IP 는 대역만 적는다(로그는 Sentry breadcrumb 로도 나간다) — 접근 로그가 없어
                // (Caddy·Tomcat 모두 꺼져 있다) 교내 NAT 가 잘리는지 외부 수집인지 가를 단서는 이 줄뿐이다.
                log.warn("[조회 요청 제한] 한 IP(대역 {})가 분당 한도({}건)를 넘겨 429 로 거절하기 시작함",
                        maskForLog(key), limitPerMinute);
            }
            return new MinuteCount(currentMinute, nextCount);
        });

        // 콜백 밖에서 돌려받은 창 건수로 갱신한다 — 새 창·증가·한도 초과 유지 세 분기를 한 번에 덮는다.
        recordPeak(minuteCount.count());

        if (minuteCount.count() > limitPerMinute) {
            long secondsUntilNextWindow = Math.max(1, (WINDOW.toMillis() - nowMillis % WINDOW.toMillis() + 999) / 1000);
            response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
            response.setHeader(HttpHeaders.RETRY_AFTER, String.valueOf(secondsUntilNextWindow));
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.setCharacterEncoding(StandardCharsets.UTF_8.name());
            objectMapper.writeValue(response.getWriter(), ApiResponse.error(MESSAGE));
            return;
        }
        filterChain.doFilter(request, response);
    }

    /**
     * 직전 호출 뒤로 어느 IP 든 한 분 창에서 도달한 최대 건수를 돌려주고 0 으로 되돌린다. 가져간 뒤의 증가분이 아니라 창 누적
     * 건수다(같은 창에서 더 오면 다음에 누적값). 한도를 넘기면 한도 + 1 에서 멈춘다(창 카운터가 그렇다). 한도가 꺼져 있으면 0.
     */
    public int drainPeakPerIpCount() {
        return peakPerIpCount.getAndSet(0);
    }

    // 지금 최대보다 클 때만 쓴다 — 조회마다 공유 카운터에 쓰지 않게 한다. 실패하면 다른 요청이 그새 올린 값과 다시 비교한다.
    private void recordPeak(int windowCount) {
        int currentPeak = peakPerIpCount.get();
        while (windowCount > currentPeak && !peakPerIpCount.compareAndSet(currentPeak, windowCount)) {
            currentPeak = peakPerIpCount.get();
        }
    }

    /**
     * 로그용 대역 표기 — IPv4 는 앞 세 옥텟({@code 203.0.113.x}), IPv6 는 앞 세 그룹({@code 2001:db8:1::/48}).
     * 학교 망인지 가릴 수 있을 만큼만 남긴다(통신사 대역 안의 작은 블록일 수 있어 /16 으로는 부족하다).
     */
    static String maskForLog(String windowKey) {
        boolean ipv6 = windowKey.indexOf(':') >= 0;
        char separator = ipv6 ? ':' : '.';
        int thirdSeparator = -1;
        for (int separatorCount = 0; separatorCount < 3; separatorCount++) {
            thirdSeparator = windowKey.indexOf(separator, thirdSeparator + 1);
            if (thirdSeparator < 0) {
                return UNKNOWN_CLIENT_IP;
            }
        }
        return windowKey.substring(0, thirdSeparator) + (ipv6 ? "::/48" : ".x");
    }

    /** 앞뒤 공백(줄끝 CR 포함)을 떼고 int 로 읽히면 그 값(0 이하 = 꺼짐), null·비었거나 정수가 아니거나 int 범위를 넘으면 빈 값. */
    static OptionalInt parseLimit(String configuredLimit) {
        try {
            return OptionalInt.of(Integer.parseInt(Objects.requireNonNullElse(configuredLimit, "").strip()));
        } catch (NumberFormatException unreadable) {
            return OptionalInt.empty();
        }
    }
}
