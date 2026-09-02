package com.duing.domain.notification.repository;

import com.duing.domain.notification.entity.Notification;
import java.time.LocalDate;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

public interface NotificationRepository extends JpaRepository<Notification, Long>, NotificationRepositoryCustom {

    boolean existsByUserIdAndDedupKey(Long userId, String dedupKey);

    long countByUserIdAndReadAtIsNull(Long userId);

    Optional<Notification> findByIdAndUserId(Long id, Long userId);

    /**
     * 모집 오픈 알림을 찜한 유저 전원에게 단일 원자문으로 fan-out 한다. 반환 = 실제 INSERT 된 행 수.
     *
     * <p>수신자를 SELECT 로 직접 고르므로 대상 선별과 삽입이 한 문장이다 —
     * 수신자당 exists 조회 + saveAndFlush 왕복 2회가 이벤트당 1회로 줄고, 요청 스레드에서
     * 동기로 도는 fan-out 지연이 수신자 수와 무관해진다({@code FeeBillRepository#bulkInsertBills} 전례).
     *
     * <p>{@code cf.deleted_at IS NULL} 은 필수다 — ClubFavorite 은 soft delete(@SQLDelete)라
     * JPQL 경로에서 @SQLRestriction 이 자동으로 걸러 주던 '찜 해제' 행이 네이티브 SQL 에는 그대로 보인다.
     * 빠뜨리면 찜을 해제한 유저에게 알림이 나가는 수신자 집합 회귀가 된다.
     *
     * <p>created_at 은 생략해 DB 기본값(NOW())을 쓴다(운영 JVM TZ=UTC 고정 → 엔티티 경로와 같은 값).
     * payload 의 id 값은 bigint 로 캐스팅해 엔티티 경로가 저장하던 JSON 숫자 타입을 그대로 유지한다.
     * ORDER BY 로 삽입 순서를 고정해 동시 fan-out 간 락 순서를 일치시킨다.
     *
     * <p>REQUIRES_NEW 는 여기(리포지토리 메서드)에 둔다 — AFTER_COMMIT 리스너 안에서 호출되므로 새 트랜잭션이
     * 필요하고, 그 커밋 실패까지 리스너의 try/catch 안에서 끝나야 알림 실패가 원 요청을 깨지 않는다.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query(value = """
            INSERT INTO notification (user_id, type, title, body, link_url, payload, dedup_key)
            SELECT cf.user_id, :type, :title, :body, :linkUrl,
                   jsonb_build_object('recruitmentId', CAST(:recruitmentId AS bigint),
                                      'clubId', CAST(:clubId AS bigint)),
                   :dedupKey
            FROM club_favorite cf
            WHERE cf.club_id = :clubId AND cf.deleted_at IS NULL
            ORDER BY cf.user_id
            ON CONFLICT (user_id, dedup_key) DO NOTHING
            """, nativeQuery = true)
    int bulkInsertRecruitmentOpened(@Param("type") String type, @Param("title") String title,
                                    @Param("body") String body, @Param("linkUrl") String linkUrl,
                                    @Param("recruitmentId") Long recruitmentId, @Param("clubId") Long clubId,
                                    @Param("dedupKey") String dedupKey);

    /**
     * 회비 발행 알림을 한 회차(정책 + 기간 시작일)의 청구 대상 전원에게 단일 원자문으로 fan-out 한다.
     * 반환 = 실제 INSERT 된 행 수.
     *
     * <p>수신자 술어는 이 벌크 전환으로 삭제된 {@code FeeBillRepository#findIssuedBillRecipients}
     * (JPQL + FeeBill @SQLRestriction)의 실효 조건과 동치다 — 취소·삭제 청구는 대상이 아니다.
     * dedup_key 와 payload 의 billId 는 청구 행에서 직접 끌어와 수신자마다 다른 값을 만든다.
     *
     * <p>REQUIRES_NEW 는 여기(리포지토리 메서드)에 둔다 — AFTER_COMMIT 리스너 안에서 호출되므로 새 트랜잭션이
     * 필요하고, 그 커밋 실패까지 리스너의 try/catch 안에서 끝나야 알림 실패가 원 요청을 깨지 않는다.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query(value = """
            INSERT INTO notification (user_id, type, title, body, link_url, payload, dedup_key)
            SELECT fb.user_id, :type, :title, :body, :linkUrl,
                   jsonb_build_object('clubId', CAST(:clubId AS bigint), 'billId', fb.id),
                   'FEE_BILL_ISSUED:b=' || fb.id
            FROM fee_bill fb
            WHERE fb.fee_policy_id = :policyId
              AND fb.billing_start_date = :startDate
              AND fb.status <> 'CANCELLED'
              AND fb.deleted_at IS NULL
            ORDER BY fb.user_id
            ON CONFLICT (user_id, dedup_key) DO NOTHING
            """, nativeQuery = true)
    int bulkInsertFeeBillIssued(@Param("type") String type, @Param("title") String title,
                                @Param("body") String body, @Param("linkUrl") String linkUrl,
                                @Param("clubId") Long clubId, @Param("policyId") Long policyId,
                                @Param("startDate") LocalDate startDate);
}
