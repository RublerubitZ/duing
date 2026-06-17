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
 *
 * <p>자유 텍스트 필드(상대방·내용·메모)에 구분자가 들어가도 서로 다른 거래가 같은 해시 입력을 만들지
 * 않도록, 각 필드를 {@code "길이:값"} 으로 길이 프리픽스 직렬화한 뒤 이어 붙인다(구분자 인젝션 차단).
 */
@Component
public class TransactionHasher {

    public String hash(Long clubId, String bankCode, BankTransactionData transaction) {
        StringBuilder input = new StringBuilder();
        appendField(input, clubId == null ? null : clubId.toString());
        appendField(input, bankCode);
        appendField(input, transaction.transactionAt() == null ? null : transaction.transactionAt().toString());
        appendField(input, Long.toString(transaction.amount()));
        appendField(input, transaction.balance() == null ? null : transaction.balance().toString());
        appendField(input, normalizeType(transaction.type()));
        appendField(input, transaction.counterparty());
        appendField(input, transaction.description());
        appendField(input, transaction.branch());
        appendField(input, transaction.memo());
        return toSha256Hex(input.toString());
    }

    /**
     * 각 필드를 {@code "길이:값"} 으로 직렬화해 구분자 인젝션을 방지한다(필드 안에 {@code ':'} 나
     * 구분자가 있어도 길이가 경계를 확정하므로 모호하지 않다). null 은 빈 문자열로 정규화한다.
     */
    private void appendField(StringBuilder input, String value) {
        String normalized = value == null ? "" : value;
        input.append(normalized.length()).append(':').append(normalized);
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
