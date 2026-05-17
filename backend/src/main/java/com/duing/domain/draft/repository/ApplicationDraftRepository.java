package com.duing.domain.draft.repository;

import com.duing.domain.draft.entity.ApplicationDraft;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ApplicationDraftRepository extends JpaRepository<ApplicationDraft, Long> {

    Optional<ApplicationDraft> findByUserIdAndRecruitmentId(Long userId, Long recruitmentId);

    void deleteByUserIdAndRecruitmentId(Long userId, Long recruitmentId);

    void deleteAllByRecruitmentId(Long recruitmentId);
}