package com.duing.domain.facility.service;

import com.duing.domain.facility.entity.Facility;
import com.duing.domain.facility.service.dto.command.UpdateFacilityBookingOpenDateCommand;
import java.time.LocalDate;
import java.util.List;

/**
 * 총동연 시설 관리 — 시설별 예약 오픈일. 오픈일 NULL 은 닫힘(신청 불가)이며, 신청 창
 * [max(오픈일, 오늘), 익월 말일] 은 저장하지 않고 BookingOpenDatePolicy 가 조회 시점에 파생한다.
 */
public interface FacilityAdminService {

    /** 활성(미아카이브) 시설을 노출 순서대로 — 관리자 오픈일 목록용. */
    List<Facility> listActiveFacilities();

    /** 시설 1건의 오픈일 변경. null = 닫기, 과거 허용(판정은 오늘로 clamp), 오늘+1년 초과는 400. 동일 값은 변이 없음. */
    void updateBookingOpenDate(UpdateFacilityBookingOpenDateCommand command);

    /** 활성 시설 전체에 같은 오픈일(또는 null=닫기)을 한 트랜잭션으로 적용 — 부분 적용 상태가 남지 않는다. */
    void updateAllBookingOpenDate(LocalDate bookingOpenDate);
}
