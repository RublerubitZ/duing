package com.duing.domain.recruitment.repository;

import com.duing.domain.recruitment.entity.Recruitment;
import jakarta.persistence.LockModeType;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
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
     * 모집 행을 배타 잠금으로 읽는다 — 삭제와 "모집에 딸린 가입 코드 발급"을 직렬화한다.
     *
     * <p>가입 코드 생성이 모집 상태를 더 이상 보지 않게 되면서(스펙 v2 4.2) 삭제(CLOSED 전용)와
     * 발급이 같은 모집에서 동시에 일어날 수 있다. 잠그지 않으면 "삭제가 활성 코드 0건을 확인한 직후
     * 발급된 코드"가 삭제된 모집에 매달린 채 살아남아, 학생이 계속 유입되는 고아 코드가 된다.
     * 두 경로 모두 모집 → 코드 순으로만 잠그므로 잠금 순서 사이클이 없다.
     *
     * <p>마감(close)과 면접 라운드 생성(createRound)도 같은 잠금을 쓴다 — 라운드 생성이 OPEN 을 확인한
     * 뒤 마감이 커밋되면 마감된 모집에 라운드가 잔존하기 때문이다(아카이브 스펙 §9). 소비 경로가 잠그는
     * 순서는 모집 → 지원서 / 모집 → 가입 코드로 모두 모집이 먼저라 사이클이 없다.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT recruitment FROM Recruitment recruitment WHERE recruitment.id = :recruitmentId")
    Optional<Recruitment> findByIdForUpdate(@Param("recruitmentId") Long recruitmentId);

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
     * c.status = 'ACTIVE' 조건은 리스너(RecruitmentOpenedListener)의 AFTER_COMMIT
     * existsByIdAndStatus 재검증과 같은 규칙이다 — 두 발송 경로가 같은 동아리 집합만 본다.
     * - OPENED: 오늘 시작하는 OPEN 모집
     * - DEADLINE: 시작일이 지났고 마감 3일 / 1일 / 당일인 OPEN 모집
     *   (start_date 조건이 없으면 "내일 시작, 3일 뒤 마감" 인 모집예정(UPCOMING) 공고에도
     *   마감 임박 알림이 나간다 — 표기 축(RecruitmentDisplayStatus, UPCOMING 우선)과 어긋난다)
     */
    @Query(value = """
            SELECT r.id AS recruitmentId, r.club_id AS clubId, c.name AS clubName, r.title AS title,
                   r.end_date AS endDate,
                   CASE
                     WHEN r.start_date = :today                                    THEN 'OPENED'
                     WHEN r.start_date <= :today
                          AND r.end_date IS NOT NULL AND (r.end_date - :today) IN (3,1,0) THEN 'DEADLINE'
                   END AS kind,
                   (r.end_date - :today) AS daysToEnd
              FROM recruitment r JOIN club c ON c.id = r.club_id
             WHERE r.status = 'OPEN' AND r.deleted_at IS NULL AND c.deleted_at IS NULL
               AND c.status = 'ACTIVE'
               AND (
                     r.start_date = :today
                     OR ( r.start_date <= :today
                          AND r.end_date IS NOT NULL AND (r.end_date - :today) IN (3,1,0) )
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
               SET r.status = com.duing.domain.recruitment.entity.RecruitmentStatus.CLOSED,
                   r.closedAt = :closedAt
             WHERE r.club.id = :clubId
               AND r.status = com.duing.domain.recruitment.entity.RecruitmentStatus.OPEN
               AND r.deletedAt IS NULL
            """)
    int closeAllOpenByClubId(@Param("clubId") Long clubId, @Param("closedAt") LocalDateTime closedAt);
}
