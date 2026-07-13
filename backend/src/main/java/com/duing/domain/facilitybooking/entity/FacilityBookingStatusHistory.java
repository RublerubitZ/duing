package com.duing.domain.facilitybooking.entity;

import com.duing.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 예약 상태 전이 audit log. append-only — application_status_history 와 동일 원칙으로
 * 수정·삭제 API 를 노출하지 않는다.
 *
 * <p>ApplicationStatusHistory 와 달리 changedBy 를 스칼라 ID 로 둔다: 시스템 자동 전이(매칭 잡)는
 * 행위자가 없어 null 이어야 하고, P1 응답은 행위자 신원을 노출하지 않으므로 연관관계가 필요 없다.
 */
@Entity
@Table(name = "facility_booking_status_history")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class FacilityBookingStatusHistory extends BaseEntity {

    @Column(name = "booking_id", nullable = false)
    private Long bookingId;

    /** 생성(신청) 기록은 null. */
    @Enumerated(EnumType.STRING)
    @Column(name = "previous_status", length = 20)
    private BookingStatus previousStatus;

    @Enumerated(EnumType.STRING)
    @Column(name = "new_status", nullable = false, length = 20)
    private BookingStatus newStatus;

    /** 시스템 자동 전이는 null. */
    @Column(name = "changed_by")
    private Long changedById;

    @Column(length = 500)
    private String reason;

    /** 전이 판단에 사용한 크롤 스냅샷 시각(승인·매칭 시). */
    @Column(name = "crawl_basis_at")
    private LocalDateTime crawlBasisAt;

    @Builder(access = AccessLevel.PRIVATE)
    private FacilityBookingStatusHistory(Long bookingId, BookingStatus previousStatus, BookingStatus newStatus,
                                         Long changedById, String reason, LocalDateTime crawlBasisAt) {
        this.bookingId = bookingId;
        this.previousStatus = previousStatus;
        this.newStatus = newStatus;
        this.changedById = changedById;
        this.reason = reason;
        this.crawlBasisAt = crawlBasisAt;
    }

    public static FacilityBookingStatusHistory record(Long bookingId, BookingStatus previousStatus,
                                                      BookingStatus newStatus, Long changedById,
                                                      String reason, LocalDateTime crawlBasisAt) {
        return FacilityBookingStatusHistory.builder()
                .bookingId(bookingId)
                .previousStatus(previousStatus)
                .newStatus(newStatus)
                .changedById(changedById)
                .reason(reason)
                .crawlBasisAt(crawlBasisAt)
                .build();
    }
}
