package com.duing.global.file.entity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.global.file.controller.dto.FilePurpose;
import java.time.Instant;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class UploadedObjectTest {

    private static final Instant UPLOADED_AT = Instant.parse("2026-09-01T00:00:00Z");
    private static final Instant LATER = Instant.parse("2026-09-02T01:00:00Z");

    private UploadedObject pending() {
        return UploadedObject.pending("club/logo/a.jpg", FilePurpose.LOGO, 7L, UPLOADED_AT);
    }

    @Test
    @DisplayName("업로드 직후 객체는 PENDING 이며 활성화·파기 시각이 비어 있다")
    void startsPending() {
        UploadedObject uploadedObject = pending();

        assertThat(uploadedObject.getStatus()).isEqualTo(UploadedObjectStatus.PENDING);
        assertThat(uploadedObject.getStorageKey()).isEqualTo("club/logo/a.jpg");
        assertThat(uploadedObject.getPurpose()).isEqualTo(FilePurpose.LOGO);
        assertThat(uploadedObject.getUploaderId()).isEqualTo(7L);
        assertThat(uploadedObject.getUploadedAt()).isEqualTo(UPLOADED_AT);
        assertThat(uploadedObject.getActivatedAt()).isNull();
        assertThat(uploadedObject.getPurgedAt()).isNull();
    }

    @Test
    @DisplayName("PENDING 객체를 연결(activate)하면 ACTIVE 가 되고 활성화 시각이 기록된다")
    void activatesFromPending() {
        UploadedObject uploadedObject = pending();

        uploadedObject.activate(LATER);

        assertThat(uploadedObject.getStatus()).isEqualTo(UploadedObjectStatus.ACTIVE);
        assertThat(uploadedObject.getActivatedAt()).isEqualTo(LATER);
    }

    @Test
    @DisplayName("연결(activate)은 PENDING 에서만 허용되며 PURGING 객체를 되살리지 못한다 (TOCTOU 계약)")
    void activateRejectsNonPending() {
        UploadedObject purging = pending();
        purging.markPurging();

        assertThatThrownBy(() -> purging.activate(LATER)).isInstanceOf(IllegalStateException.class);
        assertThat(purging.getStatus()).isEqualTo(UploadedObjectStatus.PURGING);
    }

    @Test
    @DisplayName("안전망 치유(restoreActive)는 PENDING·PURGING 에서 ACTIVE 로 전이하고 PURGED 는 거부한다")
    void restoreActiveFromPendingOrPurging() {
        UploadedObject fromPending = pending();
        fromPending.restoreActive(LATER);
        assertThat(fromPending.getStatus()).isEqualTo(UploadedObjectStatus.ACTIVE);
        assertThat(fromPending.getActivatedAt()).isEqualTo(LATER);

        UploadedObject fromPurging = pending();
        fromPurging.markPurging();
        fromPurging.restoreActive(LATER);
        assertThat(fromPurging.getStatus()).isEqualTo(UploadedObjectStatus.ACTIVE);

        UploadedObject purged = pending();
        purged.markPurging();
        purged.markPurged(LATER);
        assertThatThrownBy(() -> purged.restoreActive(LATER)).isInstanceOf(IllegalStateException.class);
    }

    @Test
    @DisplayName("claim(markPurging)은 PENDING·PURGING 에서 허용되고(재시도 멱등) ACTIVE 는 거부한다")
    void markPurgingFromPendingOrPurging() {
        UploadedObject uploadedObject = pending();
        uploadedObject.markPurging();
        uploadedObject.markPurging();
        assertThat(uploadedObject.getStatus()).isEqualTo(UploadedObjectStatus.PURGING);

        UploadedObject active = pending();
        active.activate(LATER);
        assertThatThrownBy(active::markPurging).isInstanceOf(IllegalStateException.class);
    }

    @Test
    @DisplayName("삭제 확정(markPurged)은 PURGING 에서만 허용되고 파기 시각을 기록한다")
    void markPurgedOnlyFromPurging() {
        UploadedObject uploadedObject = pending();
        assertThatThrownBy(() -> uploadedObject.markPurged(LATER)).isInstanceOf(IllegalStateException.class);

        uploadedObject.markPurging();
        uploadedObject.markPurged(LATER);

        assertThat(uploadedObject.getStatus()).isEqualTo(UploadedObjectStatus.PURGED);
        assertThat(uploadedObject.getPurgedAt()).isEqualTo(LATER);
    }
}
