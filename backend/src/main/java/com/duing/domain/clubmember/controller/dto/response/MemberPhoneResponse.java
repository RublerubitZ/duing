package com.duing.domain.clubmember.controller.dto.response;

/** 회장이 명시적으로 조회한 회원의 원본 연락처. 목록·export 응답은 계속 마스킹만 제공한다. */
public record MemberPhoneResponse(String phone) {

    public static MemberPhoneResponse from(String phone) {
        return new MemberPhoneResponse(phone);
    }
}
