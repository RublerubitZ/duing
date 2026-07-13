package com.duing.domain.facilitybooking.entity;

import com.duing.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 사용 목적 Preset — 신청 폼 입력 보조 UX(설계 §6.3). P1 은 시드 데이터 + 조회 전용,
 * 관리자 CRUD 는 P2 에서 추가한다. "기타(직접 입력)"는 DB 행이 아니라 FE 고정 칩이다.
 */
@Entity
@Table(name = "facility_booking_purpose_preset")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class FacilityBookingPurposePreset extends BaseEntity {

    @Column(nullable = false, length = 50, unique = true)
    private String label;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder;

    @Column(nullable = false)
    private boolean active;
}
