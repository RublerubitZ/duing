package com.duing.domain.fee.service;

import com.duing.domain.fee.entity.MatchStatus;
import com.duing.domain.fee.service.dto.query.BankTransactionView;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

/**
 * 운영진(LEADER/OFFICER)의 BANK 거래 검토 큐 처리.
 * PENDING 입금에 매칭 후보를 동봉해 보여주고, 승인(수동 매칭)·무시·매칭취소를 수행한다.
 */
public interface BankTransactionReviewService {

    /** 거래를 상태별로 페이지 조회한다. PENDING 입금에는 잔액=입금액 후보 청구를 동봉한다. */
    Page<BankTransactionView> list(Long clubId, Long actorId, MatchStatus status, Pageable pageable);

    /** PENDING 입금을 후보 청구 1건에 수동 매칭한다(MANUAL_MATCHED + TRANSFER 납부 생성). */
    void approve(Long clubId, Long actorId, Long txId, Long feeBillId);

    /** PENDING 입금을 회비와 무관한 거래로 표시한다. */
    void ignore(Long clubId, Long actorId, Long txId);

    /** 이미 매칭된 거래의 매칭을 해제한다(연결 납부 VOID + 청구 상태 복귀 + 거래 PENDING 복귀). */
    void unmatch(Long clubId, Long actorId, Long txId);
}
