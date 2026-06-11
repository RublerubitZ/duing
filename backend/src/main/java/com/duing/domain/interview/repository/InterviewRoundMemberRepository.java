package com.duing.domain.interview.repository;

import com.duing.domain.interview.entity.InterviewRoundMember;
import com.duing.domain.interview.entity.RoundMemberStatus;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface InterviewRoundMemberRepository
        extends JpaRepository<InterviewRoundMember, Long>, InterviewRoundMemberRepositoryCustom {

    List<InterviewRoundMember> findByRoundIdAndStatus(Long roundId, RoundMemberStatus status);
}
