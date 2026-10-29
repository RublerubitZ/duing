package com.duing.domain.adminconsole.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.LocalDate;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 총동연 홈 처리 대기 추이의 하루치 기록 — KST 날짜당 1행, 그날 하루 끝(다음 날 00:01 KST) 남은 대기 건수.
 *
 * <p>자연키(날짜) PK 라 BaseEntity 를 상속하지 않는다(FacilitySubmissionSequence 전례 — 수정·삭제가 없어
 * updated_at·deleted_at 은 거짓 신호). 저장은 {@code AdminPendingSnapshotRepository#insertIfAbsent} 네이티브
 * 삽입으로만 한다 — 같은 날짜의 첫 기록을 남기는 규칙을 한 문장으로 지키려고. 이 엔티티는 조회 전용이다.
 */
@Getter
@Entity
@Table(name = "admin_pending_snapshot")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class AdminPendingSnapshot {

    @Id
    @Column(name = "snapshot_date")
    private LocalDate snapshotDate;

    @Column(name = "club_approval", nullable = false)
    private int clubApproval;

    @Column(name = "facility_booking", nullable = false)
    private int facilityBooking;

    @Column(name = "inquiry_unanswered", nullable = false)
    private int inquiryUnanswered;

    @Column(name = "promotion_request", nullable = false)
    private int promotionRequest;

    @Column(name = "report_unresolved", nullable = false)
    private int reportUnresolved;

    @Column(name = "leader_succession", nullable = false)
    private int leaderSuccession;

    @Column(name = "stale_pending_recruitment", nullable = false)
    private int stalePendingRecruitment;

    @Column(name = "total_pending_count", nullable = false)
    private int totalPendingCount;

    @Column(name = "recorded_at", nullable = false)
    private Instant recordedAt;
}
