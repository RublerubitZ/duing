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

    // 관리자·시설 담당자 연락용(§1). 기존 행은 빈 문자열(V85 하위호환), 신규는 요청 검증이 형식을 보장한다.
    @Column(name = "contact_phone", nullable = false, length = 20)
    private String contactPhone;

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
                            LocalTime startTime, LocalTime endTime, String purpose, Integer attendeeCount,
                            String contactPhone) {
        this.facilityId = facilityId;
        this.clubId = clubId;
        this.applicantId = applicantId;
        this.reservationDate = reservationDate;
        this.startTime = startTime;
        this.endTime = endTime;
        this.purpose = purpose;
        this.attendeeCount = attendeeCount;
        this.contactPhone = contactPhone;
        this.status = BookingStatus.PENDING;
    }

    public static FacilityBooking request(Long facilityId, Long clubId, Long applicantId,
                                          LocalDate reservationDate, LocalTime startTime, LocalTime endTime,
                                          String purpose, Integer attendeeCount, String contactPhone) {
        return FacilityBooking.builder()
                .facilityId(facilityId)
                .clubId(clubId)
                .applicantId(applicantId)
                .reservationDate(reservationDate)
                .startTime(startTime)
                .endTime(endTime)
                .purpose(purpose)
                .attendeeCount(attendeeCount)
                .contactPhone(contactPhone)
                .build();
    }

    /** 신청 동아리의 취소 — PENDING 에서만 허용(설계 §4.3). APPROVED 이후 취소는 관리자 전용(PR2). */
    public void cancelByClub() {
        if (this.status != BookingStatus.PENDING) {
            throw new FacilityBookingException.InvalidStatusTransitionException(this.status, BookingStatus.CANCELLED);
        }
        this.status = BookingStatus.CANCELLED;
    }

    /** 총동연 승인 — PENDING 또는 CONFLICT(재승인, §4.2). 겹침 재검증은 서비스(§5.2)가 잠금 하에 선행한다. */
    public void approve(Long adminId, LocalDateTime crawlBasisAt, LocalDateTime decidedAt) {
        if (this.status != BookingStatus.PENDING && this.status != BookingStatus.CONFLICT) {
            throw new FacilityBookingException.InvalidStatusTransitionException(this.status, BookingStatus.APPROVED);
        }
        this.status = BookingStatus.APPROVED;
        this.decidedById = adminId;
        this.decidedAt = decidedAt;
        this.crawlBasisAt = crawlBasisAt;
        this.conflictDetail = null;
    }

    /** 총동연 거절 — PENDING 에서만(§4.3). 사유 필수는 요청 DTO 검증이 보장한다. */
    public void reject(Long adminId, String reason, LocalDateTime decidedAt) {
        if (this.status != BookingStatus.PENDING) {
            throw new FacilityBookingException.InvalidStatusTransitionException(this.status, BookingStatus.REJECTED);
        }
        this.status = BookingStatus.REJECTED;
        this.decidedById = adminId;
        this.decidedAt = decidedAt;
        this.rejectReason = reason;
    }

    /** 매칭 잡의 자동 확정(§5.3) — APPROVED 에서만. 시스템 전이라 결정자를 기록하지 않는다. */
    public void confirmByMatching(Long matchedScheduleSeq, LocalDateTime crawlBasisAt, LocalDateTime confirmedAt) {
        if (this.status != BookingStatus.APPROVED) {
            throw new FacilityBookingException.InvalidStatusTransitionException(this.status, BookingStatus.CONFIRMED);
        }
        this.status = BookingStatus.CONFIRMED;
        this.matchedScheduleSeq = matchedScheduleSeq;
        this.crawlBasisAt = crawlBasisAt;
        this.confirmedAt = confirmedAt;
    }

    /** 관리자 수동 확정 — 자동 매칭 불발(학교 표기 차이) 시(§5.3). 확정 주체는 이력(changed_by)과
     *  confirmedAt 이 담으므로 decidedById/decidedAt 은 승인 결정 쌍 그대로 보존한다(오독 방지). */
    public void confirmManually(LocalDateTime confirmedAt) {
        if (this.status != BookingStatus.APPROVED) {
            throw new FacilityBookingException.InvalidStatusTransitionException(this.status, BookingStatus.CONFIRMED);
        }
        this.status = BookingStatus.CONFIRMED;
        this.confirmedAt = confirmedAt;
    }

    /** 승인 후 학교 데이터 충돌 — APPROVED 에서만(§4.1: CONFLICT 는 승인 후 전용 상태). */
    public void markConflict(String detail) {
        if (this.status != BookingStatus.APPROVED) {
            throw new FacilityBookingException.InvalidStatusTransitionException(this.status, BookingStatus.CONFLICT);
        }
        this.status = BookingStatus.CONFLICT;
        this.conflictDetail = detail;
    }

    /** 관리자 취소 — APPROVED·CONFLICT·CONFIRMED 에서(§4.3). CONFIRMED 취소는 학교 측 취소·오확정
     *  정정용 복구 경로다(CANCELLED 전이 시 EXCLUDE 대상에서 자동 이탈). 취소 사유는 이력(history.reason)에만
     *  남긴다 — rejectReason 은 거절 전용 필드라 의미를 오염시키지 않는다. */
    public void cancelByAdmin() {
        if (this.status != BookingStatus.APPROVED && this.status != BookingStatus.CONFLICT
                && this.status != BookingStatus.CONFIRMED) {
            throw new FacilityBookingException.InvalidStatusTransitionException(this.status, BookingStatus.CANCELLED);
        }
        this.status = BookingStatus.CANCELLED;
    }

    /** 반개구간 [start, end) 겹침 — 경계 접촉(끝==시작)은 겹침이 아니다. */
    public boolean overlaps(LocalTime otherStart, LocalTime otherEnd) {
        return this.startTime.isBefore(otherEnd) && this.endTime.isAfter(otherStart);
    }
}
