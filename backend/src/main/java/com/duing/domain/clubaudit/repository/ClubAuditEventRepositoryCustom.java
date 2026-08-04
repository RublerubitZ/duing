package com.duing.domain.clubaudit.repository;

import com.duing.domain.clubaudit.entity.ClubAuditEvent;
import com.duing.domain.clubaudit.entity.ClubAuditEventType;
import java.time.LocalDateTime;
import java.util.Collection;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface ClubAuditEventRepositoryCustom {

    /**
     * 동아리 감사 타임라인 조회 — 회비 감사 콘솔(스펙 §7.8)이 첫 사용처지만 술어 자체는 범용이다.
     * 대상 종류는 호출 측이 확정해 넘긴다(빈 집합이면 조회할 것이 없어 빈 페이지).
     *
     * <p>기간 경계는 created_at 과 같은 존의 벽시계여야 한다 — created_at 은 JPA 감사 필드라
     * JVM 존 벽시계이고, {@code AdminFeePeriod.createdFrom/createdTo} 가 그 값을 만든다.
     * 경계는 from 포함·to 미만이고, 정렬은 최신순 고정이라 {@code Pageable} 의 sort 는 쓰지 않는다.
     */
    Page<ClubAuditEvent> searchFeeEvents(Long clubId, Collection<ClubAuditEventType> types,
                                         LocalDateTime createdFrom, LocalDateTime createdTo,
                                         Pageable pageable);
}
