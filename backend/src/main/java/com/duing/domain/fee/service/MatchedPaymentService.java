package com.duing.domain.fee.service;

import com.duing.domain.fee.entity.MatchStatus;

/**
 * BANK 입금 거래를 특정 청구에 매칭해 납부 1건을 생성한다.
 * 매칭 결정 로직(BE-5b)이 후보를 고른 뒤 이 서비스로 실제 납부·상태 전이를 위임한다.
 */
public interface MatchedPaymentService {

    /**
     * {@code bankTransactionId} 거래를 {@code feeBillId} 청구에 매칭한 납부를 생성한다.
     * 거래·청구는 id 로 받아 내부에서 비관적 잠금으로 재조회한다(호출측 영속성 컨텍스트와 무관 —
     * 검증·잠금·잔액 재계산의 단일 지점). Sprint 2 의 비관적 잠금·상태 재계산·납부 확인 알림을 그대로 재사용한다.
     *
     * @param clubId 동아리 격리 범위 — 거래·청구 모두 이 동아리 소속이어야 한다
     * @param matchStatus 거래에 기록할 매칭 상태(AUTO_MATCHED / MANUAL_MATCHED)
     * @param autoMatched 자동 매칭 여부 — 납부 확인 알림 문구를 분기한다
     * @param allowPartial 입금액이 잔액보다 작은 부분 납부를 허용할지 여부.
     *                     자동매칭은 {@code false}(잔액과 정확히 일치해야 매칭),
     *                     총무의 수동 승인은 {@code true}(입금액 ≤ 잔액이면 부분 납부로 기록).
     *                     초과 입금(입금액 &gt; 잔액)은 어느 경우든 거부된다.
     */
    void createMatchedPayment(Long bankTransactionId, Long clubId, Long feeBillId, Long actorId,
                              MatchStatus matchStatus, boolean autoMatched, boolean allowPartial);
}
