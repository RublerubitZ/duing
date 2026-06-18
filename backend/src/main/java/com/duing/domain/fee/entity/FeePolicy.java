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

    @Enumerated(EnumType.STRING)
    @Column(name = "target_type", nullable = false, length = 30)
    private FeeTargetType targetType;

    @Column(nullable = false)
    private boolean active;

    @Column(name = "auto_issue", nullable = false)
    private boolean autoIssue;

    @Column(name = "issue_day")
    private Integer issueDay;

    @Column(name = "due_day")
    private Integer dueDay;

    @Builder(access = AccessLevel.PRIVATE)
    private FeePolicy(Long clubId, String name, Long amount, BillingType billingType,
                      FeeTargetType targetType, boolean active) {
        this.clubId = clubId;
        this.name = name;
        this.amount = amount;
        this.billingType = billingType;
        this.targetType = targetType;
        this.active = active;
    }

    public static FeePolicy create(Long clubId, String name, Long amount, BillingType billingType,
                                   FeeTargetType targetType) {
        return FeePolicy.builder()
                .clubId(clubId).name(name).amount(amount).billingType(billingType)
                .targetType(targetType).active(true)
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

    /**
     * 자동 월발행 설정을 반영한다. 끄는 경우(autoIssue=false) 발행일·마감일을 함께 비운다(DB CHECK 정합).
     * 켜는 경우 호출 전 검증(MONTHLY·1~28·dueDay>=issueDay)을 통과했다고 가정한다.
     */
    public void applyAutoIssue(boolean autoIssue, Integer issueDay, Integer dueDay) {
        this.autoIssue = autoIssue;
        this.issueDay = autoIssue ? issueDay : null;
        this.dueDay = autoIssue ? dueDay : null;
    }
}
