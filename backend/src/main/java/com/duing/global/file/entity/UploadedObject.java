package com.duing.global.file.entity;

import com.duing.global.file.FilePurpose;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 업로드 객체 추적 행 (#791, 스펙 §2). {@code POST /api/v1/files} 가 저장한 객체 1개당 1행이며
 * 엔티티 연결(activate) 또는 파기(markPurging → markPurged)로만 상태가 바뀐다.
 *
 * <p>전이 메서드는 전제조건별로 분리돼 있다(스펙 §2.1) — attach 활성화 {@link #activate} 는 PENDING·RELEASED 에서만
 * 성공해야 파기 잡이 claim 한 객체를 되살리지 못한다(TOCTOU 계약). 안전망 치유 {@link #restoreActive} 만
 * PURGING 을 되돌릴 수 있다. {@link #release} 는 ACTIVE 에서만 — 교체·삭제로 참조를 놓은 객체를 파기 후보로 내린다(#1153).
 * 허용되지 않는 상태에서의 호출은 프로그래밍 오류이므로 {@link IllegalStateException}.
 *
 * <p>append + 상태 갱신만 있는 추적 로그라 {@code BaseEntity}(soft-delete·updated_at)를 상속하지 않는다.
 * 시각은 전부 {@link Instant}(TIMESTAMPTZ) — seoulClock/UTC JVM 사이 wall-clock 혼선을 피한다.
 */
@Getter
@Entity
@Table(name = "uploaded_object")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class UploadedObject {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 스토리지 키({@code FileStorageService#toStorageKey}) — 공개 URL 이 아니다. */
    @Column(name = "storage_key", nullable = false, length = 500)
    private String storageKey;

    @Enumerated(EnumType.STRING)
    @Column(name = "purpose", nullable = false, length = 40)
    private FilePurpose purpose;

    /** FK 없는 id 슬롯 — 남용 계정 추적용. */
    @Column(name = "uploader_id", nullable = false)
    private Long uploaderId;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private UploadedObjectStatus status;

    @Column(name = "uploaded_at", nullable = false)
    private Instant uploadedAt;

    @Column(name = "activated_at")
    private Instant activatedAt;

    @Column(name = "purged_at")
    private Instant purgedAt;

    /** 교체·비우기·삭제로 해제된 시각(#1153) — RELEASED 후보의 유예 기준. 다시 연결되면 비운다. */
    @Column(name = "released_at")
    private Instant releasedAt;

    private UploadedObject(String storageKey, FilePurpose purpose, Long uploaderId, Instant uploadedAt) {
        this.storageKey = storageKey;
        this.purpose = purpose;
        this.uploaderId = uploaderId;
        this.status = UploadedObjectStatus.PENDING;
        this.uploadedAt = uploadedAt;
    }

    public static UploadedObject pending(String storageKey, FilePurpose purpose, Long uploaderId, Instant uploadedAt) {
        return new UploadedObject(storageKey, purpose, uploaderId, uploadedAt);
    }

    /** attach 활성화 — PENDING·RELEASED 에서만. 호출자({@code UploadedObjectService})가 그 외 상태를 먼저 판정한다. */
    public void activate(Instant now) {
        requireStatus("activate", UploadedObjectStatus.PENDING, UploadedObjectStatus.RELEASED);
        this.status = UploadedObjectStatus.ACTIVE;
        this.activatedAt = now;
        this.releasedAt = null;
    }

    /** 파기 잡의 참조 안전망 치유 전용 — PENDING·PURGING·RELEASED 에서 ACTIVE 로. attach 경로에서 쓰지 않는다. */
    public void restoreActive(Instant now) {
        requireStatus("restoreActive",
                UploadedObjectStatus.PENDING, UploadedObjectStatus.PURGING, UploadedObjectStatus.RELEASED);
        this.status = UploadedObjectStatus.ACTIVE;
        this.activatedAt = now;
        this.releasedAt = null;
    }

    /** 교체·비우기·삭제로 참조를 놓음(#1153) — ACTIVE 에서만. 그 외 상태는 호출자가 no-op 으로 거른다. */
    public void release(Instant now) {
        requireStatus("release", UploadedObjectStatus.ACTIVE);
        this.status = UploadedObjectStatus.RELEASED;
        this.releasedAt = now;
    }

    /** 파기 잡 claim — PENDING·PURGING·RELEASED 에서. PURGING→PURGING 은 삭제 미확정 재시도(멱등). */
    public void markPurging() {
        requireStatus("markPurging",
                UploadedObjectStatus.PENDING, UploadedObjectStatus.PURGING, UploadedObjectStatus.RELEASED);
        this.status = UploadedObjectStatus.PURGING;
    }

    /** 스토리지 삭제 확정 후 — PURGING 에서만. 행은 보존한다(스펙 §2.1). */
    public void markPurged(Instant now) {
        requireStatus("markPurged", UploadedObjectStatus.PURGING);
        this.status = UploadedObjectStatus.PURGED;
        this.purgedAt = now;
    }

    /** 파기 후보 상태(PENDING·PURGING·RELEASED)인지 — 잡의 claim·치유 술어. */
    public boolean isPurgeCandidate() {
        return status == UploadedObjectStatus.PENDING
                || status == UploadedObjectStatus.PURGING
                || status == UploadedObjectStatus.RELEASED;
    }

    private void requireStatus(String transition, UploadedObjectStatus... allowed) {
        for (UploadedObjectStatus allowedStatus : allowed) {
            if (status == allowedStatus) {
                return;
            }
        }
        throw new IllegalStateException(
                "uploaded_object " + transition + " 불가: 현재 상태 " + status + " (storageKey=" + storageKey + ")");
    }
}
