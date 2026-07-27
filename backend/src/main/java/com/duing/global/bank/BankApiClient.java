package com.duing.global.bank;

import com.duing.global.bank.dto.BankTransactionData;
import com.duing.global.bank.dto.TransactionLookupCommand;
import java.util.List;

/**
 * BANK API(bankapi.co.kr) 호출 추상화. 테스트에서는 stub 구현으로 대체해 외부 호출 없이 검증한다.
 *
 * <p>2026-07-17 제공사 개편으로 계좌 등록 절차가 <b>폐지</b>됐다("별도의 계좌 등록 절차 없이 바로
 * 조회할 수 있습니다" — 공식 문서). 이전에 있던 계좌 등록/해제/슬롯현황({@code /v1/accounts})과
 * "인증 키당 5계좌" 한도는 함께 사라져 지금은 404 를 반환하므로 호출부에서 제거했다.
 * 현행 호출 한도는 계좌 단위 시간 제한(같은 계좌 5분 1회 등)이라 전역 슬롯 개념 자체가 없다.
 */
public interface BankApiClient {

    /**
     * 지정 기간의 거래 내역을 조회한다.
     */
    List<BankTransactionData> getTransactions(TransactionLookupCommand command);
}
