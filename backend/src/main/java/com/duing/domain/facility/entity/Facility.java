package com.duing.domain.facility.entity;

import com.duing.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import java.util.Objects;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@Entity
@Table(name = "facility")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Facility extends BaseEntity {

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
                .roomName(roomName)
                .location(location)
                .sortOrder(sortOrder)
                .build();
    }

    /** 학교 목록 기준 이름/위치/순서를 갱신한다. 변경이 있으면 true 를 반환한다(reconcile 로그용). */
    public boolean updateDetails(String newRoomName, String newLocation, Integer newSortOrder) {
        boolean changed = !Objects.equals(this.roomName, newRoomName)
                || !Objects.equals(this.location, newLocation)
                || !Objects.equals(this.sortOrder, newSortOrder);
        this.roomName = newRoomName;
        this.location = newLocation;
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

    public boolean isArchived() {
        return this.archivedAt != null;
    }
}
