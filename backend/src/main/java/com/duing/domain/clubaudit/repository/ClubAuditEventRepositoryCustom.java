package com.duing.domain.clubaudit.repository;

import com.duing.domain.clubaudit.entity.ClubAuditEvent;
import com.duing.domain.clubaudit.entity.ClubAuditEventType;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.Map;
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

    /**
     * {@code since} 이후 이벤트 수 — 이상징후 버스트 판정(스펙 §5.1 FA-06)이 첫 사용처다.
     * 대상 종류는 호출 측이 확정해 넘긴다(빈 집합이면 0).
     *
     * <p>{@code since} 는 created_at 과 같은 JVM 존 벽시계여야 한다 — seoulClock 의 벽시계를 그대로 넘기면
     * prod(JVM=UTC)에서 창이 9시간 어긋난다.
     */
    long countEventsSince(Long clubId, Collection<ClubAuditEventType> types, LocalDateTime since);

    /**
     * {@code since} 이후 한 행위자가 남긴 이벤트 수의 최댓값 — 동일 운영진 반복 변경 판정(FA-05)용.
     * 누가 그랬는지는 반환하지 않는다 — 응답에 행위자를 싣지 않기 때문이다(스펙 §9).
     * 존 규칙은 {@link #countEventsSince} 와 같다.
     */
    long findMaxEventCountByActorSince(Long clubId, Collection<ClubAuditEventType> types,
                                       LocalDateTime since);

    /**
     * {@code since} 이후 이벤트를 종류별로 센다 — 대시보드 최근 변경 요약(스펙 §7.2)이 첫 사용처라
     * 동아리를 가리지 않는 전역 집계다(clubId 조건 없음). 0 건인 종류는 키 자체가 없다.
     *
     * <p>{@code since} 의 존 규칙은 {@link #countEventsSince} 와 같다.
     */
    Map<ClubAuditEventType, Long> countEventsByTypeSince(Collection<ClubAuditEventType> types,
                                                         LocalDateTime since);
}
