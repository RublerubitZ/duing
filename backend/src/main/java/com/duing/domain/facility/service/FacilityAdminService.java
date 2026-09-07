package com.duing.domain.facility.service;

import com.duing.domain.facility.entity.Facility;
import com.duing.domain.facility.service.dto.command.UpdateFacilityBookingOpenDateCommand;
import java.time.LocalDate;
import java.util.List;

/**
 * 총동연 시설 관리 — 시설별 예약 오픈일·마감일. 오픈일 NULL 은 닫힘(신청 불가), 마감일 NULL 은 상한 없음이며,
 * 신청 창 [max(오픈일, 오늘), min(마감일, 익월 말일)] 은 저장하지 않고 BookingOpenDatePolicy 가 조회 시점에 파생한다.
 */
public interface FacilityAdminService {

    /** 활성(미아카이브) 시설을 노출 순서대로 — 관리자 오픈일 목록용. */
    List<Facility> listActiveFacilities();

    /**
     * 시설 1건의 오픈일·마감일 변경 — 커맨드가 곧 새 상태다(부분 갱신 아님). 오픈일 null = 닫기, 마감일 null = 상한 해제,
     * 과거 허용(판정은 오늘로 clamp), 오픈일 오늘+1년 초과·마감일 역순·마감일 익월 말일 초과는 400. 동일 값은 변이 없음.
     */
    void updateBookingOpenDate(UpdateFacilityBookingOpenDateCommand command);

    /** 활성 시설 전체에 같은 오픈일·마감일(각각 null=닫기·상한 해제)을 한 트랜잭션으로 적용 — 부분 적용 상태가 남지 않는다. */
    void updateAllBookingOpenDate(LocalDate bookingOpenDate, LocalDate bookingCloseDate);
}
