package com.duing.global.bank.dto;

import java.time.LocalDate;

/**
 * BANK API 거래 조회 입력. 계좌비밀번호·주민번호 등 민감정보를 운반하므로 절대 로깅하지 않는다.
 */
public record TransactionLookupCommand(
        String bankCode,
        String accountNumber,
        String accountPassword,
        String residentNumber,
        LocalDate startDate,
        LocalDate endDate
) {}
