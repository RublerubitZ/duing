package com.duing.domain.fee.entity;

import com.duing.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import java.time.LocalDate;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;

@Getter
@Entity
@Table(name = "fee_bill")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLDelete(sql = "UPDATE fee_bill SET deleted_at = NOW() WHERE id = ?")
@SQLRestriction("deleted_at IS NULL")
public class FeeBill extends BaseEntity {

    @Column(name = "club_id", nullable = false)
    private Long clubId;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "fee_policy_id", nullable = false)
    private Long feePolicyId;

    @Column(nullable = false)
    private Long amount;

    @Column(name = "billing_period", nullable = false, length = 30)
    private String billingPeriod;

    @Column(name = "billing_start_date", nullable = false)
    private LocalDate billingStartDate;

    @Column(name = "billing_end_date", nullable = false)
    private LocalDate billingEndDate;

    @Column(name = "due_date", nullable = false)
    private LocalDate dueDate;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private FeeStatus status;

    @Builder(access = AccessLevel.PRIVATE)
    private FeeBill(Long clubId, Long userId, Long feePolicyId, Long amount, String billingPeriod,
                    LocalDate billingStartDate, LocalDate billingEndDate, LocalDate dueDate, FeeStatus status) {
        this.clubId = clubId;
        this.userId = userId;
        this.feePolicyId = feePolicyId;
        this.amount = amount;
        this.billingPeriod = billingPeriod;
        this.billingStartDate = billingStartDate;
        this.billingEndDate = billingEndDate;
        this.dueDate = dueDate;
        this.status = status;
    }

    public static FeeBill issue(Long clubId, Long userId, Long feePolicyId, Long amount, String billingPeriod,
                                LocalDate billingStartDate, LocalDate billingEndDate, LocalDate dueDate) {
        return FeeBill.builder()
                .clubId(clubId).userId(userId).feePolicyId(feePolicyId).amount(amount)
                .billingPeriod(billingPeriod).billingStartDate(billingStartDate)
                .billingEndDate(billingEndDate).dueDate(dueDate).status(FeeStatus.PENDING)
                .build();
    }

    public void cancel() {
        this.status = FeeStatus.CANCELLED;
    }
}
