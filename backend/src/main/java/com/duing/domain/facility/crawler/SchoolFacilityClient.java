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
 * 예약 fetch 는 룸 단위 재시도(총 4회 / 0.5·1·2초)를 적용하되 5xx·네트워크·타임아웃만 재시도하고
 * 4xx 는 재시도하지 않는다(§5.3). .exchange() 로 상태코드를 직접 판정해 재시도 예외를 분류한다.
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
     * 특정 룸·월 예약 JSON 배열(POST). 5xx·네트워크·타임아웃 → FacilityFetchException(재시도),
     * 4xx → FacilityBadResponseException(비재시도). retryFor 가 재시도 대상을 FacilityFetchException 로
     * 제한하므로 4xx 는 즉시 전파된다. 재시도 소진 후 마지막 예외가 호출부로 전파된다.
     */
    @Retryable(
            retryFor = FacilityFetchException.class,
            maxAttemptsExpression = "${duing.facility.crawler.retry-max-attempts}",
            backoff = @Backoff(
                    delayExpression = "${duing.facility.crawler.retry-backoff-millis}",
                    multiplier = 2))
    public JsonNode fetchReservations(int roomSeq, YearMonth yearMonth) {
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("room_seq", String.valueOf(roomSeq));
        form.add("schedule_date", yearMonth.format(YEAR_MONTH));

        StatusBody statusBody;
        try {
            statusBody = facilitySchoolRestClient.post()
                    .uri(properties.dataPath())
                    .header("X-Requested-With", "XMLHttpRequest")
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .body(form)
                    .exchange((request, response) ->
                            new StatusBody(response.getStatusCode(), response.bodyTo(JsonNode.class)), false);
        } catch (RestClientException networkOrTimeout) {
            // 연결 실패·읽기 타임아웃 등 — 재시도 대상.
            log.warn("시설 예약 fetch 네트워크 실패: roomSeq={}, yearMonth={}", roomSeq, yearMonth.format(YEAR_MONTH));
            throw new FacilityFetchException("시설 예약 fetch 네트워크 실패", networkOrTimeout);
        }

        HttpStatusCode status = statusBody.status();
        if (status.is2xxSuccessful()) {
            JsonNode body = statusBody.body();
            if (body == null || !body.isArray()) {
                // 200 인데 배열이 아니면 형식 오류 → 비재시도(파싱 불가). 내용은 로깅하지 않는다.
                log.warn("시설 예약 응답이 JSON 배열이 아님: roomSeq={}, status={}", roomSeq, status.value());
                throw new FacilityBadResponseException("시설 예약 응답 형식 오류");
            }
            return body;
        }
        if (status.is5xxServerError()) {
            log.warn("시설 예약 fetch 5xx: roomSeq={}, status={}", roomSeq, status.value());
            throw new FacilityFetchException("시설 예약 fetch 5xx: " + status.value());
        }
        // 4xx 및 기타 — 비재시도.
        log.warn("시설 예약 fetch 4xx: roomSeq={}, status={}", roomSeq, status.value());
        throw new FacilityBadResponseException("시설 예약 fetch 4xx: " + status.value());
    }

    private record StatusBody(HttpStatusCode status, JsonNode body) {}
}
