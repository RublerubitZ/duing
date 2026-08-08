package com.duing.domain.joincode.controller.dto.response;

import com.duing.domain.joincode.entity.JoinCodeLinkType;
import com.duing.domain.joincode.entity.JoinRequestStatus;
import com.duing.domain.joincode.service.dto.query.JoinCodeCheckQuery;

/**
 * 학생의 코드 확인 화면(/join/{code}) 응답.
 *
 * <p>{@code alreadyMember}·{@code myRequestStatus} 는 비로그인이면 둘 다 null 이며, FE 는 이를
 * "판정 불가(로그인 유도)"로 읽는다. {@code usable} 이 false 인 사유(만료·폐기·소진·모집 마감·비 ACTIVE
 * 동아리)는 구분해 내리지 않는다(스펙 6).
 *
 * <p>{@code linkType}·{@code autoApprove} 는 부원 초대 링크(V107) 랜딩의 문구 분기 근거다 —
 * 자동 승인 링크는 신청 성공이 곧 가입 완료이므로 안내가 달라진다(스펙 §7). 신청 API 응답은 무변경이다.
 */
public record JoinCodeCheckResponse(
        Long clubId,
        String clubName,
        Integer generation,
        boolean usable,
        Boolean alreadyMember,
        String myRequestStatus,
        JoinCodeLinkType linkType,
        boolean autoApprove
) {
    public static JoinCodeCheckResponse from(JoinCodeCheckQuery joinCodeCheckQuery) {
        JoinRequestStatus myRequestStatus = joinCodeCheckQuery.myRequestStatus();
        return new JoinCodeCheckResponse(
                joinCodeCheckQuery.clubId(),
                joinCodeCheckQuery.clubName(),
                joinCodeCheckQuery.generation(),
                joinCodeCheckQuery.usable(),
                joinCodeCheckQuery.alreadyMember(),
                myRequestStatus == null ? null : myRequestStatus.name(),
                joinCodeCheckQuery.linkType(),
                joinCodeCheckQuery.autoApprove()
        );
    }
}
