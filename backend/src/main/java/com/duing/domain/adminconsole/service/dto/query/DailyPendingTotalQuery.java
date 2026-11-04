package com.duing.domain.adminconsole.service.dto.query;

import java.time.LocalDate;

/** 하루치 남은 대기 건수 합계. 그날 기록이 없으면 totalPendingCount 가 null 이다(0 과 다르다). */
public record DailyPendingTotalQuery(LocalDate date, Integer totalPendingCount) {
}
