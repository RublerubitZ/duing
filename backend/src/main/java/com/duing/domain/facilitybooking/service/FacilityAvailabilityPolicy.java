package com.duing.domain.facilitybooking.service;

import com.duing.domain.facility.entity.FacilityReservation;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.Collection;
import java.util.stream.Stream;
import org.springframework.stereotype.Component;

/**
 * 크롤 행 판별 정책 — 판별 규칙은 이 컴포넌트 한 곳에만 존재한다(설계 §3.1 0단계).
 * 가용성 계산·API·UI 는 분류 결과(CrawlRowType)만 소비하며 컬럼 구조를 알지 못한다.
 * 학교 데이터 형식이나 파서가 바뀌면 이 클래스 내부만 교체한다.
 * 점유행과 예약 시간의 겹침 판정({@link #occupiedOverlapping})도 이 클래스 소관이다.
 */
@Component
public class FacilityAvailabilityPolicy {

    /**
     * 현재 구현: 운영시간 꼬리(reservedStartTime·reservedEndTime)가 온전히 파싱된 행 = 운영행, 아니면 점유행.
     * 반쪽 파싱 행(start·end 중 한쪽만 존재)은 점유로 간주한다(보수적 기본값). 현재 파서는 두 값을 함께
     * 채우거나 함께 비우는 both-null 불변식이라 반쪽 값은 실경로가 없지만, 파서가 바뀌어 불변식이 깨져도
     * 운영행으로 오분류해 슬롯을 열어주는 것을 방지하는 심층 방어다.
     */
    public CrawlRowType classify(FacilityReservation reservation) {
        boolean operatingHoursParsed = reservation.getReservedStartTime() != null
                && reservation.getReservedEndTime() != null;
        return operatingHoursParsed ? CrawlRowType.OPERATING : CrawlRowType.OCCUPIED;
    }

    /**
     * 학교 점유행(OCCUPIED)이 지정 날짜의 [startTime, endTime) 반개구간과 겹치는 행만 남긴다.
     * 신청 차단·승인 재검증·관리자 상세·부분반영·충돌의심은 "같은 규칙이어야 하는 쌍"(설계 §5.1↔§5.2)이라
     * 이 필터 하나를 공유한다 — 갈라지면 이중 대관 승인이 난다. 결과 성형(boolean/payload/컨텍스트 누적)은
     * 호출부 소관이므로 Stream 을 그대로 돌려준다.
     * 슬롯 자동확정의 닫힌 포함 판정(FacilityBookingMatchingService, start&lt;=slotStart &amp;&amp; end&gt;=slotEnd)은
     * 겹침이 아니라 이 필터에 흡수하면 안 된다 — 부분 겹침에도 자동확정이 걸리는 오확정이 된다.
     */
    public Stream<FacilityReservation> occupiedOverlapping(Collection<FacilityReservation> rows,
            LocalDate date, LocalTime startTime, LocalTime endTime) {
        return rows.stream()
                .filter(row -> row.getReservationDate().equals(date))
                .filter(row -> classify(row) == CrawlRowType.OCCUPIED)
                .filter(row -> row.getStartTime().isBefore(endTime) && row.getEndTime().isAfter(startTime));
    }
}
