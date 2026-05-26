package com.duing.domain.report.entity;

import com.duing.domain.report.exception.ReportException;
import com.duing.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;

@Getter
@Entity
@Table(name = "report")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLDelete(sql = "UPDATE report SET deleted_at = NOW() WHERE id = ?")
@SQLRestriction("deleted_at IS NULL")
public class Report extends BaseEntity {

    @Column(name = "reporter_id", nullable = false)
    private Long reporterId;

    @Enumerated(EnumType.STRING)
    @Column(name = "target_type", nullable = false, length = 30)
    private ReportTargetType targetType;

    @Column(name = "target_id", nullable = false)
    private Long targetId;

    @Enumerated(EnumType.STRING)
    @Column(name = "reason_code", nullable = false, length = 30)
    private ReportReasonCode reasonCode;

    @Column(columnDefinition = "TEXT")
    private String detail;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ReportStatus status;

    @Column(name = "action_note", columnDefinition = "TEXT")
    private String actionNote;

    @Column(name = "handled_by")
    private Long handledBy;

    @Column(name = "handled_at")
    private LocalDateTime handledAt;

    @Builder(access = AccessLevel.PRIVATE)
    private Report(Long reporterId, ReportTargetType targetType, Long targetId,
                   ReportReasonCode reasonCode, String detail) {
        this.reporterId = reporterId;
        this.targetType = targetType;
        this.targetId = targetId;
        this.reasonCode = reasonCode;
        this.detail = detail;
        this.status = ReportStatus.PENDING;
    }

    public static Report create(Long reporterId, ReportTargetType targetType, Long targetId,
                                ReportReasonCode reasonCode, String detail) {
        return Report.builder()
                .reporterId(reporterId)
                .targetType(targetType)
                .targetId(targetId)
                .reasonCode(reasonCode)
                .detail(detail)
                .build();
    }

    public void process(Long handlerUserId, ReportStatus nextStatus, String actionNote) {
        if (nextStatus == null || nextStatus == ReportStatus.PENDING) {
            throw new ReportException.InvalidReportTransitionException(
                    "처리 결과는 RESOLVED 또는 DISMISSED 여야 합니다.");
        }
        if (this.status.isTerminal()) {
            throw new ReportException.InvalidReportTransitionException("이미 종결된 신고입니다.");
        }
        this.status = nextStatus;
        this.handledBy = handlerUserId;
        this.handledAt = LocalDateTime.now();
        this.actionNote = actionNote;
    }
}
