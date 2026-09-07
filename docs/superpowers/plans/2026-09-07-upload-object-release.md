# 교체·삭제된 업로드 객체 해제(RELEASED) 구현 플랜 — #1153

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 수정으로 교체·비워지거나 엔티티가 삭제·폐쇄돼 더는 참조되지 않는 업로드 객체를 ACTIVE 에서 RELEASED 로 내려 기존 파기 잡(#791)이 유예 뒤 지우게 한다.

**Architecture:** `uploaded_object` 에 상태 `RELEASED` 와 `released_at` 을 추가하고(V125), `UploadedObjectService` 에 해제 API 3개(`release`·`releaseIfReplaced`·`releaseRemovedFrom`)를 둔다. 이미지 URL 을 교체·비우기·삭제하는 도메인 쓰기 메서드 11곳이 활성화 뒤에 해제를 호출한다. 파기 잡은 RELEASED 를 두 번째 후보 쿼리(`released_at` 기준)로 집고, 참조 스캔은 이 작업이 삭제를 다루는 5개 테이블의 soft-delete 행을 참조에서 뺀다. 아직 참조가 남은 RELEASED 는 경고 없이 ACTIVE 로 복구된다.

**Tech Stack:** Spring Boot 3.4 / Java 21, Spring Data JPA(PESSIMISTIC_WRITE 잠금 조회), Flyway, PostgreSQL(Testcontainers), Mockito `@MockitoBean`/`@MockitoSpyBean`, Spring Boot `OutputCaptureExtension`.

**Spec:** `docs/superpowers/specs/2026-09-07-upload-object-release-design.md` (이 플랜은 그 스펙의 §2~§7 을 구현한다. 선행 스펙 `docs/superpowers/specs/2026-09-03-orphan-upload-purge-design.md`).

## Global Constraints

- 브랜치 `feat/1153-upload-object-release` 는 `refactor/1154-file-purpose-package` 위에 스택돼 있다 — `FilePurpose` 는 `com.duing.global.file.FilePurpose` 다(`controller.dto` 아님).
- 마이그레이션은 **V125** 하나(`V125__uploaded_object_released_at.sql`), additive, `IF NOT EXISTS`. develop 에 V124 가 이미 있다. 기존 마이그레이션은 절대 수정하지 않는다.
- 모든 상태 전이는 **잠금 조회(`findByStorageKeyForUpdate`/`findByIdForUpdate`) + 엔티티 전이 메서드**. 벌크 JPQL UPDATE 금지. 잠금 조회는 그 tx 안에서 `UploadedObject` 의 유일한 첫 조회여야 한다.
- 도메인 서비스의 호출 순서는 **activate → release**(새 값 먼저 확정). 해제는 도메인 tx 안(REQUIRES_NEW 금지).
- `releaseIfReplaced` 의 비교는 **스토리지 키 기준**(URL 문자열 비교 아님). 비우기가 `null` 이든 `""` 이든 해제로 수렴한다.
- 참조 스캔에서 soft-delete 행을 제외하는 테이블은 `club`·`club_photo`(+소속 club)·`notice`·`promotion`·`global_event` **다섯 곳뿐**. `promotion_request`·`federation_inquiry_attachment` 는 그대로.
- 로그 정책: objectKey·status·purpose·uploadedAt·releasedAt·deletedAt·reason 만. 업로더·파일명·내용 금지.
- "표본이 절단됨" WARN 은 **PENDING·PURGING 쿼리가 500 을 채운 경우에만**. RELEASED 가 남은 한도를 채운 경우는 INFO.
- 시각 필드는 전부 `Instant`(TIMESTAMPTZ). `Instant.now(clock)` 사용(주입된 `Clock`).
- 테스트는 `IntegrationTestBase`(매 테스트 전 TRUNCATE) + `@Import(TestcontainersConfiguration.class) @SpringBootTest` 관례. 스토리지는 test 프로파일 `StubFileStorageService`(URL 프리픽스 `/files/stub/`) — 잡·동시성 테스트만 `@MockitoBean FileStorageService`.
- Gradle 은 반드시 `backend/` 에서 실행한다. 출력에 `| tail` 을 붙이지 않는다. `--no-verify` 금지.
- 커밋: Conventional Commits + 한국어 명사구 제목(`type(scope): 대상 — 변경점`). **Co-Authored-By·"Generated with" 등 attribution 라인 절대 금지.** 파일 끝 개행 필수.
- **push·PR 생성·머지는 절대 하지 마라** — 컨트롤러가 리뷰 뒤 수행한다.
- 변수명은 역할이 드러나게(`dto`/`r`/`e`/`data`/`res` 금지). 의사코드·미완성 코드 금지.

---

## 파일 구조

| 파일 | 역할 |
|---|---|
| `backend/src/main/resources/db/migration/V125__uploaded_object_released_at.sql` | `released_at` 열 + `(status, released_at)` 인덱스 (Task 1) |
| `backend/src/main/java/com/duing/global/file/entity/UploadedObjectStatus.java` | `RELEASED` 추가 (Task 1) |
| `backend/src/main/java/com/duing/global/file/entity/UploadedObject.java` | `releasedAt`, `release`, 전이 전제조건 확장 (Task 1) |
| `backend/src/main/java/com/duing/global/file/repository/UploadedObjectRepository.java` | `findReleasedCandidates`, `isReferenced` soft-delete 제외 (Task 2) |
| `backend/src/main/java/com/duing/global/file/UploadedObjectService.java` | 해제 API 3개, RELEASED 재활성화 (Task 3) |
| `backend/src/main/java/com/duing/global/file/FilePurpose.java` | 유지 규칙 javadoc 에 해제 지점 추가 (Task 3) |
| `backend/src/main/java/com/duing/global/file/purge/UploadPurgeJob.java` | 두 번째 후보 쿼리, RELEASED 복구 INFO, 집계 (Task 4) |
| `backend/src/main/resources/application-prod.yml` | 운영 주석 1문장 (Task 4) |
| `backend/src/main/java/com/duing/domain/club/service/GeneralClubService.java` | 로고·커버 교체 해제 (Task 5) |
| `backend/src/main/java/com/duing/domain/club/photo/service/GeneralClubPhotoService.java` | 사진 삭제 해제 (Task 5) |
| `backend/src/main/java/com/duing/domain/club/service/GeneralClubClosureService.java` | 폐쇄 시 로고·커버·사진 해제 (Task 5) |
| `backend/src/main/java/com/duing/domain/notice/service/GeneralNoticeService.java` | 수정·삭제 4경로 해제 (Task 6) |
| `backend/src/main/java/com/duing/domain/promotion/service/GeneralPromotionService.java` | 수정·삭제·폐쇄 일괄 해제 (Task 7) |
| `backend/src/main/java/com/duing/domain/globalevent/service/GeneralGlobalEventService.java` | 수정·삭제 해제 (Task 7) |
| 테스트 | `UploadedObjectTest`(1) · `UploadedObjectRepositoryTest`(2) · `UploadedObjectServiceTest`(3) · `UploadPurgeJobTest`(4) · `ClubUploadActivationTest`(5) · `NoticeUploadActivationTest`(6) · `PromotionUploadActivationTest`·`GlobalEventUploadActivationTest`(7) · `UploadActivationPurgeConcurrencyTest`(8) |

---

### Task 1: 엔티티 상태 RELEASED · released_at · V125

**Files:**
- Create: `backend/src/main/resources/db/migration/V125__uploaded_object_released_at.sql`
- Modify: `backend/src/main/java/com/duing/global/file/entity/UploadedObjectStatus.java`
- Modify: `backend/src/main/java/com/duing/global/file/entity/UploadedObject.java`
- Test: `backend/src/test/java/com/duing/global/file/entity/UploadedObjectTest.java`

**Interfaces:**
- Produces: `UploadedObjectStatus.RELEASED`; `UploadedObject.release(Instant now)`(ACTIVE 에서만) ; `getReleasedAt()`; `activate(Instant)` 가 PENDING·RELEASED 허용(+`releasedAt=null`); `restoreActive(Instant)` 가 PENDING·PURGING·RELEASED 허용(+`releasedAt=null`); `markPurging()` 가 RELEASED 허용; `isPurgeCandidate()` 에 RELEASED 포함.

- [ ] **Step 1: 실패하는 테스트 작성**

`UploadedObjectTest` 상수 두 개를 추가하고(기존 `UPLOADED_AT`·`LATER` 아래), 헬퍼와 테스트 4개를 추가한다. 기존 `activateRejectsNonPending` 의 `@DisplayName` 은 `"연결(activate)은 PENDING·RELEASED 에서만 허용되며 PURGING 객체를 되살리지 못한다 (TOCTOU 계약)"` 로 바꾼다(본문 그대로).

```java
    private static final Instant RELEASED_AT = Instant.parse("2026-09-03T00:00:00Z");
    private static final Instant EVEN_LATER = Instant.parse("2026-09-04T00:00:00Z");

    private UploadedObject active() {
        UploadedObject uploadedObject = pending();
        uploadedObject.activate(LATER);
        return uploadedObject;
    }

    @Test
    @DisplayName("ACTIVE 객체를 해제(release)하면 RELEASED 가 되어 파기 후보가 되고 해제 시각이 기록된다")
    void releasesFromActive() {
        UploadedObject uploadedObject = active();

        uploadedObject.release(RELEASED_AT);

        assertThat(uploadedObject.getStatus()).isEqualTo(UploadedObjectStatus.RELEASED);
        assertThat(uploadedObject.getReleasedAt()).isEqualTo(RELEASED_AT);
        assertThat(uploadedObject.isPurgeCandidate()).isTrue();
    }

    @Test
    @DisplayName("해제(release)는 ACTIVE 에서만 허용된다 — PENDING·PURGING·PURGED 는 거부")
    void releaseRejectsNonActive() {
        UploadedObject purging = pending();
        purging.markPurging();
        UploadedObject purged = pending();
        purged.markPurging();
        purged.markPurged(LATER);

        assertThatThrownBy(() -> pending().release(RELEASED_AT)).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> purging.release(RELEASED_AT)).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> purged.release(RELEASED_AT)).isInstanceOf(IllegalStateException.class);
    }

    @Test
    @DisplayName("RELEASED 객체를 다시 연결(activate)하면 ACTIVE 로 돌아오고 해제 시각이 비워진다 (편집 되돌리기)")
    void reactivatesFromReleased() {
        UploadedObject uploadedObject = active();
        uploadedObject.release(RELEASED_AT);

        uploadedObject.activate(EVEN_LATER);

        assertThat(uploadedObject.getStatus()).isEqualTo(UploadedObjectStatus.ACTIVE);
        assertThat(uploadedObject.getActivatedAt()).isEqualTo(EVEN_LATER);
        assertThat(uploadedObject.getReleasedAt()).isNull();
        assertThat(uploadedObject.isPurgeCandidate()).isFalse();
    }

    @Test
    @DisplayName("RELEASED 객체는 잡이 claim(markPurging)할 수 있고, 안전망 치유(restoreActive)도 해제 시각을 비운다")
    void releasedIsClaimableAndRestorable() {
        UploadedObject claimed = active();
        claimed.release(RELEASED_AT);
        claimed.markPurging();
        assertThat(claimed.getStatus()).isEqualTo(UploadedObjectStatus.PURGING);

        UploadedObject restored = active();
        restored.release(RELEASED_AT);
        restored.restoreActive(EVEN_LATER);
        assertThat(restored.getStatus()).isEqualTo(UploadedObjectStatus.ACTIVE);
        assertThat(restored.getReleasedAt()).isNull();
    }
```

- [ ] **Step 2: 실패 확인**

Run: `cd backend && ./gradlew test --tests "com.duing.global.file.entity.UploadedObjectTest"`
Expected: 컴파일 실패 — `RELEASED`·`release`·`getReleasedAt` 심볼 없음.

- [ ] **Step 3: 구현**

`UploadedObjectStatus.java` (javadoc 의 목록에 RELEASED 항목을 추가하고 상수 삽입 — 순서는 상태 흐름 순):

```java
/**
 * 업로드 객체 추적 상태(스펙 §2.1, #1153 으로 RELEASED 추가).
 * <ul>
 *   <li>PENDING — 업로드됐지만 아직 어떤 엔티티에도 연결되지 않음(파기 후보)</li>
 *   <li>ACTIVE — 엔티티에 연결됨</li>
 *   <li>RELEASED — 교체·비우기·삭제로 어떤 쓰기 경로가 참조를 놓음(파기 후보). 다시 연결되면 ACTIVE 로 돌아온다.
 *       비참조 보장이 아니다 — 최종 판정은 파기 잡의 참조 스캔</li>
 *   <li>PURGING — 파기 잡이 claim 함. 스토리지 삭제 미확정 상태로, 다음 실행이 재시도한다</li>
 *   <li>PURGED — 스토리지 삭제 확정(종단). 행은 보존한다</li>
 * </ul>
 */
public enum UploadedObjectStatus {
    PENDING,
    ACTIVE,
    RELEASED,
    PURGING,
    PURGED
}
```

`UploadedObject.java`:

1. 클래스 javadoc 두 번째 단락을 다음으로 교체:
```java
 * <p>전이 메서드는 전제조건별로 분리돼 있다(스펙 §2.1) — attach 활성화 {@link #activate} 는 PENDING·RELEASED 에서만
 * 성공해야 파기 잡이 claim 한 객체를 되살리지 못한다(TOCTOU 계약). 안전망 치유 {@link #restoreActive} 만
 * PURGING 을 되돌릴 수 있다. {@link #release} 는 ACTIVE 에서만 — 교체·삭제로 참조를 놓은 객체를 파기 후보로 내린다(#1153).
 * 허용되지 않는 상태에서의 호출은 프로그래밍 오류이므로 {@link IllegalStateException}.
```
2. `purgedAt` 필드 아래에 추가:
```java
    /** 교체·비우기·삭제로 해제된 시각(#1153) — RELEASED 후보의 유예 기준. 다시 연결되면 비운다. */
    @Column(name = "released_at")
    private Instant releasedAt;
```
3. 전이 메서드 교체:
```java
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
```
4. `isPurgeCandidate`:
```java
    /** 파기 후보 상태(PENDING·PURGING·RELEASED)인지 — 잡의 claim·치유 술어. */
    public boolean isPurgeCandidate() {
        return status == UploadedObjectStatus.PENDING
                || status == UploadedObjectStatus.PURGING
                || status == UploadedObjectStatus.RELEASED;
    }
```

`V125__uploaded_object_released_at.sql`:
```sql
-- #1153 교체·삭제로 해제된(RELEASED) 업로드 객체의 해제 시각. 상태 값 RELEASED 는 VARCHAR(20) 컬럼이라 DDL 이 필요 없다.
ALTER TABLE uploaded_object ADD COLUMN IF NOT EXISTS released_at TIMESTAMP WITH TIME ZONE;
-- 해제 후보 스캔(status = 'RELEASED' AND released_at < cutoff ORDER BY id) 전용. PENDING 쪽은 기존 (status, uploaded_at).
CREATE INDEX IF NOT EXISTS idx_uploaded_object_status_released_at ON uploaded_object (status, released_at);
```

- [ ] **Step 4: 통과 확인 + 스키마 검증**

Run: `cd backend && ./gradlew test --tests "com.duing.global.file.entity.UploadedObjectTest" --tests "com.duing.global.file.repository.UploadedObjectRepositoryTest"`
Expected: BUILD SUCCESSFUL. 리포지토리 테스트는 컨텍스트 기동(Flyway V125 적용 + `ddl-auto: validate`)으로 새 열이 매핑과 맞음을 검증한다 — 기동 실패하면 열 이름·타입을 확인한다.

- [ ] **Step 5: 커밋**

```bash
git add backend/src/main/resources/db/migration/V125__uploaded_object_released_at.sql backend/src/main/java/com/duing/global/file/entity backend/src/test/java/com/duing/global/file/entity
git commit -m "feat(backend): 업로드 추적 — RELEASED 상태·released_at(V125)·해제/재연결 전이"
```

---

### Task 2: 리포지토리 — 해제 후보 조회 · 참조 스캔 soft-delete 제외

**Files:**
- Modify: `backend/src/main/java/com/duing/global/file/repository/UploadedObjectRepository.java`
- Test: `backend/src/test/java/com/duing/global/file/repository/UploadedObjectRepositoryTest.java`

**Interfaces:**
- Consumes: Task 1 의 `UploadedObjectStatus.RELEASED`, `UploadedObject.release(Instant)`.
- Produces: `List<UploadedObject> findReleasedCandidates(Instant cutoff, Pageable pageable)`; `isReferenced(String)` 의 soft-delete 제외 의미론(5 테이블).

- [ ] **Step 1: 실패하는 테스트 작성**

`UploadedObjectRepositoryTest` 에 import 추가:
```java
import com.duing.common.fixture.UserFixture; // 이미 있음
import com.duing.domain.globalevent.entity.GlobalEvent;
import com.duing.domain.globalevent.entity.GlobalEventCategory;
import com.duing.domain.globalevent.repository.GlobalEventRepository;
import com.duing.domain.promotion.entity.Promotion;
import com.duing.domain.promotion.entity.PromotionPalette;
import com.duing.domain.promotion.entity.PromotionRenderMode;
import com.duing.domain.promotion.entity.PromotionRequest;
import com.duing.domain.promotion.repository.PromotionRepository;
import com.duing.domain.promotion.repository.PromotionRequestRepository;
import java.time.LocalDateTime;
```
필드 추가:
```java
    @Autowired PromotionRepository promotionRepository;
    @Autowired PromotionRequestRepository promotionRequestRepository;
    @Autowired GlobalEventRepository globalEventRepository;
```
`save` 헬퍼에 RELEASED 분기를 추가하고, 해제 시각을 따로 받는 헬퍼를 둔다:
```java
    private UploadedObject save(String storageKey, UploadedObjectStatus status, Instant uploadedAt) {
        UploadedObject uploadedObject = UploadedObject.pending(storageKey, FilePurpose.LOGO, 1L, uploadedAt);
        if (status == UploadedObjectStatus.ACTIVE) uploadedObject.activate(uploadedAt);
        if (status == UploadedObjectStatus.RELEASED) { uploadedObject.activate(uploadedAt); uploadedObject.release(uploadedAt); }
        if (status == UploadedObjectStatus.PURGING) uploadedObject.markPurging();
        if (status == UploadedObjectStatus.PURGED) { uploadedObject.markPurging(); uploadedObject.markPurged(uploadedAt); }
        return uploadedObjectRepository.save(uploadedObject);
    }

    private UploadedObject saveReleased(String storageKey, Instant uploadedAt, Instant releasedAt) {
        UploadedObject uploadedObject = UploadedObject.pending(storageKey, FilePurpose.LOGO, 1L, uploadedAt);
        uploadedObject.activate(uploadedAt);
        uploadedObject.release(releasedAt);
        return uploadedObjectRepository.save(uploadedObject);
    }
```
기존 `findsPurgeCandidatesByStatusCutoffOrderAndLimit` 의 seed 목록에 한 줄을 추가(`thirdOld` 앞): `save(uniqueKey("club/logo"), UploadedObjectStatus.RELEASED, old);` — 단언은 그대로(RELEASED 는 기존 후보 조회에 나오면 안 된다).

새 테스트:
```java
    @Test
    @DisplayName("해제 후보 조회는 released_at 이 cutoff 이전인 RELEASED 만 id 오름차순으로, 상한까지 돌려준다 (uploaded_at 은 무관)")
    void findsReleasedCandidatesByReleasedAtCutoff() {
        Instant old = now.minus(25, ChronoUnit.HOURS);
        Instant recent = now.minus(1, ChronoUnit.HOURS);
        Instant longAgo = now.minus(30, ChronoUnit.DAYS);
        UploadedObject releasedOld = saveReleased(uniqueKey("club/logo"), longAgo, old);
        saveReleased(uniqueKey("club/logo"), longAgo, recent); // 오래전 업로드지만 방금 해제 — 유예 안
        save(uniqueKey("club/logo"), UploadedObjectStatus.PENDING, old); // 기존 후보 — 이 쿼리 대상 아님
        save(uniqueKey("club/logo"), UploadedObjectStatus.ACTIVE, longAgo);
        UploadedObject releasedOldSecond = saveReleased(uniqueKey("club/logo"), longAgo, old);

        Instant cutoff = now.minus(24, ChronoUnit.HOURS);
        List<UploadedObject> all = uploadedObjectRepository.findReleasedCandidates(cutoff, PageRequest.of(0, 500));
        List<UploadedObject> limited = uploadedObjectRepository.findReleasedCandidates(cutoff, PageRequest.of(0, 1));

        assertThat(all).extracting(UploadedObject::getId)
                .containsExactly(releasedOld.getId(), releasedOldSecond.getId());
        assertThat(limited).extracting(UploadedObject::getId).containsExactly(releasedOld.getId());
    }

    @Test
    @DisplayName("참조 스캔은 soft-delete 된 공지·홍보·전체 행사의 이미지를 참조로 세지 않는다")
    void ignoresSoftDeletedNoticePromotionAndGlobalEvent() {
        Long userId = userRepository.save(UserFixture.admin()).getId();
        String noticeCoverKey = uniqueKey("notice/cover");
        String bannerKey = uniqueKey("promotion/banner");
        String eventCoverKey = uniqueKey("global-event/cover");
        Notice notice = noticeRepository.save(Notice.create("제목", "요약", "<p>본문</p>",
                "https://files.example.com/" + noticeCoverKey, null, NoticeCategory.GENERAL, List.of(),
                NoticeVisibility.PUBLIC, null, false, null, false, null, null, null, null, null,
                NoticeContentFormat.HTML, userId));
        Promotion promotion = promotionRepository.save(Promotion.create(null, "배너",
                "https://files.example.com/" + bannerKey, "https://example.com", true, 1, userId,
                null, null, null, null, PromotionPalette.INK, null, null,
                PromotionRenderMode.SYSTEM_COMPOSED, null, null));
        LocalDateTime startAt = LocalDateTime.now().plusDays(7);
        GlobalEvent event = globalEventRepository.save(GlobalEvent.create("행사", "설명", startAt, startAt.plusHours(2),
                "장소", null, "https://files.example.com/" + eventCoverKey, GlobalEventCategory.FESTIVAL, userId));
        assertThat(uploadedObjectRepository.isReferenced(noticeCoverKey)).isTrue();
        assertThat(uploadedObjectRepository.isReferenced(bannerKey)).isTrue();
        assertThat(uploadedObjectRepository.isReferenced(eventCoverKey)).isTrue();

        noticeRepository.delete(notice);
        promotionRepository.delete(promotion);
        globalEventRepository.delete(event);

        assertThat(uploadedObjectRepository.isReferenced(noticeCoverKey)).isFalse();
        assertThat(uploadedObjectRepository.isReferenced(bannerKey)).isFalse();
        assertThat(uploadedObjectRepository.isReferenced(eventCoverKey)).isFalse();
    }

    @Test
    @DisplayName("참조 스캔은 soft-delete 된 사진과 폐쇄(soft-delete)된 동아리의 로고·살아 있는 사진을 참조로 세지 않는다")
    void ignoresSoftDeletedClubPhotoAndImagesOfDeletedClub() {
        String logoKey = uniqueKey("club/logo");
        String deletedPhotoKey = uniqueKey("club/photo");
        String survivingPhotoKey = uniqueKey("club/photo");
        Club club = clubRepository.save(Club.create("폐쇄클럽-" + sequence.incrementAndGet(), ClubCategory.ACADEMIC,
                null, "설명", "https://files.example.com/" + logoKey));
        ClubPhoto deletedPhoto = clubPhotoRepository.save(
                ClubPhoto.create(club, "/files/stub/" + deletedPhotoKey, null, null, null, 0));
        clubPhotoRepository.save(ClubPhoto.create(club, "/files/stub/" + survivingPhotoKey, null, null, null, 1));
        assertThat(uploadedObjectRepository.isReferenced(deletedPhotoKey)).isTrue();

        clubPhotoRepository.delete(deletedPhoto);
        assertThat(uploadedObjectRepository.isReferenced(deletedPhotoKey)).isFalse();
        assertThat(uploadedObjectRepository.isReferenced(logoKey)).isTrue();
        assertThat(uploadedObjectRepository.isReferenced(survivingPhotoKey)).isTrue();

        clubRepository.delete(club);
        assertThat(uploadedObjectRepository.isReferenced(logoKey)).isFalse();
        assertThat(uploadedObjectRepository.isReferenced(survivingPhotoKey)).isFalse();
    }

    @Test
    @DisplayName("참조 스캔은 soft-delete 된 문의 첨부와 홍보 요청의 제안 배너는 여전히 참조로 센다 (변경 없음 가드)")
    void keepsSoftDeletedAttachmentAndPromotionRequestReferenced() {
        Long userId = userRepository.save(UserFixture.unique()).getId();
        Club club = clubRepository.save(Club.create("요청클럽-" + sequence.incrementAndGet(), ClubCategory.ACADEMIC,
                null, "설명", null));
        FederationInquiry inquiry = federationInquiryRepository.save(FederationInquiry.create(userId, "제목", "내용"));
        String attachmentKey = uniqueKey("federation/inquiry");
        FederationInquiryAttachment attachment = federationInquiryAttachmentRepository.save(
                FederationInquiryAttachment.create(inquiry, attachmentKey, "첨부", "image/jpeg", 1024L, 0));
        String suggestedBannerKey = uniqueKey("promotion-request/banner");
        PromotionRequest request = promotionRequestRepository.save(PromotionRequest.create(club.getId(), userId,
                "타이틀", "설명", "https://files.example.com/" + suggestedBannerKey, "https://example.com"));

        federationInquiryAttachmentRepository.delete(attachment);
        promotionRequestRepository.delete(request);

        assertThat(uploadedObjectRepository.isReferenced(attachmentKey)).isTrue();
        assertThat(uploadedObjectRepository.isReferenced(suggestedBannerKey)).isTrue();
    }
```

- [ ] **Step 2: 실패 확인**

Run: `cd backend && ./gradlew test --tests "com.duing.global.file.repository.UploadedObjectRepositoryTest"`
Expected: 컴파일 실패(`findReleasedCandidates` 없음). 메서드를 임시로 추가해 돌리면 soft-delete 테스트 3개 중 2개가 `isFalse` 단언에서 실패해야 한다(현재 스캔은 soft-delete 행도 참조로 센다).

- [ ] **Step 3: 구현**

`UploadedObjectRepository.java` — `findPurgeCandidates` 아래에 추가:
```java
    List<UploadedObject> findByStatusAndReleasedAtBeforeOrderByIdAsc(UploadedObjectStatus status, Instant cutoff,
                                                                     Pageable pageable);

    /**
     * 해제 후보(#1153) — RELEASED 이면서 released_at 이 cutoff 이전인 행을 id 오름차순으로. 유예 기준이 uploaded_at 이
     * 아니라 released_at 이라 {@link #findPurgeCandidates} 와 별도 쿼리다 — 각자 (status, *_at) 인덱스를 그대로 탄다.
     */
    default List<UploadedObject> findReleasedCandidates(Instant cutoff, Pageable pageable) {
        return findByStatusAndReleasedAtBeforeOrderByIdAsc(UploadedObjectStatus.RELEASED, cutoff, pageable);
    }
```
`isReferenced` 의 javadoc 마지막 두 문장(`club_photo.storage_key 는 … soft-delete 된 행도 참조로 센다(보수적).`)을 다음으로 교체:
```java
     * club_photo.storage_key 는 실제로 URL 이 저장되지만(프론트가 응답 url 을 그대로 보냄) 키만 저장된
     * 과거 행도 있을 수 있어 둘 다 본다.
     *
     * <p>soft-delete 행: 이 스캔이 삭제 시 해제(#1153)를 다루는 다섯 곳(club·club_photo(+소속 club)·notice·promotion·
     * global_event)은 {@code deleted_at IS NULL} 만 참조로 센다 — 복구(undelete) 경로가 없는 테이블만이며, 복구 기능을
     * 붙이는 쪽이 이 조건을 되돌려야 한다. promotion_request(삭제 경로 없음)·federation_inquiry_attachment(보관기간까지
     * 첨부가 살아 있어야 함)는 soft-delete 행도 참조로 센다(보수적).
```
쿼리 교체:
```java
    @Query(value = """
            SELECT EXISTS (SELECT 1 FROM club WHERE deleted_at IS NULL
                           AND (logo_url LIKE '%/' || :key OR cover_url LIKE '%/' || :key))
                OR EXISTS (SELECT 1 FROM club_photo photo JOIN club owner ON owner.id = photo.club_id
                           WHERE photo.deleted_at IS NULL AND owner.deleted_at IS NULL
                           AND (photo.storage_key = :key OR photo.storage_key LIKE '%/' || :key))
                OR EXISTS (SELECT 1 FROM notice WHERE deleted_at IS NULL
                           AND (cover_image_url LIKE '%/' || :key OR content LIKE '%/' || :key || '%'))
                OR EXISTS (SELECT 1 FROM promotion WHERE deleted_at IS NULL AND banner_image_url LIKE '%/' || :key)
                OR EXISTS (SELECT 1 FROM promotion_request WHERE suggested_banner_image_url LIKE '%/' || :key)
                OR EXISTS (SELECT 1 FROM global_event WHERE deleted_at IS NULL AND cover_image_url LIKE '%/' || :key)
                OR EXISTS (SELECT 1 FROM federation_inquiry_attachment WHERE storage_key = :key)
            """, nativeQuery = true)
    boolean isReferenced(@Param("key") String storageKey);
```

- [ ] **Step 4: 통과 확인**

Run: `cd backend && ./gradlew test --tests "com.duing.global.file.repository.UploadedObjectRepositoryTest" --tests "com.duing.global.file.purge.UploadPurgeJobTest"`
Expected: BUILD SUCCESSFUL(기존 잡 테스트가 스캔 변경에 영향받지 않음도 확인).

- [ ] **Step 5: 커밋**

```bash
git add backend/src/main/java/com/duing/global/file/repository backend/src/test/java/com/duing/global/file/repository
git commit -m "feat(backend): 업로드 추적 리포지토리 — 해제 후보 조회(released_at)·참조 스캔 soft-delete 5테이블 제외"
```

---

### Task 3: 서비스 — 해제 API 3개 · RELEASED 재활성화

**Files:**
- Modify: `backend/src/main/java/com/duing/global/file/UploadedObjectService.java`
- Modify: `backend/src/main/java/com/duing/global/file/FilePurpose.java` (javadoc 만)
- Test: `backend/src/test/java/com/duing/global/file/UploadedObjectServiceTest.java`

**Interfaces:**
- Consumes: Task 1 전이 메서드.
- Produces:
  - `void release(String... fileUrls)` — 각 URL 을 키로 바꿔 ACTIVE 면 RELEASED. null·빈값·외부 URL·레거시·그 외 상태는 no-op.
  - `void releaseIfReplaced(String previousUrl, String currentUrl)` — `key(previous) != null && !key(previous).equals(key(current))` 이면 previous 해제.
  - `void releaseRemovedFrom(String previousContent, String currentContent)` — 이전 본문 키 − 현재 본문 키 해제. current null/blank 면 전부.
  - `activate(...)` 가 RELEASED 도 ACTIVE 로 되돌린다.

- [ ] **Step 1: 실패하는 테스트 작성**

`UploadedObjectServiceTest` 의 `seed` 헬퍼에 RELEASED 분기를 추가하고 헬퍼 하나를 더한다:
```java
    private UploadedObject seed(String storageKey, UploadedObjectStatus status) {
        UploadedObject uploadedObject = UploadedObject.pending(storageKey, FilePurpose.LOGO, 1L, Instant.now());
        if (status == UploadedObjectStatus.ACTIVE) uploadedObject.activate(Instant.now());
        if (status == UploadedObjectStatus.RELEASED) { uploadedObject.activate(Instant.now()); uploadedObject.release(Instant.now()); }
        if (status == UploadedObjectStatus.PURGING) uploadedObject.markPurging();
        if (status == UploadedObjectStatus.PURGED) { uploadedObject.markPurging(); uploadedObject.markPurged(Instant.now()); }
        return uploadedObjectRepository.save(uploadedObject);
    }

    private Instant releasedAtOf(String storageKey) {
        return uploadedObjectRepository.findByStorageKey(storageKey).orElseThrow().getReleasedAt();
    }
```
테스트 추가:
```java
    @Test
    @DisplayName("해제는 ACTIVE 만 RELEASED 로 내리고 PENDING·PURGING·PURGED·레거시·외부 URL·null 은 건드리지 않는다")
    void releasesActiveOnly() {
        String activeKey = uniqueKey(FilePurpose.LOGO);
        String pendingKey = uniqueKey(FilePurpose.LOGO);
        String purgingKey = uniqueKey(FilePurpose.LOGO);
        String purgedKey = uniqueKey(FilePurpose.LOGO);
        seed(activeKey, UploadedObjectStatus.ACTIVE);
        seed(pendingKey, UploadedObjectStatus.PENDING);
        seed(purgingKey, UploadedObjectStatus.PURGING);
        seed(purgedKey, UploadedObjectStatus.PURGED);

        assertThatCode(() -> uploadedObjectService.release(
                STUB_PREFIX + activeKey, STUB_PREFIX + pendingKey, STUB_PREFIX + purgingKey, STUB_PREFIX + purgedKey,
                STUB_PREFIX + uniqueKey(FilePurpose.LOGO), "https://elsewhere.example.com/x.jpg", null, " "))
                .doesNotThrowAnyException();
        assertThatCode(() -> uploadedObjectService.release((String[]) null)).doesNotThrowAnyException();

        assertThat(statusOf(activeKey)).isEqualTo(UploadedObjectStatus.RELEASED);
        assertThat(releasedAtOf(activeKey)).isNotNull();
        assertThat(statusOf(pendingKey)).isEqualTo(UploadedObjectStatus.PENDING);
        assertThat(statusOf(purgingKey)).isEqualTo(UploadedObjectStatus.PURGING);
        assertThat(statusOf(purgedKey)).isEqualTo(UploadedObjectStatus.PURGED);
    }

    @Test
    @DisplayName("이미 RELEASED 인 객체를 다시 해제해도 첫 해제 시각이 유지된다 (유예는 첫 해제 기준)")
    void releaseAgainKeepsFirstReleasedAt() {
        String storageKey = uniqueKey(FilePurpose.LOGO);
        seed(storageKey, UploadedObjectStatus.RELEASED);
        Instant firstReleasedAt = releasedAtOf(storageKey);

        uploadedObjectService.release(STUB_PREFIX + storageKey);

        assertThat(statusOf(storageKey)).isEqualTo(UploadedObjectStatus.RELEASED);
        assertThat(releasedAtOf(storageKey)).isEqualTo(firstReleasedAt);
    }

    @Test
    @DisplayName("교체 해제는 스토리지 키가 달라졌을 때만 옛 객체를 해제한다 — 같은 키·previous 없음은 no-op, current null/빈 문자열(비우기)은 해제")
    void releaseIfReplacedComparesStorageKeys() {
        String keptKey = uniqueKey(FilePurpose.COVER);
        String replacedKey = uniqueKey(FilePurpose.COVER);
        String clearedToNullKey = uniqueKey(FilePurpose.COVER);
        String clearedToBlankKey = uniqueKey(FilePurpose.COVER);
        String newKey = uniqueKey(FilePurpose.COVER);
        seed(keptKey, UploadedObjectStatus.ACTIVE);
        seed(replacedKey, UploadedObjectStatus.ACTIVE);
        seed(clearedToNullKey, UploadedObjectStatus.ACTIVE);
        seed(clearedToBlankKey, UploadedObjectStatus.ACTIVE);
        seed(newKey, UploadedObjectStatus.ACTIVE);

        uploadedObjectService.releaseIfReplaced(STUB_PREFIX + keptKey, STUB_PREFIX + keptKey);
        uploadedObjectService.releaseIfReplaced(STUB_PREFIX + replacedKey, STUB_PREFIX + newKey);
        uploadedObjectService.releaseIfReplaced(STUB_PREFIX + clearedToNullKey, null);
        uploadedObjectService.releaseIfReplaced(STUB_PREFIX + clearedToBlankKey, "");
        uploadedObjectService.releaseIfReplaced(null, STUB_PREFIX + newKey);
        uploadedObjectService.releaseIfReplaced("https://elsewhere.example.com/x.jpg", STUB_PREFIX + newKey);

        assertThat(statusOf(keptKey)).isEqualTo(UploadedObjectStatus.ACTIVE);
        assertThat(statusOf(replacedKey)).isEqualTo(UploadedObjectStatus.RELEASED);
        assertThat(statusOf(clearedToNullKey)).isEqualTo(UploadedObjectStatus.RELEASED);
        assertThat(statusOf(clearedToBlankKey)).isEqualTo(UploadedObjectStatus.RELEASED);
        assertThat(statusOf(newKey)).isEqualTo(UploadedObjectStatus.ACTIVE);
    }

    @Test
    @DisplayName("본문 해제는 이전 본문에만 남은 자체 스토리지 URL 만 해제하고, 현재 본문이 null 이면 전부 해제한다")
    void releaseRemovedFromReleasesOnlyMissingKeys() {
        String removedKey = uniqueKey(FilePurpose.NOTICE_BODY);
        String retainedKey = uniqueKey(FilePurpose.NOTICE_BODY);
        seed(removedKey, UploadedObjectStatus.ACTIVE);
        seed(retainedKey, UploadedObjectStatus.ACTIVE);
        String previousContent = "<img src=\"" + STUB_PREFIX + removedKey + "\"><img src=\"" + STUB_PREFIX + retainedKey + "\">";
        String currentContent = "<p>수정</p><img src=\"" + STUB_PREFIX + retainedKey + "\">";

        uploadedObjectService.releaseRemovedFrom(previousContent, currentContent);
        assertThat(statusOf(removedKey)).isEqualTo(UploadedObjectStatus.RELEASED);
        assertThat(statusOf(retainedKey)).isEqualTo(UploadedObjectStatus.ACTIVE);

        uploadedObjectService.releaseRemovedFrom(currentContent, null);
        assertThat(statusOf(retainedKey)).isEqualTo(UploadedObjectStatus.RELEASED);

        assertThatCode(() -> uploadedObjectService.releaseRemovedFrom(null, currentContent)).doesNotThrowAnyException();
        assertThatCode(() -> uploadedObjectService.releaseRemovedFrom("  ", null)).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("RELEASED 업로드를 다시 연결하면 ACTIVE 로 돌아오고 해제 시각이 비워진다 (편집 되돌리기·재사용)")
    void reactivatesReleased() {
        String storageKey = uniqueKey(FilePurpose.LOGO);
        seed(storageKey, UploadedObjectStatus.RELEASED);

        uploadedObjectService.activate(STUB_PREFIX + storageKey);

        assertThat(statusOf(storageKey)).isEqualTo(UploadedObjectStatus.ACTIVE);
        assertThat(releasedAtOf(storageKey)).isNull();
    }
```

- [ ] **Step 2: 실패 확인**

Run: `cd backend && ./gradlew test --tests "com.duing.global.file.UploadedObjectServiceTest"`
Expected: 컴파일 실패(`release`·`releaseIfReplaced`·`releaseRemovedFrom` 없음).

- [ ] **Step 3: 구현**

`UploadedObjectService.java` 전체를 다음으로 교체(클래스 javadoc·상수·필드는 유지하고 메서드부만 바뀐다 — import 에 `java.util.Collection` 은 필요 없고 `UploadedObjectStatus` import 를 추가):

```java
package com.duing.global.file;

import com.duing.global.file.entity.UploadedObject;
import com.duing.global.file.entity.UploadedObjectStatus;
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
 * <p>해제(#1153, 스펙 §3) — 교체·비우기·삭제로 참조를 놓은 URL 은 {@link #release}·{@link #releaseIfReplaced}·
 * {@link #releaseRemovedFrom} 으로 ACTIVE→RELEASED 로 내린다(같은 tx, 활성화 뒤). RELEASED 는 "어떤 쓰기 경로가 이 키를
 * 놓았다" 는 신호일 뿐 비참조 보장이 아니다 — 삭제 여부의 최종 판정은 파기 잡의 참조 스캔이다.
 *
 * <p>추적 행이 없는 키(추적 테이블 도입 이전 레거시 객체)와 자기 스토리지가 아닌 URL 은 조용히 건너뛴다 —
 * 외부 URL 차단은 이 컴포넌트의 책임이 아니다(공지 커버 prefix 검증 등은 도메인에 있다).
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional
public class UploadedObjectService {

    // 본문 토큰 경계 — 공백·따옴표·태그 괄호·소괄호·대괄호·쉼표·세미콜론·등호. 마크다운 문장 끝의 구두점이 URL 에
    // 붙어 키 조회가 빗나가는 것을 막고, 따옴표 없는 src=URL 속성도 분리한다(스펙 §3.3).
    private static final Pattern CONTENT_TOKEN_BOUNDARY = Pattern.compile("[\\s\"'<>()\\[\\],;=]+");

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
     * attach 지점 공통 진입 — 각 URL 을 키로 바꿔 PENDING·RELEASED 이면 ACTIVE 로 전이한다.
     * 키를 사전순으로 정렬해 잠근다: 같은 키 집합을 두 tx 가 서로 다른 순서로 잠그는 ABBA 데드락을 없앤다.
     */
    public void activate(String... fileUrls) {
        for (String storageKey : storageKeysOf(fileUrls)) {
            activateKey(storageKey);
        }
    }

    /** 공지 본문(HTML·마크다운 불문)에 등장하는 자기 스토리지 URL 을 전부 활성화한다(스펙 §3.3). */
    public void activateReferencedIn(String content) {
        for (String storageKey : storageKeysIn(content)) {
            activateKey(storageKey);
        }
    }

    /** 삭제 — 주어진 URL 을 전부 해제한다. null·빈값·외부 URL·추적 행 없음·ACTIVE 가 아닌 상태는 건너뛴다. */
    public void release(String... fileUrls) {
        for (String storageKey : storageKeysOf(fileUrls)) {
            releaseKey(storageKey);
        }
    }

    /**
     * 교체·비우기 — previous 가 자기 스토리지 키이고 current 의 키와 다르면 previous 를 해제한다.
     * 비교는 스토리지 키 기준이라 비우기가 {@code null} 이든 {@code ""} 이든(도메인마다 다르다) 해제로 수렴한다.
     */
    public void releaseIfReplaced(String previousUrl, String currentUrl) {
        String previousKey = toStorageKey(previousUrl);
        if (previousKey == null || previousKey.equals(toStorageKey(currentUrl))) {
            return;
        }
        releaseKey(previousKey);
    }

    /** 본문 편집·삭제 — 이전 본문의 자기 스토리지 URL 중 현재 본문에 없는 키를 해제한다. current 가 null 이면 전부. */
    public void releaseRemovedFrom(String previousContent, String currentContent) {
        Set<String> removedKeys = storageKeysIn(previousContent);
        removedKeys.removeAll(storageKeysIn(currentContent));
        for (String storageKey : removedKeys) {
            releaseKey(storageKey);
        }
    }

    private Set<String> storageKeysOf(String... fileUrls) {
        Set<String> storageKeys = new TreeSet<>();
        if (fileUrls == null) {
            return storageKeys;
        }
        for (String fileUrl : fileUrls) {
            String storageKey = toStorageKey(fileUrl);
            if (storageKey != null) {
                storageKeys.add(storageKey);
            }
        }
        return storageKeys;
    }

    private Set<String> storageKeysIn(String content) {
        if (content == null || content.isBlank()) {
            return new TreeSet<>();
        }
        return storageKeysOf(CONTENT_TOKEN_BOUNDARY.split(content));
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
            case PENDING, RELEASED -> uploadedObject.activate(Instant.now(clock)); // RELEASED = 편집 되돌리기·재사용
            case ACTIVE -> { /* 재수정·재사용 — 멱등 */ }
            case PURGING, PURGED -> throw new FileException.UploadExpiredException();
            // 상태가 추가되면 조용히 no-op 되지 않도록 명시적으로 실패시킨다 — 활성화 누락은 24시간 뒤 파기로 이어진다.
            default -> throw new IllegalStateException("알 수 없는 업로드 추적 상태: " + uploadedObject.getStatus());
        }
    }

    private void releaseKey(String storageKey) {
        Optional<UploadedObject> tracked = uploadedObjectRepository.findByStorageKeyForUpdate(storageKey);
        if (tracked.isEmpty()) {
            return; // 레거시
        }
        UploadedObject uploadedObject = tracked.get();
        if (uploadedObject.getStatus() == UploadedObjectStatus.ACTIVE) {
            uploadedObject.release(Instant.now(clock));
        }
        // PENDING(활성화 누락 — 잡의 안전망 몫)·RELEASED(재해제, 첫 released_at 유지)·PURGING·PURGED 는 no-op.
    }
}
```

`FilePurpose.java` javadoc 의 유지 규칙을 다음으로 교체:
```java
/**
 * 업로드 API 의 용도 — 스토리지 디렉터리를 결정한다.
 *
 * <p><b>유지 규칙(#791·#1153)</b>: purpose 를 추가하면 (1) 업로드 URL 을 저장하는 도메인 쓰기 메서드에서
 * {@code UploadedObjectService.activate}(본문이면 {@code activateReferencedIn})를 호출하고,
 * (2) 그 URL 을 교체·비우기·삭제하는 쓰기 메서드에서 {@code releaseIfReplaced}/{@code releaseRemovedFrom}/{@code release} 를
 * 호출하며, (3) {@code UploadedObjectRepository.isReferenced} 의 참조 스캔에 그 저장 위치를 추가해야 한다.
 * (1)·(3) 이 빠지면 24시간 뒤 파기 잡이 실사용 객체를 지운다(참조 스캔이 있으면 WARN 으로 대신 잡힌다). (2) 가 빠지면
 * 교체된 객체가 ACTIVE 로 영구 잔존한다.
 */
```

- [ ] **Step 4: 통과 확인**

Run: `cd backend && ./gradlew test --tests "com.duing.global.file.UploadedObjectServiceTest" --tests "com.duing.global.file.purge.UploadActivationPurgeConcurrencyTest"`
Expected: BUILD SUCCESSFUL(기존 9건 + 신규 5건, 동시성 13건 회귀 없음).

- [ ] **Step 5: 커밋**

```bash
git add backend/src/main/java/com/duing/global/file/UploadedObjectService.java backend/src/main/java/com/duing/global/file/FilePurpose.java backend/src/test/java/com/duing/global/file/UploadedObjectServiceTest.java
git commit -m "feat(backend): 업로드 추적 서비스 — 해제 API(release·releaseIfReplaced·releaseRemovedFrom)·RELEASED 재연결"
```

---

### Task 4: 파기 잡 — RELEASED 후보 · 참조 잔존 복구(INFO) · 절단 판정 분리

**Files:**
- Modify: `backend/src/main/java/com/duing/global/file/purge/UploadPurgeJob.java`
- Modify: `backend/src/main/resources/application-prod.yml` (주석 1문장)
- Test: `backend/src/test/java/com/duing/global/file/purge/UploadPurgeJobTest.java`

**Interfaces:**
- Consumes: Task 2 `findReleasedCandidates(Instant, Pageable)`; Task 1 `isPurgeCandidate`(RELEASED 포함)·`restoreActive`.
- Produces: 요약 로그 필드 `candidates`, `pendingCandidates`, `releasedCandidates`, `releasedStillReferenced`; dry-run 후보 로그의 `status=`·`releasedAt=` 필드; INFO `"해제 후보가 남은 한도"`.

- [ ] **Step 1: 실패하는 테스트 작성**

`UploadPurgeJobTest` 에 헬퍼 추가(`seed` 아래):
```java
    private String seedReleased(int uploadedHoursAgo, int releasedHoursAgo) {
        String storageKey = "club/logo/" + sequence.incrementAndGet() + ".jpg";
        Instant uploadedAt = Instant.now(clock).minus(uploadedHoursAgo, ChronoUnit.HOURS);
        UploadedObject uploadedObject = UploadedObject.pending(storageKey, FilePurpose.LOGO, 1L, uploadedAt);
        uploadedObject.activate(uploadedAt);
        uploadedObject.release(Instant.now(clock).minus(releasedHoursAgo, ChronoUnit.HOURS));
        uploadedObjectRepository.save(uploadedObject);
        return storageKey;
    }

    private Instant releasedAtOf(String storageKey) {
        return uploadedObjectRepository.findByStorageKey(storageKey).orElseThrow().getReleasedAt();
    }

    // status·released_at 을 지정해 대량 시드 — 상한 테스트 전용
    private void seedBulk(int count, String status, Instant uploadedAt, Instant releasedAt) {
        List<Object[]> rows = new ArrayList<>();
        for (int index = 0; index < count; index++) {
            rows.add(new Object[]{"club/logo/bulk-" + sequence.incrementAndGet() + ".jpg", "LOGO", 1L, status,
                    java.sql.Timestamp.from(uploadedAt),
                    releasedAt == null ? null : java.sql.Timestamp.from(releasedAt)});
        }
        jdbcTemplate.batchUpdate(
                "INSERT INTO uploaded_object (storage_key, purpose, uploader_id, status, uploaded_at, released_at) "
                        + "VALUES (?, ?, ?, ?, ?, ?)", rows);
    }
```
테스트 추가:
```java
    @Test
    @DisplayName("실삭제 모드에서 25시간 전 해제된 RELEASED 는 파기되고, 1시간 전 해제된 것은 업로드가 오래됐어도 보존된다")
    void purgesReleasedAfterWindowButKeepsRecentlyReleased() {
        stubStorageDeleteConfirmed();
        String releasedLongAgo = seedReleased(48, 25);
        String releasedRecently = seedReleased(48, 1);

        deleteEnabledJob().run();

        assertThat(statusOf(releasedLongAgo)).isEqualTo(UploadedObjectStatus.PURGED);
        assertThat(statusOf(releasedRecently)).isEqualTo(UploadedObjectStatus.RELEASED);
        verify(fileStorageService, times(1)).delete(anyString());
    }

    @Test
    @DisplayName("실삭제 모드에서 참조가 남아 있는 RELEASED 는 지우지 않고 ACTIVE 로 복구하되 '활성화 지점 누락' 경고는 내지 않는다")
    void restoresReferencedReleasedWithoutWarning(CapturedOutput output) {
        stubStorageDeleteConfirmed();
        String referencedKey = seedReleased(48, 25);
        clubRepository.save(Club.create("재사용클럽-" + sequence.incrementAndGet(), ClubCategory.ACADEMIC, null, "설명",
                "https://files.example.com/" + referencedKey));

        deleteEnabledJob().run();

        assertThat(statusOf(referencedKey)).isEqualTo(UploadedObjectStatus.ACTIVE);
        assertThat(releasedAtOf(referencedKey)).isNull();
        assertThat(output.getOut()).doesNotContain("활성화 지점 누락 의심");
        assertThat(output.getOut()).contains("releasedStillReferenced=1");
        verify(fileStorageService, never()).delete(anyString());
    }

    @Test
    @DisplayName("dry-run 에서 RELEASED 후보는 status 를 포함해 로그만 남기고 상태를 바꾸지 않으며, 참조가 남아 있어도 경고하지 않는다")
    void dryRunLogsReleasedWithoutWarning(CapturedOutput output) {
        String referencedKey = seedReleased(48, 25);
        clubRepository.save(Club.create("드라이런클럽-" + sequence.incrementAndGet(), ClubCategory.ACADEMIC, null, "설명",
                "https://files.example.com/" + referencedKey));

        dryRunJob.run();

        assertThat(statusOf(referencedKey)).isEqualTo(UploadedObjectStatus.RELEASED);
        assertThat(output.getOut()).contains("status=RELEASED");
        assertThat(output.getOut()).doesNotContain("활성화 지점 누락 의심");
        assertThat(output.getOut()).contains("releasedCandidates=1");
        verify(fileStorageService, never()).delete(anyString());
    }

    @Test
    @DisplayName("상한 500 은 PENDING 을 먼저 채우고 남은 한도만 RELEASED 에 준다")
    void batchLimitPrefersPendingThenReleased() {
        stubStorageDeleteConfirmed();
        Instant old = Instant.now(clock).minus(25, ChronoUnit.HOURS);
        seedBulk(499, "PENDING", old, null);
        seedBulk(3, "RELEASED", old, old);

        deleteEnabledJob().run();

        Integer purgedPending = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM uploaded_object WHERE status = 'PURGED' AND released_at IS NULL", Integer.class);
        Integer purgedReleased = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM uploaded_object WHERE status = 'PURGED' AND released_at IS NOT NULL", Integer.class);
        Integer remainingReleased = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM uploaded_object WHERE status = 'RELEASED'", Integer.class);
        assertThat(purgedPending).isEqualTo(499);
        assertThat(purgedReleased).isEqualTo(1);
        assertThat(remainingReleased).isEqualTo(2);
        verify(fileStorageService, times(500)).delete(anyString());
    }

    @Test
    @DisplayName("dry-run 에서 RELEASED 만으로 한도를 채우면 '표본이 절단됨' 경고 대신 해제 누적 안내만 남긴다")
    void releasedOnlyDoesNotTriggerTruncationWarning(CapturedOutput output) {
        Instant old = Instant.now(clock).minus(25, ChronoUnit.HOURS);
        seedBulk(500, "RELEASED", old, old);

        dryRunJob.run();

        assertThat(output.getOut()).doesNotContain("표본이 절단됨");
        assertThat(output.getOut()).contains("해제 후보가 남은 한도");
        assertThat(output.getOut()).contains("pendingCandidates=0");
        assertThat(output.getOut()).contains("releasedCandidates=500");
    }
```

- [ ] **Step 2: 실패 확인**

Run: `cd backend && ./gradlew test --tests "com.duing.global.file.purge.UploadPurgeJobTest"`
Expected: 신규 5건 실패 — RELEASED 가 후보에 없어 `PURGED` 기대가 `RELEASED` 로, 로그 필드(`status=`, `releasedCandidates=`, `releasedStillReferenced=`, `해제 후보가 남은 한도`) 부재. 기존 10건은 통과.

- [ ] **Step 3: 구현**

`UploadPurgeJob.java`:

1. import 에 `java.util.ArrayList` 추가.
2. 클래스 javadoc 첫 단락 뒤에 한 단락 추가:
```java
 * <p>#1153: 교체·삭제로 해제된(RELEASED) 객체도 후보다 — 유예 기준이 released_at 이라 두 번째 쿼리로 집고,
 * 회당 상한 {@value #BATCH_LIMIT}은 PENDING·PURGING 을 먼저 채운 뒤 남은 한도만 RELEASED 에 준다. RELEASED 는
 * 비참조 보장이 아니므로 참조가 남아 있으면 경고 없이 ACTIVE 로 복구한다(정상 흐름 — 제안 배너 재사용 등).
```
3. `run()` 의 후보 조회~경고 블록을 다음으로 교체:
```java
        Instant cutoff = Instant.now(clock).minus(window);
        boolean deleteEnabled = properties.deleteEnabled();
        List<UploadedObject> pendingCandidates = uploadedObjectRepository.findPurgeCandidates(
                CANDIDATE_STATUSES, cutoff, PageRequest.of(0, BATCH_LIMIT));
        int remainingLimit = BATCH_LIMIT - pendingCandidates.size();
        List<UploadedObject> releasedCandidates = remainingLimit > 0
                ? uploadedObjectRepository.findReleasedCandidates(cutoff, PageRequest.of(0, remainingLimit))
                : List.of();
        if (!deleteEnabled && pendingCandidates.size() >= BATCH_LIMIT) {
            // dry-run 은 상태를 바꾸지 않아 매시 같은 상위 BATCH_LIMIT 건만 다시 본다 — 그 밖의 후보는 표본에 없다.
            // 이 경고가 한 번이라도 나온 주간은 "referenced=true 0건" 만으로 실삭제 전환 판정을 내리지 않는다.
            log.warn("[업로드 고아 정리][dry-run] 후보가 상한({})을 채워 표본이 절단됨 — 오래된 후보만 관찰 중", BATCH_LIMIT);
        }
        if (!deleteEnabled && remainingLimit > 0 && releasedCandidates.size() >= remainingLimit) {
            // RELEASED 는 dry-run 동안 교체·삭제마다 단조 누적된다 — 전환 판정 조건이 아니라 안내만 남긴다.
            log.info("[업로드 고아 정리][dry-run] 해제 후보가 남은 한도({})를 채움 — 실삭제 전환 후 시간당 최대 {}건씩 정리된다",
                    remainingLimit, BATCH_LIMIT);
        }
        List<UploadedObject> candidates = new ArrayList<>(pendingCandidates);
        candidates.addAll(releasedCandidates);
```
4. 요약 INFO 교체:
```java
        log.info("[업로드 고아 정리] mode={}, candidates={}, pendingCandidates={}, releasedCandidates={}, purged={}, healed={}, "
                        + "releasedStillReferenced={}, activatedMeanwhile={}, deleteFailed={}, failed={}, referencedInDryRun={}, cutoff={}",
                deleteEnabled ? "delete" : "dry-run", candidates.size(), pendingCandidates.size(), releasedCandidates.size(),
                counters.purged, counters.healed, counters.releasedStillReferenced, counters.activatedMeanwhile,
                counters.deleteFailed, counters.failed, counters.referencedInDryRun, cutoff);
```
5. `processCandidate` 의 앞부분(참조 분기까지)을 다음으로 교체(claim 이후는 그대로):
```java
    private void processCandidate(UploadedObject candidate, boolean deleteEnabled, Counters counters) {
        String storageKey = candidate.getStorageKey();
        boolean referenced = uploadedObjectRepository.isReferenced(storageKey);
        // 스냅샷 상태로 분류한다 — RELEASED 였다가 이전 실행의 claim 뒤 삭제가 실패해 PURGING 으로 남은 행은
        // PENDING 쪽(WARN)으로 분류되는데, 이중 실패의 드문 경우라 받아들인다.
        boolean released = candidate.getStatus() == UploadedObjectStatus.RELEASED;

        if (!deleteEnabled) {
            log.info("[업로드 고아 정리][dry-run] objectKey={}, status={}, purpose={}, uploadedAt={}, releasedAt={}, referenced={}",
                    storageKey, candidate.getStatus(), candidate.getPurpose(), candidate.getUploadedAt(),
                    candidate.getReleasedAt(), referenced);
            if (referenced && released) {
                counters.releasedStillReferenced++; // 정상 — 다른 참조가 남아 있는 해제 객체
            } else if (referenced) {
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
            if (healed && released) {
                counters.releasedStillReferenced++;
                log.info("[업로드 고아 정리] 해제된 객체에 다른 참조가 남아 있어 ACTIVE 로 복구(정상) - objectKey={}, purpose={}",
                        storageKey, candidate.getPurpose());
            } else if (healed) {
                counters.healed++;
                log.warn("[업로드 고아 정리] 참조가 남아 있어 삭제하지 않고 ACTIVE 로 치유 — 활성화 지점 누락 의심: objectKey={}, purpose={}",
                        storageKey, candidate.getPurpose());
            } else {
                // 스냅샷 뒤 ACTIVE·PURGED 로 바뀌어 치유 대상이 아니었다 — 요약 합계가 후보 수와 맞도록 집계한다.
                counters.activatedMeanwhile++;
            }
            return;
        }
```
6. `Counters` 에 `int releasedStillReferenced;` 추가(`healed` 아래).
7. `import com.duing.global.file.entity.UploadedObjectStatus;` 는 이미 있다.

`application-prod.yml` 의 업로드 고아 정리 주석 마지막 줄 뒤에 한 줄 추가(`upload:` 바로 위):
```yaml
  # 교체·삭제로 해제된(RELEASED) 객체도 같은 잡이 다룬다(#1153). dry-run 동안은 누적되며 전환 직후 시간당 최대 500건씩 정리된다.
```

- [ ] **Step 4: 통과 확인**

Run: `cd backend && ./gradlew test --tests "com.duing.global.file.purge.UploadPurgeJobTest" --tests "com.duing.global.file.purge.UploadPurgeSchedulingWiringTest"`
Expected: BUILD SUCCESSFUL(15 + 1).

- [ ] **Step 5: 커밋**

```bash
git add backend/src/main/java/com/duing/global/file/purge/UploadPurgeJob.java backend/src/main/resources/application-prod.yml backend/src/test/java/com/duing/global/file/purge/UploadPurgeJobTest.java
git commit -m "feat(backend): 업로드 파기 잡 — RELEASED 후보(released_at 유예)·참조 잔존 복구 INFO·PENDING 우선 상한·절단 판정 분리"
```

---

### Task 5: 동아리 — 로고·커버 교체 · 사진 삭제 · 폐쇄 해제

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/club/service/GeneralClubService.java` (`applyProfileUpdate`)
- Modify: `backend/src/main/java/com/duing/domain/club/photo/service/GeneralClubPhotoService.java` (`delete`)
- Modify: `backend/src/main/java/com/duing/domain/club/service/GeneralClubClosureService.java` (필드 2개 + `close`)
- Test: `backend/src/test/java/com/duing/domain/club/service/ClubUploadActivationTest.java`

**Interfaces:**
- Consumes: Task 3 `releaseIfReplaced`·`release`.
- `GeneralClubClosureService` 는 `@RequiredArgsConstructor` — 필드를 **마지막 `private final`** 로 추가한다(수동 `new` 하는 테스트는 없음, `grep -rn "new GeneralClubClosureService(" backend/src/test` 로 확인).

- [ ] **Step 1: 실패하는 테스트 작성**

`ClubUploadActivationTest` import 추가:
```java
import com.duing.domain.club.photo.service.dto.command.CreateClubPhotoCommand;
import com.duing.domain.club.service.dto.command.CloseClubCommand;
import com.duing.domain.club.photo.entity.ClubPhoto;
```
(`ClubStatus`·`Field`·`ClubMember`·`UserFixture`·`User` 는 이미 import 돼 있다 — 없으면 추가.) 필드 추가:
```java
    @Autowired ClubClosureService clubClosureService;
```
헬퍼 추가:
```java
    private String seedActive(FilePurpose purpose) {
        String storageKey = purpose.directory() + "/" + sequence.incrementAndGet() + ".jpg";
        UploadedObject uploadedObject = UploadedObject.pending(storageKey, purpose, 1L, Instant.now());
        uploadedObject.activate(Instant.now());
        uploadedObjectRepository.save(uploadedObject);
        return storageKey;
    }

    private Club saveClubWithStatus(ClubStatus status, String logoUrl) throws Exception {
        Club club = Club.create("상태클럽-" + sequence.incrementAndGet(), ClubCategory.ACADEMIC, "분과", "설명", logoUrl);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(club, status);
        return clubRepository.save(club);
    }

    private UpdateClubCommand updateImages(Long clubId, Long requesterId, String logoUrl, String coverUrl,
                                           Boolean clearCoverImage) {
        return new UpdateClubCommand(
                clubId, requesterId,
                null, null, null, null, logoUrl, coverUrl,
                null, null, null,
                null, null, null, null, null, null, null,
                null, null, null, null,
                null, null, null, clearCoverImage, null, null, null);
    }
```
테스트 추가:
```java
    @Test
    @DisplayName("운영진이 로고를 바꾸고 커버를 비우면 옛 로고·커버 업로드는 RELEASED, 새 로고는 ACTIVE 가 된다")
    void leaderUpdateReleasesReplacedLogoAndClearedCover() throws Exception {
        User leader = userRepository.save(UserFixture.unique());
        Club club = saveActiveClub();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        String oldLogoKey = seedPending(FilePurpose.LOGO);
        String oldCoverKey = seedPending(FilePurpose.COVER);
        clubService.update(updateImages(club.getId(), leader.getId(), STUB_PREFIX + oldLogoKey, STUB_PREFIX + oldCoverKey));
        String newLogoKey = seedPending(FilePurpose.LOGO);

        clubService.update(updateImages(club.getId(), leader.getId(), STUB_PREFIX + newLogoKey, null, true));

        assertThat(statusOf(oldLogoKey)).isEqualTo(UploadedObjectStatus.RELEASED);
        assertThat(statusOf(oldCoverKey)).isEqualTo(UploadedObjectStatus.RELEASED);
        assertThat(statusOf(newLogoKey)).isEqualTo(UploadedObjectStatus.ACTIVE);
    }

    @Test
    @DisplayName("같은 로고 URL 로 다시 수정하면 로고 업로드는 ACTIVE 그대로다 (해제되지 않음)")
    void leaderUpdateWithSameLogoKeepsActive() throws Exception {
        User leader = userRepository.save(UserFixture.unique());
        Club club = saveActiveClub();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        String logoKey = seedPending(FilePurpose.LOGO);
        clubService.update(updateImages(club.getId(), leader.getId(), STUB_PREFIX + logoKey, null));

        clubService.update(updateImages(club.getId(), leader.getId(), STUB_PREFIX + logoKey, null));

        assertThat(statusOf(logoKey)).isEqualTo(UploadedObjectStatus.ACTIVE);
    }

    @Test
    @DisplayName("활동 사진을 삭제하면 사진 업로드가 RELEASED 가 된다")
    void photoDeleteReleasesUpload() throws Exception {
        User leader = userRepository.save(UserFixture.unique());
        Club club = saveActiveClub();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        String photoKey = seedPending(FilePurpose.PHOTO);
        Long photoId = clubPhotoService.create(new CreateClubPhotoCommand(club.getId(), leader.getId(),
                STUB_PREFIX + photoKey, null, null, null)).id();
        assertThat(statusOf(photoKey)).isEqualTo(UploadedObjectStatus.ACTIVE);

        clubPhotoService.delete(club.getId(), leader.getId(), photoId);

        assertThat(statusOf(photoKey)).isEqualTo(UploadedObjectStatus.RELEASED);
    }

    @Test
    @DisplayName("총동연이 동아리를 폐쇄하면 로고·커버·살아 있는 활동 사진 업로드가 모두 RELEASED 가 된다")
    void closureReleasesLogoCoverAndPhotos() throws Exception {
        User admin = userRepository.save(UserFixture.admin());
        String logoKey = seedActive(FilePurpose.LOGO);
        String coverKey = seedPending(FilePurpose.COVER);
        String photoKey = seedActive(FilePurpose.PHOTO);
        Club club = saveClubWithStatus(ClubStatus.INACTIVE, STUB_PREFIX + logoKey);
        clubService.updateAsAdmin(updateImages(club.getId(), null, null, STUB_PREFIX + coverKey));
        clubPhotoRepository.save(ClubPhoto.create(club, STUB_PREFIX + photoKey, null, null, null, 0));

        clubClosureService.close(new CloseClubCommand(club.getId(), admin.getId(), "운영 종료"));

        assertThat(statusOf(logoKey)).isEqualTo(UploadedObjectStatus.RELEASED);
        assertThat(statusOf(coverKey)).isEqualTo(UploadedObjectStatus.RELEASED);
        assertThat(statusOf(photoKey)).isEqualTo(UploadedObjectStatus.RELEASED);
    }
```
(`ClubPhotoQuery` 의 id 접근자가 `id()` 가 아니면 파일에서 확인해 맞춘다 — `backend/src/main/java/com/duing/domain/club/service/dto/query/ClubPhotoQuery.java`.)

- [ ] **Step 2: 실패 확인**

Run: `cd backend && ./gradlew test --tests "com.duing.domain.club.service.ClubUploadActivationTest"`
Expected: 신규 4건 중 3건 실패(RELEASED 기대가 ACTIVE), `leaderUpdateWithSameLogoKeepsActive` 는 통과(현재 동작 고정용). 기존 5건 통과.

- [ ] **Step 3: 구현**

`GeneralClubService.applyProfileUpdate` — `club.update(...)` 앞에 캡처, 활성화 뒤에 해제:
```java
        String previousLogoUrl = club.getLogoUrl();
        String previousCoverUrl = club.getCoverUrl();
        club.update(updateClubCommand.toPayload());
        try {
            // (기존 flush try/catch 그대로)
        } catch (DataIntegrityViolationException racedRename) {
            // (그대로)
        }
        // 개명 경합 분류(flush try/catch) 뒤에 활성화 — 활성화 잠금 조회가 flush 를 유발해도 409 분류를 가로채지 않는다.
        uploadedObjectService.activate(updateClubCommand.logoUrl(), updateClubCommand.coverUrl());
        // 교체·비우기로 빠진 옛 로고·커버는 해제(#1153) — 새 값을 먼저 확정한 뒤.
        uploadedObjectService.releaseIfReplaced(previousLogoUrl, club.getLogoUrl());
        uploadedObjectService.releaseIfReplaced(previousCoverUrl, club.getCoverUrl());
```

`GeneralClubPhotoService.delete` — 마지막 두 줄을 교체:
```java
        // DB 행은 soft-delete, 스토리지 객체는 해제(RELEASED) 뒤 업로드 파기 잡이 유예 후 지운다(#791·#1153).
        clubPhotoRepository.delete(photo);
        uploadedObjectService.release(photo.getStorageKey());
```

`GeneralClubClosureService`:
1. import 추가: `com.duing.domain.club.photo.repository.ClubPhotoRepository`, `com.duing.global.file.UploadedObjectService`, `java.util.ArrayList`.
2. 필드 마지막에 추가:
```java
    private final ClubPhotoRepository clubPhotoRepository;
    private final UploadedObjectService uploadedObjectService;
```
3. `String clubName = club.getName();` 바로 아래에 추가:
```java
        // 폐쇄된 동아리의 로고·커버·살아 있는 사진은 더는 어디서도 서빙되지 않는다 — clear() 전에 URL 을 모아 두고
        // soft-delete 뒤 해제한다(#1153). findByClubId 는 @SQLRestriction 으로 살아 있는 사진만 돌려준다.
        List<String> imageUrlsToRelease = new ArrayList<>();
        imageUrlsToRelease.add(club.getLogoUrl());
        imageUrlsToRelease.add(club.getCoverUrl());
        clubPhotoRepository.findByClubId(clubId).forEach(photo -> imageUrlsToRelease.add(photo.getStorageKey()));
```
4. `clubRepository.delete(clubToDelete);` 바로 아래에 추가(Slack 이벤트 발행 앞):
```java
        uploadedObjectService.release(imageUrlsToRelease.toArray(String[]::new));
```

- [ ] **Step 4: 통과 확인**

Run: `cd backend && ./gradlew test --tests "com.duing.domain.club.service.ClubUploadActivationTest" --tests "com.duing.domain.club.controller.AdminClubClosureControllerTest" --tests "com.duing.domain.club.service.ClubNameRaceGuardTest" --tests "com.duing.domain.club.photo.service.ClubPhotoCommandServiceTest"`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 5: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/club backend/src/test/java/com/duing/domain/club/service/ClubUploadActivationTest.java
git commit -m "feat(backend): 동아리 업로드 해제 — 로고·커버 교체/비우기·사진 삭제·폐쇄 시 RELEASED"
```

---

### Task 6: 공지 — 수정·삭제 4경로 해제

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/notice/service/GeneralNoticeService.java` (`update`·`updateForClub`·`delete`·`deleteForClub`)
- Test: `backend/src/test/java/com/duing/domain/notice/service/NoticeUploadActivationTest.java`

**Interfaces:**
- Consumes: Task 3 `releaseIfReplaced`·`releaseRemovedFrom`·`release`.

- [ ] **Step 1: 실패하는 테스트 작성**

`NoticeUploadActivationTest` import 추가: `com.duing.global.file.exception.FileException`, `static org.assertj.core.api.Assertions.assertThatThrownBy`. 헬퍼 추가:
```java
    private String seedPurged(FilePurpose purpose) {
        String storageKey = purpose.directory() + "/" + sequence.incrementAndGet() + ".jpg";
        UploadedObject uploadedObject = UploadedObject.pending(storageKey, purpose, 1L, Instant.now());
        uploadedObject.markPurging();
        uploadedObject.markPurged(Instant.now());
        uploadedObjectRepository.save(uploadedObject);
        return storageKey;
    }

    private String bodyWith(String firstKey, String secondKey) {
        return bodyWith(firstKey) + "<img src=\"" + STUB_PREFIX + secondKey + "\" alt=\"\">";
    }

    private UpdateNoticeCommand adminUpdate(Long noticeId, String content, String coverUrl) {
        return new UpdateNoticeCommand(noticeId, null, null, content, coverUrl,
                null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null);
    }
```
테스트 추가:
```java
    @Test
    @DisplayName("관리자가 커버를 바꾸고 본문 이미지 하나를 빼면 옛 커버·빠진 이미지는 RELEASED, 남은 이미지·새 커버는 ACTIVE 다")
    void adminUpdateReleasesReplacedCoverAndRemovedBodyImage() {
        User admin = userRepository.save(UserFixture.admin());
        String oldCoverKey = seedPending(FilePurpose.NOTICE_COVER);
        String removedKey = seedPending(FilePurpose.NOTICE_BODY);
        String retainedKey = seedPending(FilePurpose.NOTICE_BODY);
        Long noticeId = noticeService.create(adminCreate(STUB_PREFIX + oldCoverKey, bodyWith(removedKey, retainedKey), admin.getId()));
        String newCoverKey = seedPending(FilePurpose.NOTICE_COVER);

        noticeService.update(adminUpdate(noticeId, bodyWith(retainedKey), STUB_PREFIX + newCoverKey));

        assertThat(statusOf(oldCoverKey)).isEqualTo(UploadedObjectStatus.RELEASED);
        assertThat(statusOf(removedKey)).isEqualTo(UploadedObjectStatus.RELEASED);
        assertThat(statusOf(retainedKey)).isEqualTo(UploadedObjectStatus.ACTIVE);
        assertThat(statusOf(newCoverKey)).isEqualTo(UploadedObjectStatus.ACTIVE);
    }

    @Test
    @DisplayName("새 커버가 만료(PURGED)라 400 으로 실패하면 옛 커버는 ACTIVE 그대로다 (해제가 트랜잭션과 함께 롤백)")
    void adminUpdateWithExpiredCoverKeepsOldCoverActive() {
        User admin = userRepository.save(UserFixture.admin());
        String oldCoverKey = seedPending(FilePurpose.NOTICE_COVER);
        Long noticeId = noticeService.create(adminCreate(STUB_PREFIX + oldCoverKey, "<p>본문</p>", admin.getId()));
        String expiredCoverKey = seedPurged(FilePurpose.NOTICE_COVER);

        assertThatThrownBy(() -> noticeService.update(adminUpdate(noticeId, null, STUB_PREFIX + expiredCoverKey)))
                .isInstanceOf(FileException.UploadExpiredException.class);

        assertThat(statusOf(oldCoverKey)).isEqualTo(UploadedObjectStatus.ACTIVE);
    }

    @Test
    @DisplayName("관리자가 공지를 삭제하면 커버와 본문 이미지 업로드가 모두 RELEASED 가 된다")
    void adminDeleteReleasesCoverAndBodyImages() {
        User admin = userRepository.save(UserFixture.admin());
        String coverKey = seedPending(FilePurpose.NOTICE_COVER);
        String bodyKey = seedPending(FilePurpose.NOTICE_BODY);
        Long noticeId = noticeService.create(adminCreate(STUB_PREFIX + coverKey, bodyWith(bodyKey), admin.getId()));

        noticeService.delete(noticeId);

        assertThat(statusOf(coverKey)).isEqualTo(UploadedObjectStatus.RELEASED);
        assertThat(statusOf(bodyKey)).isEqualTo(UploadedObjectStatus.RELEASED);
    }

    @Test
    @DisplayName("동아리 공지에서 커버를 비우면 커버 업로드가 RELEASED 가 되고, 삭제하면 본문 이미지도 RELEASED 가 된다")
    void clubUpdateClearAndDeleteReleaseUploads() throws Exception {
        User author = userRepository.save(UserFixture.unique());
        Club club = saveActiveClub();
        String coverKey = seedPending(FilePurpose.NOTICE_COVER);
        String bodyKey = seedPending(FilePurpose.NOTICE_BODY);
        Long noticeId = noticeService.createForClub(new CreateClubNoticeCommand(club.getId(), author.getId(),
                "동아리 공지", "요약", bodyWith(bodyKey), STUB_PREFIX + coverKey, false, null));

        noticeService.updateForClub(new UpdateClubNoticeCommand(club.getId(), noticeId,
                null, null, null, null, true, null, null));
        assertThat(statusOf(coverKey)).isEqualTo(UploadedObjectStatus.RELEASED);
        assertThat(statusOf(bodyKey)).isEqualTo(UploadedObjectStatus.ACTIVE);

        noticeService.deleteForClub(club.getId(), noticeId);
        assertThat(statusOf(bodyKey)).isEqualTo(UploadedObjectStatus.RELEASED);
    }
```

- [ ] **Step 2: 실패 확인**

Run: `cd backend && ./gradlew test --tests "com.duing.domain.notice.service.NoticeUploadActivationTest"`
Expected: 신규 4건 중 3건 실패(RELEASED 기대가 ACTIVE). `adminUpdateWithExpiredCoverKeepsOldCoverActive` 는 통과(회귀 가드). 기존 4건 통과.

- [ ] **Step 3: 구현**

`GeneralNoticeService.update` — `found.update(...)` 앞에 캡처, 활성화 두 줄 뒤에 해제 두 줄:
```java
        String previousCoverImageUrl = found.getCoverImageUrl();
        String previousContent = found.getContent();
        found.update(new Notice.UpdatePayload( /* 기존 인자 그대로 */ ));
        uploadedObjectService.activate(command.coverImageUrl());
        uploadedObjectService.activateReferencedIn(command.content());
        // 교체·제거로 빠진 옛 커버·본문 이미지는 해제(#1153) — 새 값을 먼저 확정한 뒤.
        uploadedObjectService.releaseIfReplaced(previousCoverImageUrl, found.getCoverImageUrl());
        uploadedObjectService.releaseRemovedFrom(previousContent, found.getContent());
```
`updateForClub` 도 같은 모양: `found.applyClubScopedUpdate(...)` 앞에 캡처 두 줄, 활성화 두 줄 뒤에 해제 두 줄(동일 코드).

`delete`:
```java
        noticeRepository.delete(found);
        // 삭제된 공지의 커버·본문 이미지는 해제(#1153) — 잡이 유예 뒤 참조 스캔을 거쳐 지운다.
        uploadedObjectService.release(found.getCoverImageUrl());
        uploadedObjectService.releaseRemovedFrom(found.getContent(), null);
```
`deleteForClub` 의 `noticeRepository.delete(found);` 뒤에도 같은 두 줄.

- [ ] **Step 4: 통과 확인**

Run: `cd backend && ./gradlew test --tests "com.duing.domain.notice.service.*"`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 5: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/notice/service/GeneralNoticeService.java backend/src/test/java/com/duing/domain/notice/service/NoticeUploadActivationTest.java
git commit -m "feat(backend): 공지 업로드 해제 — 관리자·동아리 수정 시 교체/제거 이미지·삭제 시 커버/본문 RELEASED"
```

---

### Task 7: 홍보·전체 행사 — 수정·삭제·폐쇄 일괄 해제

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/promotion/service/GeneralPromotionService.java` (`update`·`delete`·`removeAllOnClubClosure`)
- Modify: `backend/src/main/java/com/duing/domain/globalevent/service/GeneralGlobalEventService.java` (`update`·`delete`)
- Test: `backend/src/test/java/com/duing/domain/promotion/service/PromotionUploadActivationTest.java`
- Test: `backend/src/test/java/com/duing/domain/globalevent/service/GlobalEventUploadActivationTest.java`

**Interfaces:**
- Consumes: Task 3 `releaseIfReplaced`·`release`.
- `GeneralGlobalEventServiceKstWindowTest` 가 `GeneralGlobalEventService` 를 수동 `new` 한다 — 필드를 추가하지 않으므로 영향 없음(확인: 이 태스크는 필드를 추가하지 않는다).

- [ ] **Step 1: 실패하는 테스트 작성**

`PromotionUploadActivationTest` 에 추가:
```java
    @Test
    @DisplayName("홍보 배너를 바꾸면 옛 배너 업로드는 RELEASED 가 되고, 홍보를 삭제하면 현재 배너도 RELEASED 가 된다")
    void promotionUpdateAndDeleteReleaseBanners() {
        User admin = userRepository.save(UserFixture.admin());
        String firstKey = seedPending(FilePurpose.PROMOTION_BANNER);
        String secondKey = seedPending(FilePurpose.PROMOTION_BANNER);
        Long promotionId = promotionService.create(createBanner(STUB_PREFIX + firstKey, admin.getId()));

        promotionService.update(new UpdatePromotionCommand(promotionId, null, STUB_PREFIX + secondKey, null,
                null, null, null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null));
        assertThat(statusOf(firstKey)).isEqualTo(UploadedObjectStatus.RELEASED);
        assertThat(statusOf(secondKey)).isEqualTo(UploadedObjectStatus.ACTIVE);

        promotionService.delete(promotionId);
        assertThat(statusOf(secondKey)).isEqualTo(UploadedObjectStatus.RELEASED);
    }

    @Test
    @DisplayName("동아리 폐쇄로 홍보를 일괄 제거하면 그 동아리 홍보들의 배너 업로드가 RELEASED 가 된다")
    void clubClosureBulkRemovalReleasesBanners() throws Exception {
        User admin = userRepository.save(UserFixture.admin());
        Club club = Club.create("폐쇄홍보클럽-" + sequence.incrementAndGet(), ClubCategory.ACADEMIC, null, "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(club, ClubStatus.ACTIVE);
        club = clubRepository.save(club);
        String bannerKey = seedPending(FilePurpose.PROMOTION_BANNER);
        promotionService.create(new CreatePromotionCommand(club.getId(), "배너", STUB_PREFIX + bannerKey, null, true, 1,
                admin.getId(), null, null, null, null, PromotionPalette.INK, null, null,
                PromotionRenderMode.SYSTEM_COMPOSED, null, null));
        assertThat(statusOf(bannerKey)).isEqualTo(UploadedObjectStatus.ACTIVE);

        promotionService.removeAllOnClubClosure(club.getId());

        assertThat(statusOf(bannerKey)).isEqualTo(UploadedObjectStatus.RELEASED);
    }
```
(`validateSingleLinkTarget(linkUrl, noticeId, clubId)` 가 clubId 와 linkUrl 동시 지정을 거부하므로 폐쇄 테스트의 `linkUrl` 은 `null` 이다. 거부 규칙이 다르면 `GeneralPromotionService.validateSingleLinkTarget` 을 읽고 맞춘다.)

`GlobalEventUploadActivationTest` 에 추가:
```java
    @Test
    @DisplayName("전체 행사 커버를 바꾸면 옛 커버는 RELEASED, 커버를 비우면 현재 커버도 RELEASED, 삭제하면 커버가 RELEASED 가 된다")
    void updateClearAndDeleteReleaseCovers() {
        User admin = userRepository.save(UserFixture.admin());
        String firstKey = seedPending();
        String secondKey = seedPending();
        String deletedEventKey = seedPending();
        LocalDateTime startAt = LocalDateTime.now().plusDays(7);
        Long eventId = globalEventService.create(new CreateGlobalEventCommand(admin.getId(), "행사", "설명",
                startAt, startAt.plusHours(2), "장소", null, STUB_PREFIX + firstKey, GlobalEventCategory.FESTIVAL));
        Long deletedEventId = globalEventService.create(new CreateGlobalEventCommand(admin.getId(), "행사2", "설명",
                startAt, startAt.plusHours(2), "장소", null, STUB_PREFIX + deletedEventKey, GlobalEventCategory.FESTIVAL));

        globalEventService.update(new UpdateGlobalEventCommand(eventId, null, null, null, null, null, null, null,
                STUB_PREFIX + secondKey, null));
        assertThat(statusOf(firstKey)).isEqualTo(UploadedObjectStatus.RELEASED);
        assertThat(statusOf(secondKey)).isEqualTo(UploadedObjectStatus.ACTIVE);

        globalEventService.update(new UpdateGlobalEventCommand(eventId, null, null, null, null, null, null, null,
                null, true));
        assertThat(statusOf(secondKey)).isEqualTo(UploadedObjectStatus.RELEASED);

        globalEventService.delete(deletedEventId);
        assertThat(statusOf(deletedEventKey)).isEqualTo(UploadedObjectStatus.RELEASED);
    }
```

- [ ] **Step 2: 실패 확인**

Run: `cd backend && ./gradlew test --tests "com.duing.domain.promotion.service.PromotionUploadActivationTest" --tests "com.duing.domain.globalevent.service.GlobalEventUploadActivationTest"`
Expected: 신규 3건 실패(RELEASED 기대가 ACTIVE), 기존 3건 통과.

- [ ] **Step 3: 구현**

`GeneralPromotionService`:
```java
    // update(): promotion.update(...) 앞에
        String previousBannerImageUrl = promotion.getBannerImageUrl();
    // 활성화 뒤에
        uploadedObjectService.activate(command.bannerImageUrl());
        uploadedObjectService.releaseIfReplaced(previousBannerImageUrl, promotion.getBannerImageUrl()); // 교체·비우기 해제(#1153)

    // delete(): promotionRepository.delete(promotion) 뒤에
        uploadedObjectService.release(promotion.getBannerImageUrl());

    // removeAllOnClubClosure() 전체
    @Override
    @Transactional
    public void removeAllOnClubClosure(Long clubId) {
        List<Promotion> promotions = promotionRepository.findAllByClubId(clubId);
        promotionRepository.deleteAll(promotions);
        // 폐쇄된 동아리 홍보의 배너는 해제(#1153) — 호출자(폐쇄 서비스)의 flush 가 이 변경까지 함께 쓴다.
        uploadedObjectService.release(promotions.stream().map(Promotion::getBannerImageUrl).toArray(String[]::new));
    }
```
(`java.util.List` import 가 없으면 추가.)

`GeneralGlobalEventService`:
```java
    // update(): event.update(...) 앞에
        String previousCoverImageUrl = event.getCoverImageUrl();
    // 활성화 뒤에
        uploadedObjectService.activate(command.coverImageUrl());
        uploadedObjectService.releaseIfReplaced(previousCoverImageUrl, event.getCoverImageUrl()); // 교체·비우기 해제(#1153)

    // delete(): eventRepository.delete(event) 뒤에
        uploadedObjectService.release(event.getCoverImageUrl());
```

- [ ] **Step 4: 통과 확인**

Run: `cd backend && ./gradlew test --tests "com.duing.domain.promotion.*" --tests "com.duing.domain.globalevent.*"`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 5: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/promotion/service/GeneralPromotionService.java backend/src/main/java/com/duing/domain/globalevent/service/GeneralGlobalEventService.java backend/src/test/java/com/duing/domain/promotion/service/PromotionUploadActivationTest.java backend/src/test/java/com/duing/domain/globalevent/service/GlobalEventUploadActivationTest.java
git commit -m "feat(backend): 홍보·전체 행사 업로드 해제 — 배너/커버 교체·비우기·삭제·폐쇄 일괄 RELEASED"
```

---

### Task 8: 동시성 — 해제 ↔ 재연결 ↔ 잡

**Files:**
- Test: `backend/src/test/java/com/duing/global/file/purge/UploadActivationPurgeConcurrencyTest.java`

**Interfaces:**
- Consumes: Task 1~4 전부. 이 태스크는 프로덕션 코드를 바꾸지 않는다 — 테스트가 실패하면 원인을 리포트하고 멈춘다(설계 위반 신호).

- [ ] **Step 1: 테스트 작성**

헬퍼 추가(`seedExpiredPending` 아래):
```java
    private String seedExpiredReleased() {
        String storageKey = "club/logo/" + sequence.incrementAndGet() + ".jpg";
        Instant uploadedAt = Instant.now(clock).minus(48, ChronoUnit.HOURS);
        UploadedObject uploadedObject = UploadedObject.pending(storageKey, FilePurpose.LOGO, 1L, uploadedAt);
        uploadedObject.activate(uploadedAt);
        uploadedObject.release(Instant.now(clock).minus(25, ChronoUnit.HOURS));
        uploadedObjectRepository.save(uploadedObject);
        return storageKey;
    }
```
테스트 추가:
```java
    @RepeatedTest(10)
    @DisplayName("25시간 전 해제된 RELEASED 에 재연결과 파기 잡이 동시에 달려들어도 '삭제된 객체를 가리키는 ACTIVE' 는 생기지 않는다")
    void reactivationAndPurgeOfReleasedNeverProduceActiveOverDeleted() throws Exception {
        stubStorage();
        String storageKey = seedExpiredReleased();
        TransactionTemplate transactionTemplate = new TransactionTemplate(platformTransactionManager);

        List<Throwable> failures = runConcurrently(
                () -> transactionTemplate.executeWithoutResult(status ->
                        uploadedObjectService.activate(STUB_PREFIX + storageKey)),
                () -> deleteEnabledJob().run());

        UploadedObjectStatus finalStatus = statusOf(storageKey);
        if (finalStatus == UploadedObjectStatus.ACTIVE) {
            assertThat(failures).isEmpty();
            verify(fileStorageService, never()).delete(anyString());
        } else {
            assertThat(finalStatus).isEqualTo(UploadedObjectStatus.PURGED);
            assertThat(failures).hasSize(1);
            assertThat(failures.get(0)).isInstanceOf(FileException.UploadExpiredException.class);
            verify(fileStorageService, times(1)).delete(anyString());
        }
    }

    @Test
    @DisplayName("해제됐다가 유예 안에 다시 연결된 업로드는 잡이 지나가도 ACTIVE 로 남는다 (편집 되돌리기)")
    void reactivatedReleasedSurvivesPurge() {
        stubStorage();
        String storageKey = seedExpiredReleased();
        uploadedObjectService.activate(STUB_PREFIX + storageKey);

        deleteEnabledJob().run();

        assertThat(statusOf(storageKey)).isEqualTo(UploadedObjectStatus.ACTIVE);
        verify(fileStorageService, never()).delete(anyString());
    }

    @Test
    @DisplayName("잡이 먼저 claim(PURGING)한 해제 업로드에 재연결과 실제 잡이 동시에 달려들면 잡이 삭제를 확정하고 재연결은 만료로 실패한다")
    void purgeWinsWhenJobAlreadyClaimedReleased() throws Exception {
        stubStorage();
        String storageKey = seedExpiredReleased();
        UploadedObject claimed = uploadedObjectRepository.findByStorageKey(storageKey).orElseThrow();
        claimed.markPurging();
        uploadedObjectRepository.save(claimed);
        TransactionTemplate transactionTemplate = new TransactionTemplate(platformTransactionManager);

        List<Throwable> failures = runConcurrently(
                () -> transactionTemplate.executeWithoutResult(status ->
                        uploadedObjectService.activate(STUB_PREFIX + storageKey)),
                () -> deleteEnabledJob().run());

        assertThat(statusOf(storageKey)).isEqualTo(UploadedObjectStatus.PURGED);
        assertThat(failures).hasSize(1);
        assertThat(failures.get(0)).isInstanceOf(FileException.UploadExpiredException.class);
        verify(fileStorageService, times(1)).delete(anyString());
    }
```
(`ChronoUnit`·`RepeatedTest` import 는 파일에 이미 있다 — 없으면 추가.)

- [ ] **Step 2: 통과 확인**

Run: `cd backend && ./gradlew test --tests "com.duing.global.file.purge.UploadActivationPurgeConcurrencyTest"`
Expected: BUILD SUCCESSFUL(기존 13 + 신규 12). 실패 시 프로덕션 코드를 고치지 말고 실패 케이스·상태·예외를 리포트한다.

- [ ] **Step 3: 전체 업로드 추적 회귀 + 컴파일**

Run: `cd backend && ./gradlew test --tests "com.duing.global.file.*" --tests "com.duing.domain.file.FileApiTest" --tests "com.duing.domain.club.service.ClubUploadActivationTest" --tests "com.duing.domain.notice.service.NoticeUploadActivationTest" --tests "com.duing.domain.promotion.service.PromotionUploadActivationTest" --tests "com.duing.domain.globalevent.service.GlobalEventUploadActivationTest" --tests "com.duing.domain.federation.service.FederationInquiryUploadActivationTest"`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 4: 커밋**

```bash
git add backend/src/test/java/com/duing/global/file/purge/UploadActivationPurgeConcurrencyTest.java
git commit -m "test(backend): 업로드 해제 ↔ 재연결 ↔ 파기 잡 경쟁 — 순서 무관 불변식·되돌리기 생존·claim 후 재연결 만료"
```

---

## 셀프 리뷰 (플랜 작성 후)

- **스펙 커버리지**: §2(Task 1) · §2.1(Task 1·3) · §3 API 3개(Task 3) · §3.1 해제 지점 11곳 — Club update/closure/photo delete(Task 5), Notice 4경로(Task 6), Promotion update/delete/removeAllOnClubClosure + GlobalEvent update/delete(Task 7) · §4.1 두 쿼리·PENDING 우선·절단 분리·INFO 복구·집계(Task 4) · §4.2 스캔 5테이블(Task 2) · §5 설정 변경 없음(yml 주석만, Task 4) · §6 예외 변경 없음 · §7 테스트 1~6 ↔ Task 1·2·3·5~7·4·8.
- **플레이스홀더**: 없음. "기존 인자 그대로" 표기는 변경하지 않는 코드에만 쓰였고 변경 지점은 전부 코드로 적었다.
- **타입 정합**: `findReleasedCandidates(Instant, Pageable)`(Task 2 정의 → Task 4 사용), `release(String...)`·`releaseIfReplaced(String, String)`·`releaseRemovedFrom(String, String)`(Task 3 정의 → Task 5~7 사용), `UploadedObject.release(Instant)`·`getReleasedAt()`(Task 1 → Task 2~4·8 테스트), `Counters.releasedStillReferenced`(Task 4 내부).
