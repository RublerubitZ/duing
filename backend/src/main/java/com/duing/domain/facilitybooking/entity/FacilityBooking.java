package com.duing.domain.facilitybooking.entity;

import com.duing.domain.facilitybooking.exception.FacilityBookingException;
import com.duing.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;

/**
 * 시설 대관 신청. 크롤 미러(facility_reservation)와 분리된 쓰기 도메인이며,
 * 시설·동아리·사용자는 ID 스칼라로만 참조한다(facility 도메인 컨벤션).
 */
@Getter
@Entity
@Table(name = "facility_booking")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
// @Version 도입으로 Hibernate 가 두 번째 바인드 파라미터로 version 을 전달하므로 WHERE 절에 version 조건을 명시한다.
@SQLDelete(sql = "UPDATE facility_booking SET deleted_at = NOW() WHERE id = ? AND version = ?")
@SQLRestriction("deleted_at IS NULL")
public class FacilityBooking extends BaseEntity {

    @Column(name = "facility_id", nullable = false)
    private Long facilityId;

    @Column(name = "club_id", nullable = false)
    private Long clubId;

    @Column(name = "applicant_id", nullable = false)
    private Long applicantId;

    @Column(name = "reservation_date", nullable = false)
    private LocalDate reservationDate;

    @Column(name = "start_time", nullable = false)
    private LocalTime startTime;

    @Column(name = "end_time", nullable = false)
    private LocalTime endTime;

    @Column(nullable = false, length = 200)
    private String purpose;

    @Column(name = "attendee_count")
    private Integer attendeeCount;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private BookingStatus status;

    @Column(name = "reject_reason", length = 500)
    private String rejectReason;

    @Column(name = "conflict_detail", length = 500)
    private String conflictDetail;

    @Column(name = "matched_schedule_seq")
    private Long matchedScheduleSeq;

    @Column(name = "crawl_basis_at")
    private LocalDateTime crawlBasisAt;

    @Column(name = "decided_by")
    private Long decidedById;

    @Column(name = "decided_at")
    private LocalDateTime decidedAt;

    @Column(name = "confirmed_at")
    private LocalDateTime confirmedAt;

    // 두 요청이 같은 신청을 동시에 전이시키면 후행 UPDATE 가 0 row →
    // ObjectOptimisticLockingFailureException 으로 차단된다(GlobalExceptionHandler 가 409 변환).
    @Version
    @Column(nullable = false)
    private Long version;

    @Builder(access = AccessLevel.PRIVATE)
    private FacilityBooking(Long facilityId, Long clubId, Long applicantId, LocalDate reservationDate,
                            LocalTime startTime, LocalTime endTime, String purpose, Integer attendeeCount) {
        this.facilityId = facilityId;
        this.clubId = clubId;
        this.applicantId = applicantId;
        this.reservationDate = reservationDate;
        this.startTime = startTime;
        this.endTime = endTime;
        this.purpose = purpose;
        this.attendeeCount = attendeeCount;
        this.status = BookingStatus.PENDING;
    }

    public static FacilityBooking request(Long facilityId, Long clubId, Long applicantId,
                                          LocalDate reservationDate, LocalTime startTime, LocalTime endTime,
                                          String purpose, Integer attendeeCount) {
        return FacilityBooking.builder()
                .facilityId(facilityId)
                .clubId(clubId)
                .applicantId(applicantId)
                .reservationDate(reservationDate)
                .startTime(startTime)
                .endTime(endTime)
                .purpose(purpose)
                .attendeeCount(attendeeCount)
                .build();
    }

    /** 신청 동아리의 취소 — PENDING 에서만 허용(설계 §4.3). APPROVED 이후 취소는 관리자 전용(PR2). */
    public void cancelByClub() {
        if (this.status != BookingStatus.PENDING) {
            throw new FacilityBookingException.InvalidStatusTransitionException(this.status, BookingStatus.CANCELLED);
        }
        this.status = BookingStatus.CANCELLED;
    }

    /** 반개구간 [start, end) 겹침 — 경계 접촉(끝==시작)은 겹침이 아니다. */
    public boolean overlaps(LocalTime otherStart, LocalTime otherEnd) {
        return this.startTime.isBefore(otherEnd) && this.endTime.isAfter(otherStart);
    }
}
