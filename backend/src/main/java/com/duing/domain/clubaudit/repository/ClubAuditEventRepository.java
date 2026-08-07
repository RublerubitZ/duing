package com.duing.domain.clubaudit.repository;

import com.duing.domain.clubaudit.entity.ClubAuditEvent;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * 감사 이벤트 기록 + 동아리 단위 타임라인 조회(스펙 v2 4.1). append-only 라 수정·삭제 메서드는 두지 않는다.
 * 조회는 동적 조건이라 QueryDSL 로 {@link ClubAuditEventRepositoryCustom} 에 두며,
 * (club_id, event_type, created_at) 인덱스(V105)를 탄다.
 */
public interface ClubAuditEventRepository
        extends JpaRepository<ClubAuditEvent, Long>, ClubAuditEventRepositoryCustom {
}
