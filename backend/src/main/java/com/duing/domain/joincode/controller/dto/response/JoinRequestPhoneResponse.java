package com.duing.domain.joincode.controller.dto.response;

/** 운영진이 명시적으로 조회한 가입 요청자의 원본 연락처. 상세 응답(JoinRequestDetailResponse)은 마스킹만 싣는다. */
public record JoinRequestPhoneResponse(String phone) {

    public static JoinRequestPhoneResponse from(String phone) {
        return new JoinRequestPhoneResponse(phone);
    }
}
