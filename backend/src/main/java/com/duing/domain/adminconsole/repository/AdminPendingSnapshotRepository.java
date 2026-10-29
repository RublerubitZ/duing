package com.duing.domain.adminconsole.repository;

import com.duing.domain.adminconsole.entity.AdminPendingSnapshot;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface AdminPendingSnapshotRepository extends JpaRepository<AdminPendingSnapshot, LocalDate> {

    List<AdminPendingSnapshot> findBySnapshotDateBetweenOrderBySnapshotDateAsc(LocalDate from, LocalDate to);

    /**
     * 하루치 기록 삽입. 같은 날짜가 이미 있으면 조용히 버린다 — 첫 기록(자정 직후 값)이 그날의 값이다.
     * 조회 후 삽입 대신 단일 문장 {@code ON CONFLICT DO NOTHING} 이라 중복 발화·수동 재실행에도 잠금이 필요 없다
     * (ClubViewEventRepository#insertIgnoringDuplicate 전례).
     *
     * @return 실제로 삽입됐으면 1, 이미 있으면 0
     */
    @Modifying
    @Query(value = """
            INSERT INTO admin_pending_snapshot (snapshot_date, club_approval, facility_booking, inquiry_unanswered,
                    promotion_request, report_unresolved, leader_succession, stale_pending_recruitment,
                    total_pending_count, recorded_at)
            VALUES (CAST(:snapshotDate AS date), :clubApproval, :facilityBooking, :inquiryUnanswered,
                    :promotionRequest, :reportUnresolved, :leaderSuccession, :stalePendingRecruitment,
                    :totalPendingCount, :recordedAt)
            ON CONFLICT (snapshot_date) DO NOTHING
            """, nativeQuery = true)
    int insertIfAbsent(@Param("snapshotDate") LocalDate snapshotDate,
                       @Param("clubApproval") int clubApproval,
                       @Param("facilityBooking") int facilityBooking,
                       @Param("inquiryUnanswered") int inquiryUnanswered,
                       @Param("promotionRequest") int promotionRequest,
                       @Param("reportUnresolved") int reportUnresolved,
                       @Param("leaderSuccession") int leaderSuccession,
                       @Param("stalePendingRecruitment") int stalePendingRecruitment,
                       @Param("totalPendingCount") int totalPendingCount,
                       @Param("recordedAt") Instant recordedAt);
}
