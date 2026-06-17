package com.duing.domain.fee.repository;

import com.duing.domain.fee.entity.FeeBill;
import jakarta.persistence.LockModeType;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface FeeBillRepository extends JpaRepository<FeeBill, Long>, FeeBillRepositoryCustom {
    Optional<FeeBill> findByIdAndClubId(Long id, Long clubId);

    // 납부 기록·취소가 같은 청구 행에 대해 직렬화되도록 비관적 쓰기 잠금으로 조회한다(분할 입금 합계 경합 방지).
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT b FROM FeeBill b WHERE b.id = :id AND b.clubId = :clubId")
    Optional<FeeBill> findByIdAndClubIdForUpdate(@Param("id") Long id, @Param("clubId") Long clubId);

    // 발행 이력 존재(불변성·삭제 가드 공유). 취소·soft-delete 행까지 모두 포함해야 하므로
    // @SQLRestriction 을 우회하는 네이티브 쿼리로 deleted_at·status 무관하게 본다(= uk_fee_bill_idem 의 역).
    @Query(value = "SELECT EXISTS (SELECT 1 FROM fee_bill WHERE fee_policy_id = :policyId)", nativeQuery = true)
    boolean existsByFeePolicyId(@Param("policyId") Long policyId);

    // 멱등 발행: club_member 에서 활성 회원을 직접 SELECT 해 단일 원자 INSERT 한다(대상 선별=삽입, TOCTOU 없음).
    // 부분 유니크 인덱스(uk_fee_bill_idem) 술어를 ON CONFLICT 에 그대로 명시해야 매칭된다(생략 시 Postgres 에러).
    // 반환값 = 실제 INSERT 된 행 수(=created). saveAll 금지(충돌 시 트랜잭션 전체 롤백).
    // flushAutomatically: 같은 TX에서 선행 ClubMember 변경이 있으면 flush 후 네이티브 SELECT가 최신 상태를 읽도록(stale read 방지).
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query(value = """
            INSERT INTO fee_bill (club_id, user_id, fee_policy_id, amount, billing_period,
                                  billing_start_date, billing_end_date, due_date, status)
            SELECT :clubId, cm.user_id, :policyId, :amount, :billingPeriod,
                   :startDate, :endDate, :dueDate, 'PENDING'
            FROM club_member cm
            WHERE cm.club_id = :clubId AND cm.deleted_at IS NULL
            ORDER BY cm.user_id
            ON CONFLICT (fee_policy_id, user_id, billing_start_date)
              WHERE deleted_at IS NULL AND status <> 'CANCELLED'
            DO NOTHING
            """, nativeQuery = true)
    int bulkInsertBills(@Param("clubId") Long clubId, @Param("policyId") Long policyId,
                        @Param("amount") Long amount, @Param("billingPeriod") String billingPeriod,
                        @Param("startDate") LocalDate startDate, @Param("endDate") LocalDate endDate,
                        @Param("dueDate") LocalDate dueDate);

    // 한 회차(정책+기간 시작일)로 발행된 비취소 청구의 (billId, userId) — 발행 알림 fan-out 대상.
    @Query("""
            SELECT new com.duing.domain.fee.repository.BillRecipient(b.id, b.userId)
            FROM FeeBill b
            WHERE b.feePolicyId = :feePolicyId
              AND b.billingStartDate = :startDate
              AND b.status <> com.duing.domain.fee.entity.FeeStatus.CANCELLED
            """)
    List<BillRecipient> findIssuedBillRecipients(@Param("feePolicyId") Long feePolicyId,
                                                 @Param("startDate") LocalDate startDate);

    // 연체 후보(마감 지난 미납·부분납부)를 FOR UPDATE 로 잠가 동시 납부 기록과 직렬화하고, 이번 실행의 전이 대상을 확정한다.
    @Query(value = """
            SELECT id, user_id, billing_period
            FROM fee_bill
            WHERE status IN ('PENDING','PARTIAL_PAID')
              AND due_date < :today
              AND deleted_at IS NULL
            ORDER BY id
            FOR UPDATE
            """, nativeQuery = true)
    List<Object[]> lockOverdueCandidates(@Param("today") LocalDate today);

    // 잠근 후보를 OVERDUE 로 일괄 전이(updated_at 갱신). 반환 = 전이된 행 수.
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query(value = "UPDATE fee_bill SET status = 'OVERDUE', updated_at = now() WHERE id IN (:ids)", nativeQuery = true)
    int markOverdue(@Param("ids") java.util.Collection<Long> ids);
}
