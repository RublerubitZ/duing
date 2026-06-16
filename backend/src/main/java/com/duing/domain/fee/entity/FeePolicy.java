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

@Getter
@Entity
@Table(name = "fee_policy")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLDelete(sql = "UPDATE fee_policy SET deleted_at = NOW() WHERE id = ?")
@SQLRestriction("deleted_at IS NULL")
public class FeePolicy extends BaseEntity {

    @Column(name = "club_id", nullable = false)
    private Long clubId;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(nullable = false)
    private Long amount;

    @Enumerated(EnumType.STRING)
    @Column(name = "billing_type", nullable = false, length = 20)
    private BillingType billingType;

    @Column(nullable = false)
    private boolean active;

    @Builder(access = AccessLevel.PRIVATE)
    private FeePolicy(Long clubId, String name, Long amount, BillingType billingType, boolean active) {
        this.clubId = clubId;
        this.name = name;
        this.amount = amount;
        this.billingType = billingType;
        this.active = active;
    }

    public static FeePolicy create(Long clubId, String name, Long amount, BillingType billingType) {
        return FeePolicy.builder()
                .clubId(clubId).name(name).amount(amount).billingType(billingType).active(true)
                .build();
    }

    public void update(String name, Long amount, BillingType billingType, Boolean active) {
        if (name != null) {
            this.name = name;
        }
        if (amount != null) {
            this.amount = amount;
        }
        if (billingType != null) {
            this.billingType = billingType;
        }
        if (active != null) {
            this.active = active;
        }
    }
}
