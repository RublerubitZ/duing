package com.duing.domain.facilitybooking.service;

import java.time.LocalDate;

/**
 * 예약 오픈 구간 정책(설계 §1.5). 오늘 날짜를 받아 "지금 신청 가능한 구간"을 계산하는 순수 전략 —
 * Clock 은 소비처(검증기·가용성 서비스)가 보유한다. 구간 산식은 이 계층 밖에 중복 정의하지 않는다.
 * 모드 추가(MONTHLY·FREE)는 구현체를 늘리고 BookingWindowConfig 에 매핑만 추가한다.
 */
public interface BookingWindowPolicy {

    BookingWindow windowFor(LocalDate today);
}
