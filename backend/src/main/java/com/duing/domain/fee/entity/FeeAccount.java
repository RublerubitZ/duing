package com.duing.domain.fee.entity;

import com.duing.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;

/**
 * 동아리 회비 입금 계좌. 동아리당 활성 1건(uk_fee_account_club).
 *
 * <p>{@code accountNumber} 는 평문이 아니라 AES-256-GCM 암호문(base64)을 그대로 보관한다.
 * 암·복호화는 서비스 계층이 {@code FeeAccountCipher} 로 수행하며, 엔티티는 문자열만 들고 있는다.
 */
@Getter
@Entity
@Table(name = "fee_account")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLDelete(sql = "UPDATE fee_account SET deleted_at = NOW() WHERE id = ?")
@SQLRestriction("deleted_at IS NULL")
public class FeeAccount extends BaseEntity {

    @Column(name = "club_id", nullable = false)
    private Long clubId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private Bank bank;

    // 암호문(base64) 저장 — 평문 계좌번호 금지.
    @Column(name = "account_number", nullable = false, length = 255)
    private String accountNumber;

    @Column(name = "account_holder", nullable = false, length = 50)
    private String accountHolder;

    @Builder(access = AccessLevel.PRIVATE)
    private FeeAccount(Long clubId, Bank bank, String accountNumber, String accountHolder) {
        this.clubId = clubId;
        this.bank = bank;
        this.accountNumber = accountNumber;
        this.accountHolder = accountHolder;
    }

    public static FeeAccount create(Long clubId, Bank bank, String accountNumber, String accountHolder) {
        return FeeAccount.builder()
                .clubId(clubId).bank(bank).accountNumber(accountNumber).accountHolder(accountHolder)
                .build();
    }

    public void update(Bank bank, String accountNumber, String accountHolder) {
        if (bank != null) {
            this.bank = bank;
        }
        if (accountNumber != null) {
            this.accountNumber = accountNumber;
        }
        if (accountHolder != null) {
            this.accountHolder = accountHolder;
        }
    }
}
