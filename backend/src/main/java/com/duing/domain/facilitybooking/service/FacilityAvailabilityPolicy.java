package com.duing.domain.facilitybooking.service;

import com.duing.domain.facility.entity.FacilityReservation;
import org.springframework.stereotype.Component;

/**
 * 크롤 행 판별 정책 — 판별 규칙은 이 컴포넌트 한 곳에만 존재한다(설계 §3.1 0단계).
 * 가용성 계산·API·UI 는 분류 결과(CrawlRowType)만 소비하며 컬럼 구조를 알지 못한다.
 * 학교 데이터 형식이나 파서가 바뀌면 이 클래스 내부만 교체한다.
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
}
