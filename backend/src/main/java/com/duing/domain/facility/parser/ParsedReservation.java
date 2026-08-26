package com.duing.domain.facility.parser;

import java.time.LocalDate;
import java.time.LocalTime;

/**
 * 예약 JSON 파싱 산출물. organizationName 은 꼬리 시간표기가 제거된 상태.
 * startTime/endTime 은 원본 1시간 슬롯 — 단, 하이픈 꼬리 (H:MM-H:MM) 실예약 범위 행은 표기 범위
 * 전체로 확장된 값이다(전 구간 차단, ReservationParser 참조).
 * reservedStartTime/reservedEndTime 은 물결 꼬리 (H:MM~H:MM)에서 추출한 기본 확보 시간(§16.1) —
 * 표기가 없거나 파싱 실패(역전·형식 이상)면 둘 다 null(조회 시 SlotMerger 폴백).
 */
public record ParsedReservation(long scheduleSeq, LocalDate reservationDate, LocalTime startTime,
                                LocalTime endTime, String organizationName,
                                LocalTime reservedStartTime, LocalTime reservedEndTime) {}
