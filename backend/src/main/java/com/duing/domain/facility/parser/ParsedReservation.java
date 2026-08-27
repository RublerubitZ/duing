package com.duing.domain.facility.parser;

import java.time.LocalDate;
import java.time.LocalTime;

/**
 * 예약 JSON 파싱 산출물. organizationName 은 꼬리 시간표기가 제거된 상태.
 * startTime/endTime 은 원본 1시간 슬롯 — 단, 꼬리 (H:MM~H:MM)/(H:MM-H:MM) 실예약 범위 행은
 * 구분자와 무관하게 표기 범위 전체로 확장된 값이다(전 구간 차단, ReservationParser 참조).
 * reservedStartTime/reservedEndTime 은 구 "기본 확보 시간" 파생값 — 전면 차단 정책(2026-08-27)으로
 * 추출을 중단해 항상 null 이며, 필드 물리 제거는 소비처 정리와 함께 후속 단계에서 수행한다.
 */
public record ParsedReservation(long scheduleSeq, LocalDate reservationDate, LocalTime startTime,
                                LocalTime endTime, String organizationName,
                                LocalTime reservedStartTime, LocalTime reservedEndTime) {}
