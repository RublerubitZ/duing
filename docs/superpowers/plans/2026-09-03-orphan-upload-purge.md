# 업로드 고아 객체 정리 배치 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 업로드 API 가 남긴 객체를 추적 테이블로 기록하고, 엔티티 연결 시 ACTIVE 로 전환하며, 24시간 넘게 PENDING 인 객체를 매시 dry-run(1차)/실삭제(2차) 잡으로 정리한다.

**Architecture:** `uploaded_object` 테이블(V120) + 상태 전이 엔티티 + 잠금 조회 기반 `UploadedObjectService`(기록·활성화) 를 `global/file` 에 두고, 9종 purpose 의 7개 도메인 서비스 쓰기 메서드에서 활성화를 호출한다. `UploadPurgeJob` 은 후보(PENDING|PURGING, 24h 경과, 500건)를 참조 스캔 안전망 → claim(잠금+술어) → 스토리지 delete(tx 밖) → PURGED 순으로 처리하고, `delete-enabled=false` 면 후보를 로그로만 남긴다.

**Tech Stack:** Spring Boot 3.4 / Java 21 / Spring Data JPA(PESSIMISTIC_WRITE) / Flyway / Testcontainers PostgreSQL / Mockito(`@MockitoBean`) / RestAssured.

**Spec:** `docs/superpowers/specs/2026-09-03-orphan-upload-purge-design.md` — 스펙의 §번호를 각 태스크에서 인용한다. 구현자는 스펙을 먼저 읽는다.

## Global Constraints

- 브랜치 `feat/791-orphan-upload-purge`(이미 체크아웃됨). **push·PR 생성·머지는 절대 하지 마라** — 컨트롤러가 리뷰 후 수행한다.
- 빌드/테스트는 반드시 `cd /Users/ksy/orca/workspaces/Duing/emperor/backend && ./gradlew …` 로 실행(루트에 gradlew 없음). 파이프 `| tail` 금지 — exit code 를 가린다. 테스트는 Docker 필요(기동 확인됨).
- 커밋 메시지: Conventional Commits + 한국어, `feat(backend): 대상 — 변경점` 명사구. **Co-Authored-By / 🤖 Generated 라인 절대 금지.**
- Flyway: 기존 파일 수정 금지. 새 파일 `V120__create_uploaded_object.sql` 만 추가. 컬럼 삭제·제약 강화 없음.
- 변수명 축약 금지(`dto`/`r`/`e` 등). 모든 DTO record. 서비스 클래스 `@Transactional(readOnly = true)` 기본은 기존 서비스에만 해당 — 새 `UploadedObjectService` 는 쓰기 전용이라 클래스 레벨 `@Transactional`.
- 상수 문자열: 만료 예외 메시지 `"업로드한 이미지가 만료되었습니다. 다시 업로드해주세요."`(400). 크론 `"0 20 * * * *"` zone `Asia/Seoul`. `BATCH_LIMIT = 500`. 설정 프리픽스 `duing.upload.purge`(`enabled`, `delete-enabled`, `window`), env `DUING_UPLOAD_PURGE_ENABLED` / `DUING_UPLOAD_PURGE_DELETE_ENABLED` / `DUING_UPLOAD_PURGE_WINDOW`.
- 잠금 조회 규약: `UploadedObject` 는 서비스·잡 안에서 **잠금 조회가 유일한 첫 조회**. 벌크 JPQL UPDATE 금지(§3.2-3).
- 새 필드는 각 도메인 서비스의 **마지막 `private final` 필드**로 추가한다 — `@RequiredArgsConstructor` 생성자 인자 순서가 바뀌면 수동 `new` 하는 단위 테스트가 깨진다(Task 4·5·6 에 해당 테스트 수정 포함).
- 테스트 표시명은 요구사항 문장(`@DisplayName`), 메서드명 금지. 통합 테스트는 `@Import(TestcontainersConfiguration.class) @SpringBootTest` + `IntegrationTestBase`(TRUNCATE) 또는 `@Transactional` 롤백.
- 파일 끝 개행 필수.

---

## File Structure

| 경로 | 책임 |
|---|---|
| `backend/src/main/resources/db/migration/V120__create_uploaded_object.sql` | 추적 테이블·인덱스·RLS |
| `backend/src/main/java/com/duing/global/file/entity/UploadedObjectStatus.java` | PENDING/ACTIVE/PURGING/PURGED |
| `backend/src/main/java/com/duing/global/file/entity/UploadedObject.java` | 엔티티 + 전제조건별 전이 메서드 4개 |
| `backend/src/main/java/com/duing/global/file/repository/UploadedObjectRepository.java` | 잠금 조회 2·후보 조회·참조 스캔 native |
| `backend/src/main/java/com/duing/global/file/UploadedObjectService.java` | recordUpload / activate / activateReferencedIn |
| `backend/src/main/java/com/duing/global/file/exception/FileException.java` | `UploadExpiredException` 추가 |
| `backend/src/main/java/com/duing/global/file/controller/FileController.java` | 업로드 성공 후 기록 |
| `backend/src/main/java/com/duing/global/file/controller/dto/FilePurpose.java` | 활성화 지점·참조 스캔 유지 규칙 javadoc |
| 도메인 서비스 7개(Task 4~7) | 활성화 호출 |
| `backend/src/main/java/com/duing/global/file/purge/UploadPurgeProperties.java` · `UploadPurgePropertiesConfig.java` · `UploadPurgeJobConfig.java` · `UploadPurgeJob.java` | 잡 + 설정 3분리 |
| `backend/src/main/resources/application.yml` · `application-prod.yml` · `backend/src/test/resources/application.yml` | 플래그 |
| 테스트 8개(각 태스크) | 아래 |

---

### Task 1: 마이그레이션 + 엔티티 + 리포지토리

**Files:**
- Create: `backend/src/main/resources/db/migration/V120__create_uploaded_object.sql`
- Create: `backend/src/main/java/com/duing/global/file/entity/UploadedObjectStatus.java`
- Create: `backend/src/main/java/com/duing/global/file/entity/UploadedObject.java`
- Create: `backend/src/main/java/com/duing/global/file/repository/UploadedObjectRepository.java`
- Test: `backend/src/test/java/com/duing/global/file/entity/UploadedObjectTest.java`
- Test: `backend/src/test/java/com/duing/global/file/repository/UploadedObjectRepositoryTest.java`

**Interfaces:**
- Produces: `UploadedObject.pending(String storageKey, FilePurpose purpose, Long uploaderId, Instant uploadedAt)`, `activate(Instant)`, `restoreActive(Instant)`, `markPurging()`, `markPurged(Instant)`, getters `getId/getStorageKey/getPurpose/getUploaderId/getStatus/getUploadedAt/getActivatedAt/getPurgedAt`.
- Produces: `UploadedObjectRepository.findByStorageKey`, `findByStorageKeyForUpdate`, `findByIdForUpdate`, `findPurgeCandidates(Collection<UploadedObjectStatus>, Instant cutoff, Pageable)`, `isReferenced(String storageKey)`.

- [ ] **Step 1: 마이그레이션 작성**

```sql
-- 업로드 객체 추적 테이블 (#791). POST /api/v1/files 가 저장한 객체를 PENDING 으로 기록하고, 엔티티에 연결되는
-- 순간 ACTIVE 로 바꾼다. 24시간 넘게 PENDING 인 객체는 UploadPurgeJob 이 스토리지에서 지운다(PURGING → PURGED).
--
-- storage_key: 공개 URL 이 아닌 스토리지 키({purpose 디렉터리}/{UUID}.{ext}) — publicBaseUrl 이 바뀌어도 추적이 유지된다.
-- uploader_id: FK 없는 id 슬롯(club_view_event 전례) — 남용 계정 추적용. users 는 물리 삭제되지 않는다.
-- 시각 3종은 TIMESTAMPTZ + 엔티티 Instant — prod JVM(UTC)·seoulClock 사이 wall-clock 혼선을 원천 차단한다.
-- PURGED 행은 지우지 않는다 — 행이 있어야 늦은 연결 시도를 "만료된 업로드" 400 으로 구분해 거부할 수 있다
-- (행이 없으면 추적 이전 레거시 객체와 구분이 안 돼 존재하지 않는 URL 이 조용히 저장된다).
CREATE TABLE IF NOT EXISTS uploaded_object (
    id           BIGSERIAL PRIMARY KEY,
    storage_key  VARCHAR(500) NOT NULL,
    purpose      VARCHAR(40)  NOT NULL,
    uploader_id  BIGINT       NOT NULL,
    status       VARCHAR(20)  NOT NULL,
    uploaded_at  TIMESTAMP WITH TIME ZONE NOT NULL,
    activated_at TIMESTAMP WITH TIME ZONE,
    purged_at    TIMESTAMP WITH TIME ZONE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_uploaded_object_storage_key ON uploaded_object (storage_key);
-- 파기 후보 스캔(status IN (PENDING, PURGING) AND uploaded_at < cutoff ORDER BY id) 전용.
CREATE INDEX IF NOT EXISTS idx_uploaded_object_status_uploaded_at ON uploaded_object (status, uploaded_at);

-- 앱은 세션 풀러의 단일 롤로 접근하므로 정책 없이 ENABLE 만으로 외부 직접 접근을 차단한다(전 테이블 공통).
ALTER TABLE uploaded_object ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 2: 상태 enum**

```java
package com.duing.global.file.entity;

/**
 * 업로드 객체 추적 상태(스펙 §2.1).
 * <ul>
 *   <li>PENDING — 업로드됐지만 아직 어떤 엔티티에도 연결되지 않음(파기 후보)</li>
 *   <li>ACTIVE — 엔티티에 연결됨(종단)</li>
 *   <li>PURGING — 파기 잡이 claim 함. 스토리지 삭제 미확정 상태로, 다음 실행이 재시도한다</li>
 *   <li>PURGED — 스토리지 삭제 확정(종단). 행은 보존한다</li>
 * </ul>
 */
public enum UploadedObjectStatus {
    PENDING,
    ACTIVE,
    PURGING,
    PURGED
}
```

- [ ] **Step 3: 엔티티 단위 테스트 작성 (RED)**

`backend/src/test/java/com/duing/global/file/entity/UploadedObjectTest.java`:

```java
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
```

- [ ] **Step 4: 테스트 실패 확인**

Run: `cd /Users/ksy/orca/workspaces/Duing/emperor/backend && ./gradlew test --tests "com.duing.global.file.entity.UploadedObjectTest"`
Expected: 컴파일 실패(클래스 없음).

- [ ] **Step 5: 엔티티 구현**

`backend/src/main/java/com/duing/global/file/entity/UploadedObject.java`:

```java
package com.duing.global.file.entity;

import com.duing.global.file.controller.dto.FilePurpose;
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
 * <p>전이 메서드는 전제조건별로 분리돼 있다(스펙 §2.1) — attach 활성화 {@link #activate} 는 PENDING 에서만
 * 성공해야 파기 잡이 claim 한 객체를 되살리지 못한다(TOCTOU 계약). 안전망 치유 {@link #restoreActive} 만
 * PURGING 을 되돌릴 수 있다. 허용되지 않는 상태에서의 호출은 프로그래밍 오류이므로 {@link IllegalStateException}.
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

    /** attach 활성화 — PENDING 에서만. 호출자({@code UploadedObjectService})가 그 외 상태를 먼저 판정한다. */
    public void activate(Instant now) {
        requireStatus("activate", UploadedObjectStatus.PENDING);
        this.status = UploadedObjectStatus.ACTIVE;
        this.activatedAt = now;
    }

    /** 파기 잡의 참조 안전망 치유 전용 — PENDING·PURGING 에서 ACTIVE 로. attach 경로에서 쓰지 않는다. */
    public void restoreActive(Instant now) {
        requireStatus("restoreActive", UploadedObjectStatus.PENDING, UploadedObjectStatus.PURGING);
        this.status = UploadedObjectStatus.ACTIVE;
        this.activatedAt = now;
    }

    /** 파기 잡 claim — PENDING·PURGING 에서. PURGING→PURGING 은 삭제 미확정 재시도(멱등). */
    public void markPurging() {
        requireStatus("markPurging", UploadedObjectStatus.PENDING, UploadedObjectStatus.PURGING);
        this.status = UploadedObjectStatus.PURGING;
    }

    /** 스토리지 삭제 확정 후 — PURGING 에서만. 행은 보존한다(스펙 §2.1). */
    public void markPurged(Instant now) {
        requireStatus("markPurged", UploadedObjectStatus.PURGING);
        this.status = UploadedObjectStatus.PURGED;
        this.purgedAt = now;
    }

    /** 파기 후보 상태(PENDING·PURGING)인지 — 잡의 claim·치유 술어. */
    public boolean isPurgeCandidate() {
        return status == UploadedObjectStatus.PENDING || status == UploadedObjectStatus.PURGING;
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
```

- [ ] **Step 6: 엔티티 테스트 통과 확인**

Run: `cd /Users/ksy/orca/workspaces/Duing/emperor/backend && ./gradlew test --tests "com.duing.global.file.entity.UploadedObjectTest"`
Expected: BUILD SUCCESSFUL, 6 tests PASS.

- [ ] **Step 7: 리포지토리 통합 테스트 작성 (RED)**

`backend/src/test/java/com/duing/global/file/repository/UploadedObjectRepositoryTest.java`:

```java
package com.duing.global.file.repository;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.photo.entity.ClubPhoto;
import com.duing.domain.club.photo.repository.ClubPhotoRepository;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.federation.entity.FederationInquiry;
import com.duing.domain.federation.entity.FederationInquiryAttachment;
import com.duing.domain.federation.repository.FederationInquiryAttachmentRepository;
import com.duing.domain.federation.repository.FederationInquiryRepository;
import com.duing.domain.notice.entity.Notice;
import com.duing.domain.notice.entity.NoticeCategory;
import com.duing.domain.notice.entity.NoticeContentFormat;
import com.duing.domain.notice.entity.NoticeVisibility;
import com.duing.domain.notice.repository.NoticeRepository;
import com.duing.global.file.controller.dto.FilePurpose;
import com.duing.global.file.entity.UploadedObject;
import com.duing.global.file.entity.UploadedObjectStatus;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.PageRequest;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
class UploadedObjectRepositoryTest extends IntegrationTestBase {

    @Autowired UploadedObjectRepository uploadedObjectRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubPhotoRepository clubPhotoRepository;
    @Autowired NoticeRepository noticeRepository;
    @Autowired FederationInquiryRepository federationInquiryRepository;
    @Autowired FederationInquiryAttachmentRepository federationInquiryAttachmentRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());
    private final Instant now = Instant.now();

    private UploadedObject save(String storageKey, UploadedObjectStatus status, Instant uploadedAt) {
        UploadedObject uploadedObject = UploadedObject.pending(storageKey, FilePurpose.LOGO, 1L, uploadedAt);
        if (status == UploadedObjectStatus.ACTIVE) uploadedObject.activate(uploadedAt);
        if (status == UploadedObjectStatus.PURGING) uploadedObject.markPurging();
        if (status == UploadedObjectStatus.PURGED) { uploadedObject.markPurging(); uploadedObject.markPurged(uploadedAt); }
        return uploadedObjectRepository.save(uploadedObject);
    }

    private String uniqueKey(String directory) {
        return directory + "/" + sequence.incrementAndGet() + ".jpg";
    }

    @Test
    @DisplayName("파기 후보 조회는 cutoff 이전에 업로드된 PENDING·PURGING 만 id 오름차순으로, 요청한 상한까지 돌려준다")
    void findsPurgeCandidatesByStatusCutoffOrderAndLimit() {
        Instant old = now.minus(25, ChronoUnit.HOURS);
        Instant recent = now.minus(1, ChronoUnit.HOURS);
        UploadedObject oldPending = save(uniqueKey("club/logo"), UploadedObjectStatus.PENDING, old);
        UploadedObject oldPurging = save(uniqueKey("club/logo"), UploadedObjectStatus.PURGING, old);
        save(uniqueKey("club/logo"), UploadedObjectStatus.ACTIVE, old);
        save(uniqueKey("club/logo"), UploadedObjectStatus.PURGED, old);
        save(uniqueKey("club/logo"), UploadedObjectStatus.PENDING, recent);
        UploadedObject thirdOld = save(uniqueKey("club/logo"), UploadedObjectStatus.PENDING, old);

        Instant cutoff = now.minus(24, ChronoUnit.HOURS);
        List<UploadedObject> all = uploadedObjectRepository.findPurgeCandidates(
                List.of(UploadedObjectStatus.PENDING, UploadedObjectStatus.PURGING), cutoff, PageRequest.of(0, 500));
        List<UploadedObject> limited = uploadedObjectRepository.findPurgeCandidates(
                List.of(UploadedObjectStatus.PENDING, UploadedObjectStatus.PURGING), cutoff, PageRequest.of(0, 2));

        assertThat(all).extracting(UploadedObject::getId)
                .containsExactly(oldPending.getId(), oldPurging.getId(), thirdOld.getId());
        assertThat(limited).extracting(UploadedObject::getId)
                .containsExactly(oldPending.getId(), oldPurging.getId());
    }

    @Test
    @DisplayName("참조 스캔은 동아리 로고·커버 URL 이 키로 끝나면 참조 있음으로 판정한다")
    void detectsClubLogoAndCoverReference() {
        String logoKey = uniqueKey("club/logo");
        String coverKey = uniqueKey("club/cover");
        Club club = Club.create("참조클럽-" + sequence.incrementAndGet(), ClubCategory.ACADEMIC, null, "설명",
                "https://files.example.com/" + logoKey);
        club.update(new Club.UpdatePayload(null, null, null, null, null, "https://files.example.com/" + coverKey,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null));
        clubRepository.save(club);

        assertThat(uploadedObjectRepository.isReferenced(logoKey)).isTrue();
        assertThat(uploadedObjectRepository.isReferenced(coverKey)).isTrue();
        assertThat(uploadedObjectRepository.isReferenced(uniqueKey("club/logo"))).isFalse();
    }

    @Test
    @DisplayName("참조 스캔은 동아리 사진의 storage_key(URL 또는 키)와 공지 본문 안의 URL 을 잡는다")
    void detectsClubPhotoAndNoticeBodyReference() {
        Club club = clubRepository.save(Club.create("사진클럽-" + sequence.incrementAndGet(), ClubCategory.ACADEMIC, null, "설명", null));
        String photoUrlKey = uniqueKey("club/photo");
        String photoRawKey = uniqueKey("club/photo");
        clubPhotoRepository.save(ClubPhoto.create(club, "/files/stub/" + photoUrlKey, null, null, null, 0));
        clubPhotoRepository.save(ClubPhoto.create(club, photoRawKey, null, null, null, 1));

        String bodyKey = uniqueKey("notice/body");
        noticeRepository.save(Notice.create("제목", "요약",
                "<p>본문</p><img src=\"/files/stub/" + bodyKey + "\" alt=\"\"><p>끝</p>",
                "", null, NoticeCategory.GENERAL, List.of(), NoticeVisibility.PUBLIC, null,
                false, null, false, null, null, null, null, null, NoticeContentFormat.HTML, 1L));

        assertThat(uploadedObjectRepository.isReferenced(photoUrlKey)).isTrue();
        assertThat(uploadedObjectRepository.isReferenced(photoRawKey)).isTrue();
        assertThat(uploadedObjectRepository.isReferenced(bodyKey)).isTrue();
    }

    @Test
    @DisplayName("참조 스캔은 문의 첨부의 storage_key 정확 일치를 잡는다")
    void detectsFederationInquiryAttachmentReference() {
        FederationInquiry inquiry = federationInquiryRepository.save(FederationInquiry.create(1L, "제목", "내용"));
        String attachmentKey = uniqueKey("federation/inquiry");
        federationInquiryAttachmentRepository.save(FederationInquiryAttachment.create(
                inquiry, attachmentKey, "첨부 이미지 1", "image/jpeg", 1024L, 0));

        assertThat(uploadedObjectRepository.isReferenced(attachmentKey)).isTrue();
    }
}
```

- [ ] **Step 8: 테스트 실패 확인**

Run: `cd /Users/ksy/orca/workspaces/Duing/emperor/backend && ./gradlew test --tests "com.duing.global.file.repository.UploadedObjectRepositoryTest"`
Expected: 컴파일 실패(리포지토리 없음).

- [ ] **Step 9: 리포지토리 구현**

`backend/src/main/java/com/duing/global/file/repository/UploadedObjectRepository.java`:

```java
package com.duing.global.file.repository;

import com.duing.global.file.entity.UploadedObject;
import com.duing.global.file.entity.UploadedObjectStatus;
import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * 업로드 객체 추적 리포지토리. 상태를 바꾸는 경로는 전부 잠금 조회({@code …ForUpdate}) + 엔티티 전이 메서드다 —
 * 벌크 JPQL UPDATE 를 두지 않는다(호출 도메인 tx 의 영속성 컨텍스트를 clear 하거나 stale 하게 만든다, 스펙 §3.2).
 * 잠금 조회는 그 tx 안에서 이 엔티티의 유일한 첫 조회여야 한다(무잠금 선조회가 1차 캐시를 오염시키면
 * 잠금이 낡은 스냅샷을 돌려준다).
 */
public interface UploadedObjectRepository extends JpaRepository<UploadedObject, Long> {

    /** 무잠금 조회 — 테스트·검증 전용. 상태 전이 경로에서는 쓰지 않는다. */
    Optional<UploadedObject> findByStorageKey(String storageKey);

    /** attach 활성화용 잠금 조회 — 도메인 tx 커밋까지 행을 잠가 파기 잡의 claim 을 대기시킨다. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT uploadedObject FROM UploadedObject uploadedObject WHERE uploadedObject.storageKey = :storageKey")
    Optional<UploadedObject> findByStorageKeyForUpdate(@Param("storageKey") String storageKey);

    /** 파기 잡 claim·확정용 잠금 조회 — 짧은 tx 안에서 상태 술어를 재평가한다. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT uploadedObject FROM UploadedObject uploadedObject WHERE uploadedObject.id = :id")
    Optional<UploadedObject> findByIdForUpdate(@Param("id") Long id);

    /**
     * 파기 후보 — 주어진 상태(PENDING·PURGING)이면서 cutoff 이전에 업로드된 행을 id 오름차순으로.
     * ORDER BY id 로 처리 순서를 결정화해 "개별 실패 후 다음 후보 계속 처리" 계약을 테스트 가능하게 한다.
     */
    @Query("SELECT uploadedObject FROM UploadedObject uploadedObject "
            + "WHERE uploadedObject.status IN :statuses AND uploadedObject.uploadedAt < :cutoff "
            + "ORDER BY uploadedObject.id ASC")
    List<UploadedObject> findPurgeCandidates(@Param("statuses") Collection<UploadedObjectStatus> statuses,
                                             @Param("cutoff") Instant cutoff,
                                             Pageable pageable);

    /**
     * 참조 스캔 안전망(스펙 §4.3) — 스토리지 키가 어떤 엔티티에서든 아직 쓰이고 있으면 true.
     * 활성화 지점 누락을 데이터 손실 대신 WARN 으로 바꾸는 장치이므로 {@code FilePurpose} 에 purpose 가
     * 추가되면 이 문장에도 저장 위치를 추가해야 한다.
     *
     * <p>URL 컬럼은 접미 일치({@code LIKE '%/' || key}) — publicBaseUrl 이 무엇이든 맞춘다. 키는
     * {@code {dir}/{UUID}.{ext}} 형식이라 {@code %}·{@code _} 가 없어 LIKE 이스케이프가 필요 없다.
     * club_photo.storage_key 는 실제로 URL 이 저장되지만(프론트가 응답 url 을 그대로 보냄) 키만 저장된
     * 과거 행도 있을 수 있어 둘 다 본다. soft-delete 된 행도 참조로 센다(보수적).
     * ponytail: 후보(≤500/시)에 대해서만 실행되는 접미 LIKE seq scan — 후보가 상한을 상시 채우면 전용 참조 테이블로.
     */
    @Query(value = """
            SELECT EXISTS (SELECT 1 FROM club WHERE logo_url LIKE '%/' || :key OR cover_url LIKE '%/' || :key)
                OR EXISTS (SELECT 1 FROM club_photo WHERE storage_key = :key OR storage_key LIKE '%/' || :key)
                OR EXISTS (SELECT 1 FROM notice WHERE cover_image_url LIKE '%/' || :key OR content LIKE '%/' || :key || '%')
                OR EXISTS (SELECT 1 FROM promotion WHERE banner_image_url LIKE '%/' || :key)
                OR EXISTS (SELECT 1 FROM promotion_request WHERE suggested_banner_image_url LIKE '%/' || :key)
                OR EXISTS (SELECT 1 FROM global_event WHERE cover_image_url LIKE '%/' || :key)
                OR EXISTS (SELECT 1 FROM federation_inquiry_attachment WHERE storage_key = :key)
            """, nativeQuery = true)
    boolean isReferenced(@Param("key") String storageKey);
}
```

- [ ] **Step 10: 테스트 통과 확인**

Run: `cd /Users/ksy/orca/workspaces/Duing/emperor/backend && ./gradlew test --tests "com.duing.global.file.repository.UploadedObjectRepositoryTest" --tests "com.duing.global.file.entity.UploadedObjectTest"`
Expected: BUILD SUCCESSFUL, 10 tests PASS. Flyway 가 V120 을 적용하는 로그 확인.

- [ ] **Step 11: 커밋**

```bash
cd /Users/ksy/orca/workspaces/Duing/emperor && git add backend/src/main/resources/db/migration/V120__create_uploaded_object.sql backend/src/main/java/com/duing/global/file/entity backend/src/main/java/com/duing/global/file/repository backend/src/test/java/com/duing/global/file/entity backend/src/test/java/com/duing/global/file/repository
git commit -m "feat(backend): 업로드 객체 추적 — uploaded_object 테이블(V120)·상태 전이 엔티티·잠금 조회/후보/참조 스캔 리포지토리"
```

---

### Task 2: UploadedObjectService (기록·활성화) + 만료 예외

**Files:**
- Modify: `backend/src/main/java/com/duing/global/file/exception/FileException.java`
- Create: `backend/src/main/java/com/duing/global/file/UploadedObjectService.java`
- Test: `backend/src/test/java/com/duing/global/file/UploadedObjectServiceTest.java`

**Interfaces:**
- Consumes: Task 1 의 엔티티·리포지토리.
- Produces: `UploadedObjectService.recordUpload(String fileUrl, FilePurpose purpose, Long uploaderId)`, `activate(String... fileUrls)`, `activateReferencedIn(String content)`, `FileException.UploadExpiredException`.

- [ ] **Step 1: 예외 추가**

`FileException.java` 의 마지막 inner class 뒤에:

```java
    /** 파기 잡이 이미 claim/삭제한 업로드를 엔티티에 연결하려 할 때(스펙 §3.2·§6). 재업로드가 유일한 복구다. */
    public static class UploadExpiredException extends FileException {
        private static final String MESSAGE = "업로드한 이미지가 만료되었습니다. 다시 업로드해주세요.";
        public UploadExpiredException() {
            super(MESSAGE, HttpStatus.BAD_REQUEST);
        }
    }
```

- [ ] **Step 2: 서비스 테스트 작성 (RED)**

`backend/src/test/java/com/duing/global/file/UploadedObjectServiceTest.java`:

```java
package com.duing.global.file;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.global.file.controller.dto.FilePurpose;
import com.duing.global.file.entity.UploadedObject;
import com.duing.global.file.entity.UploadedObjectStatus;
import com.duing.global.file.exception.FileException;
import com.duing.global.file.repository.UploadedObjectRepository;
import java.time.Instant;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 스토리지는 test 프로파일의 {@code StubFileStorageService}(URL 프리픽스 {@code /files/stub/}) — 실제 I/O 없이
 * {@code toStorageKey} 대칭만 필요하다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class UploadedObjectServiceTest extends IntegrationTestBase {

    private static final String STUB_PREFIX = "/files/stub/";

    @Autowired UploadedObjectService uploadedObjectService;
    @Autowired UploadedObjectRepository uploadedObjectRepository;
    @Autowired PlatformTransactionManager platformTransactionManager;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private String uniqueKey(FilePurpose purpose) {
        return purpose.directory() + "/" + sequence.incrementAndGet() + ".jpg";
    }

    private UploadedObject seed(String storageKey, UploadedObjectStatus status) {
        UploadedObject uploadedObject = UploadedObject.pending(storageKey, FilePurpose.LOGO, 1L, Instant.now());
        if (status == UploadedObjectStatus.ACTIVE) uploadedObject.activate(Instant.now());
        if (status == UploadedObjectStatus.PURGING) uploadedObject.markPurging();
        if (status == UploadedObjectStatus.PURGED) { uploadedObject.markPurging(); uploadedObject.markPurged(Instant.now()); }
        return uploadedObjectRepository.save(uploadedObject);
    }

    private UploadedObjectStatus statusOf(String storageKey) {
        return uploadedObjectRepository.findByStorageKey(storageKey).orElseThrow().getStatus();
    }

    @Test
    @DisplayName("업로드 기록은 응답 URL 을 스토리지 키로 바꿔 purpose·업로더와 함께 PENDING 행을 남긴다")
    void recordsPendingRowWithKeyPurposeAndUploader() {
        String storageKey = uniqueKey(FilePurpose.NOTICE_COVER);

        uploadedObjectService.recordUpload(STUB_PREFIX + storageKey, FilePurpose.NOTICE_COVER, 42L);

        UploadedObject saved = uploadedObjectRepository.findByStorageKey(storageKey).orElseThrow();
        assertThat(saved.getStatus()).isEqualTo(UploadedObjectStatus.PENDING);
        assertThat(saved.getPurpose()).isEqualTo(FilePurpose.NOTICE_COVER);
        assertThat(saved.getUploaderId()).isEqualTo(42L);
        assertThat(saved.getUploadedAt()).isNotNull();
    }

    @Test
    @DisplayName("자기 스토리지 URL 이 아닌 값은 기록하지 않고 조용히 건너뛴다")
    void skipsRecordingForForeignUrl() {
        long before = uploadedObjectRepository.count();

        uploadedObjectService.recordUpload("https://elsewhere.example.com/x.jpg", FilePurpose.LOGO, 1L);

        assertThat(uploadedObjectRepository.count()).isEqualTo(before);
    }

    @Test
    @DisplayName("PENDING 업로드를 연결하면 ACTIVE 가 되고, 이미 ACTIVE 인 업로드의 재연결은 멱등이다")
    void activatesPendingAndIsIdempotentForActive() {
        String storageKey = uniqueKey(FilePurpose.LOGO);
        seed(storageKey, UploadedObjectStatus.PENDING);

        uploadedObjectService.activate(STUB_PREFIX + storageKey);
        assertThat(statusOf(storageKey)).isEqualTo(UploadedObjectStatus.ACTIVE);

        assertThatCode(() -> uploadedObjectService.activate(STUB_PREFIX + storageKey)).doesNotThrowAnyException();
        assertThat(statusOf(storageKey)).isEqualTo(UploadedObjectStatus.ACTIVE);
    }

    @Test
    @DisplayName("추적 행이 없는(레거시) 키·외부 URL·null·빈 문자열은 연결 시 아무 일도 하지 않는다")
    void ignoresUntrackedForeignAndBlankUrls() {
        assertThatCode(() -> uploadedObjectService.activate(
                STUB_PREFIX + uniqueKey(FilePurpose.LOGO),
                "https://elsewhere.example.com/x.jpg",
                null,
                "  ")).doesNotThrowAnyException();
        assertThatCode(() -> uploadedObjectService.activate((String[]) null)).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("파기 잡이 claim(PURGING)했거나 이미 파기(PURGED)한 업로드를 연결하면 만료 400 예외가 난다")
    void rejectsPurgingAndPurgedUploads() {
        String purgingKey = uniqueKey(FilePurpose.LOGO);
        String purgedKey = uniqueKey(FilePurpose.LOGO);
        seed(purgingKey, UploadedObjectStatus.PURGING);
        seed(purgedKey, UploadedObjectStatus.PURGED);

        assertThatThrownBy(() -> uploadedObjectService.activate(STUB_PREFIX + purgingKey))
                .isInstanceOf(FileException.UploadExpiredException.class)
                .hasMessage("업로드한 이미지가 만료되었습니다. 다시 업로드해주세요.");
        assertThatThrownBy(() -> uploadedObjectService.activate(STUB_PREFIX + purgedKey))
                .isInstanceOf(FileException.UploadExpiredException.class);
        assertThat(statusOf(purgingKey)).isEqualTo(UploadedObjectStatus.PURGING);
        assertThat(statusOf(purgedKey)).isEqualTo(UploadedObjectStatus.PURGED);
    }

    @Test
    @DisplayName("본문 활성화는 HTML img·마크다운 이미지·쉼표 뒤 URL·중복 URL 을 모두 잡고 외부 URL 은 무시한다")
    void activatesEveryOwnUrlReferencedInContent() {
        String htmlKey = uniqueKey(FilePurpose.NOTICE_BODY);
        String markdownKey = uniqueKey(FilePurpose.NOTICE_BODY);
        String trailingCommaKey = uniqueKey(FilePurpose.NOTICE_BODY);
        String untouchedKey = uniqueKey(FilePurpose.NOTICE_BODY);
        seed(htmlKey, UploadedObjectStatus.PENDING);
        seed(markdownKey, UploadedObjectStatus.PENDING);
        seed(trailingCommaKey, UploadedObjectStatus.PENDING);
        seed(untouchedKey, UploadedObjectStatus.PENDING);
        String content = "<p>안내</p><img src=\"" + STUB_PREFIX + htmlKey + "\" alt=\"\">"
                + "\n![사진](" + STUB_PREFIX + markdownKey + ")"
                + "\n참고: " + STUB_PREFIX + trailingCommaKey + ", 그리고 " + STUB_PREFIX + htmlKey
                + "\n<img src=\"https://elsewhere.example.com/ext.png\">";

        uploadedObjectService.activateReferencedIn(content);

        assertThat(statusOf(htmlKey)).isEqualTo(UploadedObjectStatus.ACTIVE);
        assertThat(statusOf(markdownKey)).isEqualTo(UploadedObjectStatus.ACTIVE);
        assertThat(statusOf(trailingCommaKey)).isEqualTo(UploadedObjectStatus.ACTIVE);
        assertThat(statusOf(untouchedKey)).isEqualTo(UploadedObjectStatus.PENDING);
    }

    @Test
    @DisplayName("본문이 null 이거나 비어 있으면 본문 활성화는 아무 일도 하지 않는다")
    void ignoresNullOrBlankContent() {
        assertThatCode(() -> uploadedObjectService.activateReferencedIn(null)).doesNotThrowAnyException();
        assertThatCode(() -> uploadedObjectService.activateReferencedIn("   ")).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("연결을 호출한 도메인 트랜잭션이 롤백되면 활성화도 함께 롤백되어 객체는 PENDING 으로 남는다")
    void activationRollsBackWithCallerTransaction() {
        String storageKey = uniqueKey(FilePurpose.LOGO);
        seed(storageKey, UploadedObjectStatus.PENDING);
        TransactionTemplate transactionTemplate = new TransactionTemplate(platformTransactionManager);

        transactionTemplate.executeWithoutResult(status -> {
            uploadedObjectService.activate(STUB_PREFIX + storageKey);
            status.setRollbackOnly();
        });

        assertThat(statusOf(storageKey)).isEqualTo(UploadedObjectStatus.PENDING);
    }
}
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `cd /Users/ksy/orca/workspaces/Duing/emperor/backend && ./gradlew test --tests "com.duing.global.file.UploadedObjectServiceTest"`
Expected: 컴파일 실패(서비스 없음).

- [ ] **Step 4: 서비스 구현**

`backend/src/main/java/com/duing/global/file/UploadedObjectService.java`:

```java
package com.duing.global.file;

import com.duing.global.file.controller.dto.FilePurpose;
import com.duing.global.file.entity.UploadedObject;
import com.duing.global.file.exception.FileException;
import com.duing.global.file.repository.UploadedObjectRepository;
import java.time.Clock;
import java.time.Instant;
import java.util.Optional;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Pattern;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 업로드 객체 추적(#791, 스펙 §3) — 업로드 API 가 남긴 객체를 PENDING 으로 기록하고, 엔티티에 연결되는 순간
 * ACTIVE 로 바꾼다. 도메인 서비스는 쓰기 메서드 안(같은 tx)에서 {@link #activate} 를 부른다.
 *
 * <p>활성화는 {@code findByStorageKeyForUpdate} 잠금 조회로 시작한다 — 도메인 tx 커밋까지 행이 잠겨 파기 잡의
 * claim 이 대기하고, claim 이 먼저 커밋됐다면 PURGING 을 보고 만료 400 으로 실패한다(TOCTOU 계약). 도메인 쓰기가
 * 다른 이유로 롤백되면 활성화도 함께 롤백돼 객체는 정상 파기 대상으로 남는다.
 *
 * <p>추적 행이 없는 키(추적 테이블 도입 이전 레거시 객체)와 자기 스토리지가 아닌 URL 은 조용히 건너뛴다 —
 * 외부 URL 차단은 이 컴포넌트의 책임이 아니다(공지 커버 prefix 검증 등은 도메인에 있다).
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional
public class UploadedObjectService {

    // 본문 토큰 경계 — 공백·따옴표·태그 괄호·소괄호·대괄호·쉼표·세미콜론. 마크다운 문장 끝의 구두점이 URL 에
    // 붙어 키 조회가 빗나가는 것을 막는다(스펙 §3.3).
    private static final Pattern CONTENT_TOKEN_BOUNDARY = Pattern.compile("[\\s\"'<>()\\[\\],;]+");

    private final UploadedObjectRepository uploadedObjectRepository;
    private final FileStorageService fileStorageService;
    private final Clock clock;

    /** 업로드 API 성공 직후 호출 — 응답 URL 을 키로 바꿔 PENDING 행을 남긴다. DB 예외는 전파한다(스펙 §3.1). */
    public void recordUpload(String fileUrl, FilePurpose purpose, Long uploaderId) {
        String storageKey = fileStorageService.toStorageKey(fileUrl);
        if (storageKey == null) {
            // 정상 구현에서는 발생하지 않는다(upload 가 돌려준 URL 은 항상 자기 프리픽스) — 추적만 포기하고 요청은 성공시킨다.
            log.warn("[업로드 추적] 자기 스토리지 URL 이 아니어서 기록을 건너뜀: purpose={}", purpose);
            return;
        }
        uploadedObjectRepository.save(UploadedObject.pending(storageKey, purpose, uploaderId, Instant.now(clock)));
    }

    /**
     * attach 지점 공통 진입 — 각 URL 을 키로 바꿔 PENDING 이면 ACTIVE 로 전이한다.
     * 키를 사전순으로 정렬해 잠근다: 같은 키 집합을 두 tx 가 서로 다른 순서로 잠그는 ABBA 데드락을 없앤다.
     */
    public void activate(String... fileUrls) {
        if (fileUrls == null) {
            return;
        }
        Set<String> storageKeys = new TreeSet<>();
        for (String fileUrl : fileUrls) {
            String storageKey = toStorageKey(fileUrl);
            if (storageKey != null) {
                storageKeys.add(storageKey);
            }
        }
        for (String storageKey : storageKeys) {
            activateKey(storageKey);
        }
    }

    /** 공지 본문(HTML·마크다운 불문)에 등장하는 자기 스토리지 URL 을 전부 활성화한다(스펙 §3.3). */
    public void activateReferencedIn(String content) {
        if (content == null || content.isBlank()) {
            return;
        }
        activate(CONTENT_TOKEN_BOUNDARY.split(content));
    }

    private String toStorageKey(String fileUrl) {
        if (fileUrl == null || fileUrl.isBlank()) {
            return null;
        }
        return fileStorageService.toStorageKey(fileUrl);
    }

    // 잠금 조회가 이 tx 안에서 UploadedObject 의 유일한 첫 조회여야 한다 — 앞에서 무잠금으로 읽으면 잠금이
    // 1차 캐시의 낡은 인스턴스를 돌려줘 PURGING 전환을 못 본다.
    private void activateKey(String storageKey) {
        Optional<UploadedObject> tracked = uploadedObjectRepository.findByStorageKeyForUpdate(storageKey);
        if (tracked.isEmpty()) {
            return; // 추적 이전 레거시 객체 — grandfather
        }
        UploadedObject uploadedObject = tracked.get();
        switch (uploadedObject.getStatus()) {
            case PENDING -> uploadedObject.activate(Instant.now(clock));
            case ACTIVE -> { /* 재수정·재사용 — 멱등 */ }
            case PURGING, PURGED -> throw new FileException.UploadExpiredException();
        }
    }
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd /Users/ksy/orca/workspaces/Duing/emperor/backend && ./gradlew test --tests "com.duing.global.file.UploadedObjectServiceTest"`
Expected: BUILD SUCCESSFUL, 8 tests PASS.

- [ ] **Step 6: 커밋**

```bash
cd /Users/ksy/orca/workspaces/Duing/emperor && git add backend/src/main/java/com/duing/global/file/UploadedObjectService.java backend/src/main/java/com/duing/global/file/exception/FileException.java backend/src/test/java/com/duing/global/file/UploadedObjectServiceTest.java
git commit -m "feat(backend): 업로드 객체 추적 서비스 — 업로드 기록·잠금 조회 활성화·본문 URL 활성화·만료 업로드 400"
```

---

### Task 3: 업로드 API 가 PENDING 행을 기록

**Files:**
- Modify: `backend/src/main/java/com/duing/global/file/controller/FileController.java`
- Modify: `backend/src/main/java/com/duing/global/file/controller/dto/FilePurpose.java`
- Test: `backend/src/test/java/com/duing/domain/file/FileApiTest.java`

**Interfaces:**
- Consumes: `UploadedObjectService.recordUpload`.

- [ ] **Step 1: FileApiTest 에 테스트 추가 (RED)**

`FileApiTest` 에 필드와 테스트 2개를 추가한다(기존 import 블록에 `com.duing.global.file.entity.UploadedObject`, `com.duing.global.file.entity.UploadedObjectStatus`, `com.duing.global.file.repository.UploadedObjectRepository`, `com.duing.global.file.controller.dto.FilePurpose`, `io.restassured.response.Response` 추가):

```java
    @Autowired UploadedObjectRepository uploadedObjectRepository;
    private Long userId; // setUp 에서 user.getId() 를 보관한다 — 기존 setUp 의 `token = …` 앞줄에 `userId = user.getId();` 추가
```

```java
    @Test
    @DisplayName("업로드가 성공하면 응답 URL 의 스토리지 키로 PENDING 추적 행이 purpose·업로더와 함께 남는다")
    void recordsPendingTrackingRowOnSuccessfulUpload() {
        Response response = RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                    .multiPart("file", "tracked.png", pngBytesOfSize(1024), "image/png")
                    .queryParam("purpose", "GLOBAL_EVENT_COVER")
                .when()
                    .post("/api/v1/files");
        response.then().statusCode(HttpStatus.CREATED.value());
        String uploadedUrl = response.jsonPath().getString("data.url");

        String storageKey = uploadedUrl.substring("/files/stub/".length());
        UploadedObject tracked = uploadedObjectRepository.findByStorageKey(storageKey).orElseThrow();
        assertThat(tracked.getStatus()).isEqualTo(UploadedObjectStatus.PENDING);
        assertThat(tracked.getPurpose()).isEqualTo(FilePurpose.GLOBAL_EVENT_COVER);
        assertThat(tracked.getUploaderId()).isEqualTo(userId);
    }

    @Test
    @DisplayName("형식 검증에서 거부된 업로드는 추적 행을 남기지 않는다")
    void leavesNoTrackingRowWhenUploadIsRejected() {
        long before = uploadedObjectRepository.count();

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                    .multiPart("file", "fake.png", bytesOfSize(1024), "image/png")
                    .queryParam("purpose", "LOGO")
                .when()
                    .post("/api/v1/files")
                .then()
                    .statusCode(HttpStatus.BAD_REQUEST.value());

        assertThat(uploadedObjectRepository.count()).isEqualTo(before);
    }
```

`assertThat` 은 `import static org.assertj.core.api.Assertions.assertThat;` 로 추가한다.

- [ ] **Step 2: 실패 확인**

Run: `cd /Users/ksy/orca/workspaces/Duing/emperor/backend && ./gradlew test --tests "com.duing.domain.file.FileApiTest"`
Expected: `recordsPendingTrackingRowOnSuccessfulUpload` FAIL (`NoSuchElementException` — 행 없음).

- [ ] **Step 3: FileController 수정**

필드 추가(마지막):

```java
    private final UploadedObjectService uploadedObjectService;
```

`upload` 메서드에서 `String uploadedUrl = fileStorageService.upload(...)` 바로 다음 줄에:

```java
        // 추적 행 기록(#791) — 스토리지 업로드 성공 후. DB 예외는 전파해 500 으로 드러낸다(객체는 미추적 고아로 남는다).
        uploadedObjectService.recordUpload(uploadedUrl, purpose, currentUser.id());
```

import `com.duing.global.file.UploadedObjectService` 추가.

- [ ] **Step 4: FilePurpose javadoc**

`FilePurpose` enum 선언 위에:

```java
/**
 * 업로드 API 의 용도 — 스토리지 디렉터리를 결정한다.
 *
 * <p><b>유지 규칙(#791)</b>: purpose 를 추가하면 (1) 업로드 URL 을 저장하는 도메인 쓰기 메서드에서
 * {@code UploadedObjectService.activate}(본문이면 {@code activateReferencedIn})를 호출하고,
 * (2) {@code UploadedObjectRepository.isReferenced} 의 참조 스캔에 그 저장 위치를 추가해야 한다.
 * 둘 다 빠지면 24시간 뒤 파기 잡이 실사용 객체를 지운다(참조 스캔이 있으면 WARN 으로 대신 잡힌다).
 */
```

- [ ] **Step 5: 통과 확인**

Run: `cd /Users/ksy/orca/workspaces/Duing/emperor/backend && ./gradlew test --tests "com.duing.domain.file.FileApiTest"`
Expected: BUILD SUCCESSFUL, 전부 PASS.

- [ ] **Step 6: 커밋**

```bash
cd /Users/ksy/orca/workspaces/Duing/emperor && git add backend/src/main/java/com/duing/global/file/controller backend/src/test/java/com/duing/domain/file/FileApiTest.java
git commit -m "feat(backend): 업로드 API — 성공 시 PENDING 추적 행 기록·FilePurpose 유지 규칙 javadoc"
```

---

### Task 4: 동아리 로고·커버·사진 활성화 + 만료 400 HTTP 계약

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/club/service/GeneralClubService.java`
- Modify: `backend/src/main/java/com/duing/domain/club/photo/service/GeneralClubPhotoService.java`
- Modify: `backend/src/test/java/com/duing/domain/club/service/ClubNameRaceGuardTest.java` (수동 생성자 인자 1개 추가)
- Test: `backend/src/test/java/com/duing/domain/club/service/ClubUploadActivationTest.java`

**Interfaces:**
- Consumes: `UploadedObjectService.activate`.

- [ ] **Step 1: 테스트 작성 (RED)**

`backend/src/test/java/com/duing/domain/club/service/ClubUploadActivationTest.java`:

```java
package com.duing.domain.club.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.photo.service.ClubPhotoService;
import com.duing.domain.club.photo.service.dto.command.CreateClubPhotoCommand;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.club.service.dto.command.CreateClubCommand;
import com.duing.domain.club.service.dto.command.UpdateClubCommand;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import com.duing.global.file.controller.dto.FilePurpose;
import com.duing.global.file.entity.UploadedObject;
import com.duing.global.file.entity.UploadedObjectStatus;
import com.duing.global.file.repository.UploadedObjectRepository;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import java.lang.reflect.Field;
import java.time.Instant;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;

/** 동아리 도메인의 업로드 활성화 지점(스펙 §3.4: LOGO·COVER·PHOTO) + 만료 업로드 400 HTTP 계약(§6). */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ClubUploadActivationTest extends IntegrationTestBase {

    private static final String STUB_PREFIX = "/files/stub/";

    @LocalServerPort int port;
    @Autowired ClubService clubService;
    @Autowired ClubPhotoService clubPhotoService;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired UserRepository userRepository;
    @Autowired UploadedObjectRepository uploadedObjectRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @BeforeEach
    void setUpPort() {
        RestAssured.port = port;
    }

    private String seedPending(FilePurpose purpose) {
        String storageKey = purpose.directory() + "/" + sequence.incrementAndGet() + ".jpg";
        uploadedObjectRepository.save(UploadedObject.pending(storageKey, purpose, 1L, Instant.now()));
        return storageKey;
    }

    private String seedPurged(FilePurpose purpose) {
        String storageKey = purpose.directory() + "/" + sequence.incrementAndGet() + ".jpg";
        UploadedObject uploadedObject = UploadedObject.pending(storageKey, purpose, 1L, Instant.now());
        uploadedObject.markPurging();
        uploadedObject.markPurged(Instant.now());
        uploadedObjectRepository.save(uploadedObject);
        return storageKey;
    }

    private UploadedObjectStatus statusOf(String storageKey) {
        return uploadedObjectRepository.findByStorageKey(storageKey).orElseThrow().getStatus();
    }

    private Club saveActiveClub() throws Exception {
        Club club = Club.create("활성화클럽-" + sequence.incrementAndGet(), ClubCategory.ACADEMIC, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(club, ClubStatus.ACTIVE);
        return clubRepository.save(club);
    }

    private UpdateClubCommand updateImages(Long clubId, Long requesterId, String logoUrl, String coverUrl) {
        return new UpdateClubCommand(
                clubId, requesterId,
                null, null, null, null, logoUrl, coverUrl,
                null, null, null,
                null, null, null, null, null, null, null,
                null, null, null, null,
                null, null, null, null, null, null, null);
    }

    @Test
    @DisplayName("총동연이 동아리를 등록하면 로고 업로드가 ACTIVE 가 된다")
    void adminCreateActivatesLogo() {
        User leader = userRepository.save(UserFixture.unique());
        String logoKey = seedPending(FilePurpose.LOGO);

        clubService.create(new CreateClubCommand("등록클럽-" + sequence.incrementAndGet(), ClubCategory.ACADEMIC,
                null, "설명", STUB_PREFIX + logoKey, leader.getId(), false, null, null));

        assertThat(statusOf(logoKey)).isEqualTo(UploadedObjectStatus.ACTIVE);
    }

    @Test
    @DisplayName("운영진이 동아리 정보를 수정하면 로고·커버 업로드가 모두 ACTIVE 가 된다")
    void leaderUpdateActivatesLogoAndCover() throws Exception {
        User leader = userRepository.save(UserFixture.unique());
        Club club = saveActiveClub();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        String logoKey = seedPending(FilePurpose.LOGO);
        String coverKey = seedPending(FilePurpose.COVER);

        clubService.update(updateImages(club.getId(), leader.getId(), STUB_PREFIX + logoKey, STUB_PREFIX + coverKey));

        assertThat(statusOf(logoKey)).isEqualTo(UploadedObjectStatus.ACTIVE);
        assertThat(statusOf(coverKey)).isEqualTo(UploadedObjectStatus.ACTIVE);
    }

    @Test
    @DisplayName("총동연이 동아리 정보를 수정해도 같은 경로로 로고 업로드가 ACTIVE 가 된다")
    void adminUpdateActivatesLogo() throws Exception {
        Club club = saveActiveClub();
        String logoKey = seedPending(FilePurpose.LOGO);

        clubService.updateAsAdmin(updateImages(club.getId(), null, STUB_PREFIX + logoKey, null));

        assertThat(statusOf(logoKey)).isEqualTo(UploadedObjectStatus.ACTIVE);
    }

    @Test
    @DisplayName("활동 사진을 등록하면 사진 업로드가 ACTIVE 가 된다")
    void photoCreateActivatesPhoto() throws Exception {
        User leader = userRepository.save(UserFixture.unique());
        Club club = saveActiveClub();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        String photoKey = seedPending(FilePurpose.PHOTO);

        clubPhotoService.create(new CreateClubPhotoCommand(
                club.getId(), leader.getId(), STUB_PREFIX + photoKey, "캡션", 100, 100));

        assertThat(statusOf(photoKey)).isEqualTo(UploadedObjectStatus.ACTIVE);
    }

    @Test
    @DisplayName("이미 파기된 업로드로 활동 사진을 등록하면 400 과 만료 안내 메시지를 받고 사진은 저장되지 않는다")
    void purgedUploadIsRejectedWithExpiredMessageOverHttp() throws Exception {
        User leader = userRepository.save(UserFixture.unique());
        Club club = saveActiveClub();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        String purgedKey = seedPurged(FilePurpose.PHOTO);
        String token = jwtTokenProvider.createToken(leader.getId(), leader.getRole().name());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .contentType(ContentType.JSON)
                .body("""
                    { "storageKey": "%s", "caption": "만료", "width": 100, "height": 100 }
                    """.formatted(STUB_PREFIX + purgedKey))
            .when()
                .post("/api/v1/clubs/" + club.getId() + "/photos")
            .then()
                .statusCode(HttpStatus.BAD_REQUEST.value())
                .body("message", org.hamcrest.Matchers.equalTo("업로드한 이미지가 만료되었습니다. 다시 업로드해주세요."));

        assertThat(clubPhotoRepository.findByClubId(club.getId())).isEmpty();
        assertThat(statusOf(purgedKey)).isEqualTo(UploadedObjectStatus.PURGED);
    }
}
```

`clubPhotoRepository` 는 `@Autowired ClubPhotoRepository clubPhotoRepository;`(`com.duing.domain.club.photo.repository.ClubPhotoRepository`)로 추가한다. 에러 본문 필드명은 `ApiResponse.message`(확인됨).

- [ ] **Step 2: 실패 확인**

Run: `cd /Users/ksy/orca/workspaces/Duing/emperor/backend && ./gradlew test --tests "com.duing.domain.club.service.ClubUploadActivationTest"`
Expected: 활성화 4건 FAIL(PENDING 그대로), 400 계약 FAIL(201 반환).

- [ ] **Step 3: GeneralClubService 수정**

마지막 필드로 추가:

```java
    // 업로드 객체 추적(#791) — 로고·커버 URL 을 저장하는 쓰기 메서드에서 활성화한다.
    private final UploadedObjectService uploadedObjectService;
```

`create` 에서 `savedClub = clubRepository.save(club); clubRepository.flush();` 를 감싼 try 블록 **뒤**(catch 밖, 리더 멤버십 생성 등 기존 코드 앞)에:

```java
        uploadedObjectService.activate(createClubCommand.logoUrl());
```

`applyProfileUpdate` 에서 `club.update(updateClubCommand.toPayload());` 바로 다음 줄에:

```java
        uploadedObjectService.activate(updateClubCommand.logoUrl(), updateClubCommand.coverUrl());
```

import `com.duing.global.file.UploadedObjectService`.

- [ ] **Step 4: GeneralClubPhotoService 수정**

마지막 필드로 `private final UploadedObjectService uploadedObjectService;` 추가. `create` 에서 `return ClubPhotoQuery.from(clubPhotoRepository.save(photo));` 를

```java
        ClubPhoto savedPhoto = clubPhotoRepository.save(photo);
        // 사진 storageKey 는 프론트가 업로드 응답 url 을 그대로 보낸 값(공개 URL)이다 — 업로드 추적 활성화(#791).
        uploadedObjectService.activate(command.storageKey());
        return ClubPhotoQuery.from(savedPhoto);
```

로 바꾼다. import 추가.

- [ ] **Step 5: ClubNameRaceGuardTest 생성자 인자 추가**

`new GeneralClubService(` 의 마지막 인자 `mock(ApplicationEventPublisher.class)` 뒤에 `, mock(UploadedObjectService.class)` 를 추가하고 `import com.duing.global.file.UploadedObjectService;` 를 추가한다.

- [ ] **Step 6: 통과 확인 (신규 + 회귀)**

Run: `cd /Users/ksy/orca/workspaces/Duing/emperor/backend && ./gradlew test --tests "com.duing.domain.club.service.ClubUploadActivationTest" --tests "com.duing.domain.club.service.ClubNameRaceGuardTest" --tests "com.duing.domain.club.service.ClubUpdateServiceTest" --tests "com.duing.domain.club.photo.service.ClubPhotoCommandServiceTest"`
Expected: BUILD SUCCESSFUL, 전부 PASS.

- [ ] **Step 7: 커밋**

```bash
cd /Users/ksy/orca/workspaces/Duing/emperor && git add backend/src/main/java/com/duing/domain/club backend/src/test/java/com/duing/domain/club
git commit -m "feat(backend): 동아리 로고·커버·사진 — 저장 시 업로드 추적 활성화 + 만료 업로드 400 계약"
```

---

### Task 5: 공지 커버·본문 활성화

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/notice/service/GeneralNoticeService.java`
- Modify: `backend/src/test/java/com/duing/domain/notice/service/NoticeExpiryKstBoundaryTest.java` (수동 생성자 인자 1개 추가)
- Test: `backend/src/test/java/com/duing/domain/notice/service/NoticeUploadActivationTest.java`

- [ ] **Step 1: 테스트 작성 (RED)**

```java
package com.duing.domain.notice.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.notice.entity.NoticeCategory;
import com.duing.domain.notice.entity.NoticeContentFormat;
import com.duing.domain.notice.entity.NoticeVisibility;
import com.duing.domain.notice.service.dto.command.CreateClubNoticeCommand;
import com.duing.domain.notice.service.dto.command.CreateNoticeCommand;
import com.duing.domain.notice.service.dto.command.UpdateClubNoticeCommand;
import com.duing.domain.notice.service.dto.command.UpdateNoticeCommand;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.file.controller.dto.FilePurpose;
import com.duing.global.file.entity.UploadedObject;
import com.duing.global.file.entity.UploadedObjectStatus;
import com.duing.global.file.repository.UploadedObjectRepository;
import java.lang.reflect.Field;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

/** 공지 도메인의 업로드 활성화 지점(스펙 §3.4: NOTICE_COVER·NOTICE_BODY × 관리자/동아리 생성·수정 4경로). */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class NoticeUploadActivationTest extends IntegrationTestBase {

    private static final String STUB_PREFIX = "/files/stub/";

    @Autowired NoticeService noticeService;
    @Autowired ClubRepository clubRepository;
    @Autowired UserRepository userRepository;
    @Autowired UploadedObjectRepository uploadedObjectRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private String seedPending(FilePurpose purpose) {
        String storageKey = purpose.directory() + "/" + sequence.incrementAndGet() + ".jpg";
        uploadedObjectRepository.save(UploadedObject.pending(storageKey, purpose, 1L, Instant.now()));
        return storageKey;
    }

    private UploadedObjectStatus statusOf(String storageKey) {
        return uploadedObjectRepository.findByStorageKey(storageKey).orElseThrow().getStatus();
    }

    private String bodyWith(String storageKey) {
        return "<p>본문</p><img src=\"" + STUB_PREFIX + storageKey + "\" alt=\"\">";
    }

    private Club saveActiveClub() throws Exception {
        Club club = Club.create("공지클럽-" + sequence.incrementAndGet(), ClubCategory.ACADEMIC, null, "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(club, ClubStatus.ACTIVE);
        return clubRepository.save(club);
    }

    private CreateNoticeCommand adminCreate(String coverUrl, String content, Long authorId) {
        return new CreateNoticeCommand("제목", "요약", content, coverUrl, null,
                NoticeCategory.GENERAL, List.of(), NoticeVisibility.PUBLIC, null, List.of(),
                false, null, false, null, null, null, null, null, NoticeContentFormat.HTML, authorId);
    }

    @Test
    @DisplayName("관리자가 공지를 만들면 커버와 본문 이미지 업로드가 모두 ACTIVE 가 된다")
    void adminCreateActivatesCoverAndBodyImages() {
        User admin = userRepository.save(UserFixture.admin());
        String coverKey = seedPending(FilePurpose.NOTICE_COVER);
        String bodyKey = seedPending(FilePurpose.NOTICE_BODY);

        noticeService.create(adminCreate(STUB_PREFIX + coverKey, bodyWith(bodyKey), admin.getId()));

        assertThat(statusOf(coverKey)).isEqualTo(UploadedObjectStatus.ACTIVE);
        assertThat(statusOf(bodyKey)).isEqualTo(UploadedObjectStatus.ACTIVE);
    }

    @Test
    @DisplayName("관리자가 공지를 수정하면 새 커버와 새 본문 이미지 업로드가 ACTIVE 가 된다")
    void adminUpdateActivatesNewCoverAndBodyImages() {
        User admin = userRepository.save(UserFixture.admin());
        Long noticeId = noticeService.create(adminCreate("", "<p>초기</p>", admin.getId()));
        String coverKey = seedPending(FilePurpose.NOTICE_COVER);
        String bodyKey = seedPending(FilePurpose.NOTICE_BODY);

        noticeService.update(new UpdateNoticeCommand(noticeId, null, null, bodyWith(bodyKey), STUB_PREFIX + coverKey,
                null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null));

        assertThat(statusOf(coverKey)).isEqualTo(UploadedObjectStatus.ACTIVE);
        assertThat(statusOf(bodyKey)).isEqualTo(UploadedObjectStatus.ACTIVE);
    }

    @Test
    @DisplayName("동아리 공지를 만들면 커버와 본문 이미지 업로드가 ACTIVE 가 된다")
    void clubCreateActivatesCoverAndBodyImages() throws Exception {
        User author = userRepository.save(UserFixture.unique());
        Club club = saveActiveClub();
        String coverKey = seedPending(FilePurpose.NOTICE_COVER);
        String bodyKey = seedPending(FilePurpose.NOTICE_BODY);

        noticeService.createForClub(new CreateClubNoticeCommand(club.getId(), author.getId(),
                "동아리 공지", "요약", bodyWith(bodyKey), STUB_PREFIX + coverKey, false, null));

        assertThat(statusOf(coverKey)).isEqualTo(UploadedObjectStatus.ACTIVE);
        assertThat(statusOf(bodyKey)).isEqualTo(UploadedObjectStatus.ACTIVE);
    }

    @Test
    @DisplayName("동아리 공지를 수정하면 새 커버와 새 본문 이미지 업로드가 ACTIVE 가 된다")
    void clubUpdateActivatesNewCoverAndBodyImages() throws Exception {
        User author = userRepository.save(UserFixture.unique());
        Club club = saveActiveClub();
        Long noticeId = noticeService.createForClub(new CreateClubNoticeCommand(club.getId(), author.getId(),
                "동아리 공지", "요약", "<p>초기</p>", null, false, null));
        String coverKey = seedPending(FilePurpose.NOTICE_COVER);
        String bodyKey = seedPending(FilePurpose.NOTICE_BODY);

        noticeService.updateForClub(new UpdateClubNoticeCommand(club.getId(), noticeId,
                null, null, bodyWith(bodyKey), STUB_PREFIX + coverKey, null, null, null));

        assertThat(statusOf(coverKey)).isEqualTo(UploadedObjectStatus.ACTIVE);
        assertThat(statusOf(bodyKey)).isEqualTo(UploadedObjectStatus.ACTIVE);
    }
}
```

`UserFixture.admin()` 이 ADMIN 역할 사용자를 만든다(`src/test/java/com/duing/common/fixture/UserFixture.java:33`).

- [ ] **Step 2: 실패 확인**

Run: `cd /Users/ksy/orca/workspaces/Duing/emperor/backend && ./gradlew test --tests "com.duing.domain.notice.service.NoticeUploadActivationTest"`
Expected: 4건 FAIL(PENDING 그대로).

- [ ] **Step 3: GeneralNoticeService 수정**

마지막 필드로(`@Value` 필드 `coverImageUrlPrefix` 는 final 이 아니므로 그 **위**, `private final Clock clock;` 바로 아래):

```java
    // 업로드 객체 추적(#791) — 커버 URL 과 본문 안 이미지 URL 을 저장하는 4개 쓰기 메서드에서 활성화한다.
    private final UploadedObjectService uploadedObjectService;
```

각 메서드에 다음 줄을 추가한다:
- `create`: `Notice saved = noticeRepository.save(...)` 문장 바로 다음.
- `update`: `found.update(new Notice.UpdatePayload(...));` 바로 다음.
- `createForClub`: `saved.assignOwningClub(command.clubId());` 바로 다음.
- `updateForClub`: `found.applyClubScopedUpdate(...);` 바로 다음.

```java
        uploadedObjectService.activate(command.coverImageUrl());
        uploadedObjectService.activateReferencedIn(command.content());
```

import `com.duing.global.file.UploadedObjectService`.

- [ ] **Step 4: NoticeExpiryKstBoundaryTest 생성자 인자 추가**

`serviceWithClock` 의 `new GeneralNoticeService(…, fixedClock)` 마지막 인자 뒤에 `, mock(UploadedObjectService.class)` 추가 + import.

- [ ] **Step 5: 통과 확인 (신규 + 회귀)**

Run: `cd /Users/ksy/orca/workspaces/Duing/emperor/backend && ./gradlew test --tests "com.duing.domain.notice.*"`
Expected: BUILD SUCCESSFUL, 전부 PASS.

- [ ] **Step 6: 커밋**

```bash
cd /Users/ksy/orca/workspaces/Duing/emperor && git add backend/src/main/java/com/duing/domain/notice backend/src/test/java/com/duing/domain/notice
git commit -m "feat(backend): 공지 커버·본문 이미지 — 관리자/동아리 생성·수정 4경로에서 업로드 추적 활성화"
```

---

### Task 6: 홍보 배너·홍보 요청 배너·전체 행사 커버 활성화

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/promotion/service/GeneralPromotionService.java`
- Modify: `backend/src/main/java/com/duing/domain/promotion/service/GeneralPromotionRequestService.java`
- Modify: `backend/src/main/java/com/duing/domain/globalevent/service/GeneralGlobalEventService.java`
- Modify: `backend/src/test/java/com/duing/domain/globalevent/service/GeneralGlobalEventServiceKstWindowTest.java` (수동 생성자 인자 1개 추가)
- Test: `backend/src/test/java/com/duing/domain/promotion/service/PromotionUploadActivationTest.java`
- Test: `backend/src/test/java/com/duing/domain/globalevent/service/GlobalEventUploadActivationTest.java`

- [ ] **Step 1: 홍보 테스트 작성 (RED)**

```java
package com.duing.domain.promotion.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.promotion.entity.PromotionPalette;
import com.duing.domain.promotion.entity.PromotionRenderMode;
import com.duing.domain.promotion.service.dto.command.CreatePromotionCommand;
import com.duing.domain.promotion.service.dto.command.CreatePromotionRequestCommand;
import com.duing.domain.promotion.service.dto.command.UpdatePromotionCommand;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.file.controller.dto.FilePurpose;
import com.duing.global.file.entity.UploadedObject;
import com.duing.global.file.entity.UploadedObjectStatus;
import com.duing.global.file.repository.UploadedObjectRepository;
import java.lang.reflect.Field;
import java.time.Instant;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

/** 홍보 도메인의 업로드 활성화 지점(스펙 §3.4: PROMOTION_BANNER 생성·수정, PROMOTION_REQUEST_BANNER 생성). */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class PromotionUploadActivationTest extends IntegrationTestBase {

    private static final String STUB_PREFIX = "/files/stub/";

    @Autowired PromotionService promotionService;
    @Autowired PromotionRequestService promotionRequestService;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired UserRepository userRepository;
    @Autowired UploadedObjectRepository uploadedObjectRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private String seedPending(FilePurpose purpose) {
        String storageKey = purpose.directory() + "/" + sequence.incrementAndGet() + ".jpg";
        uploadedObjectRepository.save(UploadedObject.pending(storageKey, purpose, 1L, Instant.now()));
        return storageKey;
    }

    private UploadedObjectStatus statusOf(String storageKey) {
        return uploadedObjectRepository.findByStorageKey(storageKey).orElseThrow().getStatus();
    }

    private CreatePromotionCommand createBanner(String bannerUrl, Long adminId) {
        return new CreatePromotionCommand(null, "배너", bannerUrl, "https://example.com", true, 1, adminId,
                null, null, null, null, PromotionPalette.INK, null, null,
                PromotionRenderMode.SYSTEM_COMPOSED, null, null);
    }

    @Test
    @DisplayName("홍보를 만들면 배너 업로드가 ACTIVE 가 되고, 수정으로 배너를 바꾸면 새 배너 업로드가 ACTIVE 가 된다")
    void promotionCreateAndUpdateActivateBanner() {
        User admin = userRepository.save(UserFixture.admin());
        String createdKey = seedPending(FilePurpose.PROMOTION_BANNER);
        String replacedKey = seedPending(FilePurpose.PROMOTION_BANNER);

        Long promotionId = promotionService.create(createBanner(STUB_PREFIX + createdKey, admin.getId()));
        assertThat(statusOf(createdKey)).isEqualTo(UploadedObjectStatus.ACTIVE);

        promotionService.update(new UpdatePromotionCommand(promotionId, null, STUB_PREFIX + replacedKey, null,
                null, null, null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null));
        assertThat(statusOf(replacedKey)).isEqualTo(UploadedObjectStatus.ACTIVE);
    }

    @Test
    @DisplayName("동아리 운영진이 홍보 요청을 제출하면 제안 배너 업로드가 ACTIVE 가 된다")
    void promotionRequestCreateActivatesSuggestedBanner() throws Exception {
        User leader = userRepository.save(UserFixture.unique());
        Club club = Club.create("홍보요청클럽-" + sequence.incrementAndGet(), ClubCategory.ACADEMIC, null, "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(club, ClubStatus.ACTIVE);
        club = clubRepository.save(club);
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        String bannerKey = seedPending(FilePurpose.PROMOTION_REQUEST_BANNER);

        promotionRequestService.create(new CreatePromotionRequestCommand(club.getId(), leader.getId(),
                "타이틀", "설명", STUB_PREFIX + bannerKey, "https://example.com"));

        assertThat(statusOf(bannerKey)).isEqualTo(UploadedObjectStatus.ACTIVE);
    }
}
```

- [ ] **Step 2: 전체 행사 테스트 작성 (RED)**

```java
package com.duing.domain.globalevent.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.globalevent.entity.GlobalEventCategory;
import com.duing.domain.globalevent.service.dto.command.CreateGlobalEventCommand;
import com.duing.domain.globalevent.service.dto.command.UpdateGlobalEventCommand;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.file.controller.dto.FilePurpose;
import com.duing.global.file.entity.UploadedObject;
import com.duing.global.file.entity.UploadedObjectStatus;
import com.duing.global.file.repository.UploadedObjectRepository;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

/** 전체 행사 도메인의 업로드 활성화 지점(스펙 §3.4: GLOBAL_EVENT_COVER 생성·수정). */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class GlobalEventUploadActivationTest extends IntegrationTestBase {

    private static final String STUB_PREFIX = "/files/stub/";

    @Autowired GlobalEventService globalEventService;
    @Autowired UserRepository userRepository;
    @Autowired UploadedObjectRepository uploadedObjectRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private String seedPending() {
        String storageKey = FilePurpose.GLOBAL_EVENT_COVER.directory() + "/" + sequence.incrementAndGet() + ".jpg";
        uploadedObjectRepository.save(UploadedObject.pending(storageKey, FilePurpose.GLOBAL_EVENT_COVER, 1L, Instant.now()));
        return storageKey;
    }

    private UploadedObjectStatus statusOf(String storageKey) {
        return uploadedObjectRepository.findByStorageKey(storageKey).orElseThrow().getStatus();
    }

    @Test
    @DisplayName("전체 행사를 만들면 커버 업로드가 ACTIVE 가 되고, 수정으로 커버를 바꾸면 새 커버 업로드가 ACTIVE 가 된다")
    void createAndUpdateActivateCover() {
        User admin = userRepository.save(UserFixture.admin());
        String createdKey = seedPending();
        String replacedKey = seedPending();
        LocalDateTime startAt = LocalDateTime.now().plusDays(7);

        Long eventId = globalEventService.create(new CreateGlobalEventCommand(admin.getId(), "행사", "설명",
                startAt, startAt.plusHours(2), "장소", null, STUB_PREFIX + createdKey, GlobalEventCategory.FESTIVAL));
        assertThat(statusOf(createdKey)).isEqualTo(UploadedObjectStatus.ACTIVE);

        globalEventService.update(new UpdateGlobalEventCommand(eventId, null, null, null, null, null, null, null,
                STUB_PREFIX + replacedKey, null));
        assertThat(statusOf(replacedKey)).isEqualTo(UploadedObjectStatus.ACTIVE);
    }
}
```

`GlobalEvent.update(...)` 는 null 필드를 "미변경" 으로 다룬다(`GlobalEvent.java:70-84` 확인됨) — 위처럼 커버만 넘기면 된다.

- [ ] **Step 3: 실패 확인**

Run: `cd /Users/ksy/orca/workspaces/Duing/emperor/backend && ./gradlew test --tests "com.duing.domain.promotion.service.PromotionUploadActivationTest" --tests "com.duing.domain.globalevent.service.GlobalEventUploadActivationTest"`
Expected: 3건 FAIL(PENDING 그대로).

- [ ] **Step 4: 서비스 3개 수정**

각 서비스에 마지막 필드로 `private final UploadedObjectService uploadedObjectService;` + import 추가.

`GeneralPromotionService.create`: `return promotionRepository.save(Promotion.create(...)).getId();` 를

```java
        Promotion saved = promotionRepository.save(Promotion.create(
                /* 기존 인자 그대로 */
        ));
        uploadedObjectService.activate(command.bannerImageUrl());
        return saved.getId();
```

`GeneralPromotionService.update`: `promotion.update(new Promotion.UpdatePayload(...));` 바로 다음에 `uploadedObjectService.activate(command.bannerImageUrl());`.

`GeneralPromotionRequestService.create`: try 블록 안 `return requestRepository.save(PromotionRequest.create(...)).getId();` 를

```java
            PromotionRequest saved = requestRepository.save(PromotionRequest.create(
                    command.clubId(), command.requesterUserId(),
                    command.title(), command.description(),
                    command.suggestedBannerImageUrl(), command.suggestedLinkUrl()
            ));
            uploadedObjectService.activate(command.suggestedBannerImageUrl());
            return saved.getId();
```

(`DataIntegrityViolationException` catch 는 그대로 — `save` 는 flush 시점이 아니라도 PENDING 중복 유니크가 INSERT 즉시 걸리므로 기존 동작 유지. `activate` 의 `UploadExpiredException` 은 catch 대상이 아니다.)

`GeneralGlobalEventService.create`: `return eventRepository.save(event).getId();` 를

```java
        Long eventId = eventRepository.save(event).getId();
        uploadedObjectService.activate(command.coverImageUrl());
        return eventId;
```

`GeneralGlobalEventService.update`: `event.update(...)` 바로 다음에 `uploadedObjectService.activate(command.coverImageUrl());`.

- [ ] **Step 5: GeneralGlobalEventServiceKstWindowTest 생성자 인자 추가**

`new GeneralGlobalEventService(eventRepository, mock(UserRepository.class), fixedClock)` → 마지막에 `, mock(UploadedObjectService.class)` + import.

- [ ] **Step 6: 통과 확인 (신규 + 회귀)**

Run: `cd /Users/ksy/orca/workspaces/Duing/emperor/backend && ./gradlew test --tests "com.duing.domain.promotion.*" --tests "com.duing.domain.globalevent.*"`
Expected: BUILD SUCCESSFUL, 전부 PASS.

- [ ] **Step 7: 커밋**

```bash
cd /Users/ksy/orca/workspaces/Duing/emperor && git add backend/src/main/java/com/duing/domain/promotion backend/src/main/java/com/duing/domain/globalevent backend/src/test/java/com/duing/domain/promotion backend/src/test/java/com/duing/domain/globalevent
git commit -m "feat(backend): 홍보 배너·홍보 요청 배너·전체 행사 커버 — 저장 시 업로드 추적 활성화"
```

---

### Task 7: 총동연 문의 첨부 활성화

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/federation/service/GeneralFederationInquiryService.java`
- Test: `backend/src/test/java/com/duing/domain/federation/service/FederationInquiryUploadActivationTest.java`

- [ ] **Step 1: 테스트 작성 (RED)**

```java
package com.duing.domain.federation.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.federation.service.dto.command.CreateFederationInquiryCommand;
import com.duing.domain.federation.service.dto.command.UpdateFederationInquiryCommand;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.file.controller.dto.FilePurpose;
import com.duing.global.file.entity.UploadedObject;
import com.duing.global.file.entity.UploadedObjectStatus;
import com.duing.global.file.repository.UploadedObjectRepository;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

/** 총동연 문의 첨부의 업로드 활성화 지점(스펙 §3.4: FEDERATION_INQUIRY 생성·수정 교체). */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class FederationInquiryUploadActivationTest extends IntegrationTestBase {

    private static final String STUB_PREFIX = "/files/stub/";

    @Autowired FederationInquiryService federationInquiryService;
    @Autowired UserRepository userRepository;
    @Autowired UploadedObjectRepository uploadedObjectRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private String seedPending() {
        String storageKey = FilePurpose.FEDERATION_INQUIRY.directory() + "/" + sequence.incrementAndGet() + ".jpg";
        uploadedObjectRepository.save(UploadedObject.pending(storageKey, FilePurpose.FEDERATION_INQUIRY, 1L, Instant.now()));
        return storageKey;
    }

    private UploadedObjectStatus statusOf(String storageKey) {
        return uploadedObjectRepository.findByStorageKey(storageKey).orElseThrow().getStatus();
    }

    @Test
    @DisplayName("문의를 첨부와 함께 만들면 첨부 업로드가 전부 ACTIVE 가 되고, 수정으로 교체하면 새 첨부 업로드가 ACTIVE 가 된다")
    void createAndReplaceActivateAttachments() {
        User author = userRepository.save(UserFixture.unique());
        String firstKey = seedPending();
        String secondKey = seedPending();
        String replacementKey = seedPending();

        Long inquiryId = federationInquiryService.create(new CreateFederationInquiryCommand(author.getId(),
                "제목", "내용", List.of(STUB_PREFIX + secondKey, STUB_PREFIX + firstKey)));
        assertThat(statusOf(firstKey)).isEqualTo(UploadedObjectStatus.ACTIVE);
        assertThat(statusOf(secondKey)).isEqualTo(UploadedObjectStatus.ACTIVE);

        federationInquiryService.update(new UpdateFederationInquiryCommand(inquiryId, author.getId(),
                "제목", "내용", List.of(STUB_PREFIX + replacementKey)));
        assertThat(statusOf(replacementKey)).isEqualTo(UploadedObjectStatus.ACTIVE);
    }
}
```

- [ ] **Step 2: 실패 확인**

Run: `cd /Users/ksy/orca/workspaces/Duing/emperor/backend && ./gradlew test --tests "com.duing.domain.federation.service.FederationInquiryUploadActivationTest"`
Expected: FAIL(PENDING 그대로).

- [ ] **Step 3: 서비스 수정**

마지막 필드로 `private final UploadedObjectService uploadedObjectService;` + import. `buildAttachments` 의 for 루프가 끝난 뒤 `return attachments;` 직전에:

```java
        // 업로드 추적 활성화(#791) — 잠금 순서 결정화를 위해 서비스가 사전순 정렬해 한 번에 잠근다(스펙 §3.3).
        uploadedObjectService.activate(attachmentUrls.toArray(String[]::new));
```

(`activate` 내부가 `TreeSet` 으로 정렬·중복 제거하므로 여기서는 배열로만 넘긴다.)

- [ ] **Step 4: 통과 확인 (신규 + 회귀)**

Run: `cd /Users/ksy/orca/workspaces/Duing/emperor/backend && ./gradlew test --tests "com.duing.domain.federation.*"`
Expected: BUILD SUCCESSFUL, 전부 PASS.

- [ ] **Step 5: 커밋**

```bash
cd /Users/ksy/orca/workspaces/Duing/emperor && git add backend/src/main/java/com/duing/domain/federation backend/src/test/java/com/duing/domain/federation
git commit -m "feat(backend): 총동연 문의 첨부 — 생성·교체 시 업로드 추적 활성화"
```

---

### Task 8: 파기 잡 + 설정 + dry-run

**Files:**
- Create: `backend/src/main/java/com/duing/global/file/purge/UploadPurgeProperties.java`
- Create: `backend/src/main/java/com/duing/global/file/purge/UploadPurgePropertiesConfig.java`
- Create: `backend/src/main/java/com/duing/global/file/purge/UploadPurgeJobConfig.java`
- Create: `backend/src/main/java/com/duing/global/file/purge/UploadPurgeJob.java`
- Modify: `backend/src/main/resources/application.yml` (`duing.federation-inquiry.purge` 블록 뒤)
- Modify: `backend/src/main/resources/application-prod.yml` (`federation-inquiry.purge` 블록 뒤)
- Modify: `backend/src/test/resources/application.yml` (`duing.federation-inquiry.purge` 블록 뒤)
- Test: `backend/src/test/java/com/duing/global/file/purge/UploadPurgeJobTest.java`
- Test: `backend/src/test/java/com/duing/global/file/purge/UploadPurgeSchedulingWiringTest.java`

**Interfaces:**
- Produces: `UploadPurgeJob.run()` (public, `@Scheduled`), `UploadPurgeProperties(boolean enabled, boolean deleteEnabled, Duration window)`, 공개 생성자 `UploadPurgeJob(UploadPurgeProperties, Clock, UploadedObjectRepository, FileStorageService, PlatformTransactionManager)`.

- [ ] **Step 1: 설정 클래스 3개**

`UploadPurgeProperties.java`:

```java
package com.duing.global.file.purge;

import jakarta.validation.constraints.NotNull;
import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/**
 * 업로드 고아 객체 정리 잡 설정(#791, 스펙 §5). {@code FederationInquiryPurgeProperties} 와 같은 구조.
 *
 * <p>{@code enabled} 는 스케줄링 on/off(prod 기본 활성). {@code deleteEnabled} 는 실삭제 on/off — 1차 릴리스는
 * false(dry-run: 후보를 로그로만 기록)로 두고, 일주일간 {@code referenced=true} 후보가 0건임을 확인한 뒤
 * true 로 전환한다. {@code window} 는 업로드 후 PENDING 으로 남을 수 있는 유예(기본 24시간).
 */
@Validated
@ConfigurationProperties(prefix = "duing.upload.purge")
public record UploadPurgeProperties(boolean enabled, boolean deleteEnabled, @NotNull Duration window) {
}
```

`UploadPurgePropertiesConfig.java`:

```java
package com.duing.global.file.purge;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

/**
 * {@link UploadPurgeProperties} 를 무조건 등록한다({@code FederationInquiryPurgePropertiesConfig} 전례).
 * {@link UploadPurgeJob} 은 잡이 비활성일 때도 properties 를 읽어 early-return 하므로 바인딩은 항상 유지한다.
 * 스케줄링 활성화는 {@link UploadPurgeJobConfig} 가 {@code duing.upload.purge.enabled=true} 일 때만 켠다.
 */
@Configuration
@EnableConfigurationProperties(UploadPurgeProperties.class)
public class UploadPurgePropertiesConfig {
}
```

`UploadPurgeJobConfig.java`:

```java
package com.duing.global.file.purge;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * 업로드 고아 정리 크론을 활성화하는 설정 — {@code duing.upload.purge.enabled=true} 일 때만 {@code @EnableScheduling}
 * 으로 스케줄러를 켠다. 다른 잡 설정의 스케줄러에 무임승차하지 않고 자기 플래그만으로 독립 동작한다
 * ({@code FederationInquiryPurgeJobConfig} 와 동일 격리 패턴).
 */
@Configuration
@EnableScheduling
@ConditionalOnProperty(prefix = "duing.upload.purge", name = "enabled", havingValue = "true")
public class UploadPurgeJobConfig {
}
```

- [ ] **Step 2: yml 3곳**

`backend/src/main/resources/application.yml` — `federation-inquiry.purge.window` 줄 바로 아래(같은 `duing:` 들여쓰기 2칸):

```yaml
  upload:
    purge:
      # 업로드 고아 객체 정리 잡(매시 :20 Asia/Seoul, #791). 업로드 후 24시간(PT24H) 넘게 어떤 엔티티에도 연결되지
      # 않은 객체를 스토리지에서 지운다. enabled 는 스케줄링, delete-enabled 는 실삭제 — 기본 둘 다 비활성.
      # 운영에서 DUING_UPLOAD_PURGE_ENABLED=true 로 켜고, dry-run(delete-enabled=false)으로 후보 로그를 확인한 뒤
      # DUING_UPLOAD_PURGE_DELETE_ENABLED=true 로 실삭제를 연다.
      enabled: ${DUING_UPLOAD_PURGE_ENABLED:false}
      delete-enabled: ${DUING_UPLOAD_PURGE_DELETE_ENABLED:false}
      window: ${DUING_UPLOAD_PURGE_WINDOW:PT24H}
```

`backend/src/main/resources/application-prod.yml` — `federation-inquiry.purge.enabled` 줄 바로 아래:

```yaml
  # 업로드 고아 객체 정리 잡(#791) — 스케줄링은 다른 잡과 같은 관례로 운영 기본 활성. 실삭제(delete-enabled)는
  # 의도적 예외로 기본 비활성 = 1차 릴리스는 dry-run(후보를 로그로만 기록). 일주일간 로그의 referenced=true 후보가
  # 0건임을 확인한 뒤 2차 릴리스에서 true 로 바꾼다(DUING_UPLOAD_PURGE_DELETE_ENABLED=true 로 즉시 전환도 가능).
  upload:
    purge:
      enabled: ${DUING_UPLOAD_PURGE_ENABLED:true}
      delete-enabled: ${DUING_UPLOAD_PURGE_DELETE_ENABLED:false}
```

`backend/src/test/resources/application.yml` — `federation-inquiry.purge.window: P45D` 줄 바로 아래:

```yaml
  upload:
    purge:
      enabled: false
      delete-enabled: false
      window: PT24H
```

- [ ] **Step 3: 잡 테스트 작성 (RED)**

`backend/src/test/java/com/duing/global/file/purge/UploadPurgeJobTest.java`:

```java
package com.duing.global.file.purge;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.global.file.FileStorageService;
import com.duing.global.file.controller.dto.FilePurpose;
import com.duing.global.file.entity.UploadedObject;
import com.duing.global.file.entity.UploadedObjectStatus;
import com.duing.global.file.repository.UploadedObjectRepository;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;

/**
 * {@link UploadPurgeJob} 통합 테스트(FederationInquiryPurgeJobTest 패턴). FileStorageService 는 외부 경계라
 * {@link MockitoBean} 으로 대체한다 — mock 의 boolean 기본값은 false(=삭제 미확정)이므로 파기가 일어나야 하는
 * 테스트는 반드시 {@code stubStorageDeleteConfirmed()} 로 명시 stub 한다.
 *
 * <p>이슈 #791 테스트 케이스 4 "이미 삭제된 객체 처리 멱등성" 은 별도 케이스가 아니다 — S3/Local 구현 계약상
 * 미존재 키 delete 도 true(삭제 확정)이므로 정상 경로(mock delete→true)와 동형이다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = {
        "duing.upload.purge.enabled=true",
        "duing.upload.purge.delete-enabled=false",
        "duing.upload.purge.window=PT24H"
})
class UploadPurgeJobTest extends IntegrationTestBase {

    @Autowired UploadPurgeJob dryRunJob; // 컨텍스트 빈 = delete-enabled=false
    @Autowired UploadedObjectRepository uploadedObjectRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired Clock clock;
    @Autowired JdbcTemplate jdbcTemplate;
    @Autowired PlatformTransactionManager platformTransactionManager;
    @MockitoBean FileStorageService fileStorageService;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private UploadPurgeJob deleteEnabledJob() {
        return new UploadPurgeJob(new UploadPurgeProperties(true, true, Duration.ofHours(24)),
                clock, uploadedObjectRepository, fileStorageService, platformTransactionManager);
    }

    private void stubStorageDeleteConfirmed() {
        when(fileStorageService.toFileUrl(anyString()))
                .thenAnswer(invocation -> "resolved:" + invocation.getArgument(0, String.class));
        when(fileStorageService.delete(anyString())).thenReturn(true);
    }

    private String seed(UploadedObjectStatus status, int hoursAgo) {
        String storageKey = "club/logo/" + sequence.incrementAndGet() + ".jpg";
        Instant uploadedAt = Instant.now(clock).minus(hoursAgo, ChronoUnit.HOURS);
        UploadedObject uploadedObject = UploadedObject.pending(storageKey, FilePurpose.LOGO, 1L, uploadedAt);
        if (status == UploadedObjectStatus.ACTIVE) uploadedObject.activate(uploadedAt);
        if (status == UploadedObjectStatus.PURGING) uploadedObject.markPurging();
        uploadedObjectRepository.save(uploadedObject);
        return storageKey;
    }

    private UploadedObjectStatus statusOf(String storageKey) {
        return uploadedObjectRepository.findByStorageKey(storageKey).orElseThrow().getStatus();
    }

    @Test
    @DisplayName("dry-run(기본)에서는 25시간 지난 PENDING 이 있어도 스토리지를 지우지 않고 상태도 바꾸지 않는다")
    void dryRunNeverDeletesNorChangesStatus() {
        stubStorageDeleteConfirmed();
        String oldKey = seed(UploadedObjectStatus.PENDING, 25);
        String referencedKey = seed(UploadedObjectStatus.PENDING, 25);
        clubRepository.save(Club.create("참조클럽-" + sequence.incrementAndGet(), ClubCategory.ACADEMIC, null, "설명",
                "https://files.example.com/" + referencedKey));

        dryRunJob.run();

        verify(fileStorageService, never()).delete(anyString());
        assertThat(statusOf(oldKey)).isEqualTo(UploadedObjectStatus.PENDING);
        assertThat(statusOf(referencedKey)).isEqualTo(UploadedObjectStatus.PENDING);
    }

    @Test
    @DisplayName("실삭제 모드에서 25시간 지난 PENDING 은 스토리지 삭제 후 PURGED 가 되고, 1시간 지난 PENDING 과 오래된 ACTIVE 는 건드리지 않는다")
    void deletesOnlyExpiredPending() {
        stubStorageDeleteConfirmed();
        String expiredKey = seed(UploadedObjectStatus.PENDING, 25);
        String recentKey = seed(UploadedObjectStatus.PENDING, 1);
        String activeKey = seed(UploadedObjectStatus.ACTIVE, 500);

        deleteEnabledJob().run();

        assertThat(statusOf(expiredKey)).isEqualTo(UploadedObjectStatus.PURGED);
        assertThat(uploadedObjectRepository.findByStorageKey(expiredKey).orElseThrow().getPurgedAt()).isNotNull();
        verify(fileStorageService).delete("resolved:" + expiredKey);
        verify(fileStorageService, times(1)).delete(anyString());
        assertThat(statusOf(recentKey)).isEqualTo(UploadedObjectStatus.PENDING);
        assertThat(statusOf(activeKey)).isEqualTo(UploadedObjectStatus.ACTIVE);
    }

    @Test
    @DisplayName("실삭제 모드라도 어떤 엔티티가 아직 참조하는 후보는 지우지 않고 ACTIVE 로 치유한다 (활성화 지점 누락 안전망)")
    void healsReferencedCandidateInsteadOfDeleting() {
        stubStorageDeleteConfirmed();
        String referencedKey = seed(UploadedObjectStatus.PENDING, 25);
        clubRepository.save(Club.create("참조클럽-" + sequence.incrementAndGet(), ClubCategory.ACADEMIC, null, "설명",
                "https://files.example.com/" + referencedKey));

        deleteEnabledJob().run();

        assertThat(statusOf(referencedKey)).isEqualTo(UploadedObjectStatus.ACTIVE);
        verify(fileStorageService, never()).delete(anyString());
    }

    @Test
    @DisplayName("스토리지 delete 가 false(미확정)면 PURGING 으로 남고, 다음 실행에서 재시도해 확정되면 PURGED 가 된다")
    void keepsPurgingOnUnconfirmedDeleteAndRetriesNextRun() {
        when(fileStorageService.toFileUrl(anyString()))
                .thenAnswer(invocation -> "resolved:" + invocation.getArgument(0, String.class));
        String failingKey = seed(UploadedObjectStatus.PENDING, 25);
        String okKey = seed(UploadedObjectStatus.PENDING, 25);
        when(fileStorageService.delete("resolved:" + failingKey)).thenReturn(false);
        when(fileStorageService.delete("resolved:" + okKey)).thenReturn(true);

        deleteEnabledJob().run();
        assertThat(statusOf(failingKey)).isEqualTo(UploadedObjectStatus.PURGING);
        assertThat(statusOf(okKey)).isEqualTo(UploadedObjectStatus.PURGED);

        when(fileStorageService.delete("resolved:" + failingKey)).thenReturn(true);
        deleteEnabledJob().run();
        assertThat(statusOf(failingKey)).isEqualTo(UploadedObjectStatus.PURGED);
        verify(fileStorageService, times(2)).delete("resolved:" + failingKey);
        verify(fileStorageService, times(1)).delete("resolved:" + okKey);
    }

    @Test
    @DisplayName("스토리지 delete 가 예외를 던져도(방어 경로) 그 후보는 PURGING 으로 남고 나머지 후보는 계속 파기된다")
    void keepsPurgingOnStorageExceptionAndContinuesOthers() {
        when(fileStorageService.toFileUrl(anyString()))
                .thenAnswer(invocation -> "resolved:" + invocation.getArgument(0, String.class));
        String throwingKey = seed(UploadedObjectStatus.PENDING, 25);
        String nextKey = seed(UploadedObjectStatus.PENDING, 25);
        doThrow(new RuntimeException("스토리지 장애")).when(fileStorageService).delete("resolved:" + throwingKey);
        when(fileStorageService.delete("resolved:" + nextKey)).thenReturn(true);

        deleteEnabledJob().run();

        assertThat(statusOf(throwingKey)).isEqualTo(UploadedObjectStatus.PURGING);
        assertThat(statusOf(nextKey)).isEqualTo(UploadedObjectStatus.PURGED);
    }

    @Test
    @DisplayName("2회 실행해도 두 번째 실행은 이미 PURGED 된 객체를 다시 지우지 않는다 (멱등·중복 실행 안전)")
    void isIdempotentAcrossRuns() {
        stubStorageDeleteConfirmed();
        String expiredKey = seed(UploadedObjectStatus.PENDING, 25);

        deleteEnabledJob().run();
        deleteEnabledJob().run();

        assertThat(statusOf(expiredKey)).isEqualTo(UploadedObjectStatus.PURGED);
        verify(fileStorageService, times(1)).delete(anyString());
    }

    @Test
    @DisplayName("한 번에 최대 500건만 처리하고 남은 후보는 다음 실행이 이어받는다")
    void processesAtMostBatchLimitPerRun() {
        stubStorageDeleteConfirmed();
        Instant uploadedAt = Instant.now(clock).minus(25, ChronoUnit.HOURS);
        List<Object[]> rows = new ArrayList<>();
        for (int index = 0; index < 502; index++) {
            rows.add(new Object[]{"club/logo/bulk-" + sequence.incrementAndGet() + ".jpg", "LOGO", 1L, "PENDING",
                    java.sql.Timestamp.from(uploadedAt)});
        }
        jdbcTemplate.batchUpdate(
                "INSERT INTO uploaded_object (storage_key, purpose, uploader_id, status, uploaded_at) VALUES (?, ?, ?, ?, ?)",
                rows);

        deleteEnabledJob().run();
        Integer purgedAfterFirst = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM uploaded_object WHERE status = 'PURGED'", Integer.class);
        assertThat(purgedAfterFirst).isEqualTo(500);

        deleteEnabledJob().run();
        Integer purgedAfterSecond = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM uploaded_object WHERE status = 'PURGED'", Integer.class);
        assertThat(purgedAfterSecond).isEqualTo(502);
    }

    @Test
    @DisplayName("enabled=false 잡과 window=0 잡은 25시간 지난 PENDING 도 건드리지 않는다 (비활성·오설정 안전장치)")
    void noopWhenDisabledOrWindowIsZero() {
        stubStorageDeleteConfirmed();
        String expiredKey = seed(UploadedObjectStatus.PENDING, 25);

        new UploadPurgeJob(new UploadPurgeProperties(false, true, Duration.ofHours(24)),
                clock, uploadedObjectRepository, fileStorageService, platformTransactionManager).run();
        new UploadPurgeJob(new UploadPurgeProperties(true, true, Duration.ZERO),
                clock, uploadedObjectRepository, fileStorageService, platformTransactionManager).run();

        assertThat(statusOf(expiredKey)).isEqualTo(UploadedObjectStatus.PENDING);
        verify(fileStorageService, never()).delete(anyString());
    }
}
```

- [ ] **Step 4: 와이어링 테스트 작성 (RED)**

`backend/src/test/java/com/duing/global/file/purge/UploadPurgeSchedulingWiringTest.java`:

```java
package com.duing.global.file.purge;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.federation.config.FederationInquiryPurgeJobConfig;
import com.duing.domain.fee.job.MonthlyBillIssueJob;
import com.duing.domain.fee.job.OverdueBillJob;
import com.duing.domain.notification.job.DeadlineNotificationJob;
import com.duing.global.privacy.PiiRetentionJobConfig;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Import;

/** 업로드 정리 잡의 스케줄 자급 + 격리 회귀 테스트(FederationInquiryPurgeSchedulingWiringTest 전례). */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = {
        "duing.upload.purge.enabled=true",
        "duing.federation-inquiry.purge.enabled=false",
        "duing.notification.jobs.enabled=false",
        "duing.privacy.retention.enabled=false",
        "duing.fee.overdue.enabled=false",
        "duing.fee.auto-issue.enabled=false"
})
class UploadPurgeSchedulingWiringTest extends IntegrationTestBase {

    @Autowired
    private ApplicationContext applicationContext;

    @Test
    @DisplayName("upload.purge 만 켜도 스케줄 설정이 활성화되며 UploadPurgeJob 은 등록되고, 비활성 문의 파기·PII·알림·회비 잡은 함께 깨우지 않는다")
    void uploadPurgeSchedulesItselfWithoutWakingOtherJobs() {
        assertThat(applicationContext.getBeanNamesForType(UploadPurgeJobConfig.class)).isNotEmpty();
        assertThat(applicationContext.getBeanNamesForType(UploadPurgeJob.class)).isNotEmpty();
        assertThat(applicationContext.getBeanNamesForType(FederationInquiryPurgeJobConfig.class)).isEmpty();
        assertThat(applicationContext.getBeanNamesForType(PiiRetentionJobConfig.class)).isEmpty();
        assertThat(applicationContext.getBeanNamesForType(DeadlineNotificationJob.class)).isEmpty();
        assertThat(applicationContext.getBeanNamesForType(OverdueBillJob.class)).isEmpty();
        assertThat(applicationContext.getBeanNamesForType(MonthlyBillIssueJob.class)).isEmpty();
    }
}
```

- [ ] **Step 5: 실패 확인**

Run: `cd /Users/ksy/orca/workspaces/Duing/emperor/backend && ./gradlew test --tests "com.duing.global.file.purge.*"`
Expected: 컴파일 실패(잡 없음).

- [ ] **Step 6: 잡 구현**

`backend/src/main/java/com/duing/global/file/purge/UploadPurgeJob.java`:

```java
package com.duing.global.file.purge;

import com.duing.global.file.FileStorageService;
import com.duing.global.file.entity.UploadedObject;
import com.duing.global.file.entity.UploadedObjectStatus;
import com.duing.global.file.repository.UploadedObjectRepository;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 업로드 고아 객체 정리 잡(#791, 스펙 §4). 업로드 후 {@code window}(기본 24시간)가 지나도록 어떤 엔티티에도
 * 연결되지 않은(PENDING) 객체와, 이전 실행에서 claim 했지만 삭제가 확정되지 않은(PURGING) 객체를 매시 최대
 * {@value #BATCH_LIMIT}건 처리한다.
 *
 * <p>후보마다: 참조 스캔 안전망(§4.3) → dry-run 이면 로그만 → 참조가 남아 있으면 ACTIVE 로 치유(WARN) →
 * claim(잠금 조회 + 상태 술어, 그 사이 attach 가 이겼으면 skip) → 스토리지 delete(트랜잭션 밖) → 확정 시 PURGED.
 * 미확정(false·예외)은 PURGING 으로 남겨 다음 실행이 재시도한다. 개별 실패는 다음 후보로 계속 진행한다.
 *
 * <p>중복 실행 가드는 두지 않는다 — 스케줄러는 기본 단일 스레드이고, 겹치더라도 claim 이 행 잠금+술어로
 * 직렬화되며 스토리지 delete 는 멱등이라 결과가 같다(§4.1).
 *
 * <p>로그 정책(§4.2): objectKey·uploadedAt·deletedAt·reason 만. 파일명·내용·업로더는 남기지 않는다.
 */
@Slf4j
@Component
public class UploadPurgeJob {

    static final int BATCH_LIMIT = 500;
    private static final List<UploadedObjectStatus> CANDIDATE_STATUSES =
            List.of(UploadedObjectStatus.PENDING, UploadedObjectStatus.PURGING);

    private final UploadPurgeProperties properties;
    private final Clock clock;
    private final UploadedObjectRepository uploadedObjectRepository;
    private final FileStorageService fileStorageService;
    private final TransactionTemplate transactionTemplate;

    public UploadPurgeJob(
            UploadPurgeProperties properties,
            Clock clock,
            UploadedObjectRepository uploadedObjectRepository,
            FileStorageService fileStorageService,
            PlatformTransactionManager platformTransactionManager) {
        this.properties = properties;
        this.clock = clock;
        this.uploadedObjectRepository = uploadedObjectRepository;
        this.fileStorageService = fileStorageService;
        this.transactionTemplate = new TransactionTemplate(platformTransactionManager);
    }

    @Scheduled(cron = "0 20 * * * *", zone = "Asia/Seoul")
    public void run() {
        if (!properties.enabled()) {
            return;
        }
        Duration window = properties.window();
        if (window == null || window.isZero() || window.isNegative()) {
            // 유예가 0 이면 방금 올린(아직 폼 제출 전인) 업로드까지 즉시 파기된다 — 오설정 시 실행하지 않는다.
            log.error("[업로드 고아 정리] 유예(window={})가 유효하지 않아 실행을 건너뜁니다.", window);
            return;
        }
        Instant cutoff = Instant.now(clock).minus(window);
        boolean deleteEnabled = properties.deleteEnabled();
        List<UploadedObject> candidates = uploadedObjectRepository.findPurgeCandidates(
                CANDIDATE_STATUSES, cutoff, PageRequest.of(0, BATCH_LIMIT));

        Counters counters = new Counters();
        for (UploadedObject candidate : candidates) {
            processCandidate(candidate, deleteEnabled, counters);
        }
        log.info("[업로드 고아 정리] mode={}, candidates={}, purged={}, healed={}, activatedMeanwhile={}, deleteFailed={}, "
                        + "referencedInDryRun={}, cutoff={}",
                deleteEnabled ? "delete" : "dry-run", candidates.size(), counters.purged, counters.healed,
                counters.activatedMeanwhile, counters.deleteFailed, counters.referencedInDryRun, cutoff);
    }

    private void processCandidate(UploadedObject candidate, boolean deleteEnabled, Counters counters) {
        String storageKey = candidate.getStorageKey();
        boolean referenced = uploadedObjectRepository.isReferenced(storageKey);

        if (!deleteEnabled) {
            log.info("[업로드 고아 정리][dry-run] objectKey={}, purpose={}, uploadedAt={}, referenced={}",
                    storageKey, candidate.getPurpose(), candidate.getUploadedAt(), referenced);
            if (referenced) {
                counters.referencedInDryRun++;
                log.warn("[업로드 고아 정리][dry-run] 참조가 남아 있는 후보 — 활성화 지점 누락 의심: objectKey={}, purpose={}",
                        storageKey, candidate.getPurpose());
            }
            return;
        }

        if (referenced) {
            boolean healed = Boolean.TRUE.equals(transactionTemplate.execute(status ->
                    uploadedObjectRepository.findByIdForUpdate(candidate.getId())
                            .filter(UploadedObject::isPurgeCandidate)
                            .map(locked -> { locked.restoreActive(Instant.now(clock)); return true; })
                            .orElse(false)));
            if (healed) {
                counters.healed++;
                log.warn("[업로드 고아 정리] 참조가 남아 있어 삭제하지 않고 ACTIVE 로 치유 — 활성화 지점 누락 의심: objectKey={}, purpose={}",
                        storageKey, candidate.getPurpose());
            }
            return;
        }

        boolean claimed = Boolean.TRUE.equals(transactionTemplate.execute(status ->
                uploadedObjectRepository.findByIdForUpdate(candidate.getId())
                        .filter(UploadedObject::isPurgeCandidate)
                        .map(locked -> { locked.markPurging(); return true; })
                        .orElse(false)));
        if (!claimed) {
            counters.activatedMeanwhile++; // 후보 조회와 claim 사이에 attach 가 이겼다
            return;
        }

        if (!deleteFromStorage(storageKey)) {
            counters.deleteFailed++; // PURGING 유지 → 다음 실행 재시도
            return;
        }

        Instant deletedAt = Instant.now(clock);
        transactionTemplate.executeWithoutResult(status ->
                uploadedObjectRepository.findByIdForUpdate(candidate.getId())
                        .filter(locked -> locked.getStatus() == UploadedObjectStatus.PURGING)
                        .ifPresent(locked -> locked.markPurged(deletedAt)));
        counters.purged++;
        log.info("[업로드 고아 정리] objectKey={}, uploadedAt={}, deletedAt={}, reason=ORPHAN_OBJECT",
                storageKey, candidate.getUploadedAt(), deletedAt);
    }

    // FileStorageService 구현은 예외를 삼키고 boolean 만 돌려주는 best-effort 의미론 — false 와 (방어적으로) 예외
    // 둘 다 "삭제 미확정" 으로 수렴시킨다. 확정 없이 PURGED 로 넘기면 일시 장애에도 객체가 영구 고아가 된다.
    private boolean deleteFromStorage(String storageKey) {
        try {
            return fileStorageService.delete(fileStorageService.toFileUrl(storageKey));
        } catch (Exception storageDeleteFailure) {
            log.warn("[업로드 고아 정리] 스토리지 삭제 실패로 PURGING 유지(다음 실행 재시도) - objectKey={}",
                    storageKey, storageDeleteFailure);
            return false;
        }
    }

    private static final class Counters {
        int purged;
        int healed;
        int activatedMeanwhile;
        int deleteFailed;
        int referencedInDryRun;
    }
}
```

- [ ] **Step 7: 통과 확인**

Run: `cd /Users/ksy/orca/workspaces/Duing/emperor/backend && ./gradlew test --tests "com.duing.global.file.purge.*"`
Expected: BUILD SUCCESSFUL, 9 tests PASS.

- [ ] **Step 8: 커밋**

```bash
cd /Users/ksy/orca/workspaces/Duing/emperor && git add backend/src/main/java/com/duing/global/file/purge backend/src/main/resources/application.yml backend/src/main/resources/application-prod.yml backend/src/test/resources/application.yml backend/src/test/java/com/duing/global/file/purge
git commit -m "feat(backend): 업로드 고아 정리 잡 — 매시 후보 500건 참조 스캔·claim·스토리지 삭제·PURGED, dry-run 기본(prod 실삭제 꺼짐)"
```

---

### Task 9: 활성화 ↔ 파기 동시성 테스트

**Files:**
- Test: `backend/src/test/java/com/duing/global/file/purge/UploadActivationPurgeConcurrencyTest.java`

- [ ] **Step 1: 테스트 작성**

```java
package com.duing.global.file.purge;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.global.file.FileStorageService;
import com.duing.global.file.UploadedObjectService;
import com.duing.global.file.controller.dto.FilePurpose;
import com.duing.global.file.entity.UploadedObject;
import com.duing.global.file.entity.UploadedObjectStatus;
import com.duing.global.file.exception.FileException;
import com.duing.global.file.repository.UploadedObjectRepository;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.RepeatedTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 활성화(attach) ↔ 파기 잡 claim 경쟁(스펙 §0-5·§4.1). 두 스레드를 latch 로 동시에 시작시키고 순서 무관 불변식을
 * 단언한다(ClubHeroActivityPhotoDeleteConcurrencyTest 전례). 활성화 스레드는 도메인 서비스처럼 TransactionTemplate
 * 안에서 활성화한다 — 잠금이 커밋까지 유지되는 실제 조건을 재현하기 위해서다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class UploadActivationPurgeConcurrencyTest extends IntegrationTestBase {

    private static final String STUB_PREFIX = "/files/stub/";

    @Autowired UploadedObjectService uploadedObjectService;
    @Autowired UploadedObjectRepository uploadedObjectRepository;
    @Autowired Clock clock;
    @Autowired PlatformTransactionManager platformTransactionManager;
    @MockitoBean FileStorageService fileStorageService;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());
    private ExecutorService executor;

    @AfterEach
    void tearDown() {
        if (executor != null) {
            executor.shutdownNow();
        }
    }

    private void stubStorage() {
        // @MockitoBean 이 StubFileStorageService 를 대체하므로 toStorageKey/toFileUrl 대칭을 직접 준다.
        when(fileStorageService.toStorageKey(anyString())).thenAnswer(invocation -> {
            String url = invocation.getArgument(0, String.class);
            return url.startsWith(STUB_PREFIX) ? url.substring(STUB_PREFIX.length()) : null;
        });
        when(fileStorageService.toFileUrl(anyString()))
                .thenAnswer(invocation -> STUB_PREFIX + invocation.getArgument(0, String.class));
        when(fileStorageService.delete(anyString())).thenReturn(true);
    }

    private UploadPurgeJob deleteEnabledJob() {
        return new UploadPurgeJob(new UploadPurgeProperties(true, true, Duration.ofHours(24)),
                clock, uploadedObjectRepository, fileStorageService, platformTransactionManager);
    }

    private String seedExpiredPending() {
        String storageKey = "club/logo/" + sequence.incrementAndGet() + ".jpg";
        uploadedObjectRepository.save(UploadedObject.pending(storageKey, FilePurpose.LOGO, 1L,
                Instant.now(clock).minus(25, ChronoUnit.HOURS)));
        return storageKey;
    }

    private UploadedObjectStatus statusOf(String storageKey) {
        return uploadedObjectRepository.findByStorageKey(storageKey).orElseThrow().getStatus();
    }

    @RepeatedTest(10)
    @DisplayName("25시간 지난 PENDING 에 활성화와 파기 잡이 동시에 달려들어도 '삭제된 객체를 가리키는 ACTIVE' 는 생기지 않는다")
    void activationVersusPurgeNeverLeavesActiveOnDeletedObject() throws Exception {
        stubStorage();
        String storageKey = seedExpiredPending();
        TransactionTemplate transactionTemplate = new TransactionTemplate(platformTransactionManager);

        List<Throwable> failures = runConcurrently(
                () -> transactionTemplate.executeWithoutResult(status ->
                        uploadedObjectService.activate(STUB_PREFIX + storageKey)),
                () -> deleteEnabledJob().run());

        UploadedObjectStatus finalStatus = statusOf(storageKey);
        if (finalStatus == UploadedObjectStatus.ACTIVE) {
            // 활성화가 이겼다 — 잡은 claim 에서 ACTIVE 를 보고 건너뛰어야 하며 스토리지는 손대지 않는다.
            assertThat(failures).isEmpty();
            verify(fileStorageService, never()).delete(anyString());
        } else {
            // 잡이 이겼다 — 활성화는 PURGING/PURGED 를 보고 만료 예외로 실패해야 한다.
            assertThat(finalStatus).isEqualTo(UploadedObjectStatus.PURGED);
            assertThat(failures).hasSize(1);
            assertThat(failures.get(0)).isInstanceOf(FileException.UploadExpiredException.class);
            verify(fileStorageService, times(1)).delete(anyString());
        }
    }

    @Test
    @DisplayName("잡이 먼저 claim(PURGING)한 업로드를 뒤늦게 연결하면 만료 예외가 나고 상태는 그대로다")
    void activationAfterClaimFails() {
        stubStorage();
        String storageKey = seedExpiredPending();
        UploadedObject claimed = uploadedObjectRepository.findByStorageKey(storageKey).orElseThrow();
        claimed.markPurging();
        uploadedObjectRepository.save(claimed);

        assertThatThrownBy(() -> uploadedObjectService.activate(STUB_PREFIX + storageKey))
                .isInstanceOf(FileException.UploadExpiredException.class);
        assertThat(statusOf(storageKey)).isEqualTo(UploadedObjectStatus.PURGING);
    }

    @Test
    @DisplayName("먼저 연결(ACTIVE)된 업로드는 25시간이 지났어도 잡이 건드리지 않는다")
    void purgeSkipsAlreadyActivated() {
        stubStorage();
        String storageKey = seedExpiredPending();
        uploadedObjectService.activate(STUB_PREFIX + storageKey);

        deleteEnabledJob().run();

        assertThat(statusOf(storageKey)).isEqualTo(UploadedObjectStatus.ACTIVE);
        verify(fileStorageService, never()).delete(anyString());
    }

    private List<Throwable> runConcurrently(Runnable firstTask, Runnable secondTask) throws InterruptedException {
        CountDownLatch start = new CountDownLatch(1);
        CountDownLatch done = new CountDownLatch(2);
        List<Throwable> failures = new CopyOnWriteArrayList<>();
        executor = Executors.newFixedThreadPool(2);
        for (Runnable task : List.of(firstTask, secondTask)) {
            executor.submit(() -> {
                try {
                    start.await();
                    task.run();
                } catch (Throwable failure) {
                    failures.add(failure);
                } finally {
                    done.countDown();
                }
            });
        }
        start.countDown();
        // 교착이 생기면 이 대기가 끝나지 않는다 — uploaded_object 단일 행 잠금 규칙의 회귀 감시 지점.
        assertThat(done.await(15, TimeUnit.SECONDS)).as("두 트랜잭션이 교착 없이 완료").isTrue();
        return failures;
    }
}
```

- [ ] **Step 2: 실행**

Run: `cd /Users/ksy/orca/workspaces/Duing/emperor/backend && ./gradlew test --tests "com.duing.global.file.purge.UploadActivationPurgeConcurrencyTest"`
Expected: BUILD SUCCESSFUL, 12 tests PASS(반복 10 + 2). 반복 중 두 분기가 모두 관측되는지는 보장하지 않지만 불변식은 항상 성립해야 한다.

- [ ] **Step 3: 전체 백엔드 테스트**

Run: `cd /Users/ksy/orca/workspaces/Duing/emperor/backend && ./gradlew test > /private/tmp/claude-501/-Users-ksy-orca-workspaces-Duing-emperor/005adf52-c123-4270-af6f-b83e3fc2e5bc/scratchpad/full-test.log 2>&1; echo "exit=$?"; grep -E "BUILD (SUCCESSFUL|FAILED)|tests completed" /private/tmp/claude-501/-Users-ksy-orca-workspaces-Duing-emperor/005adf52-c123-4270-af6f-b83e3fc2e5bc/scratchpad/full-test.log`
Expected: `BUILD SUCCESSFUL`, exit=0. (`joinCodes` 계열 간헐 플래키가 있으면 해당 클래스만 재실행해 통과 확인.)

- [ ] **Step 4: 커밋**

```bash
cd /Users/ksy/orca/workspaces/Duing/emperor && git add backend/src/test/java/com/duing/global/file/purge/UploadActivationPurgeConcurrencyTest.java
git commit -m "test(backend): 업로드 활성화 ↔ 파기 잡 경쟁 — 실스레드 순서 무관 불변식·claim 후 만료·선활성화 스킵"
```

---

### Task 10 (컨트롤러 전용): 전체 브랜치 리뷰 → self-check → PR

구현 subagent 는 이 태스크를 실행하지 않는다.

- [ ] whole-branch 리뷰(fork) — 권한/상태전이/동시성/데이터무결성 공격 관점 포함
- [ ] self-check 7항목(빌드·범위·타 영역 영향·리뷰 완료·플랜 체크박스·attribution 없음·EOF newline)
- [ ] PR 본문(🚀/🤔/💬) — "PURGED 행 보존" 이슈 문구 편차, 참조 스캔 안전망 추가, 2차 릴리스 전환 절차, FE 무변경 명시
- [ ] push + `gh pr create` — 머지는 사용자 지시 대기

---

## Self-Review (작성 후 점검)

- **스펙 커버리지**: §2 → Task 1 / §3.1 → Task 3 / §3.2·3.3 → Task 2 / §3.4 9경로 → Task 4~7(LOGO·COVER·PHOTO / NOTICE_COVER·NOTICE_BODY ×4 / PROMOTION_BANNER·PROMOTION_REQUEST_BANNER·GLOBAL_EVENT_COVER / FEDERATION_INQUIRY) / §4·§5 → Task 8 / §6 → Task 2 + Task 4 HTTP 계약 / §8 테스트 6종 → Task 1·2·3·4~7·8·9 / §7 FE 무변경 / §9 Out of Scope 준수.
- **타입 정합**: `UploadedObject.pending(String, FilePurpose, Long, Instant)`, `activate(Instant)`, `restoreActive(Instant)`, `markPurging()`, `markPurged(Instant)`, `isPurgeCandidate()`; `UploadedObjectRepository.findPurgeCandidates(Collection<UploadedObjectStatus>, Instant, Pageable)`, `isReferenced(String)`; `UploadedObjectService.activate(String...)`, `activateReferencedIn(String)`, `recordUpload(String, FilePurpose, Long)`; `UploadPurgeJob(UploadPurgeProperties, Clock, UploadedObjectRepository, FileStorageService, PlatformTransactionManager)` — 전 태스크 동일.
- **플레이스홀더**: 없음. `ApiResponse.message`·`GlobalEvent.update` 부분 갱신·`ClubPhotoRepository.findByClubId` 는 소스로 확인했다.
