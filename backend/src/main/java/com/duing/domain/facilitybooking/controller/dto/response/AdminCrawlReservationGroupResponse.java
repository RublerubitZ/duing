package com.duing.domain.facilitybooking.controller.dto.response;

import com.duing.domain.facilitybooking.service.CrawlRowType;
import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/**
 * 어드민 크롤 예약 현황의 그룹 1건(설계 §3.6, 수정 1~4). 페이징 단위 = 그룹이라 같은 주체가 페이지 간
 * 분리되지 않는다. 시간은 "HH:mm" 문자열, crawledAt 은 행 단위 수집 시각(절대시각).
 */
public record AdminCrawlReservationGroupResponse(
        GroupType groupType,
        @JsonInclude(JsonInclude.Include.NON_NULL) Long clubId,
        @JsonInclude(JsonInclude.Include.NON_NULL) Boolean facilitySecuredTimeTarget,
        @JsonInclude(JsonInclude.Include.NON_NULL) Long facilityId,
        @JsonInclude(JsonInclude.Include.NON_NULL) LocalDate reservationDate,
        String title,
        List<AdminCrawlReservation> reservations
) {

    /** CLUB=매칭 동아리 / EXTERNAL=미매칭 주체(행사·부서·기관·미등록) / FACILITY·FACILITY_DATE=장소 기준. */
    public enum GroupType { CLUB, EXTERNAL, FACILITY, FACILITY_DATE }

    public record AdminCrawlReservation(
            Long reservationId,
            Long facilityId,
            String facilityName,
            String organizationName,
            LocalDate reservationDate,
            String startTime,
            String endTime,
            CrawlRowType classification,
            @JsonInclude(JsonInclude.Include.NON_NULL) Long matchedClubId,
            @JsonInclude(JsonInclude.Include.NON_NULL) String matchedClubName,
            Instant crawledAt
    ) {}
}
