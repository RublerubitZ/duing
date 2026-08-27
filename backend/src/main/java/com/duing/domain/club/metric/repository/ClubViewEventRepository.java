package com.duing.domain.club.metric.repository;

import com.duing.domain.club.metric.entity.ClubViewEvent;
import java.time.LocalDate;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ClubViewEventRepository extends JpaRepository<ClubViewEvent, Long> {

    /**
     * 상세 진입 1건 적재. 같은 (동아리, 방문자, 날짜) 가 이미 있으면 조용히 버린다.
     * <p>먼저 SELECT 로 존재를 확인하고 없으면 INSERT 하는 방식은 같은 사람이 탭을 연속으로 여는
     * 흔한 상황에서 그대로 경합한다 — 단일 문장 {@code ON CONFLICT DO NOTHING} 이 그 경합을
     * 인덱스 수준에서 해소하므로 애플리케이션에 잠금이나 재시도가 필요 없다.
     *
     * @return 실제로 삽입됐으면 1, 이미 오늘 집계된 방문자면 0
     */
    @Modifying
    @Query(value = """
            INSERT INTO club_view_event (club_id, visitor_hash, event_date)
            VALUES (:clubId, :visitorHash, CAST(:eventDate AS date))
            ON CONFLICT (club_id, visitor_hash, event_date) DO NOTHING
            """, nativeQuery = true)
    int insertIgnoringDuplicate(@Param("clubId") Long clubId,
                                @Param("visitorHash") String visitorHash,
                                @Param("eventDate") LocalDate eventDate);

    /**
     * 보존 기간이 지난 원천 이벤트 물리 삭제.
     * <p>soft-delete 가 아니라 물리 삭제인 이유는 보존 기간 자체가 개인정보 약속이기 때문이다 —
     * deleted_at 으로 남기면 행동 이력이 그대로 테이블에 남는다.
     *
     * @return 삭제된 행 수
     */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query(value = "DELETE FROM club_view_event WHERE event_date < CAST(:cutoff AS date)", nativeQuery = true)
    int deleteOlderThan(@Param("cutoff") LocalDate cutoff);

    /**
     * 창 안의 동아리별 관심도 집계.
     * <p>한 행이 곧 "어떤 방문자가 어느 날 이 동아리를 봤다" 이므로, 행마다 그날의 감쇠 가중치를 더하면
     * 그것이 곧 {@code Σ 일별 순방문자 × 0.5^(경과일/3)} 이다 — 일자별로 먼저 GROUP BY 할 필요가 없다.
     * <p>미래 날짜 행(클라이언트·서버 시계 어긋남)은 감쇠 지수가 음수가 되어 가중치가 1을 넘으므로
     * 상한을 오늘로 막는다. ACTIVE·미삭제 동아리만 집계한다 — 목록도 그것만 노출한다.
     */
    @Query(value = """
            SELECT v.club_id                     AS clubId,
                   COUNT(DISTINCT v.visitor_hash) AS weeklyVisitorCount,
                   SUM(POWER(0.5, (CAST(:today AS date) - v.event_date)
                                  / CAST(:halfLifeDays AS double precision))) AS interestScore
            FROM club_view_event v
            JOIN club c ON c.id = v.club_id
            WHERE v.event_date >= CAST(:windowStart AS date)
              AND v.event_date <= CAST(:today AS date)
              AND c.deleted_at IS NULL
              AND c.status = 'ACTIVE'
            GROUP BY v.club_id
            """, nativeQuery = true)
    List<ClubInterestSourceRow> aggregateInterest(@Param("windowStart") LocalDate windowStart,
                                                  @Param("today") LocalDate today,
                                                  @Param("halfLifeDays") int halfLifeDays);
}
