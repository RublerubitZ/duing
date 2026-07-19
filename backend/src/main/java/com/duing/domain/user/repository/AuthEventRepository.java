package com.duing.domain.user.repository;

import com.duing.domain.user.entity.AuthEvent;
import java.time.LocalDateTime;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface AuthEventRepository extends JpaRepository<AuthEvent, Long> {

    List<AuthEvent> findByUserIdOrderByIdAsc(Long userId);

    /** 감사 로그 90일 보관 후 삭제 — IP·UA 포함 PII 최소 보관 (spec §18.1). */
    @Modifying
    @Query("DELETE FROM AuthEvent e WHERE e.createdAt < :cutoff")
    int deleteOlderThan(@Param("cutoff") LocalDateTime cutoff);
}
