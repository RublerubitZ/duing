package com.duing.domain.fee.support;

import com.duing.global.bank.dto.BankTransactionData;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import org.springframework.stereotype.Component;

/**
 * BANK API 거래 1건의 멱등 식별용 SHA-256 해시를 만든다.
 *
 * <p>bank_transaction.transaction_hash 컬럼은 <b>전역 unique</b> 이므로, 서로 다른 동아리의
 * 똑같이 생긴 거래가 같은 해시로 충돌해 한쪽이 적재 실패하면 안 된다. 따라서 {@code clubId} 를
 * 반드시 해시 입력에 포함한다.
 *
 * <p>null 필드는 빈 문자열로 정규화하고, type 은 입금/출금을 DEPOSIT/WITHDRAWAL 로 정규화한다.
 * 같은 거래는 항상 같은 64자리 소문자 hex 를 만든다.
 */
@Component
public class TransactionHasher {

    private static final String DELIMITER = "|";

    public String hash(Long clubId, String bankCode, BankTransactionData transaction) {
        String input = String.join(DELIMITER,
                normalize(clubId == null ? null : clubId.toString()),
                normalize(bankCode),
                normalize(transaction.transactionAt() == null ? null : transaction.transactionAt().toString()),
                Long.toString(transaction.amount()),
                normalize(transaction.balance() == null ? null : transaction.balance().toString()),
                normalizeType(transaction.type()),
                normalize(transaction.counterparty()),
                normalize(transaction.description()),
                normalize(transaction.branch()),
                normalize(transaction.memo()));
        return toSha256Hex(input);
    }

    private String normalize(String value) {
        return value == null ? "" : value;
    }

    private String normalizeType(String type) {
        if (type == null) {
            return "";
        }
        if ("deposit".equalsIgnoreCase(type)) {
            return "DEPOSIT";
        }
        if ("withdrawal".equalsIgnoreCase(type)) {
            return "WITHDRAWAL";
        }
        return type.toUpperCase();
    }

    private String toSha256Hex(String input) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hashed = digest.digest(input.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(hashed.length * 2);
            for (byte hashedByte : hashed) {
                hex.append(Character.forDigit((hashedByte >> 4) & 0xF, 16));
                hex.append(Character.forDigit(hashedByte & 0xF, 16));
            }
            return hex.toString();
        } catch (NoSuchAlgorithmException unsupportedAlgorithm) {
            // SHA-256 은 JDK 표준 — 사실상 발생하지 않으나 체크 예외를 런타임으로 승격한다.
            throw new IllegalStateException("SHA-256 해시 알고리즘을 사용할 수 없습니다.", unsupportedAlgorithm);
        }
    }
}
