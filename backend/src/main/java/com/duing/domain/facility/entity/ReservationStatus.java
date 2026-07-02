package com.duing.domain.facility.entity;

/** 예약 슬롯의 조회 시점 상태. 응답 전용이며 DB 에 저장하지 않는다(Asia/Seoul 기준 계산). */
public enum ReservationStatus {
    UPCOMING,
    USING,
    FINISHED
}
