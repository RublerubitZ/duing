package com.duing.domain.user.repository;

import com.duing.domain.user.entity.AuthSession;
import com.duing.domain.user.entity.SessionRevokeReason;
import jakarta.persistence.LockModeType;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface AuthSessionRepository extends JpaRepository<AuthSession, Long> {

    /** rotation·폐기의 직렬화 지점 — 같은 세션의 동시 갱신을 행잠금으로 직렬화한다 (spec §11). */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT s FROM AuthSession s WHERE s.id = :id")
    Optional<AuthSession> findByIdForUpdate(@Param("id") Long id);

    /** 활성 세션을 LRU 순(가장 오래 미사용 먼저)으로 — 상한 초과 폐기 대상 선정용. */
    List<AuthSession> findByUserIdAndRevokedAtIsNullOrderByLastUsedAtAsc(Long userId);

    /** 활성 세션을 최근 사용 순(내림차순)으로 — 세션 목록 화면용 (정렬은 쿼리 레벨). */
    List<AuthSession> findByUserIdAndRevokedAtIsNullOrderByLastUsedAtDesc(Long userId);

    /**
     * 전 세션 일괄 폐기(전체 로그아웃·자격 변경·관리자 강제). flushAutomatically 로 같은 트랜잭션의
     * 선행 엔티티 변경(tokenVersion bump 등)을 벌크 실행 전에 flush 한다 — clear 는 하지 않아
     * 호출 측의 managed 엔티티(User)가 detach 되지 않는다.
     */
    @Modifying(flushAutomatically = true)
    @Query("UPDATE AuthSession s SET s.revokedAt = :now, s.revokeReason = :reason "
            + "WHERE s.userId = :userId AND s.revokedAt IS NULL")
    int revokeAllActive(@Param("userId") Long userId, @Param("now") LocalDateTime now,
                        @Param("reason") SessionRevokeReason reason);

    /** 폐기/만료 후 보존기간(30일)을 넘긴 세션 — 재사용 포렌식 보존 뒤 물리 삭제 대상 (spec §18.1). */
    @Query("SELECT s.id FROM AuthSession s "
            + "WHERE (s.revokedAt IS NOT NULL AND s.revokedAt < :cutoff) OR s.expiresAt < :cutoff")
    List<Long> findPurgeableIds(@Param("cutoff") LocalDateTime cutoff);

    @Modifying
    @Query("DELETE FROM AuthSession s WHERE s.id IN :sessionIds")
    int deleteByIds(@Param("sessionIds") List<Long> sessionIds);
}
