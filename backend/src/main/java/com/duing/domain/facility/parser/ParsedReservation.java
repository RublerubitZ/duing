package com.duing.domain.facility.parser;

import java.time.LocalDate;
import java.time.LocalTime;

/**
 * 예약 JSON 파싱 산출물(원본 1시간 슬롯). organizationName 은 꼬리 시간표기가 제거된 상태.
 * reservedStartTime/reservedEndTime 은 꼬리 (H:MM~H:MM)에서 추출한 실제 운영시간(§16.1) —
 * 표기가 없거나 파싱 실패(역전·형식 이상)면 둘 다 null(조회 시 SlotMerger 폴백).
 */
public record ParsedReservation(long scheduleSeq, LocalDate reservationDate, LocalTime startTime,
                                LocalTime endTime, String organizationName,
                                LocalTime reservedStartTime, LocalTime reservedEndTime) {}
