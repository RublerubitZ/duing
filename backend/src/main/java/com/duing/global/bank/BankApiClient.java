package com.duing.global.bank;

import com.duing.global.bank.dto.AccountSlotStatus;
import com.duing.global.bank.dto.BankTransactionData;
import com.duing.global.bank.dto.TransactionLookupCommand;
import java.util.List;

/**
 * BANK API(bankapi.co.kr) 호출 추상화. 테스트에서는 stub 구현으로 대체해 외부 호출 없이 검증한다.
 */
public interface BankApiClient {

    /**
     * 계좌를 BANK API 에 등록한다. 이미 등록된 계좌는 멱등 성공으로 처리(예외 없이 정상 반환)한다.
     */
    void registerAccount(String bankCode, String accountNumber);

    /**
     * 계좌 등록을 해제한다. 미등록 계좌는 멱등 성공으로 처리한다.
     */
    void deleteAccount(String bankCode, String accountNumber);

    /**
     * 현재 인증 키의 계좌 등록 슬롯 현황을 조회한다.
     */
    AccountSlotStatus getAccountStatus();

    /**
     * 지정 기간의 거래 내역을 조회한다.
     */
    List<BankTransactionData> getTransactions(TransactionLookupCommand command);
}
