package com.duing.global.mo;

import java.util.Optional;

/**
 * MO(문자 발신) 인증 벤더 포트 (spec §8). 현재 어댑터는 Octomo — exists 형(발신번호+본문 쌍 확인) 벤더까지만
 * 이 포트로 교체 가능하며, PASS/NICE 등 리다이렉트형 본인확인은 별개 설계다.
 */
public interface MoVerificationClient {

    /**
     * (발신번호, 본문) 쌍이 최근 withinMinutes 분 내 대표번호로 수신됐는지 확인한다 — Octomo Message Exists.
     * 조회 실패(비2xx·타임아웃·네트워크)는 {@link MoProviderException} — 호출부는 PENDING 을 유지한다.
     */
    boolean messageExists(String mobileNum, String text, int withinMinutes);

    /** SMSTO 딥링크 QR(data URL) 발급. 실패 시 empty — 호출부가 코드 텍스트 안내로 폴백한다 (spec §2.2). */
    Optional<String> createSmsQrCode(String text);
}
