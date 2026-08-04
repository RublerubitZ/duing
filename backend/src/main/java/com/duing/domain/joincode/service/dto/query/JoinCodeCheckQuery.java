package com.duing.domain.joincode.service.dto.query;

import com.duing.domain.joincode.entity.JoinRequestStatus;

/**
 * 학생의 코드 확인 결과.
 *
 * <p>{@code alreadyMember}·{@code myRequestStatus} 는 현재 사용자 기준 판정이므로 비로그인 확인에서는
 * 둘 다 null 이다 (스펙 5 — 비로그인도 동아리명 확인은 허용).
 */
public record JoinCodeCheckQuery(
        Long clubId,
        String clubName,
        Integer generation,
        boolean usable,
        Boolean alreadyMember,
        JoinRequestStatus myRequestStatus
) {
}
