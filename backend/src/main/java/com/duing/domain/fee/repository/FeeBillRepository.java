package com.duing.domain.fee.repository;

import com.duing.domain.fee.entity.FeeBill;
import jakarta.persistence.LockModeType;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface FeeBillRepository extends JpaRepository<FeeBill, Long>, FeeBillRepositoryCustom {
    Optional<FeeBill> findByIdAndClubId(Long id, Long clubId);

    // 회원 영수증: 본인(userId) 청구만 노출(타인 청구는 빈 Optional → 404, 존재 비노출). @SQLRestriction 이 soft-delete 제외.
    Optional<FeeBill> findByIdAndUserId(Long id, Long userId);

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

    // SELECTED_MEMBERS 발행: 활성 회원 중 지정된 user_id 만 대상으로 단일 원자 INSERT 한다.
    // RETURNING user_id 로 '실제로 새로 INSERT 된' user_id 만 받는다(ON CONFLICT 로 스킵된 행은 RETURNING 에 잡히지 않음).
    // @Modifying 을 붙이지 않는다 — getResultList 로 반환행을 받아야 하며, 네이티브 쿼리라 Hibernate 가 실행 전 세션을 flush 한다.
    @Query(value = """
            INSERT INTO fee_bill (club_id, user_id, fee_policy_id, amount, billing_period,
                                  billing_start_date, billing_end_date, due_date, status)
            SELECT :clubId, cm.user_id, :policyId, :amount, :billingPeriod,
                   :startDate, :endDate, :dueDate, 'PENDING'
            FROM club_member cm
            WHERE cm.club_id = :clubId AND cm.deleted_at IS NULL AND cm.user_id IN (:memberIds)
            ORDER BY cm.user_id
            ON CONFLICT (fee_policy_id, user_id, billing_start_date)
              WHERE deleted_at IS NULL AND status <> 'CANCELLED'
            DO NOTHING
            RETURNING user_id
            """, nativeQuery = true)
    List<Long> bulkInsertBillsForMembers(@Param("clubId") Long clubId, @Param("policyId") Long policyId,
                                         @Param("amount") Long amount, @Param("billingPeriod") String billingPeriod,
                                         @Param("startDate") LocalDate startDate, @Param("endDate") LocalDate endDate,
                                         @Param("dueDate") LocalDate dueDate,
                                         @Param("memberIds") Collection<Long> memberIds);

    // 마감 임박(오늘/오늘+1/오늘+3 등 지정 일자) 미납·부분납부 청구를 리마인더 대상으로 조회한다.
    // Club 을 조인해 동아리명을 함께 싣는다 — FeeBill·Club 모두 @SQLRestriction 으로 soft-delete·폐쇄 동아리는 자동 제외.
    @Query("""
            SELECT new com.duing.domain.fee.repository.FeeBillDueSoonRow(
                       b.id, b.userId, b.clubId, c.name, b.billingPeriod, b.dueDate)
            FROM FeeBill b JOIN Club c ON c.id = b.clubId
            WHERE b.status IN (com.duing.domain.fee.entity.FeeStatus.PENDING,
                               com.duing.domain.fee.entity.FeeStatus.PARTIAL_PAID)
              AND b.dueDate IN :dueDates
            ORDER BY b.id
            """)
    List<FeeBillDueSoonRow> findDueSoonUnpaidBills(@Param("dueDates") Collection<LocalDate> dueDates);

    // 동아리 회원별 "가장 최근 비-CANCELLED 청구"의 상태를 단일 쿼리로 뽑는다(멤버 목록·EXPORT 의 회비 상태 판정).
    // 상관 서브쿼리 NOT EXISTS 로 같은 user 의 더 최신 청구가 없는 행만 남긴다 — 최신 기준은 created_at, 동률이면 id.
    // @SQLRestriction(deleted_at IS NULL) 가 b·later 양쪽 JPQL 에 자동 적용돼 soft-delete 청구는 제외된다.
    // 청구가 하나도 없는(또는 전부 CANCELLED 인) user 는 결과에서 빠져 호출부에서 NONE 으로 채운다.
    @Query("""
            SELECT new com.duing.domain.fee.repository.LatestBillStatusRow(b.userId, b.status)
            FROM FeeBill b
            WHERE b.clubId = :clubId
              AND b.status <> com.duing.domain.fee.entity.FeeStatus.CANCELLED
              AND NOT EXISTS (
                SELECT 1 FROM FeeBill later
                WHERE later.clubId = b.clubId
                  AND later.userId = b.userId
                  AND later.status <> com.duing.domain.fee.entity.FeeStatus.CANCELLED
                  AND (later.createdAt > b.createdAt
                       OR (later.createdAt = b.createdAt AND later.id > b.id))
              )
            """)
    List<LatestBillStatusRow> findLatestNonCancelledBillStatusByClubId(@Param("clubId") Long clubId);

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
