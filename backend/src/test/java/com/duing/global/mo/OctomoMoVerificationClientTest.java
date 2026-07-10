package com.duing.global.mo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withException;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.io.IOException;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class OctomoMoVerificationClientTest {

    private static final String BASE_URL = "https://api.octoverse.kr";

    private MockRestServiceServer mockServer;
    private OctomoMoVerificationClient octomoClient;

    @BeforeEach
    void setUp() {
        RestClient.Builder restClientBuilder = RestClient.builder()
                .baseUrl(BASE_URL)
                .defaultHeader(HttpHeaders.AUTHORIZATION, "Octomo test-api-key");
        mockServer = MockRestServiceServer.bindTo(restClientBuilder).build();
        octomoClient = new OctomoMoVerificationClient(restClientBuilder.build());
    }

    @Test
    @DisplayName("exists 조회는 공식 계약(엔드포인트·Octomo 헤더·mobileNum/text/withinMinutes)대로 호출하고 exists 값을 반환한다")
    void messageExistsCallsOctomoContract() {
        mockServer.expect(requestTo(BASE_URL + "/octomo/v1/public/message/exists"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header(HttpHeaders.AUTHORIZATION, "Octomo test-api-key"))
                .andExpect(content().contentType(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.mobileNum").value("01012345678"))
                .andExpect(jsonPath("$.text").value("7K3M9PXQ"))
                .andExpect(jsonPath("$.withinMinutes").value(5))
                .andRespond(withSuccess("{\"exists\": true}", MediaType.APPLICATION_JSON));

        assertThat(octomoClient.messageExists("01012345678", "7K3M9PXQ", 5)).isTrue();
        mockServer.verify();
    }

    @Test
    @DisplayName("exists=false 응답이면 false 를 반환한다 (아직 수신 안 됨)")
    void messageExistsReturnsFalse() {
        mockServer.expect(requestTo(BASE_URL + "/octomo/v1/public/message/exists"))
                .andRespond(withSuccess("{\"exists\": false}", MediaType.APPLICATION_JSON));

        assertThat(octomoClient.messageExists("01012345678", "7K3M9PXQ", 5)).isFalse();
    }

    @Test
    @DisplayName("exists 조회의 5xx 응답은 MoProviderException 으로 변환된다 (호출부가 PENDING 유지)")
    void messageExistsWrapsServerError() {
        mockServer.expect(requestTo(BASE_URL + "/octomo/v1/public/message/exists"))
                .andRespond(withServerError());

        assertThatThrownBy(() -> octomoClient.messageExists("01012345678", "7K3M9PXQ", 5))
                .isInstanceOf(MoProviderException.class);
    }

    @Test
    @DisplayName("exists 조회의 타임아웃·네트워크 오류는 MoProviderException 으로 변환된다 (호출부가 PENDING 유지)")
    void messageExistsWrapsNetworkFailure() {
        mockServer.expect(requestTo(BASE_URL + "/octomo/v1/public/message/exists"))
                .andRespond(withException(new IOException("connection timed out")));

        assertThatThrownBy(() -> octomoClient.messageExists("01012345678", "7K3M9PXQ", 5))
                .isInstanceOf(MoProviderException.class);
    }

    @Test
    @DisplayName("exists 가 200 이어도 빈 바디면 false 로 방어한다 (수신 미확인 취급)")
    void messageExistsReturnsFalseOnEmptyBody() {
        mockServer.expect(requestTo(BASE_URL + "/octomo/v1/public/message/exists"))
                .andRespond(withSuccess("", MediaType.APPLICATION_JSON));

        assertThat(octomoClient.messageExists("01012345678", "7K3M9PXQ", 5)).isFalse();
    }

    @Test
    @DisplayName("QR 발급 성공 시 data URL 을 반환한다")
    void createSmsQrCodeReturnsDataUrl() {
        mockServer.expect(requestTo(BASE_URL + "/octomo/v1/public/message/qr-code"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(jsonPath("$.text").value("7K3M9PXQ"))
                .andRespond(withSuccess("{\"qrCode\": \"data:image/png;base64,QQ==\"}", MediaType.APPLICATION_JSON));

        assertThat(octomoClient.createSmsQrCode("7K3M9PXQ")).contains("data:image/png;base64,QQ==");
    }

    @Test
    @DisplayName("QR 발급 실패는 empty 로 폴백한다 — 발급 API 자체를 실패시키지 않는다")
    void createSmsQrCodeFallsBackToEmpty() {
        mockServer.expect(requestTo(BASE_URL + "/octomo/v1/public/message/qr-code"))
                .andRespond(withServerError());

        assertThat(octomoClient.createSmsQrCode("7K3M9PXQ")).isEqualTo(Optional.empty());
    }

    @Test
    @DisplayName("QR 응답이 200 이어도 빈 바디면 empty 로 방어한다 (텍스트 안내 폴백)")
    void createSmsQrCodeReturnsEmptyOnEmptyBody() {
        mockServer.expect(requestTo(BASE_URL + "/octomo/v1/public/message/qr-code"))
                .andRespond(withSuccess("", MediaType.APPLICATION_JSON));

        assertThat(octomoClient.createSmsQrCode("7K3M9PXQ")).isEmpty();
    }
}
