package com.duing.domain.facility.crawler;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;

import com.duing.domain.facility.config.FacilityCrawlerProperties;
import com.duing.domain.facility.crawler.exception.FacilityClientException.FacilityBadResponseException;
import com.duing.domain.facility.crawler.exception.FacilityClientException.FacilityFetchException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.YearMonth;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.retry.annotation.EnableRetry;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.junit.jupiter.SpringExtension;
import org.springframework.test.web.client.ExpectedCount;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

@ExtendWith(SpringExtension.class)
@ContextConfiguration(classes = SchoolFacilityClientRetryTest.RetryTestConfig.class)
@TestPropertySource(properties = {
        "duing.facility.crawler.retry-max-attempts=4",
        "duing.facility.crawler.on-demand-retry-max-attempts=2", // 온디맨드는 FE 타임아웃 내 응답 위해 축소 예산
        "duing.facility.crawler.retry-backoff-millis=1" // 테스트 가속(0.5s 실대기 회피)
})
class SchoolFacilityClientRetryTest {

    @Autowired SchoolFacilityClient client;
    @Autowired MockRestServiceServer mockServer;

    @AfterEach
    void resetServer() {
        mockServer.reset();
    }

    @Test
    @DisplayName("5xx 응답은 총 4회(초기 1 + 재시도 3)까지 재시도한 뒤 FacilityFetchException 을 던진다")
    void serverErrorRetriesFourTimes() {
        mockServer.expect(ExpectedCount.times(4), requestTo("https://school.test/room/data/list"))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withServerError());

        assertThatThrownBy(() -> client.fetchReservations(4, YearMonth.of(2026, 7)))
                .isInstanceOf(FacilityFetchException.class);
        mockServer.verify(); // 정확히 4회 요청 수신을 단언
    }

    @Test
    @DisplayName("온디맨드 예산의 5xx 응답은 총 2회(초기 1 + 재시도 1)까지만 재시도한 뒤 FacilityFetchException 을 던진다")
    void onDemandServerErrorRetriesOnlyTwice() {
        mockServer.expect(ExpectedCount.times(2), requestTo("https://school.test/room/data/list"))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withServerError());

        assertThatThrownBy(() -> client.fetchReservationsOnDemand(4, YearMonth.of(2026, 7)))
                .isInstanceOf(FacilityFetchException.class);
        mockServer.verify(); // 정확히 2회 요청 수신을 단언 — 스케줄러 예산(4회)과 분리
    }

    @Test
    @DisplayName("4xx 응답은 재시도하지 않고 단 1회 요청 후 FacilityBadResponseException 을 던진다")
    void clientErrorNotRetried() {
        mockServer.expect(ExpectedCount.times(1), requestTo("https://school.test/room/data/list"))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withStatus(HttpStatus.BAD_REQUEST));

        assertThatThrownBy(() -> client.fetchReservations(4, YearMonth.of(2026, 7)))
                .isInstanceOf(FacilityBadResponseException.class);
        mockServer.verify(); // 재시도 없이 1회만
    }

    @Test
    @DisplayName("4xx 응답 본문이 HTML(비 JSON)이어도 재시도 없이 1회만 요청하고 FacilityBadResponseException 을 던진다")
    void clientErrorWithHtmlBodyNotRetried() {
        mockServer.expect(ExpectedCount.times(1), requestTo("https://school.test/room/data/list"))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withStatus(HttpStatus.BAD_REQUEST).contentType(MediaType.TEXT_HTML).body("<html>error</html>"));

        assertThatThrownBy(() -> client.fetchReservations(4, YearMonth.of(2026, 7)))
                .isInstanceOf(FacilityBadResponseException.class);
        mockServer.verify(); // 4xx = 비재시도, 1회만
    }

    @Test
    @DisplayName("200 이지만 본문이 HTML/깨진 JSON 이면 재시도 없이 FacilityBadResponseException(파싱 실패)을 던진다")
    void malformedOkBodyNotRetried() {
        mockServer.expect(ExpectedCount.times(1), requestTo("https://school.test/room/data/list"))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withStatus(HttpStatus.OK).contentType(MediaType.TEXT_HTML).body("<html>blocked</html>"));

        assertThatThrownBy(() -> client.fetchReservations(4, YearMonth.of(2026, 7)))
                .isInstanceOf(FacilityBadResponseException.class);
        mockServer.verify(); // 파싱 실패도 계층 안에서 비재시도
    }

    @Configuration
    @EnableRetry
    static class RetryTestConfig {

        @Bean
        RestClient.Builder facilityBuilder() {
            return RestClient.builder().baseUrl("https://school.test");
        }

        // 빌더에 mock 팩토리를 심는다. facilitySchoolRestClient 가 이 빈에 의존하므로 바인딩 후 build 된다.
        @Bean
        MockRestServiceServer mockServer(RestClient.Builder facilityBuilder) {
            return MockRestServiceServer.bindTo(facilityBuilder).build();
        }

        @Bean
        RestClient facilitySchoolRestClient(RestClient.Builder facilityBuilder, MockRestServiceServer mockServer) {
            return facilityBuilder.build();
        }

        @Bean
        ObjectMapper objectMapper() {
            return new ObjectMapper();
        }

        @Bean
        FacilityCrawlerProperties facilityCrawlerProperties() {
            return new FacilityCrawlerProperties(
                    "https://school.test", "/room/detail", "/room/data/list",
                    "DuingFacilityTest/1.0", 500, 500, 4, 1, 2, 10, 1, false);
        }

        @Bean
        SchoolFacilityClient schoolFacilityClient(RestClient facilitySchoolRestClient,
                                                  FacilityCrawlerProperties props, ObjectMapper objectMapper) {
            return new SchoolFacilityClient(facilitySchoolRestClient, props, objectMapper);
        }
    }
}
