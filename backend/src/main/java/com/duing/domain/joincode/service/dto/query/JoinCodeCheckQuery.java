package com.duing.domain.joincode.service.dto.query;

import com.duing.domain.joincode.entity.JoinCodeLinkType;
import com.duing.domain.joincode.entity.JoinRequestStatus;

/**
 * 학생의 코드 확인 결과.
 *
 * <p>{@code alreadyMember}·{@code myRequestStatus} 는 현재 사용자 기준 판정이므로 비로그인 확인에서는
 * 둘 다 null 이다 (스펙 5 — 비로그인도 동아리명 확인은 허용).
 *
 * <p>{@code linkType}·{@code autoApprove} 는 링크 2종(V107)의 랜딩 문구 분기 근거다 — 로그인 여부와
 * 무관한 링크 자체의 속성이라 비로그인 확인에도 그대로 실린다. 모집 링크는 {@code RECRUITMENT}·false.
 */
public record JoinCodeCheckQuery(
        Long clubId,
        String clubName,
        Integer generation,
        boolean usable,
        Boolean alreadyMember,
        JoinRequestStatus myRequestStatus,
        JoinCodeLinkType linkType,
        boolean autoApprove
) {
}
