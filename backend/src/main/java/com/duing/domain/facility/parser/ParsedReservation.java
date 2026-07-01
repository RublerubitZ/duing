package com.duing.domain.facility.parser;

import java.time.LocalDate;
import java.time.LocalTime;

/** 예약 JSON 파싱 산출물(원본 1시간 슬롯). organizationName 은 꼬리 시간표기가 제거된 상태. */
public record ParsedReservation(long scheduleSeq, LocalDate reservationDate, LocalTime startTime,
                                LocalTime endTime, String organizationName) {}
