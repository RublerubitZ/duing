package com.duing.global.mo;

import java.util.Map;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

/**
 * Octomo(octoverse.kr) MO 조회 어댑터 — 공식 샘플 코드의 계약을 따른다 (spec §2).
 *
 * <p>exists: {@code POST /octomo/v1/public/message/exists} body {mobileNum, text, withinMinutes}
 * → {exists}. QR: {@code POST /octomo/v1/public/message/qr-code} body {text} → {qrCode(data URL)}.
 * 인증 헤더({@code Authorization: Octomo {key}})와 타임아웃은 OctomoClientConfig 가 주입한다.
 *
 * <p>로깅 정책: 벤더 응답 바디가 섞이는 예외 원문은 로그로 내보내지 않는다(인증코드·PII 배제).
 * exists 실패는 MoProviderException 으로 던지기만 하고, 로깅 수위는 호출부가 결정한다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
@ConditionalOnProperty(name = "mo.provider", havingValue = "octomo")
public class OctomoMoVerificationClient implements MoVerificationClient {

    private final RestClient octomoRestClient;

    record ExistsResponse(boolean exists) {}

    record QrCodeResponse(String qrCode) {}

    @Override
    public boolean messageExists(String mobileNum, String text, int withinMinutes) {
        try {
            ExistsResponse existsResponse = octomoRestClient.post()
                    .uri("/octomo/v1/public/message/exists")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of("mobileNum", mobileNum, "text", text, "withinMinutes", withinMinutes))
                    .retrieve()
                    .body(ExistsResponse.class);
            return existsResponse != null && existsResponse.exists();
        } catch (RestClientResponseException httpFailure) {
            throw new MoProviderException(
                    "Octomo exists 조회 실패(HTTP " + httpFailure.getStatusCode().value() + ")", httpFailure);
        } catch (RestClientException existsFailure) {
            throw new MoProviderException(
                    "Octomo exists 조회 실패(" + existsFailure.getClass().getSimpleName() + ")", existsFailure);
        }
    }

    @Override
    public Optional<String> createSmsQrCode(String text) {
        try {
            QrCodeResponse qrCodeResponse = octomoRestClient.post()
                    .uri("/octomo/v1/public/message/qr-code")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of("text", text))
                    .retrieve()
                    .body(QrCodeResponse.class);
            return Optional.ofNullable(qrCodeResponse == null ? null : qrCodeResponse.qrCode());
        } catch (RestClientException qrFailure) {
            // QR 은 부가 기능 — 발급 플로우를 죽이지 않고 코드 텍스트 안내로 폴백한다 (spec §7.1).
            // 벤더 4xx/5xx 응답 바디가 예외 메시지에 섞일 수 있어(RestClientResponseException 관례)
            // 예외 객체를 로그에 싣지 않는다 — 응답 바디의 PII 를 로그에서 배제하는 정책 (ERROR 는 Sentry 전송).
            log.warn("Octomo QR 발급 실패({}) — 텍스트 안내로 폴백한다.", qrFailure.getClass().getSimpleName());
            return Optional.empty();
        }
    }
}
