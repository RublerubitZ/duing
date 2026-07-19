package com.duing.domain.facilitysubmission.entity;

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

/**
 * 학교 제출 감사 로그 — append-only, 수정 메서드를 두지 않는다(auth_event 와 동일 원칙, 스펙 §2).
 * deleted_at 은 BaseEntity 일관성으로만 존재, 항상 NULL.
 */
@Getter
@Entity
@Table(name = "facility_submission_audit")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class FacilitySubmissionAudit extends BaseEntity {

    @Column(name = "batch_id", nullable = false)
    private Long batchId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private SubmissionAuditAction action;

    @Column(name = "admin_id", nullable = false)
    private Long adminId;

    @Column(name = "ip_address", length = 45)
    private String ipAddress;

    @Column(name = "user_agent", length = 500)
    private String userAgent;

    @Builder(access = AccessLevel.PRIVATE)
    private FacilitySubmissionAudit(Long batchId, SubmissionAuditAction action, Long adminId,
                                    String ipAddress, String userAgent) {
        this.batchId = batchId;
        this.action = action;
        this.adminId = adminId;
        this.ipAddress = ipAddress;
        this.userAgent = userAgent;
    }

    public static FacilitySubmissionAudit of(Long batchId, SubmissionAuditAction action, Long adminId,
                                             String ipAddress, String userAgent) {
        return FacilitySubmissionAudit.builder()
                .batchId(batchId)
                .action(action)
                .adminId(adminId)
                .ipAddress(truncate(ipAddress, 45))
                .userAgent(truncate(userAgent, 500))
                .build();
    }

    /** 공격자 제어 헤더의 컬럼 길이 초과가 감사 트랜잭션을 500 으로 만들지 않게 절단한다(서로게이트 쌍 보존). */
    private static String truncate(String value, int maxLength) {
        if (value == null || value.length() <= maxLength) {
            return value;
        }
        int end = maxLength;
        if (Character.isHighSurrogate(value.charAt(end - 1))) {
            end--;
        }
        return value.substring(0, end);
    }
}
