package com.duing.global.mo;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class StubMoVerificationClientTest {

    private final StubMoVerificationClient stubClient = new StubMoVerificationClient(0);

    @Test
    @DisplayName("등록된 (발신번호, 본문) 쌍만 수신된 것으로 판정한다")
    void matchesOnlyRegisteredPairs() {
        stubClient.registerInboundMessage("01012345678", "7K3M9PXQ");

        assertThat(stubClient.messageExists("01012345678", "7K3M9PXQ", 5)).isTrue();
        assertThat(stubClient.messageExists("01012345678", "OTHERCOD", 5)).isFalse();
        assertThat(stubClient.messageExists("01099998888", "7K3M9PXQ", 5)).isFalse();
    }

    @Test
    @DisplayName("clear 는 등록된 수신 기록을 모두 지운다 (테스트 격리용)")
    void clearRemovesRegisteredMessages() {
        stubClient.registerInboundMessage("01012345678", "7K3M9PXQ");
        stubClient.clear();

        assertThat(stubClient.messageExists("01012345678", "7K3M9PXQ", 5)).isFalse();
    }

    @Test
    @DisplayName("QR 은 항상 고정 스텁 data URL 을 반환한다")
    void qrReturnsStubDataUrl() {
        assertThat(stubClient.createSmsQrCode("7K3M9PXQ"))
                .contains(StubMoVerificationClient.STUB_QR_DATA_URL);
    }
}
