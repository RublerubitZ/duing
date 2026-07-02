package com.duing.domain.facility.entity;

import com.duing.domain.facility.converter.YearMonthAttributeConverter;
import com.duing.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.YearMonth;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@Entity
@Table(name = "facility_reservation")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class FacilityReservation extends BaseEntity {

    @Column(name = "facility_id", nullable = false)
    private Long facilityId;

    @Column(name = "schedule_seq", nullable = false, unique = true)
    private Long scheduleSeq;

    @Convert(converter = YearMonthAttributeConverter.class)
    @Column(name = "year_month", nullable = false, length = 7)
    private YearMonth yearMonth;

    @Column(name = "reservation_date", nullable = false)
    private LocalDate reservationDate;

    @Column(name = "start_time", nullable = false)
    private LocalTime startTime;

    @Column(name = "end_time", nullable = false)
    private LocalTime endTime;

    @Column(name = "organization_name", nullable = false, length = 200)
    private String organizationName;

    /** 꼬리 (H:MM~H:MM) 운영시간(§16.1) — 표기 없음/파싱 실패면 null(조회 시 SlotMerger 폴백). */
    @Column(name = "reserved_start_time")
    private LocalTime reservedStartTime;

    @Column(name = "reserved_end_time")
    private LocalTime reservedEndTime;

    @Column(name = "crawled_at", nullable = false)
    private LocalDateTime crawledAt;

    @Builder(access = AccessLevel.PRIVATE)
    private FacilityReservation(Long facilityId, Long scheduleSeq, YearMonth yearMonth, LocalDate reservationDate,
                                LocalTime startTime, LocalTime endTime, String organizationName,
                                LocalTime reservedStartTime, LocalTime reservedEndTime, LocalDateTime crawledAt) {
        this.facilityId = facilityId;
        this.scheduleSeq = scheduleSeq;
        this.yearMonth = yearMonth;
        this.reservationDate = reservationDate;
        this.startTime = startTime;
        this.endTime = endTime;
        this.organizationName = organizationName;
        this.reservedStartTime = reservedStartTime;
        this.reservedEndTime = reservedEndTime;
        this.crawledAt = crawledAt;
    }

    public static FacilityReservation create(Long facilityId, Long scheduleSeq, YearMonth yearMonth,
                                             LocalDate reservationDate, LocalTime startTime, LocalTime endTime,
                                             String organizationName, LocalTime reservedStartTime,
                                             LocalTime reservedEndTime, LocalDateTime crawledAt) {
        return FacilityReservation.builder()
                .facilityId(facilityId)
                .scheduleSeq(scheduleSeq)
                .yearMonth(yearMonth)
                .reservationDate(reservationDate)
                .startTime(startTime)
                .endTime(endTime)
                .organizationName(organizationName)
                .reservedStartTime(reservedStartTime)
                .reservedEndTime(reservedEndTime)
                .crawledAt(crawledAt)
                .build();
    }
}
