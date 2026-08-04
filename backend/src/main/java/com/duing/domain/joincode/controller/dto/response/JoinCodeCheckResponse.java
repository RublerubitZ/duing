package com.duing.domain.joincode.controller.dto.response;

import com.duing.domain.joincode.entity.JoinRequestStatus;
import com.duing.domain.joincode.service.dto.query.JoinCodeCheckQuery;

/**
 * 학생의 코드 확인 화면(/join/{code}) 응답.
 *
 * <p>{@code alreadyMember}·{@code myRequestStatus} 는 비로그인이면 둘 다 null 이며, FE 는 이를
 * "판정 불가(로그인 유도)"로 읽는다. {@code usable} 이 false 인 사유(만료·폐기·소진·모집 마감·비 ACTIVE
 * 동아리)는 구분해 내리지 않는다(스펙 6).
 */
public record JoinCodeCheckResponse(
        Long clubId,
        String clubName,
        Integer generation,
        boolean usable,
        Boolean alreadyMember,
        String myRequestStatus
) {
    public static JoinCodeCheckResponse from(JoinCodeCheckQuery joinCodeCheckQuery) {
        JoinRequestStatus myRequestStatus = joinCodeCheckQuery.myRequestStatus();
        return new JoinCodeCheckResponse(
                joinCodeCheckQuery.clubId(),
                joinCodeCheckQuery.clubName(),
                joinCodeCheckQuery.generation(),
                joinCodeCheckQuery.usable(),
                joinCodeCheckQuery.alreadyMember(),
                myRequestStatus == null ? null : myRequestStatus.name()
        );
    }
}
