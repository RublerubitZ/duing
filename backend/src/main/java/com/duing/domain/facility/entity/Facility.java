package com.duing.domain.facility.entity;

import com.duing.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Objects;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.DynamicUpdate;

// 더티 플러시가 변경 컬럼만 UPDATE 하게 한다. 학교 목록 동기화(이름·위치·순서·아카이브)와 총동연 오픈일 변경이
// 서로 다른 컬럼을 쓰는 두 트랜잭션이라, 전 컬럼 UPDATE 면 늦게 커밋한 쪽이 상대 컬럼을 옛 스냅샷으로 되돌린다
// (User 의 GeneralUserService.updateProfile 주석이 지적한 결함). 같은 컬럼을 두 관리자가 동시에 쓰는 경우는 last-writer-wins 허용.
// BaseEntity 의 @LastModifiedDate 는 AuditingEntityListener 가 @PreUpdate 에서 더티로 만들어 UPDATE 에 포함된다.
@Getter
@Entity
@DynamicUpdate
@Table(name = "facility")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Facility extends BaseEntity {

    private static final int MAX_ROOM_NAME_LENGTH = 100;
    private static final int MAX_LOCATION_LENGTH = 100;

    @Column(name = "room_seq", nullable = false, unique = true)
    private Integer roomSeq;

    @Column(name = "room_name", nullable = false, length = 100)
    private String roomName;

    @Column(name = "location", length = 100)
    private String location;

    @Column(name = "sort_order", nullable = false)
    private Integer sortOrder;

    @Column(name = "archived_at")
    private LocalDateTime archivedAt;

    /** 총동연이 정한 예약 오픈일. NULL = 아직 열지 않음(닫힘). 신청 창 계산은 BookingOpenDatePolicy. */
    @Column(name = "booking_open_date")
    private LocalDate bookingOpenDate;

    /** 총동연이 정한 예약 마감일. NULL = 상한 없음(익월 말일). 오픈일과 함께 BookingOpenDatePolicy 가 창을 계산한다. */
    @Column(name = "booking_close_date")
    private LocalDate bookingCloseDate;

    @Builder(access = AccessLevel.PRIVATE)
    private Facility(Integer roomSeq, String roomName, String location, Integer sortOrder) {
        this.roomSeq = roomSeq;
        this.roomName = roomName;
        this.location = location;
        this.sortOrder = sortOrder;
    }

    public static Facility create(Integer roomSeq, String roomName, String location, Integer sortOrder) {
        return Facility.builder()
                .roomSeq(roomSeq)
                .roomName(truncate(roomName, MAX_ROOM_NAME_LENGTH))
                .location(truncate(location, MAX_LOCATION_LENGTH))
                .sortOrder(sortOrder)
                .build();
    }

    /** 학교 목록 기준 이름/위치/순서를 갱신한다. 변경이 있으면 true 를 반환한다(reconcile 로그용). */
    public boolean updateDetails(String newRoomName, String newLocation, Integer newSortOrder) {
        String truncatedRoomName = truncate(newRoomName, MAX_ROOM_NAME_LENGTH);
        String truncatedLocation = truncate(newLocation, MAX_LOCATION_LENGTH);
        boolean changed = !Objects.equals(this.roomName, truncatedRoomName)
                || !Objects.equals(this.location, truncatedLocation)
                || !Objects.equals(this.sortOrder, newSortOrder);
        this.roomName = truncatedRoomName;
        this.location = truncatedLocation;
        this.sortOrder = newSortOrder;
        return changed;
    }

    /** 학교 목록에서 사라진 시설을 아카이브한다(하드삭제 금지). */
    public void archive(LocalDateTime now) {
        this.archivedAt = now;
    }

    /** 학교 목록에 재등장한 시설의 아카이브를 해제한다. */
    public void restore() {
        this.archivedAt = null;
    }

    /** updateDetails(학교 동기화)는 이 값을 건드리지 않는다 — 운영자 설정 보존. null = 닫기. */
    public void changeBookingOpenDate(LocalDate newBookingOpenDate) {
        this.bookingOpenDate = newBookingOpenDate;
    }

    /** updateDetails(학교 동기화)는 이 값을 건드리지 않는다. null = 상한 해제. */
    public void changeBookingCloseDate(LocalDate newBookingCloseDate) {
        this.bookingCloseDate = newBookingCloseDate;
    }

    public boolean isArchived() {
        return this.archivedAt != null;
    }

    /** 학교가 내려준 긴 값의 컬럼 길이 초과가 시설 동기화 트랜잭션을 롤백시키지 않게 절단한다(서로게이트 쌍 보존). */
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
