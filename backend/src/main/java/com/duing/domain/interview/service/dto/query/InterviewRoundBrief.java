package com.duing.domain.interview.service.dto.query;

import com.duing.domain.interview.entity.RoundMemberStatus;
import com.duing.domain.interview.entity.RoundStatus;

/**
 * 운영진 시점에 노출하는 면접 라운드 요약 — placement-active 멤버십(§5.4 — DRAFT 포함,
 * EXCLUDED·CANCELLED 제외)이 있을 때만 만들어진다.
 * <p>
 * {@code unresponded} 는 저장 필드가 아니라 파생값이다 — INVITED && now > availabilityDeadline.
 * availabilityDeadline 이 null 인 DRAFT 라운드는 마감이 미설정 상태이므로 unresponded 가 false.
 * {@code alternativeAvailabilityText} 는 NO_AVAILABLE_SLOT 상태일 때만 의미를 가지며 그 외엔 null.
 */
public record InterviewRoundBrief(
        Long roundId,
        String title,
        RoundStatus roundStatus,
        RoundMemberStatus memberStatus,
        boolean unresponded,
        String alternativeAvailabilityText
) {}
