package com.duing.domain.clubevent.repository;

import com.duing.domain.clubevent.entity.ClubEvent;
import java.time.LocalDateTime;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ClubEventRepository extends JpaRepository<ClubEvent, Long> {

    List<ClubEvent> findAllByClubId(Long clubId);

    @Query("""
        SELECT e FROM ClubEvent e
        WHERE e.clubId = :clubId
          AND e.startAt >= :from
          AND e.startAt <= :to
        ORDER BY e.startAt ASC
    """)
    List<ClubEvent> findWindow(@Param("clubId") Long clubId,
                                @Param("from") LocalDateTime from,
                                @Param("to") LocalDateTime to);

    // 총동연 캘린더: 전 동아리 일정을 동아리명과 함께 한 번에 조회한다(ACTIVE 동아리만).
    // c.deletedAt IS NULL 은 현 Hibernate 에서 Club 의 @SQLRestriction 과 중복이지만 의도적으로 명시한다 —
    // @SQLRestriction 의 조인 자동 적용은 문맥별·버전 의존적이라, 기대고 쓰면 업그레이드 시 소리 없이
    // fail-open(삭제된 동아리의 내부 일정이 총동연 화면에 노출) 이 된다.
    // ClubEvent 는 조인이 아니라 FROM 루트라 자체 @SQLRestriction 이 안정적으로 적용되므로 중복 명시하지 않는다.
    @Query("""
        SELECT new com.duing.domain.clubevent.repository.AdminClubEventRow(
                   e.id, c.id, c.name, e.title, e.startAt, e.endAt, e.location)
        FROM ClubEvent e JOIN Club c ON c.id = e.clubId
        WHERE e.startAt >= :from
          AND e.startAt <= :to
          AND c.status = com.duing.domain.club.entity.ClubStatus.ACTIVE
          AND c.deletedAt IS NULL
        ORDER BY e.startAt ASC
    """)
    List<AdminClubEventRow> findWindowAllClubs(@Param("from") LocalDateTime from,
                                               @Param("to") LocalDateTime to);
}
