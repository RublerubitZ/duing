package com.duing.domain.fee.support;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.global.bank.dto.BankTransactionData;
import java.time.LocalDateTime;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class TransactionHasherTest {

    private final TransactionHasher hasher = new TransactionHasher();

    private static final Long CLUB_ID = 1L;
    private static final String BANK_CODE = "NH";

    private BankTransactionData transaction(String counterparty, String description, String branch, String memo) {
        return new BankTransactionData(
                LocalDateTime.of(2026, 6, 17, 14, 30, 0),
                15000L,
                250000L,
                "deposit",
                counterparty,
                description,
                branch,
                memo,
                "{\"raw\":true}");
    }

    @Test
    @DisplayName("같은 입력은 항상 같은 64자리 소문자 hex 해시를 만든다")
    void sameInputProducesSameHash() {
        BankTransactionData transaction = transaction("홍길동", "회비", "본점", "메모");

        String first = hasher.hash(CLUB_ID, BANK_CODE, transaction);
        String second = hasher.hash(CLUB_ID, BANK_CODE, transaction);

        assertThat(first).isEqualTo(second);
        assertThat(first).hasSize(64);
        assertThat(first).matches("[0-9a-f]{64}");
    }

    @Test
    @DisplayName("counterparty 가 null 이든 빈 문자열이든 같은 해시를 만든다(null 정규화)")
    void normalizesNullToEmptyString() {
        String nullCounterparty = hasher.hash(CLUB_ID, BANK_CODE, transaction(null, "회비", "본점", "메모"));
        String emptyCounterparty = hasher.hash(CLUB_ID, BANK_CODE, transaction("", "회비", "본점", "메모"));

        assertThat(nullCounterparty).isEqualTo(emptyCounterparty);
    }

    @Test
    @DisplayName("동아리가 다르면 똑같이 생긴 거래라도 다른 해시를 만든다(전역 unique 충돌 방지)")
    void differentClubIdProducesDifferentHash() {
        BankTransactionData transaction = transaction("홍길동", "회비", "본점", "메모");

        String clubOneHash = hasher.hash(1L, BANK_CODE, transaction);
        String clubTwoHash = hasher.hash(2L, BANK_CODE, transaction);

        assertThat(clubOneHash).isNotEqualTo(clubTwoHash);
    }

    @Test
    @DisplayName("은행 코드가 다르면 똑같이 생긴 거래라도 다른 해시를 만든다")
    void differentBankCodeProducesDifferentHash() {
        BankTransactionData transaction = transaction("홍길동", "회비", "본점", "메모");

        String nhHash = hasher.hash(CLUB_ID, "NH", transaction);
        String kbHash = hasher.hash(CLUB_ID, "KB", transaction);

        assertThat(nhHash).isNotEqualTo(kbHash);
    }

    @Test
    @DisplayName("description 이 다르면 다른 해시를 만든다")
    void differentDescriptionProducesDifferentHash() {
        String first = hasher.hash(CLUB_ID, BANK_CODE, transaction("홍길동", "회비", "본점", "메모"));
        String second = hasher.hash(CLUB_ID, BANK_CODE, transaction("홍길동", "후원금", "본점", "메모"));

        assertThat(first).isNotEqualTo(second);
    }

    @Test
    @DisplayName("branch 가 다르면 다른 해시를 만든다")
    void differentBranchProducesDifferentHash() {
        String first = hasher.hash(CLUB_ID, BANK_CODE, transaction("홍길동", "회비", "본점", "메모"));
        String second = hasher.hash(CLUB_ID, BANK_CODE, transaction("홍길동", "회비", "강남지점", "메모"));

        assertThat(first).isNotEqualTo(second);
    }

    @Test
    @DisplayName("memo 가 다르면 다른 해시를 만든다")
    void differentMemoProducesDifferentHash() {
        String first = hasher.hash(CLUB_ID, BANK_CODE, transaction("홍길동", "회비", "본점", "메모A"));
        String second = hasher.hash(CLUB_ID, BANK_CODE, transaction("홍길동", "회비", "본점", "메모B"));

        assertThat(first).isNotEqualTo(second);
    }
}
