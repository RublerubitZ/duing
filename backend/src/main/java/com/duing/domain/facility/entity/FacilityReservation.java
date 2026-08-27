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
import java.util.Objects;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@Entity
@Table(name = "facility_reservation")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class FacilityReservation extends BaseEntity {

    private static final int MAX_ORGANIZATION_NAME_LENGTH = 200;

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

    // reserved_start_time/reserved_end_time(V72) 컬럼은 DB 에 남아 있으나 매핑하지 않는다 —
    // 구 "기본 확보 시간" 파생값으로 전면 차단 정책(2026-08-27)에서 폐지됐다(물리 drop 은 후속 마이그레이션).

    @Column(name = "crawled_at", nullable = false)
    private LocalDateTime crawledAt;

    @Builder(access = AccessLevel.PRIVATE)
    private FacilityReservation(Long facilityId, Long scheduleSeq, YearMonth yearMonth, LocalDate reservationDate,
                                LocalTime startTime, LocalTime endTime, String organizationName,
                                LocalDateTime crawledAt) {
        this.facilityId = facilityId;
        this.scheduleSeq = scheduleSeq;
        this.yearMonth = yearMonth;
        this.reservationDate = reservationDate;
        this.startTime = startTime;
        this.endTime = endTime;
        this.organizationName = organizationName;
        this.crawledAt = crawledAt;
    }

    public static FacilityReservation create(Long facilityId, Long scheduleSeq, YearMonth yearMonth,
                                             LocalDate reservationDate, LocalTime startTime, LocalTime endTime,
                                             String organizationName, LocalDateTime crawledAt) {
        return FacilityReservation.builder()
                .facilityId(facilityId)
                .scheduleSeq(scheduleSeq)
                .yearMonth(yearMonth)
                .reservationDate(reservationDate)
                .startTime(startTime)
                .endTime(endTime)
                .organizationName(truncate(organizationName, MAX_ORGANIZATION_NAME_LENGTH))
                .crawledAt(crawledAt)
                .build();
    }

    /**
     * 같은 schedule_seq 로 다시 수집된 크롤 결과를 반영한다. 저장된 값과 논리적으로 동일하면 아무 필드도
     * 건드리지 않아 UPDATE 자체가 발생하지 않는다(변경 없는 크롤 = DB 쓰기 0의 근거).
     *
     * <p>비교는 저장 형태 기준이다 — 단체명은 저장 시와 같은 절단을 거친 값으로 비교해, 컬럼 길이를 넘는
     * 단체명이 매 주기 "변경됨"으로 오판되지 않게 한다.
     *
     * <p>선비교를 생략하면 안 된다: 나머지 필드는 값이 같으면 Hibernate dirty check 가 UPDATE 를 걸러주지만
     * crawled_at 은 주기마다 새 값이라 무조건 dirty 가 되어, 변경이 없어도 전 행 UPDATE 가 나간다.
     * crawled_at 은 그래서 비교 대상에서 빼고 실제 변경이 있을 때만 함께 갱신한다.
     */
    public void updateCrawledDetails(LocalDate reservationDate, LocalTime startTime, LocalTime endTime,
                                     String organizationName, LocalDateTime crawledAt) {
        String normalizedOrganizationName = truncate(organizationName, MAX_ORGANIZATION_NAME_LENGTH);
        boolean unchanged = Objects.equals(this.reservationDate, reservationDate)
                && Objects.equals(this.startTime, startTime)
                && Objects.equals(this.endTime, endTime)
                && Objects.equals(this.organizationName, normalizedOrganizationName);
        if (unchanged) {
            return;
        }
        this.reservationDate = reservationDate;
        this.startTime = startTime;
        this.endTime = endTime;
        this.organizationName = normalizedOrganizationName;
        this.crawledAt = crawledAt;
    }

    /** 학교가 내려준 긴 단체명의 컬럼 길이 초과가 해당 시설·월 크롤 트랜잭션을 롤백시키지 않게 절단한다(서로게이트 쌍 보존). */
    private static String truncate(String value, int maxLength) {
        if (value == null || value.length() <= maxLength) {
            return value;
        }
        int end = maxLength;
        if (Character.isHighSurrogate(value.charAt(end - 1))) {
            end--;
        }
        return value.substring(0, end);
    }
}
