package com.duing.global.frontend;

import com.duing.global.monitoring.OpsSlackMessageFormatter;
import com.duing.global.monitoring.SlackNotifier;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
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
 * 무효화 뒤 첫 요청이 재생성을 일으키므로 그 요청을 백엔드가 먼저 보내 실제 사용자 요청보다 앞서 재생성을 시작시킨다.
 * 1초는 CDN 무효화가 전 지역에 퍼지는 시간(약 300ms)의 여유다. Vercel 에서 재검증 2xx 는 무효화가 접수됐다는 뜻일 뿐
 * 재생성 완료가 아니다 — 실제로 새로 만들어졌는지는 warm-up 응답의 캐시 상태·{@code age} 헤더로만 드러나므로 INFO 로
 * 남겨 운영에서 확인한다. 옛 엔트리를 그대로 받은 HIT 이 반복되면 대기를 늘린다.
 *
 * <p>격리가 계약이다: {@link #revalidate} 는 어떤 경우에도 예외를 던지지 않고 재시도하지 않는다 — 다음 정각에
 * 다시 돌고, 프론트는 자체 재생성 주기를 안전망으로 둔다. 성공 판정은 2xx 만이다 — RestClient 기본 오류 판정은
 * 4xx/5xx 만 예외로 만들어 3xx 가 성공처럼 통과하므로({@code SimpleClientHttpRequestFactory} 는 POST 리다이렉트를
 * 따라가지 않는다), 상태 핸들러를 거치지 않는 {@code exchange} 로 상태를 직접 판정한다.
 *
 * <p>연속 실패 알림(#1361): 한 번의 시도는 성공(재검증 2xx 그리고 warm-up 2xx)·제외(종료 중 인터럽트로 warm-up 을
 * 건너뜀)·실패 중 하나이고, 앞의 둘이 아니면 전부 실패다 — warm-up 실패는 지운 뒤 다시 그리지 못한 것이라 그 요청이
 * 오류 화면을 받는다. 경로별 연속 실패가 {@value #FAILURE_ALERT_THRESHOLD}회에 처음 닿을 때 Slack 으로 한 번 알리고
 * (이어지는 실패는 조용), 그 뒤 성공하면 복구를 한 번 알린다. 비활성은 세지 않는다. 카운터는 메모리라 재기동하면
 * 0 부터다 — 알림 뒤 재기동하면 복구 알림이 오지 않으므로 배포 뒤 첫 정각 warm-up INFO 로 확인한다. 알림 전송 실패는
 * 재전송하지 않는다(알림은 손실 허용). 알림은 이 스레드에서 직접 보낸다 — 이벤트를 발행하면 트랜잭션 없는 스케줄러
 * 스레드라 {@code @TransactionalEventListener} 가 버린다. 런북: deploy/MONITORING.md
 *
 * <p>로깅 정책({@code SlackNotifier} 관례): 상태 코드·예외 클래스명만 남긴다. 예외 메시지에는 요청 URL·응답 본문이
 * 섞이므로 싣지 않고, 비밀값·Authorization 은 어디에도 남기지 않는다. 알림 문구도 같은 사유 토큰만 싣는다.
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
    /**
     * 정각 잡이 {@code /clubs} 를 시간당 한 번 부른다는 전제의 값이다 — 10·11·12시가 실패하면 12시에 알린다(재집계
     * 실패로 요청을 건너뛴 시간은 카운터를 그대로 둔다). #1356(상세 즉시 재생성)이 호출을 더하면 호출 빈도·경로별 알림
     * 중복·묶음 요청의 502 전파와, 같은 경로의 실패·성공이 겹칠 때 Slack 의 "복구" 가 "연속 실패" 보다 먼저 도착할 수
     * 있는 순서 문제를 보고 다시 정한다. 그 비동기 실행에 {@code monitoringTaskExecutor} 를 쓰지 않는다 —
     * Slack 알림 전용 작은 풀이라 1초 대기·10초 타임아웃 작업이 알림을 밀어낸다.
     */
    private static final int FAILURE_ALERT_THRESHOLD = 3;

    private final boolean enabled;
    private final String authorization;
    private final RestClient frontendRevalidationRestClient;
    private final ObjectMapper objectMapper;
    private final OpsSlackMessageFormatter opsSlackMessageFormatter;
    private final SlackNotifier slackNotifier;
    /** 실패 중인 경로만 남는다(성공하면 지운다). #1356 이 비동기 호출을 더할 예정이라 원자 연산(merge·remove)으로 센다. */
    private final ConcurrentHashMap<String, Integer> consecutiveFailuresByPath = new ConcurrentHashMap<>();

    // RestClient 빈이 여럿이라 이름으로 고정한다 — 파라미터 이름 폴백은 @Primary RestClient 가 생기면 밀려 비밀값이 다른 호스트로 간다.
    public FrontendRevalidator(FrontendRevalidationProperties frontendRevalidationProperties,
            @Qualifier("frontendRevalidationRestClient") RestClient frontendRevalidationRestClient,
            ObjectMapper objectMapper, OpsSlackMessageFormatter opsSlackMessageFormatter,
            SlackNotifier slackNotifier) {
        this.enabled = frontendRevalidationProperties.enabled();
        this.authorization = enabled ? "Bearer " + frontendRevalidationProperties.revalidateSecret() : null;
        this.frontendRevalidationRestClient = frontendRevalidationRestClient;
        this.objectMapper = objectMapper;
        this.opsSlackMessageFormatter = opsSlackMessageFormatter;
        this.slackNotifier = slackNotifier;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void logStatus() {
        if (enabled) {
            log.info("[프론트 재생성 트리거] 활성 — 정각 잡(DUING_CLUB_METRIC_ENABLED, 운영 기본 활성)이 켜져 있으면 "
                    + "매시 정각 /clubs 재생성을 요청한다.");
        } else {
            log.warn("[프론트 재생성 트리거] 비활성 — DUING_FRONTEND_REVALIDATE_SECRET 미설정·32바이트 미만이거나 "
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
        if (path == null) {
            // 호출 오류 — 경로별 카운터(ConcurrentHashMap)가 null 키를 받지 않으므로 시도 전에 끊는다.
            log.warn("프론트 재생성 요청 실패 — path=null");
            return;
        }
        // 기록은 시도 밖에서 한 번만 한다 — 시도 안의 어느 분기도 카운터를 직접 만지지 않는다.
        recordOutcome(path, attempt(path));
    }

    private AttemptOutcome attempt(String path) {
        try {
            AttemptOutcome revalidation = requestRevalidation(path);
            if (revalidation instanceof AttemptOutcome.Failure) {
                return revalidation;
            }
            return waitForPurge() ? warmUp(path) : AttemptOutcome.SKIPPED;
        } catch (RuntimeException unexpected) {
            // 아래 catch 들이 못 잡는 나머지(연결 시점의 인자 오류 등) — 여기서 끊어 정각 잡으로 새지 않게 하고 실패로 센다.
            return requestFailed(path, unexpected.getClass().getSimpleName());
        }
    }

    private AttemptOutcome requestRevalidation(String path) {
        String payload;
        try {
            payload = objectMapper.writeValueAsString(Map.of("paths", List.of(path)));
        } catch (JsonProcessingException serializationFailure) {
            return requestFailed(path, "JSON_SERIALIZATION");
        }
        try {
            HttpStatusCode status = frontendRevalidationRestClient.post()
                    .uri(REVALIDATE_ENDPOINT)
                    .header(HttpHeaders.AUTHORIZATION, authorization)
                    .header(HttpHeaders.USER_AGENT, USER_AGENT)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(payload)
                    .exchange((request, response) -> response.getStatusCode());
            return status.is2xxSuccessful() ? AttemptOutcome.SUCCESS : requestFailed(path, "HTTP_" + status.value());
        } catch (RestClientException transportFailure) {
            return requestFailed(path, transportFailure.getClass().getSimpleName());
        }
    }

    private static AttemptOutcome requestFailed(String path, String reason) {
        log.warn("프론트 재생성 요청 실패 — path={}, reason={}", path, reason);
        return new AttemptOutcome.Failure(reason);
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

    private AttemptOutcome warmUp(String path) {
        try {
            WarmUpResult warmUpResult = frontendRevalidationRestClient.get()
                    .uri(path)
                    .header(HttpHeaders.USER_AGENT, USER_AGENT)
                    .exchange((request, response) -> new WarmUpResult(response.getStatusCode(),
                            cacheStatus(response.getHeaders()), response.getHeaders().getFirst("age")));
            if (warmUpResult.status().is2xxSuccessful()) {
                log.info("프론트 재생성 warm-up 응답 — path={}, status=HTTP_{}, cache={}, age={}",
                        path, warmUpResult.status().value(), warmUpResult.cacheStatus(), warmUpResult.age());
                return AttemptOutcome.SUCCESS;
            }
            return warmUpFailed(path, "HTTP_" + warmUpResult.status().value());
        } catch (RestClientException transportFailure) {
            return warmUpFailed(path, transportFailure.getClass().getSimpleName());
        }
    }

    // 알림 사유에는 접두를 달아 재검증 거절과 구분한다 — 런북이 사유로 조치를 가른다.
    private static AttemptOutcome warmUpFailed(String path, String reason) {
        log.warn("프론트 재생성 warm-up 실패 — path={}, reason={}", path, reason);
        return new AttemptOutcome.Failure("warm-up " + reason);
    }

    // Vercel 은 x-vercel-cache, next start(로컬)는 x-nextjs-cache 로 캐시 상태를 알린다.
    private static String cacheStatus(HttpHeaders headers) {
        String vercelCache = headers.getFirst("x-vercel-cache");
        return vercelCache != null ? vercelCache : headers.getFirst("x-nextjs-cache");
    }

    private void recordOutcome(String path, AttemptOutcome outcome) {
        switch (outcome) {
            case AttemptOutcome.Success() -> recordSuccess(path);
            case AttemptOutcome.Failure(String reason) -> recordFailure(path, reason);
            case AttemptOutcome.Skipped() -> {
                // 종료 중 인터럽트 — 성공도 실패도 아니라 카운터를 건드리지 않는다.
            }
        }
    }

    private void recordFailure(String path, String reason) {
        int streak = consecutiveFailuresByPath.merge(path, 1, Integer::sum);
        if (streak == FAILURE_ALERT_THRESHOLD) {
            // webhook 이 비어 있으면 전송기는 debug 만 남긴다 — 임계 도달은 로그로도 추적되게 한 줄 남긴다.
            log.warn("프론트 재생성 연속 실패 — path={}, streak={}, reason={} (런북: deploy/MONITORING.md)",
                    path, streak, reason);
            notifySafely("FRONTEND_REVALIDATION_FAILING",
                    () -> opsSlackMessageFormatter.frontendRevalidationFailing(path, streak, reason));
        }
    }

    private void recordSuccess(String path) {
        Integer previousStreak = consecutiveFailuresByPath.remove(path);
        if (previousStreak != null && previousStreak >= FAILURE_ALERT_THRESHOLD) {
            notifySafely("FRONTEND_REVALIDATION_RECOVERED",
                    () -> opsSlackMessageFormatter.frontendRevalidationRecovered(path, previousStreak));
        }
    }

    // 전송기는 던지지 않지만 포매터까지 감싸 알림 실패가 정각 잡으로 새지 않게 한다(OpsSlackListener 관례).
    private void notifySafely(String eventType, Supplier<String> messageSupplier) {
        try {
            slackNotifier.send(messageSupplier.get());
        } catch (RuntimeException failure) {
            // 예외 메시지에 URL 이 섞일 수 있어 클래스명만 남긴다.
            log.error("Slack 운영 알림 처리 실패 — event={}, reason={}", eventType, failure.getClass().getSimpleName());
        }
    }

    private record WarmUpResult(HttpStatusCode status, String cacheStatus, String age) {
    }

    /** 한 번의 시도 결과 — 명시적 성공·제외가 아니면 전부 사유를 단 실패다. */
    private sealed interface AttemptOutcome {

        AttemptOutcome SUCCESS = new Success();
        /** 종료 중 인터럽트로 warm-up 을 건너뛴 시도. */
        AttemptOutcome SKIPPED = new Skipped();

        record Success() implements AttemptOutcome {
        }

        record Skipped() implements AttemptOutcome {
        }

        record Failure(String reason) implements AttemptOutcome {
        }
    }
}
