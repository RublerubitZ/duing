package com.duing.domain.interview.repository;

import com.duing.domain.interview.entity.InterviewSlot;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface InterviewSlotRepository extends JpaRepository<InterviewSlot, Long> {

    long countByRoundId(Long roundId);

    List<InterviewSlot> findByRoundIdOrderByStartTimeAsc(Long roundId);
}

