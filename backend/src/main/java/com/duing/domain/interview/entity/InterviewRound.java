package com.duing.domain.interview.entity;

import com.duing.domain.interview.exception.InterviewException;
import com.duing.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;

@Getter
@Entity
@Table(name = "interview_round")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
// @Version 도입으로 Hibernate 가 두 번째 바인드 파라미터로 version 을 전달한다 (Application 전례).
@SQLDelete(sql = "UPDATE interview_round SET deleted_at = NOW() WHERE id = ? AND version = ?")
@SQLRestriction("deleted_at IS NULL")
public class InterviewRound extends BaseEntity {

    @Column(name = "recruitment_id", nullable = false)
    private Long recruitmentId;

    @Column(nullable = false, length = 100)
    private String title;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private RoundStatus status;

    // DRAFT 동안 nullable — DRAFT→COLLECTING 발송 전이 가드에서 NOT NULL 을 요구한다 (BE#5).
    @Column(name = "availability_deadline")
    private LocalDateTime availabilityDeadline;

    @Column(length = 200)
    private String location;

    @Column(name = "assignment_completed_at")
    private LocalDateTime assignmentCompletedAt;

    // MVP 는 Availability 요청/재알림 dedupKey 생성용 — 발송·재알림·Rule 2 재초대 직전에 증가한다.
    // 향후 NotificationLog/InterviewRoundNotification 테이블로 이관 가능 (스펙 §4·§8).
    @Column(name = "request_sequence", nullable = false)
    private int requestSequence;

    // 자동배정/확정/취소 동시 실행 race 차단 (스펙 §7 — Application @Version 전례)
    @Version
    @Column(nullable = false)
    private Long version;

    @Builder(access = AccessLevel.PRIVATE)
    private InterviewRound(Long recruitmentId, String title,
                           LocalDateTime availabilityDeadline, String location) {
        this.recruitmentId = recruitmentId;
        this.title = title;
        this.status = RoundStatus.DRAFT;
        this.availabilityDeadline = availabilityDeadline;
        this.location = location;
        this.requestSequence = 0;
    }

    public static InterviewRound create(Long recruitmentId, String title,
                                        LocalDateTime availabilityDeadline, String location) {
        return InterviewRound.builder()
                .recruitmentId(recruitmentId)
                .title(title)
                .availabilityDeadline(availabilityDeadline)
                .location(normalizeNullable(location))
                .build();
    }

    /**
     * 발송: DRAFT → COLLECTING (스펙 §5.1). 마감은 발송의 전제 조건이라 도메인이 직접 검증한다 —
     * 생성 시점에 미래였어도 발송까지 시간이 흐를 수 있어 재검증한다.
     * 슬롯·멤버 존재 가드는 레포지토리가 필요하므로 서비스가 담당한다 (스펙 §10.3 가드 3종 중 나머지).
     */
    public void openCollecting(LocalDateTime now) {
        if (this.status != RoundStatus.DRAFT) {
            throw new InterviewException.RoundTransitionNotAllowed();
        }
        if (this.availabilityDeadline == null) {
            throw new InterviewException.AvailabilityDeadlineRequired();
        }
        if (!this.availabilityDeadline.isAfter(now)) {
            throw new InterviewException.InvalidDeadline();
        }
        this.status = RoundStatus.COLLECTING;
    }

    /**
     * 자동배정 실행: COLLECTING → ASSIGNING (스펙 §5.1·§6.2). 이미 ASSIGNING 인 재실행은
     * 전이가 아니므로 서비스가 분기한다 — 이 메서드는 첫 실행 전이만 담당한다.
     */
    public void openAssigning() {
        if (this.status != RoundStatus.COLLECTING) {
            throw new InterviewException.RoundTransitionNotAllowed();
        }
        this.status = RoundStatus.ASSIGNING;
    }

    /** 확정: ASSIGNING → SCHEDULED (터미널, 스펙 §5.1·§6.3) + 확정 시각 기록. 재확정·확정 후 변경 경로는 없다 (§14). */
    public void confirm(LocalDateTime now) {
        if (this.status != RoundStatus.ASSIGNING) {
            throw new InterviewException.RoundTransitionNotAllowed();
        }
        this.status = RoundStatus.SCHEDULED;
        this.assignmentCompletedAt = now;
    }

    /**
     * Availability 요청 회차를 1 올린다 — 발송·재알림·Rule 2 재초대 모두 발동 직전에 호출한다.
     * 안 올리면 직전 발송과 dedupKey 가 같아져 재알림이 deduped 되어 소실된다 (스펙 §8).
     */
    public void increaseRequestSequence() {
        this.requestSequence++;
    }

    private static String normalizeNullable(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
