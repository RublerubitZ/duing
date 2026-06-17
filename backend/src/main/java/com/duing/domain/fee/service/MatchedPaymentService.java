package com.duing.domain.fee.service;

import com.duing.domain.fee.entity.BankTransaction;
import com.duing.domain.fee.entity.MatchStatus;

/**
 * BANK 입금 거래를 특정 청구에 매칭해 납부 1건을 생성한다.
 * 매칭 결정 로직(BE-5b)이 후보를 고른 뒤 이 서비스로 실제 납부·상태 전이를 위임한다.
 */
public interface MatchedPaymentService {

    /**
     * 거래({@code tx})를 {@code feeBillId} 청구에 매칭한 납부를 생성한다.
     * Sprint 2 의 비관적 잠금·상태 재계산·납부 확인 알림을 그대로 재사용한다.
     *
     * @param matchStatus 거래에 기록할 매칭 상태(AUTO_MATCHED / MANUAL_MATCHED)
     * @param autoMatched 자동 매칭 여부 — 납부 확인 알림 문구를 분기한다
     */
    void createMatchedPayment(BankTransaction tx, Long feeBillId, Long actorId,
                              MatchStatus matchStatus, boolean autoMatched);
}
