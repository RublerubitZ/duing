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
import java.util.concurrent.ConcurrentMap;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * 조회 요청(GET·HEAD) 전체의 IP 분당 총량 상한 — in-memory, 단일 인스턴스 전제.
 *
 * <p><b>막는 것은 한 IP 의 순간 폭주다.</b> 공개 조회는 인증 없이 누구나 부를 수 있고, 60초 캐시
 * ({@code PublicApiCacheConfig})는 같은 질의의 반복만 걷어 낸다 — 검색어·페이지·정렬을 바꿔 가며 긁으면 요청마다
 * DB 까지 닿아 Supabase egress 와 풀러 연결을 쓴다. 이 창은 한 IP 가 서버 처리량을 독차지하는 속도로 그러지 못하게 한다.
 *
 * <p><b>egress 총량 상한은 아니다.</b> 교내 NAT 뒤에서 여러 학생이 같은 IP 를 쓰므로 한도를 사람 한 명 기준으로 잡으면
 * 모집 기간에 정상 학생이 집단으로 잘린다({@code LoginAttemptRateLimiter} 가 문서화한 자해와 같은 형태).
 * 기본 한도 분당 1000건(초당 약 17건)의 근거는 운영 실측(2026-11-13, 집계만)이다 — 로그인 기록 3개월(2026-08-15~,
 * 2학기 모집 기간 포함)에서 한 IP 를 같이 쓴 사용자는 시간당 최대 3명·하루 최대 8명이었다. 8명이 동시에 콘솔을 바쁘게
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
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ApiReadRateLimitFilter extends OncePerRequestFilter {

    static final String MESSAGE = "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.";

    private static final Duration WINDOW = Duration.ofMinutes(1);

    // clientIp 를 못 얻은 요청이 키 없음으로 창을 통째로 우회하지 못하도록 한 버킷에 모은다.
    private static final String UNKNOWN_CLIENT_IP = "unknown";

    private final ObjectMapper objectMapper;
    private final Clock clock;

    // 0 이하면 끈다. 운영에서 한도가 정상 사용자를 자르면 DUING_RATE_LIMIT_API_READ_PER_MINUTE 로 올리거나 0 으로 끄고
    // 컨테이너를 다시 만든다(docker compose up -d — restart 는 env_file 을 다시 읽지 않는다). 재배포는 필요 없다.
    @Value("${duing.rate-limit.api-read-per-minute:1000}")
    private int limitPerMinute;

    private final ConcurrentMap<String, MinuteCount> countsByIp = RateLimitMaps.expiringMap(WINDOW);

    private record MinuteCount(long minute, int count) {
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

    /** 로그용 대역 표기 — IPv4 는 앞 두 옥텟({@code 203.0.x.x}), IPv6 는 앞 두 그룹({@code 2001:db8::/32}). */
    static String maskForLog(String windowKey) {
        boolean ipv6 = windowKey.indexOf(':') >= 0;
        char separator = ipv6 ? ':' : '.';
        int secondSeparator = windowKey.indexOf(separator, windowKey.indexOf(separator) + 1);
        if (secondSeparator < 0) {
            return UNKNOWN_CLIENT_IP;
        }
        return windowKey.substring(0, secondSeparator) + (ipv6 ? "::/32" : ".x.x");
    }
}
