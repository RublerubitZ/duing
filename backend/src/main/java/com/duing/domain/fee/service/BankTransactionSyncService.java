package com.duing.domain.fee.service;

import com.duing.domain.fee.service.dto.command.SyncTransactionsCommand;
import com.duing.domain.fee.service.dto.query.SyncResult;

/**
 * 총무가 수동으로 트리거하는 BANK 거래 동기화. 계좌 비밀번호 + 주민번호 앞 6자리를 입력받아 BANK API 로
 * 지정 기간 거래를 조회하고, 멱등(transaction_hash unique)으로 적재한다.
 *
 * <p><b>인증정보 비저장 원칙</b>: {@link SyncTransactionsCommand} 의 {@code accountPassword}·
 * {@code residentNumber} 는 BANK API 거래 조회 호출에만 사용하고, DB·캐시·로그·이벤트·raw_payload
 * 어디에도 저장하거나 출력하지 않는다. 호출 직후 별도 참조 없이 메서드 스코프 종료로 폐기된다.
 */
public interface BankTransactionSyncService {

    /**
     * 운영진 권한·자동매칭 사용 가능 여부를 검증한 뒤, BANK API 거래를 조회해 멱등 적재한다.
     * 매칭은 BE-5 에서 구현한다 — 현재는 입금을 모두 PENDING(검토 대기)으로 적재하고 자동매칭은 0건이다.
     */
    SyncResult sync(SyncTransactionsCommand command);
}
