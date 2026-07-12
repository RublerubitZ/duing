package com.duing.domain.facility.service.dto.query;

import com.duing.domain.facility.entity.DataSource;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.List;

/** 이용현황 조회 결과 집합(내부 query DTO). crawledAt 이 null 이면 콜드(성공 수집 이력 없음). */
public record FacilityUsageResult(YearMonth yearMonth, LocalDateTime crawledAt, DataSource source, boolean stale,
                                  List<FacilityUsageItem> facilities) {}
