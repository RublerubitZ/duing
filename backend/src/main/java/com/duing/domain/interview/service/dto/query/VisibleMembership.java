package com.duing.domain.interview.service.dto.query;

import com.duing.domain.interview.entity.InterviewRound;
import com.duing.domain.interview.entity.InterviewRoundMember;

/** isVisibleToApplicant 술어(§5.4)를 통과한 라운드-멤버십 쌍. */
public record VisibleMembership(InterviewRound round, InterviewRoundMember member) {}
