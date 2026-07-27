package com.duing.global.bank;

import com.duing.global.bank.dto.BankTransactionData;
import com.duing.global.bank.dto.TransactionLookupCommand;
import com.duing.global.bank.exception.BankApiException;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.IOException;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * {@link BankApiClient} 의 RestClient 구현. 외부 연동 시 PII-safe 로깅 패턴을 따른다 —
 * 요청 바디(계좌비밀번호·주민번호·계좌번호)는 절대 로그에 남기지 않고,
 * 실패 로그는 HTTP 상태/에러코드 같은 비민감 정보만 남긴다.
 *
 * <p>BANK API 의 에러 응답 형식이 혼재한다(문서상). 어떤 응답은 {@code error} 가 문자열 코드이고,
 * 어떤 응답은 {@code {code, message, retryAfter}} 객체다. {@link #extractError(JsonNode)} 가 두
 * 형식을 모두 견고하게 파싱한다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class BankApiHttpClient implements BankApiClient {

    private static final DateTimeFormatter API_DATE_FORMAT = DateTimeFormatter.ofPattern("yyyyMMdd");

    private final RestClient bankApiRestClient;
    private final ObjectMapper objectMapper;

    @Override
    public List<BankTransactionData> getTransactions(TransactionLookupCommand command) {
        // LinkedHashMap 사용 — Map.of 는 null 값을 허용하지 않고, 입력 순서를 보존한다.
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("bankCode", command.bankCode());
        body.put("accountNumber", command.accountNumber());
        body.put("accountPassword", command.accountPassword());
        body.put("residentNumber", command.residentNumber());
        body.put("startDate", command.startDate().format(API_DATE_FORMAT));
        body.put("endDate", command.endDate().format(API_DATE_FORMAT));

        JsonNode response = post("/v1/transactions", body);
        if (!isSuccess(response)) {
            throw toException(extractError(response), "거래조회");
        }
        return mapTransactions(response.path("transactions"));
    }

    private List<BankTransactionData> mapTransactions(JsonNode transactions) {
        List<BankTransactionData> result = new ArrayList<>();
        if (!transactions.isArray()) {
            return result;
        }
        int missingDate = 0;
        int unparseable = 0;
        for (JsonNode transaction : transactions) {
            SkipReason skipReason = appendTransaction(transaction, result);
            if (skipReason == SkipReason.MISSING_DATE) {
                missingDate++;
            } else if (skipReason == SkipReason.UNPARSEABLE) {
                unparseable++;
            }
        }
        if (missingDate > 0 || unparseable > 0) {
            // 사유별 건수만 남긴다 — 거래 내용은 민감 가능성이 있어 로깅하지 않는다.
            log.warn("BANK API 거래 매핑 건너뜀: missingDate={}, unparseable={}", missingDate, unparseable);
        }
        return result;
    }

    /**
     * 거래 1건을 매핑해 결과에 추가한다. {@code time} 이 비면 자정으로 보정하고, {@code date} 가 비거나
     * 파싱 불가면 건너뛴다(한 건의 빈 값이 동기화 배치 전체를 크래시시키지 않도록 한다).
     * 추가하면 {@code null}, 건너뛰면 사유({@link SkipReason})를 반환한다.
     */
    private SkipReason appendTransaction(JsonNode transaction, List<BankTransactionData> result) {
        // date·time 은 이미 KST 벽시계 값이므로 타임존 변환 없이 그대로 조립한다.
        String dateText = transaction.path("date").asText("");
        if (dateText.isBlank()) {
            // 날짜 없는 거래는 식별 불가(transaction_at NOT NULL·해시 입력) → 제외한다.
            return SkipReason.MISSING_DATE;
        }
        LocalDate date;
        LocalTime time;
        try {
            date = parseTransactionDate(dateText);
            String timeText = transaction.path("time").asText("");
            time = timeText.isBlank() ? LocalTime.MIDNIGHT : LocalTime.parse(timeText);
        } catch (DateTimeParseException malformed) {
            // 파싱 불가 거래는 제외한다(배치 전체 크래시 방지). PII 없는 사유는 호출부가 건수로 집계한다.
            return SkipReason.UNPARSEABLE;
        }
        LocalDateTime transactionAt = LocalDateTime.of(date, time);
        result.add(new BankTransactionData(
                transactionAt,
                transaction.path("amount").asLong(),
                transaction.hasNonNull("balance") ? transaction.path("balance").asLong() : null,
                transaction.path("type").asText(""),
                transaction.path("counterparty").asText(""),
                transaction.path("description").asText(""),
                transaction.path("branch").asText(""),
                transaction.path("memo").asText(""),
                writeRawJson(transaction)));
        return null;
    }

    /**
     * 거래일자를 파싱한다. 제공사는 은행에 따라 {@code YYYY-MM-DD} 또는 {@code YYYY/MM/DD} 를 주므로
     * 슬래시를 하이픈으로 정규화하고, 문서에 없지만 요청 형식과 같은 압축형({@code YYYYMMDD})도 받아 둔다.
     * 형식 하나를 놓치면 그 은행 거래가 통째로 유실되는데(입금 누락) 형식 추가 비용은 한 줄이라 보수적으로 넓힌다.
     */
    private LocalDate parseTransactionDate(String dateText) {
        String normalized = dateText.replace('/', '-');
        try {
            return LocalDate.parse(normalized);
        } catch (DateTimeParseException notIsoDate) {
            return LocalDate.parse(normalized, DateTimeFormatter.BASIC_ISO_DATE);
        }
    }

    private enum SkipReason {
        MISSING_DATE,
        UNPARSEABLE
    }

    private String writeRawJson(JsonNode transaction) {
        try {
            return objectMapper.writeValueAsString(transaction);
        } catch (JsonProcessingException serializationFailure) {
            // 직렬화 실패는 원본 노드 자체 문제이므로 비민감 — 노드 내용은 로그에 남기지 않는다.
            log.warn("BANK API 거래 원본 직렬화 실패", serializationFailure);
            throw new BankApiException.BankApiCallFailedException();
        }
    }

    private JsonNode post(String path, Map<String, ?> body) {
        return exchange("POST", () -> bankApiRestClient.post()
                .uri(path)
                .contentType(MediaType.APPLICATION_JSON)
                .body(body)
                .exchange((request, clientResponse) -> readBody(clientResponse)));
    }

    /**
     * 호출을 실행하고 RestClient 레벨 예외(연결 실패·타임아웃 등)를 비민감 로그와 함께
     * {@link BankApiException.BankApiCallFailedException} 으로 변환한다.
     */
    private JsonNode exchange(String httpMethod, ExchangeCall call) {
        try {
            return call.run();
        } catch (RestClientException callFailure) {
            // 요청 바디(민감정보)는 절대 로그에 남기지 않는다 — HTTP 메서드만 기록한다.
            log.warn("BANK API 호출 실패: method={}", httpMethod, callFailure);
            throw new BankApiException.BankApiCallFailedException();
        }
    }

    /**
     * 응답 바디를 status 와 함께 읽어 단일 JsonNode 로 합친다(2xx·에러 동일 처리).
     * 4xx/5xx 여도 RestClient 가 예외를 던지지 않도록 exchange() 를 쓰며, status·retryAfter 정보를
     * 파싱 단계로 넘기기 위해 {@code __status}·헤더의 Retry-After 를 합성 필드로 주입한다.
     */
    private JsonNode readBody(RestClient.RequestHeadersSpec.ConvertibleClientHttpResponse clientResponse) {
        try {
            HttpStatusCode status = clientResponse.getStatusCode();
            JsonNode body = clientResponse.bodyTo(JsonNode.class);
            ObjectNode merged;
            if (body != null && body.isObject()) {
                merged = (ObjectNode) body;
            } else {
                // 예상치 못한 응답 형식(배열·비-object). 내용은 민감 가능성이 있어 로깅하지 않고 status 만 남긴다.
                log.warn("BANK API 응답이 JSON object 형식이 아님: status={}", status.value());
                merged = objectMapper.createObjectNode();
            }
            merged.put("__status", status.value());
            String retryAfterHeader = clientResponse.getHeaders().getFirst("Retry-After");
            if (retryAfterHeader != null && !merged.has("__retryAfterHeader")) {
                merged.put("__retryAfterHeader", retryAfterHeader);
            }
            return merged;
        } catch (IOException readFailure) {
            // ClientHttpResponse.getStatusCode() 가 IOException 을 선언하므로 이 catch 는 도달 가능하다
            // (응답 상태 읽기 단계의 실제 스트림 IO). 바디 자체에 민감정보가 없으나, 보수적으로 내용은 로그에 남기지 않는다.
            log.warn("BANK API 응답 본문 읽기 실패", readFailure);
            throw new BankApiException.BankApiCallFailedException();
        }
    }

    private boolean isSuccess(JsonNode response) {
        return response.path("success").asBoolean(false);
    }

    /**
     * 에러 형식을 파싱한다. 현재 제공사 형식은 {@code {"success":false,"error":"ACCOUNT_COOLDOWN",
     * "message":...,"retryAfterSec":540}} 로 error 가 문자열 코드이고 재시도 대기는 본문 최상위
     * {@code retryAfterSec} 에 온다. 과거 객체형({@code error:{code,message,retryAfter}})도 함께 받는다.
     *
     * <p>대기 시간은 본문 우선(과거 형식 error.retryAfter → 현행 retryAfterSec 순으로 확인),
     * 둘 다 없으면 Retry-After 헤더로 보충한다. 두 형식이 동시에 오는 응답은 문서상 없다.
     */
    private ApiError extractError(JsonNode response) {
        JsonNode errorNode = response.path("error");
        String code = null;
        String message = null;
        Integer retryAfter = null;

        if (errorNode.isTextual()) {
            code = errorNode.asText();
        } else if (errorNode.isObject()) {
            code = errorNode.hasNonNull("code") ? errorNode.path("code").asText() : null;
            message = errorNode.hasNonNull("message") ? errorNode.path("message").asText() : null;
            if (errorNode.hasNonNull("retryAfter")) {
                retryAfter = errorNode.path("retryAfter").asInt();
            }
        }
        // 현행 형식: 본문 최상위 retryAfterSec.
        if (retryAfter == null && response.hasNonNull("retryAfterSec")) {
            retryAfter = response.path("retryAfterSec").asInt();
        }
        if (retryAfter == null && response.hasNonNull("__retryAfterHeader")) {
            try {
                retryAfter = Integer.parseInt(response.path("__retryAfterHeader").asText().trim());
            } catch (NumberFormatException ignored) {
                // Retry-After 가 HTTP-date 형식이면 초 단위로 변환하지 않고 무시한다(파싱 견고성 우선).
            }
        }
        int status = response.path("__status").asInt(0);
        return new ApiError(code, message, retryAfter, status);
    }

    /**
     * 에러를 도메인 예외로 변환한다. 에러코드 우선, 없으면 HTTP 상태로 분류한다.
     * 로그·예외 메시지에 요청 바디나 응답 message(민감정보 가능) 를 싣지 않는다.
     */
    private BankApiException toException(ApiError error, String operation) {
        String code = error.code();
        int status = error.status();

        // 제한 3종(ACCOUNT_COOLDOWN·QUERY_QUOTA_EXCEEDED·TOO_MANY_REQUESTS)은 모두 429 로 오므로
        // 상태만 보면 충분하다 — 코드 문자열까지 나열하면 도달 불가한 분기만 늘어난다.
        if (status == 429) {
            log.warn("BANK API {} 실패: status={}, code={}", operation, status, code);
            return new BankApiException.RateLimitExceededException(error.retryAfter());
        }
        if (status == 401 || status == 403) {
            log.warn("BANK API {} 실패: status={}, code={}", operation, status, code);
            return new BankApiException.AuthFailedException();
        }
        // 분류되지 않은 에러코드·5xx·400 등은 일반 실패로 처리한다(message 는 민감 가능 → 로깅 금지).
        log.warn("BANK API {} 실패: status={}, code={}", operation, status, code);
        return new BankApiException.BankApiCallFailedException();
    }

    @FunctionalInterface
    private interface ExchangeCall {
        JsonNode run();
    }

    private record ApiError(String code, String message, Integer retryAfter, int status) {}
}
