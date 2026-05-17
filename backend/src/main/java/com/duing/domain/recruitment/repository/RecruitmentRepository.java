package com.duing.domain.recruitment.repository;

import com.duing.domain.recruitment.entity.Recruitment;
import java.time.LocalDate;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface RecruitmentRepository extends JpaRepository<Recruitment, Long>, RecruitmentRepositoryCustom {

    /**
     * Deadline 알림 후보를 조회한다.
     * - OPENED: 오늘 시작하는 OPEN 모집
     * - DEADLINE: 마감 3일 / 1일 / 당일인 OPEN 모집
     */
    @Query(value = """
            SELECT r.id AS recruitmentId, r.club_id AS clubId, c.name AS clubName, r.title AS title,
                   r.end_date AS endDate,
                   CASE
                     WHEN r.start_date = :today             THEN 'OPENED'
                     WHEN (r.end_date - :today) IN (3,1,0)  THEN 'DEADLINE'
                   END AS kind,
                   (r.end_date - :today) AS daysToEnd
              FROM recruitment r JOIN club c ON c.id = r.club_id
             WHERE r.status = 'OPEN' AND r.deleted_at IS NULL
               AND ( r.start_date = :today OR (r.end_date - :today) IN (3,1,0) )
            """, nativeQuery = true)
    List<DeadlineRow> findDeadlineNotificationCandidates(@Param("today") LocalDate today);
}