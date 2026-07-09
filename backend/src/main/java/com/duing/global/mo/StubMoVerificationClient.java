package com.duing.global.mo;

import java.time.LocalDateTime;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * {@code mo.provider=stub}(기본) 전용 — 로컬·CI 에서 Octomo 없이 동작한다.
 *
 * <p>테스트: {@link #registerInboundMessage} 로 (발신번호, 본문) 쌍을 주입해 수신을 시뮬레이션한다.
 * 로컬 수동 확인: {@code mo.stub.auto-verify-after-seconds} 가 양수(N)면 최초 조회 후 N초 지난
 * 세션을 수신된 것으로 간주한다 (기본 0 = 비활성. 자동화 테스트에서는 사용 금지 — 시간 의존 플래키).
 */
@Component
@ConditionalOnProperty(name = "mo.provider", havingValue = "stub", matchIfMissing = true)
public class StubMoVerificationClient implements MoVerificationClient {

    public static final String STUB_QR_DATA_URL = "data:image/png;base64,c3R1Yi1xcg==";

    private final long autoVerifyAfterSeconds;
    private final Set<String> inboundMessages = ConcurrentHashMap.newKeySet();
    private final ConcurrentHashMap<String, LocalDateTime> firstQueriedAt = new ConcurrentHashMap<>();

    public StubMoVerificationClient(
            @Value("${mo.stub.auto-verify-after-seconds:0}") long autoVerifyAfterSeconds) {
        this.autoVerifyAfterSeconds = autoVerifyAfterSeconds;
    }

    @Override
    public boolean messageExists(String mobileNum, String text, int withinMinutes) {
        String messageKey = key(mobileNum, text);
        if (inboundMessages.contains(messageKey)) {
            return true;
        }
        if (autoVerifyAfterSeconds <= 0) {
            return false;
        }
        LocalDateTime firstAsked = firstQueriedAt.computeIfAbsent(messageKey, ignored -> LocalDateTime.now());
        return !LocalDateTime.now().isBefore(firstAsked.plusSeconds(autoVerifyAfterSeconds));
    }

    @Override
    public Optional<String> createSmsQrCode(String text) {
        return Optional.of(STUB_QR_DATA_URL);
    }

    /** 테스트 전용 — (발신번호, 본문) 수신을 시뮬레이션한다. 발신번호는 하이픈 없는 숫자만(서비스 정규화와 동일). */
    public void registerInboundMessage(String mobileNum, String text) {
        inboundMessages.add(key(mobileNum, text));
    }

    /** 테스트 전용 — 등록된 수신·최초 조회 기록 초기화. */
    public void clear() {
        inboundMessages.clear();
        firstQueriedAt.clear();
    }

    private String key(String mobileNum, String text) {
        return mobileNum + ":" + text;
    }
}
