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

    /** 납부 재계산·연체 크론이 산출한 상태로 전이한다. 운영자가 취소(CANCELLED)한 청구는 자동 산출로 덮어쓰지 않는다. */
    public void updateStatus(FeeStatus newStatus) {
        if (this.status == FeeStatus.CANCELLED) {
            return;
        }
        this.status = newStatus;
    }

    /**
     * 청구액에서 활성(ACTIVE) 납부 합계를 뺀 잔액. 음수로 클램프하지 않는다 —
     * 호출부가 초과 납부 검증(잔액 초과 비교)과 이벤트 페이로드에 원값 그대로 사용한다.
     */
    public long remainingAfter(long activePaidSum) {
        return this.amount - activePaidSum;
    }
}
