package com.duing.domain.facility.crawler;

import com.duing.domain.facility.config.FacilityCrawlerProperties;
import com.duing.domain.facility.crawler.exception.FacilityClientException.FacilityBadResponseException;
import com.duing.domain.facility.crawler.exception.FacilityClientException.FacilityFetchException;
import com.fasterxml.jackson.databind.JsonNode;
import java.io.IOException;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.client.ClientHttpResponse;
import org.springframework.retry.annotation.Backoff;
import org.springframework.retry.annotation.Retryable;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * 학생회관 시설 학교 서버 HTTP 클라이언트(HTTP 만 담당, 파싱은 Parser 계층).
 *
 * <p>시설 목록은 정적 HTML(Jsoup GET), 예약은 월 단위 JSON(RestClient POST 폼)이다.
 * 예약 fetch 는 룸 단위 재시도를 적용하되 5xx·네트워크·타임아웃만 재시도하고 4xx 는 재시도하지
 * 않는다(§5.3). 재시도 예산은 호출 경로별로 분리된다 — 스케줄러 {@link #fetchReservations}(총 4회 /
 * 0.5·1·2초) vs 온디맨드 {@link #fetchReservationsOnDemand}(총 2회, FE 타임아웃 내 응답).
 * .exchange() 로 상태코드를 직접 판정해 재시도 예외를 분류한다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class SchoolFacilityClient {

    private static final DateTimeFormatter YEAR_MONTH = DateTimeFormatter.ofPattern("yyyy-MM");

    private final RestClient facilitySchoolRestClient;
    private final FacilityCrawlerProperties properties;
    private final com.fasterxml.jackson.databind.ObjectMapper objectMapper;

    /** 시설 탭 목록 HTML(GET). 1일 1회 호출이며 실패는 상위(동기화 잡)가 스킵 처리한다. */
    public Document fetchRoomListHtml() {
        try {
            return Jsoup.connect(properties.baseUrl() + properties.listPath())
                    .userAgent(properties.userAgent())
                    .timeout(properties.readTimeoutMillis())
                    .get();
        } catch (IOException networkFailure) {
            // URL/상태만 로깅(PII·학교 민감정보 금지).
            log.warn("시설 목록 HTML fetch 실패: path={}", properties.listPath());
            throw new FacilityFetchException("시설 목록 HTML fetch 실패", networkFailure);
        }
    }

    /**
     * 특정 룸·월 예약 JSON 배열(POST) — 스케줄러 예산(총 4회 / 0.5·1·2초). 상태코드를 먼저 판정하고 2xx 일 때만 본문을 파싱한다.
     * 5xx·네트워크·타임아웃 → FacilityFetchException(재시도), 4xx·비 JSON/깨진 본문 → FacilityBadResponseException(비재시도).
     * 본문을 상태 판정 전에 파싱하지 않으므로 4xx HTML 응답이 재시도되거나 파싱 예외가 예외 계층 밖으로 새지 않는다.
     */
    @Retryable(
            retryFor = FacilityFetchException.class,
            maxAttemptsExpression = "${duing.facility.crawler.retry-max-attempts}",
            backoff = @Backoff(
                    delayExpression = "${duing.facility.crawler.retry-backoff-millis}",
                    multiplier = 2))
    public JsonNode fetchReservations(int roomSeq, YearMonth yearMonth) {
        return doFetchReservations(roomSeq, yearMonth);
    }

    /**
     * {@link #fetchReservations(int, YearMonth)} 와 동일하되 온디맨드(공개 GET 유발) 예산을 적용한다 —
     * FE 18초 타임아웃(facilityOnDemand) 안에 응답해야 하므로 룸당 재시도를 총 2회로 줄인다. 두 공개 메서드 모두 프록시를
     * 통과하도록 private 본문에 위임한다(어노테이션 메서드 간 self-invocation 시 재시도 미적용).
     */
    @Retryable(
            retryFor = FacilityFetchException.class,
            maxAttemptsExpression = "${duing.facility.crawler.on-demand-retry-max-attempts}",
            backoff = @Backoff(
                    delayExpression = "${duing.facility.crawler.retry-backoff-millis}",
                    multiplier = 2))
    public JsonNode fetchReservationsOnDemand(int roomSeq, YearMonth yearMonth) {
        return doFetchReservations(roomSeq, yearMonth);
    }

    private JsonNode doFetchReservations(int roomSeq, YearMonth yearMonth) {
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("room_seq", String.valueOf(roomSeq));
        form.add("schedule_date", yearMonth.format(YEAR_MONTH));
        try {
            return facilitySchoolRestClient.post()
                    .uri(properties.dataPath())
                    .header("X-Requested-With", "XMLHttpRequest")
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .body(form)
                    .exchange((request, response) -> classify(roomSeq, response));
        } catch (RestClientException networkOrTimeout) {
            // 연결 실패·읽기 타임아웃 등 — 재시도 대상. (FacilityClientException 은 RestClientException 이 아니므로 여기 안 걸리고 그대로 전파된다.)
            log.warn("시설 예약 fetch 네트워크 실패: roomSeq={}, yearMonth={}", roomSeq, yearMonth.format(YEAR_MONTH));
            throw new FacilityFetchException("시설 예약 fetch 네트워크 실패", networkOrTimeout);
        }
    }

    /** 상태코드 우선 판정 후 2xx 에서만 JSON 배열로 파싱한다. 단일 인자 exchange 콜백이라 close=true 로 응답이 닫힌다. */
    private JsonNode classify(int roomSeq, ClientHttpResponse response) {
        HttpStatusCode status;
        try {
            status = response.getStatusCode();
        } catch (IOException statusReadError) {
            log.warn("시설 예약 응답 상태 판독 실패: roomSeq={}", roomSeq);
            throw new FacilityFetchException("시설 예약 응답 상태 판독 실패", statusReadError); // 재시도
        }
        if (status.is5xxServerError()) {
            log.warn("시설 예약 fetch 5xx: roomSeq={}, status={}", roomSeq, status.value());
            throw new FacilityFetchException("시설 예약 fetch 5xx: " + status.value()); // 재시도
        }
        if (!status.is2xxSuccessful()) {
            log.warn("시설 예약 fetch 4xx: roomSeq={}, status={}", roomSeq, status.value());
            throw new FacilityBadResponseException("시설 예약 fetch 4xx: " + status.value()); // 비재시도
        }
        JsonNode body;
        try {
            body = objectMapper.readTree(response.getBody());
        } catch (IOException malformed) {
            // 2xx 인데 HTML/깨진 JSON(세션만료·차단 페이지 등) — 비재시도, 예외 계층 안에 유지.
            log.warn("시설 예약 응답 JSON 파싱 실패: roomSeq={}, status={}", roomSeq, status.value());
            throw new FacilityBadResponseException("시설 예약 응답 JSON 파싱 실패");
        }
        if (body == null || !body.isArray()) {
            log.warn("시설 예약 응답이 JSON 배열이 아님: roomSeq={}, status={}", roomSeq, status.value());
            throw new FacilityBadResponseException("시설 예약 응답 형식 오류");
        }
        return body;
    }
}
