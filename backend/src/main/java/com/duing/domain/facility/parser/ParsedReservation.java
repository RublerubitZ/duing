package com.duing.domain.facility.parser;

import java.time.LocalDate;
import java.time.LocalTime;

/**
 * 예약 JSON 파싱 산출물. organizationName 은 꼬리 시간표기가 제거된 상태.
 * startTime/endTime 은 원본 1시간 슬롯 — 단, 꼬리 (H:MM~H:MM)/(H:MM-H:MM) 행은 구분자와 무관하게
 * 표기 범위 전체로 확장된 값이다(전 구간 확장, ReservationParser 참조).
 * securedTail 은 물결 꼬리(기본 확보 시간 표기)가 정상 파싱된 행에만 true — 행 단위 정밀 분류의 신호다(스펙 §1).
 */
public record ParsedReservation(long scheduleSeq, LocalDate reservationDate, LocalTime startTime,
                                LocalTime endTime, String organizationName, boolean securedTail) {}
