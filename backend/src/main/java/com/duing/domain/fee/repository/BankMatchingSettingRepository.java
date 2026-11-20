package com.duing.domain.fee.repository;

import com.duing.domain.fee.entity.BankMatchingSetting;
import java.time.Instant;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface BankMatchingSettingRepository extends JpaRepository<BankMatchingSetting, Long> {

    Optional<BankMatchingSetting> findByClubId(Long clubId);

    /**
     * 마지막 동기화 시각을 기록한다. 자동매칭이 켜진 살아 있는 설정에만, 기록된 값보다 늦을 때만 쓴다 — 은행 호출 중 꺼진 설정에
     * 기억을 남기지 않고(엔티티 저장은 전 칸을 써 그새 끈 active 를 되살릴 수 있다) 값을 뒤로 돌리지 않는다.
     * 설정 변경이 아니라 updated_at 은 건드리지 않는다. 스스로 트랜잭션을 열지 않으므로 쓰기 트랜잭션 안에서만 부른다 — 동기화는
     * 자동매칭까지 끝난 뒤 짧은 트랜잭션을 따로 연다. 영속성 컨텍스트를 거치지 않으므로 같은 트랜잭션에 로드된 설정 엔티티는 옛 값이다.
     * 반환값은 바뀐 행 수(0 또는 1)다.
     */
    @Modifying
    @Query(value = """
            UPDATE bank_matching_setting SET last_synced_at = :syncedAt
             WHERE club_id = :clubId AND active = true AND deleted_at IS NULL
               AND (last_synced_at IS NULL OR last_synced_at < :syncedAt)
            """, nativeQuery = true)
    int recordLastSyncedAt(@Param("clubId") Long clubId, @Param("syncedAt") Instant syncedAt);
}
