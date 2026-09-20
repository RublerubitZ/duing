package com.duing.domain.draft.repository;

import com.duing.domain.draft.entity.ApplicationDraft;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ApplicationDraftRepository extends JpaRepository<ApplicationDraft, Long> {

    Optional<ApplicationDraft> findByUserIdAndRecruitmentId(Long userId, Long recruitmentId);

    @Modifying(clearAutomatically = true)
    @Query("""
            DELETE FROM ApplicationDraft d
            WHERE d.userId = :userId
              AND d.recruitmentId = :recruitmentId
            """)
    void deleteByUserIdAndRecruitmentId(@Param("userId") Long userId,
                                        @Param("recruitmentId") Long recruitmentId);

    @Modifying(clearAutomatically = true)
    @Query("DELETE FROM ApplicationDraft d WHERE d.recruitmentId = :recruitmentId")
    void deleteAllByRecruitmentId(@Param("recruitmentId") Long recruitmentId);

    /**
     * 마감 6개월(closedCutoffDate) 또는 탈퇴 45일(withdrawnCutoff)이 지난 미제출 초안을 물리 삭제한다(스펙 §3.3).
     * 초안은 감사 가치가 없고 soft-delete 컬럼도 없다. 제출된 지원서(application)는 다른 테이블이라 건드리지 않는다.
     * 마감 앵커 LEAST(closed_at::date, end_date) 의 NULL 처리는 ApplicationRepository.purgeExpiredTextAnswers 와 같다.
     */
    @Modifying(clearAutomatically = true)
    @Query(value = """
            DELETE FROM application_draft draft
             USING recruitment r, users u
             WHERE r.id = draft.recruitment_id AND u.id = draft.user_id
               AND (LEAST(r.closed_at::date, r.end_date) < :closedCutoffDate
                    OR u.deleted_at < :withdrawnCutoff)
            """, nativeQuery = true)
    int deleteExpired(@Param("closedCutoffDate") LocalDate closedCutoffDate,
                      @Param("withdrawnCutoff") LocalDateTime withdrawnCutoff);
}
