package com.duing.global.bank;

import com.duing.global.bank.dto.AccountSlotStatus;
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
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * {@link BankApiClient} 의 RestClient 구현. {@link com.duing.global.email.ResendEmailSender} 의
 * PII-safe 로깅 패턴을 따른다 — 요청 바디(계좌비밀번호·주민번호·계좌번호)는 절대 로그에 남기지 않고,
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

    private static final String CODE_ACCOUNT_ALREADY_REGISTERED = "ACCOUNT_ALREADY_REGISTERED";
    private static final String CODE_ACCOUNT_LIMIT_EXCEEDED = "ACCOUNT_LIMIT_EXCEEDED";
    private static final String CODE_ACCOUNT_NOT_FOUND = "ACCOUNT_NOT_FOUND";
    private static final String CODE_ACCOUNT_NOT_REGISTERED = "ACCOUNT_NOT_REGISTERED";
    private static final String CODE_RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED";

    private final RestClient bankApiRestClient;
    private final ObjectMapper objectMapper;

    @Override
    public void registerAccount(String bankCode, String accountNumber) {
        JsonNode response = post("/v1/accounts", Map.of(
                "bankCode", bankCode,
                "accountNumber", accountNumber));
        if (isSuccess(response)) {
            return;
        }
        ApiError error = extractError(response);
        // 재등록은 실패가 아니다 — 이미 등록된 계좌는 멱등 성공으로 처리한다.
        if (CODE_ACCOUNT_ALREADY_REGISTERED.equals(error.code())) {
            return;
        }
        if (CODE_ACCOUNT_LIMIT_EXCEEDED.equals(error.code())) {
            throw new BankApiException.AccountLimitExceededException();
        }
        throw toException(error, "계좌등록");
    }

    @Override
    public void deleteAccount(String bankCode, String accountNumber) {
        JsonNode response = delete("/v1/accounts", Map.of(
                "bankCode", bankCode,
                "accountNumber", accountNumber));
        if (isSuccess(response)) {
            return;
        }
        ApiError error = extractError(response);
        // 미등록 계좌 삭제는 멱등 성공으로 처리한다(이미 등록 해제된 상태).
        // 같은 "미등록" 의미를 ACCOUNT_NOT_FOUND·ACCOUNT_NOT_REGISTERED 두 코드로 응답할 수 있어 둘 다 멱등 처리한다.
        if (CODE_ACCOUNT_NOT_FOUND.equals(error.code())
                || CODE_ACCOUNT_NOT_REGISTERED.equals(error.code())) {
            return;
        }
        throw toException(error, "계좌삭제");
    }

    @Override
    public AccountSlotStatus getAccountStatus() {
        JsonNode response = get("/v1/accounts");
        if (!isSuccess(response)) {
            throw toException(extractError(response), "계좌현황조회");
        }
        JsonNode data = response.path("data");
        return new AccountSlotStatus(
                data.path("registeredCount").asInt(),
                data.path("maxAccounts").asInt(),
                data.path("remaining").asInt());
    }

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
        for (JsonNode transaction : transactions) {
            result.add(toTransactionData(transaction));
        }
        return result;
    }

    private BankTransactionData toTransactionData(JsonNode transaction) {
        // date·time 은 이미 KST 벽시계 값이므로 타임존 변환 없이 그대로 조립한다.
        LocalDate date = LocalDate.parse(transaction.path("date").asText());
        LocalTime time = LocalTime.parse(transaction.path("time").asText());
        LocalDateTime transactionAt = LocalDateTime.of(date, time);
        return new BankTransactionData(
                transactionAt,
                transaction.path("amount").asLong(),
                transaction.hasNonNull("balance") ? transaction.path("balance").asLong() : null,
                transaction.path("type").asText(""),
                transaction.path("counterparty").asText(""),
                transaction.path("description").asText(""),
                transaction.path("branch").asText(""),
                transaction.path("memo").asText(""),
                writeRawJson(transaction));
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

    private JsonNode delete(String path, Map<String, ?> body) {
        return exchange("DELETE", () -> bankApiRestClient.method(HttpMethod.DELETE)
                .uri(path)
                .contentType(MediaType.APPLICATION_JSON)
                .body(body)
                .exchange((request, clientResponse) -> readBody(clientResponse)));
    }

    private JsonNode get(String path) {
        return exchange("GET", () -> bankApiRestClient.get()
                .uri(path)
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
            // 바디 자체에 민감정보가 없으나, 보수적으로 내용은 로그에 남기지 않는다.
            log.warn("BANK API 응답 본문 읽기 실패", readFailure);
            throw new BankApiException.BankApiCallFailedException();
        }
    }

    private boolean isSuccess(JsonNode response) {
        return response.path("success").asBoolean(false);
    }

    /**
     * 두 가지 에러 형식을 모두 파싱한다.
     * <ul>
     *   <li>{@code {"error":"ACCOUNT_NOT_REGISTERED"}} — error 가 문자열이면 그대로 코드</li>
     *   <li>{@code {"error":{"code":"RATE_LIMIT_EXCEEDED","message":...,"retryAfter":45}}} — 객체면 분해</li>
     * </ul>
     * retryAfter 는 바디(error.retryAfter) 우선, 없으면 Retry-After 헤더에서 보충한다.
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

        if (CODE_RATE_LIMIT_EXCEEDED.equals(code) || status == 429) {
            log.warn("BANK API {} 실패: status={}, code={}", operation, status, code);
            return new BankApiException.RateLimitExceededException(error.retryAfter());
        }
        if (status == 401 || status == 403) {
            log.warn("BANK API {} 실패: status={}, code={}", operation, status, code);
            return new BankApiException.AuthFailedException();
        }
        if (CODE_ACCOUNT_NOT_FOUND.equals(code) || CODE_ACCOUNT_NOT_REGISTERED.equals(code)) {
            log.warn("BANK API {} 실패: status={}, code={}", operation, status, code);
            return new BankApiException.AccountNotRegisteredException();
        }
        if (CODE_ACCOUNT_LIMIT_EXCEEDED.equals(code)) {
            log.warn("BANK API {} 실패: status={}, code={}", operation, status, code);
            return new BankApiException.AccountLimitExceededException();
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
