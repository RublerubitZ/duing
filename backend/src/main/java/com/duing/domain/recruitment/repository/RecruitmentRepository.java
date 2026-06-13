package com.duing.domain.recruitment.repository;

import com.duing.domain.recruitment.entity.Recruitment;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
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
                     WHEN r.start_date = :today                                    THEN 'OPENED'
                     WHEN r.end_date IS NOT NULL AND (r.end_date - :today) IN (3,1,0) THEN 'DEADLINE'
                   END AS kind,
                   (r.end_date - :today) AS daysToEnd
              FROM recruitment r JOIN club c ON c.id = r.club_id
             WHERE r.status = 'OPEN' AND r.deleted_at IS NULL
               AND (
                     r.start_date = :today
                     OR ( r.end_date IS NOT NULL AND (r.end_date - :today) IN (3,1,0) )
                   )
            """, nativeQuery = true)
    List<DeadlineRow> findDeadlineNotificationCandidates(@Param("today") LocalDate today);

    /**
     * 동아리 폐쇄 cascade 의 마지막 단계에서 모집을 일괄 soft-delete 한다.
     * 엔티티 remove(@SQLDelete) 대신 벌크 UPDATE 를 쓰는 이유: 직전에 거절된 Application 이
     * 영속성 컨텍스트에서 이 모집을 @ManyToOne 으로 참조하는데, 모집 엔티티를 remove 하면
     * flush 시 "제거된 엔티티 참조" 로 예외가 난다. 벌크 UPDATE 는 영속성 상태를 건드리지 않는다.
     * flush/clear 를 자동 수행해 직전 변경(지원서 거절·모집 CLOSED) 을 먼저 반영하고 stale 엔티티를 비운다.
     */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("UPDATE Recruitment r SET r.deletedAt = :deletedAt WHERE r.id IN :ids AND r.deletedAt IS NULL")
    void softDeleteByIds(@Param("ids") List<Long> ids, @Param("deletedAt") LocalDateTime deletedAt);
}