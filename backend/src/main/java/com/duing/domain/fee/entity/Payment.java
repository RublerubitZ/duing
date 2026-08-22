package com.duing.domain.fee.entity;

import com.duing.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;

@Getter
@Entity
@Table(name = "payment")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLDelete(sql = "UPDATE payment SET deleted_at = NOW() WHERE id = ?")
@SQLRestriction("deleted_at IS NULL")
public class Payment extends BaseEntity {

    @Column(name = "fee_bill_id", nullable = false)
    private Long feeBillId;

    @Column(nullable = false)
    private Long amount;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private PaymentMethod method;

    // timestamptz 컬럼 — 정합 절대시각으로 저장한다(수기 납부는 KST 자정, BANK 매칭은 거래 시각).
    @Column(name = "paid_at", nullable = false)
    private Instant paidAt;

    @Column(name = "recorded_by", nullable = false)
    private Long recordedBy;

    @Column(length = 200)
    private String memo;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private PaymentStatus status;

    @Column(name = "voided_by")
    private Long voidedBy;

    @Column(name = "voided_at")
    private Instant voidedAt;

    @Column(name = "void_reason", length = 200)
    private String voidReason;

    // BANK 거래 매칭으로 생성된 납부만 채워진다(수동 납부는 null). V63 의 payment.bank_transaction_id 컬럼에 매핑.
    @Column(name = "bank_transaction_id")
    private Long bankTransactionId;

    @Builder(access = AccessLevel.PRIVATE)
    private Payment(Long feeBillId, Long amount, PaymentMethod method, Instant paidAt,
                    Long recordedBy, String memo, PaymentStatus status) {
        this.feeBillId = feeBillId;
        this.amount = amount;
        this.method = method;
        this.paidAt = paidAt;
        this.recordedBy = recordedBy;
        this.memo = memo;
        this.status = status;
    }

    public static Payment record(Long feeBillId, Long amount, PaymentMethod method, Instant paidAt,
                                 Long recordedBy, String memo) {
        return Payment.builder()
                .feeBillId(feeBillId).amount(amount).method(method).paidAt(paidAt)
                .recordedBy(recordedBy).memo(memo).status(PaymentStatus.ACTIVE)
                .build();
    }

    /** 매칭된 BANK 거래 id 를 연결한다. 매칭 납부 생성 시에만 호출된다. */
    public void linkBankTransaction(Long bankTransactionId) {
        this.bankTransactionId = bankTransactionId;
    }

    /** 납부를 정정(무효화)한다. 이미 정정된 경우 기존 이력을 보존하기 위해 멱등 no-op 으로 처리한다. */
    public void voidPayment(Long actorId, String reason, Instant now) {
        if (status == PaymentStatus.VOIDED) {
            return;
        }
        this.status = PaymentStatus.VOIDED;
        this.voidedBy = actorId;
        this.voidedAt = now;
        this.voidReason = reason;
    }

    public boolean isActive() {
        return status == PaymentStatus.ACTIVE;
    }
}
