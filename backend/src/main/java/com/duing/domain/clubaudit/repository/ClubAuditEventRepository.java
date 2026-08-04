package com.duing.domain.clubaudit.repository;

import com.duing.domain.clubaudit.entity.ClubAuditEvent;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * 감사 이벤트 기록 전용 — 조회 화면은 후속이라 조회 메서드를 미리 만들지 않는다(스펙 v2 4.1).
 * 조회가 생기면 (club_id, created_at)·(recruitment_id, created_at) 인덱스(V102)를 쓰는 쿼리를 더한다.
 */
public interface ClubAuditEventRepository extends JpaRepository<ClubAuditEvent, Long> {
}
