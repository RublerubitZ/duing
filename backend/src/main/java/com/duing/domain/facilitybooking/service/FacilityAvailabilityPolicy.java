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

    /** 현재 구현: 운영시간 꼬리(reservedStartTime)가 파싱된 행 = 운영행, 없는 행 = 점유행. */
    public CrawlRowType classify(FacilityReservation reservation) {
        return reservation.getReservedStartTime() != null ? CrawlRowType.OPERATING : CrawlRowType.OCCUPIED;
    }
}
