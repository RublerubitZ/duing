package com.duing.domain.facility.service;

import com.duing.domain.facility.entity.Facility;
import com.duing.domain.facility.service.dto.query.FacilityUsageResult;
import java.time.YearMonth;
import java.util.List;

/** 시설 이용현황 조회(공개 API 용). 조회 시점 상태계산은 구현체가 담당한다. */
public interface FacilityUsageService {

    /** §7.1 활성 시설 목록(가벼움). */
    List<Facility> getActiveFacilities();

    /** §7.2 이용현황. yearMonth 가 null 이면 현재월. 범위 초과는 400. */
    FacilityUsageResult getUsage(YearMonth requestedMonth);

    /** §7.3 단일 시설 상세 — usage 의 시설 1건 슬라이스. */
    FacilityUsageResult getDetail(Long facilityId, YearMonth requestedMonth);
}
