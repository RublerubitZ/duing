package com.duing.domain.user.repository;

import com.duing.domain.user.entity.AuthRefreshToken;
import com.duing.domain.user.entity.RefreshTokenStatus;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface AuthRefreshTokenRepository extends JpaRepository<AuthRefreshToken, Long> {

    /**
     * 잠금 전 스칼라 조회 — 엔티티를 영속성 컨텍스트에 올리지 않아, 세션 행잠금 획득 후의
     * findByTokenHash 재조회가 잠금 대기 중 변경된 최신 상태를 읽는다 (spec §11 원자성).
     */
    @Query("SELECT t.sessionId FROM AuthRefreshToken t WHERE t.tokenHash = :tokenHash")
    Optional<Long> findSessionIdByTokenHash(@Param("tokenHash") String tokenHash);

    Optional<AuthRefreshToken> findByTokenHash(String tokenHash);

    Optional<AuthRefreshToken> findBySessionIdAndStatus(Long sessionId, RefreshTokenStatus status);

    List<AuthRefreshToken> findBySessionIdOrderByIdAsc(Long sessionId);

    @Modifying(flushAutomatically = true)
    @Query("UPDATE AuthRefreshToken t SET t.status = :revoked "
            + "WHERE t.sessionId IN :sessionIds AND t.status <> :revoked")
    int revokeBySessionIds(@Param("sessionIds") List<Long> sessionIds,
                           @Param("revoked") RefreshTokenStatus revoked);

    @Modifying(flushAutomatically = true)
    @Query("UPDATE AuthRefreshToken t SET t.status = :revoked WHERE t.status <> :revoked "
            + "AND t.sessionId IN (SELECT s.id FROM AuthSession s WHERE s.userId = :userId)")
    int revokeAllByUserId(@Param("userId") Long userId, @Param("revoked") RefreshTokenStatus revoked);

    @Modifying
    @Query("DELETE FROM AuthRefreshToken t WHERE t.sessionId IN :sessionIds")
    int deleteBySessionIds(@Param("sessionIds") List<Long> sessionIds);
}
