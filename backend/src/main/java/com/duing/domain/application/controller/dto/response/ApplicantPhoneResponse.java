package com.duing.domain.application.controller.dto.response;

/** 운영진이 명시적으로 조회한 지원자의 원본 연락처. 상세 응답(ApplicantDetailResponse)은 마스킹만 싣는다. */
public record ApplicantPhoneResponse(String phone) {

    public static ApplicantPhoneResponse from(String phone) {
        return new ApplicantPhoneResponse(phone);
    }
}
