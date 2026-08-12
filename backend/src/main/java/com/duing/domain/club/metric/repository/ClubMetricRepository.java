package com.duing.domain.club.metric.repository;

import com.duing.domain.club.metric.entity.ClubMetric;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface ClubMetricRepository extends JpaRepository<ClubMetric, Long> {

    /**
     * 집계 대상(ACTIVE·미삭제)에서 빠진 동아리의 고아 metric 행 삭제.
     * <p>refresh 는 upsert 만 하므로 폐쇄·중단·삭제된 동아리의 행이 영구 잔존한다 — 목록은 ACTIVE 만
     * 노출해 정렬엔 무해하지만, 재활성 시 낡은 점수로 되살아나지 않도록 매 갱신마다 함께 걷어낸다.
     */
    // native DELETE 는 영속성 컨텍스트를 우회한다 — 이전에 로드된 ClubMetric 이 1차 캐시에 남아
    // 삭제 후 조회에 되살아나지 않도록 flush/clear 를 강제한다.
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query(value = """
            DELETE FROM club_metric metric
            WHERE NOT EXISTS (SELECT 1 FROM club c
                              WHERE c.id = metric.club_id
                                AND c.deleted_at IS NULL
                                AND c.status = 'ACTIVE')
            """, nativeQuery = true)
    int deleteOrphans();

    /**
     * 동아리별 활동 지표 원천값 일괄 집계.
     * <p>UNION ALL 이 JPQL 로 표현되지 않아 native 로 둔다. 활동 시각 소스는
     * 사진·대표활동·일정·모집 등록(전부 soft-delete 제외) — 총동연 발신인 notice 는
     * 동아리 자체 활동 신호가 아니라 제외한다(설계 문서 참고).
     * <p>ACTIVE 동아리만 집계한다 — 목록도 ACTIVE 만 노출하고, 비공개 동아리가
     * 정규화 최댓값을 쥐어 공개 동아리 점수를 일괄 누르는 왜곡을 막는다.
     */
    @Query(value = """
            SELECT c.id                 AS clubId,
                   COALESCE(f.cnt, 0)   AS favoriteCount,
                   COALESCE(a.cnt, 0)   AS applicationCount,
                   act.last_at          AS lastActivityAt
            FROM club c
            LEFT JOIN (SELECT club_id, count(*) AS cnt
                       FROM club_favorite
                       WHERE deleted_at IS NULL
                       GROUP BY club_id) f ON f.club_id = c.id
            LEFT JOIN (SELECT r.club_id, count(*) AS cnt
                       FROM application ap
                       JOIN recruitment r ON r.id = ap.recruitment_id AND r.deleted_at IS NULL
                       WHERE ap.deleted_at IS NULL
                       GROUP BY r.club_id) a ON a.club_id = c.id
            LEFT JOIN (SELECT club_id, max(created_at) AS last_at
                       FROM (SELECT club_id, created_at FROM club_photo         WHERE deleted_at IS NULL
                             UNION ALL
                             SELECT club_id, created_at FROM club_hero_activity WHERE deleted_at IS NULL
                             UNION ALL
                             SELECT club_id, created_at FROM club_event         WHERE deleted_at IS NULL
                             UNION ALL
                             SELECT club_id, created_at FROM recruitment        WHERE deleted_at IS NULL) activity_source
                       GROUP BY club_id) act ON act.club_id = c.id
            WHERE c.deleted_at IS NULL
              AND c.status = 'ACTIVE'
            """, nativeQuery = true)
    List<ClubMetricSourceRow> findMetricSources();
}
