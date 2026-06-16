package com.duing.domain.fee.repository;

import com.duing.domain.fee.entity.FeeBill;
import java.time.LocalDate;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface FeeBillRepository extends JpaRepository<FeeBill, Long>, FeeBillRepositoryCustom {
    Optional<FeeBill> findByIdAndClubId(Long id, Long clubId);

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
}
