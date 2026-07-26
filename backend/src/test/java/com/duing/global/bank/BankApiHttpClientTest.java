package com.duing.global.bank;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.InstanceOfAssertFactories.throwable;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.duing.global.bank.dto.BankTransactionData;
import com.duing.global.bank.dto.TransactionLookupCommand;
import com.duing.global.bank.exception.BankApiException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/**
 * BANK API 응답 매핑 계약 테스트. 통합 테스트는 {@link BankApiClient} 를 stub 으로 갈아끼우기 때문에
 * 실제 JSON → 도메인 매핑은 여기서만 검증된다(슬래시 날짜 유실 같은 결함이 숨을 수 있던 자리).
 */
class BankApiHttpClientTest {

    private static final String BASE_URL = "https://api.bankapi.co.kr";

    private MockRestServiceServer mockServer;
    private BankApiHttpClient bankApiClient;

    @BeforeEach
    void setUp() {
        RestClient.Builder restClientBuilder = RestClient.builder().baseUrl(BASE_URL);
        mockServer = MockRestServiceServer.bindTo(restClientBuilder).build();
        bankApiClient = new BankApiHttpClient(restClientBuilder.build(), new ObjectMapper());
    }

    private TransactionLookupCommand lookupCommand() {
        return new TransactionLookupCommand(
                "NH", "3521234567890", "1234", "800101",
                LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 10));
    }

    @Test
    @DisplayName("거래조회는 공식 계약(POST /v1/transactions·YYYYMMDD 기간)대로 호출한다")
    void callsDocumentedContract() {
        mockServer.expect(requestTo(BASE_URL + "/v1/transactions"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(jsonPath("$.bankCode").value("NH"))
                .andExpect(jsonPath("$.startDate").value("20260101"))
                .andExpect(jsonPath("$.endDate").value("20260110"))
                .andRespond(withSuccess("{\"success\":true,\"transactions\":[]}",
                        MediaType.APPLICATION_JSON));

        assertThat(bankApiClient.getTransactions(lookupCommand())).isEmpty();
        mockServer.verify();
    }

    @Test
    @DisplayName("거래일자가 하이픈·슬래시·압축형 중 무엇이든 모두 매핑된다")
    void mapsAllDateFormats() {
        // 제공사 문서: date 는 은행에 따라 YYYY-MM-DD 또는 YYYY/MM/DD 로 온다. 압축형(YYYYMMDD)은
        // 문서에 없지만 요청 형식과 같아 방어적으로 받는다 — 형식 하나를 놓치면 입금이 통째로 유실된다.
        mockServer.expect(requestTo(BASE_URL + "/v1/transactions"))
                .andRespond(withSuccess("""
                        {"success":true,"transactions":[
                          {"date":"2026-01-09","time":"09:15:00","amount":3000000,"balance":1284567,
                           "type":"deposit","counterparty":"홍길동","description":"FBS입금","branch":"국민 0068738"},
                          {"date":"2026/01/10","time":"14:30:25","amount":50000,"balance":1234567,
                           "type":"withdrawal","counterparty":"스타벅스코리아","description":"스마트출금","branch":"강남"},
                          {"date":"20260111","time":"08:00:00","amount":10000,"type":"deposit"}
                        ]}""", MediaType.APPLICATION_JSON));

        List<BankTransactionData> transactions = bankApiClient.getTransactions(lookupCommand());

        assertThat(transactions).hasSize(3);
        assertThat(transactions.get(0).transactionAt())
                .isEqualTo(LocalDateTime.of(2026, 1, 9, 9, 15, 0));
        assertThat(transactions.get(0).isDeposit()).isTrue();
        // 슬래시형도 건너뛰지 않고 같은 벽시계 값으로 매핑된다.
        assertThat(transactions.get(1).transactionAt())
                .isEqualTo(LocalDateTime.of(2026, 1, 10, 14, 30, 25));
        assertThat(transactions.get(1).isDeposit()).isFalse();
        assertThat(transactions.get(2).transactionAt())
                .isEqualTo(LocalDateTime.of(2026, 1, 11, 8, 0, 0));
    }

    @Test
    @DisplayName("429 제한 응답은 본문 retryAfterSec 을 담은 RateLimitExceededException 으로 변환된다")
    void mapsRateLimitWithRetryAfterSec() {
        mockServer.expect(requestTo(BASE_URL + "/v1/transactions"))
                .andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS)
                        .contentType(MediaType.APPLICATION_JSON)
                        .body("""
                                {"success":false,"error":"ACCOUNT_COOLDOWN",
                                 "message":"동일 계좌는 5분에 1회만 조회할 수 있습니다.","retryAfterSec":540}"""));

        assertThatThrownBy(() -> bankApiClient.getTransactions(lookupCommand()))
                .isInstanceOf(BankApiException.RateLimitExceededException.class)
                .asInstanceOf(throwable(BankApiException.RateLimitExceededException.class))
                .extracting(BankApiException.RateLimitExceededException::getRetryAfterSeconds)
                .isEqualTo(540);
    }

    @Test
    @DisplayName("401 인증 실패는 AuthFailedException 으로 변환된다")
    void mapsAuthFailure() {
        mockServer.expect(requestTo(BASE_URL + "/v1/transactions"))
                .andRespond(withStatus(HttpStatus.UNAUTHORIZED)
                        .contentType(MediaType.APPLICATION_JSON)
                        .body("{\"success\":false,\"error\":\"Invalid API Key\"}"));

        assertThatThrownBy(() -> bankApiClient.getTransactions(lookupCommand()))
                .isInstanceOf(BankApiException.AuthFailedException.class);
    }

    @Test
    @DisplayName("날짜가 비었거나 파싱 불가한 거래만 건너뛰고 나머지는 정상 적재된다")
    void skipsOnlyMalformedRows() {
        mockServer.expect(requestTo(BASE_URL + "/v1/transactions"))
                .andRespond(withSuccess("""
                        {"success":true,"transactions":[
                          {"date":"","time":"09:15:00","amount":1000,"type":"deposit"},
                          {"date":"10/01/2026","time":"09:15:00","amount":2000,"type":"deposit"},
                          {"date":"2026-01-11","time":"10:00:00","amount":3000,"type":"deposit"}
                        ]}""", MediaType.APPLICATION_JSON));

        List<BankTransactionData> transactions = bankApiClient.getTransactions(lookupCommand());

        // 빈 날짜(MISSING_DATE)와 일-월-년 순서(UNPARSEABLE)만 빠지고 정상 1건이 남는다.
        assertThat(transactions).hasSize(1);
        assertThat(transactions.get(0).amount()).isEqualTo(3000L);
    }

    @Test
    @DisplayName("success=false 에 분류되지 않은 에러코드가 오면 일반 호출 실패로 변환된다")
    void mapsUnclassifiedErrorToCallFailure() {
        mockServer.expect(requestTo(BASE_URL + "/v1/transactions"))
                .andRespond(withSuccess("{\"success\":false,\"error\":\"SOMETHING_NEW\"}",
                        MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> bankApiClient.getTransactions(lookupCommand()))
                .isInstanceOf(BankApiException.BankApiCallFailedException.class);
    }

    @Test
    @DisplayName("본문에 대기 시간이 없으면 Retry-After 헤더에서 보충한다")
    void fallsBackToRetryAfterHeader() {
        mockServer.expect(requestTo(BASE_URL + "/v1/transactions"))
                .andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Retry-After", "120")
                        .body("{\"success\":false,\"error\":\"TOO_MANY_REQUESTS\"}"));

        assertThatThrownBy(() -> bankApiClient.getTransactions(lookupCommand()))
                .asInstanceOf(throwable(BankApiException.RateLimitExceededException.class))
                .extracting(BankApiException.RateLimitExceededException::getRetryAfterSeconds)
                .isEqualTo(120);
    }
}
