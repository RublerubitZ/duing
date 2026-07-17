package com.duing.common.fixture;

/**
 * 시설 대관 신청 테스트 공통 상수. 대표 연락처는 서버 검증 패턴
 * {@code ^01[016789]-?\d{3,4}-?\d{4}$} 을 만족하는 유효 형식을 쓴다(하드코딩 무효값 = 회귀 유발 금지).
 */
public final class FacilityBookingFixture {

    /** 유효한 대표 연락처(하이픈 포함) — 신청 생성 픽스처 공통 값. */
    public static final String VALID_CONTACT_PHONE = "010-1234-5678";

    private FacilityBookingFixture() {}
}
