package com.duing.global.frontend;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * 프론트(Next.js) 페이지 재생성 요청기 — 백엔드 데이터가 정각에 바뀌는 공개 페이지를 그 직후 다시 만들게 한다.
 * 지금 호출부는 추천순 정각 셔플에 맞춘 동아리 탐색({@code /clubs}) 하나다({@code ClubMetricRefreshJob}).
 *
 * <p>흐름: {@code POST /api/internal/revalidate}(Bearer 비밀값) → 2xx 면 1초 뒤 그 페이지를 GET(warm-up).
 * 무효화 뒤 첫 요청이 재생성을 일으키므로 그 요청을 백엔드가 대신 맞는다 — 실제 사용자는 새 HTML 을 받는다.
 * 1초는 CDN 무효화가 전 지역에 퍼지는 시간(약 300ms)의 여유다. warm-up 응답의 캐시 상태 헤더를 INFO 로 남겨
 * 운영에서 확인한다 — 옛 엔트리를 그대로 받은 HIT 이 반복되면 대기를 늘린다.
 *
 * <p>격리가 계약이다: {@link #revalidate} 는 어떤 경우에도 예외를 던지지 않고 재시도하지 않는다 — 다음 정각에
 * 다시 돌고, 프론트는 자체 재생성 주기를 안전망으로 둔다. 성공 판정은 2xx 만이다 — RestClient 기본 오류 판정은
 * 4xx/5xx 만 예외로 만들어 3xx 가 성공처럼 통과하므로({@code SimpleClientHttpRequestFactory} 는 POST 리다이렉트를
 * 따라가지 않는다), 상태 핸들러를 거치지 않는 {@code exchange} 로 상태를 직접 판정한다.
 *
 * <p>로깅 정책({@code SlackNotifier} 관례): 상태 코드·예외 클래스명만 남긴다. 예외 메시지에는 요청 URL·응답 본문이
 * 섞이므로 싣지 않고, 비밀값·Authorization 은 어디에도 남기지 않는다.
 *
 * <p>운영에서 비밀값 누락은 부팅 실패가 아니라 비활성이다 — 부팅 직후 상태를 한 줄 남겨 사일런트 결손을 드러낸다.
 */
@Slf4j
@Component
public class FrontendRevalidator {

    static final String REVALIDATE_ENDPOINT = "/api/internal/revalidate";
    /** 기본 Java UA 는 봇 차단 규칙에 걸릴 수 있어 명시한다. */
    static final String USER_AGENT = "DuingBackend-Revalidator/1.0";
    private static final Duration WARM_UP_DELAY = Duration.ofSeconds(1);

    private final boolean enabled;
    private final String authorization;
    private final RestClient frontendRevalidationRestClient;
    private final ObjectMapper objectMapper;

    public FrontendRevalidator(FrontendRevalidationProperties frontendRevalidationProperties,
            RestClient frontendRevalidationRestClient, ObjectMapper objectMapper) {
        this.enabled = frontendRevalidationProperties.enabled();
        this.authorization = enabled ? "Bearer " + frontendRevalidationProperties.revalidateSecret() : null;
        this.frontendRevalidationRestClient = frontendRevalidationRestClient;
        this.objectMapper = objectMapper;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void logStatus() {
        if (enabled) {
            log.info("[프론트 재생성 트리거] 활성 — 매시 정각 /clubs 재생성을 요청한다.");
        } else {
            log.warn("[프론트 재생성 트리거] 비활성 — DUING_FRONTEND_REVALIDATE_SECRET 미설정이거나 "
                    + "DUING_FRONTEND_BASE_URL 이 비었거나 절대 http(s) 주소가 아니다. "
                    + "로컬·CI 는 정상이며, 운영이라면 서버 .env 를 확인하라.");
        }
    }

    /** {@code path} 페이지 재생성을 요청하고 warm-up 한다. 비활성이면 즉시 반환. 절대 예외를 던지지 않는다. */
    public void revalidate(String path) {
        if (!enabled) {
            log.debug("프론트 재생성 트리거 비활성 — 요청 생략(path={})", path);
            return;
        }
        try {
            if (requestRevalidation(path) && waitForPurge()) {
                warmUp(path);
            }
        } catch (RuntimeException unexpected) {
            // 아래 catch 들이 못 잡는 나머지(연결 시점의 인자 오류 등) — 여기서 끊어 정각 잡으로 새지 않게 한다.
            log.warn("프론트 재생성 요청 실패 — path={}, reason={}", path, unexpected.getClass().getSimpleName());
        }
    }

    private boolean requestRevalidation(String path) {
        String payload;
        try {
            payload = objectMapper.writeValueAsString(Map.of("paths", List.of(path)));
        } catch (JsonProcessingException serializationFailure) {
            log.warn("프론트 재생성 요청 실패 — path={}, reason=JSON_SERIALIZATION", path);
            return false;
        }
        try {
            HttpStatusCode status = frontendRevalidationRestClient.post()
                    .uri(REVALIDATE_ENDPOINT)
                    .header(HttpHeaders.AUTHORIZATION, authorization)
                    .header(HttpHeaders.USER_AGENT, USER_AGENT)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(payload)
                    .exchange((request, response) -> response.getStatusCode());
            if (status.is2xxSuccessful()) {
                return true;
            }
            log.warn("프론트 재생성 요청 실패 — path={}, reason=HTTP_{}", path, status.value());
        } catch (RestClientException transportFailure) {
            log.warn("프론트 재생성 요청 실패 — path={}, reason={}", path, transportFailure.getClass().getSimpleName());
        }
        return false;
    }

    // CDN 무효화가 퍼지기 전에 warm-up 하면 옛 엔트리를 받아 헛돈다. 종료 중 인터럽트면 warm-up 을 건너뛴다.
    private boolean waitForPurge() {
        try {
            Thread.sleep(WARM_UP_DELAY.toMillis());
            return true;
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            return false;
        }
    }

    private void warmUp(String path) {
        try {
            WarmUpResult warmUpResult = frontendRevalidationRestClient.get()
                    .uri(path)
                    .header(HttpHeaders.USER_AGENT, USER_AGENT)
                    .exchange((request, response) ->
                            new WarmUpResult(response.getStatusCode(), cacheStatus(response.getHeaders())));
            if (warmUpResult.status().is2xxSuccessful()) {
                log.info("프론트 재생성 완료 — path={}, warmUp=HTTP_{}, cache={}",
                        path, warmUpResult.status().value(), warmUpResult.cacheStatus());
            } else {
                log.warn("프론트 재생성 warm-up 실패 — path={}, reason=HTTP_{}", path, warmUpResult.status().value());
            }
        } catch (RestClientException transportFailure) {
            log.warn("프론트 재생성 warm-up 실패 — path={}, reason={}",
                    path, transportFailure.getClass().getSimpleName());
        }
    }

    // Vercel 은 x-vercel-cache, next start(로컬)는 x-nextjs-cache 로 캐시 상태를 알린다.
    private static String cacheStatus(HttpHeaders headers) {
        String vercelCache = headers.getFirst("x-vercel-cache");
        return vercelCache != null ? vercelCache : headers.getFirst("x-nextjs-cache");
    }

    private record WarmUpResult(HttpStatusCode status, String cacheStatus) {
    }
}
