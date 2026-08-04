package com.duing.domain.recruitment.repository;

import com.duing.domain.recruitment.entity.Recruitment;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface RecruitmentRepository extends JpaRepository<Recruitment, Long>, RecruitmentRepositoryCustom {

    /**
     * 모집 스코프 경로(가입 코드 등)의 clubId↔recruitmentId 소속 대조용 조회 — 타 동아리 모집은
     * 조회되지 않아야 존재 여부 열거를 막을 수 있다(불일치 404).
     * {@code @SQLRestriction} 이 적용되는 JPQL 파생 쿼리라 soft-delete 된 모집은 자동으로 제외된다.
     */
    Optional<Recruitment> findByIdAndClubId(Long recruitmentId, Long clubId);

    /**
     * 제출이 읽는 질문 정의를 고정한다. 질문 변경(FOR UPDATE)과 상호 배타이고,
     * 제출끼리는 공유 잠금이라 서로를 막지 않는다. 폼이 없는(EXTERNAL) 모집은 빈 Optional.
     */
    @Query(value = "SELECT 1 FROM recruitment_form WHERE recruitment_id = :recruitmentId "
            + "AND deleted_at IS NULL FOR SHARE", nativeQuery = true)
    Optional<Integer> lockFormForSubmission(@Param("recruitmentId") Long recruitmentId);

    /**
     * 질문 변경 직전에 폼을 배타 잠금한다. 진행 중인 제출이 커밋될 때까지 대기하므로
     * 이후의 지원자 수 확인이 "확인 후 커밋 전 INSERT" 경합에 노출되지 않는다.
     */
    @Query(value = "SELECT 1 FROM recruitment_form WHERE recruitment_id = :recruitmentId "
            + "AND deleted_at IS NULL FOR UPDATE", nativeQuery = true)
    Optional<Integer> lockFormForQuestionChange(@Param("recruitmentId") Long recruitmentId);

    /**
     * Deadline 알림 후보를 조회한다. 운영 중(ACTIVE) 동아리의 모집만 대상이다.
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
             WHERE r.status = 'OPEN' AND r.deleted_at IS NULL AND c.deleted_at IS NULL
               AND c.status = 'ACTIVE'
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

    /**
     * 동아리 운영 중단(INACTIVE) 전환 시 OPEN 모집을 일괄 마감한다 (스펙 Part A · D1).
     * 벌크 UPDATE 에는 @SQLRestriction 이 적용되지 않으므로 deletedAt IS NULL 을 명시한다.
     * 행 잠금 하 updateStatus 트랜잭션의 1차 캐시와 어긋나지 않도록 flush/clear 를 자동 수행한다.
     */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            UPDATE Recruitment r
               SET r.status = com.duing.domain.recruitment.entity.RecruitmentStatus.CLOSED
             WHERE r.club.id = :clubId
               AND r.status = com.duing.domain.recruitment.entity.RecruitmentStatus.OPEN
               AND r.deletedAt IS NULL
            """)
    int closeAllOpenByClubId(@Param("clubId") Long clubId);
}
