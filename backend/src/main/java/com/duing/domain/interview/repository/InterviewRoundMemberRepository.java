package com.duing.domain.interview.repository;

import com.duing.domain.interview.entity.InterviewRoundMember;
import org.springframework.data.jpa.repository.JpaRepository;

public interface InterviewRoundMemberRepository extends JpaRepository<InterviewRoundMember, Long> {
}
