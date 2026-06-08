package com.duing.domain.interview.repository;

import com.duing.domain.interview.entity.InterviewSlot;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface InterviewSlotRepository
        extends JpaRepository<InterviewSlot, Long>, InterviewSlotRepositoryCustom {

    List<InterviewSlot> findByRecruitmentIdOrderByStartTimeAsc(Long recruitmentId);
}
