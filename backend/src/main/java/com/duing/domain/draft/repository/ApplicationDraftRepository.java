package com.duing.domain.draft.repository;

import com.duing.domain.draft.entity.ApplicationDraft;
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
}
