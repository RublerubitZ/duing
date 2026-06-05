package com.duing.domain.clubevent.repository;

import com.duing.domain.clubevent.entity.ClubEvent;
import java.time.LocalDateTime;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ClubEventRepository extends JpaRepository<ClubEvent, Long> {

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
}
