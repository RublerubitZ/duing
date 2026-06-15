# 배너 공지 연결 Implementation Plan (Spec #8)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Spec `docs/superpowers/specs/2026-06-07-promotion-notice-link-design.md` 의 공지 연결 기능을 구현한다 — Promotion 에 `notice_id` 컬럼 추가, `link_url / notice_id / club_id` 중 ≤1 만 set 보장, 어드민 폼의 \"연결 대상\" 라디오 UX, NoticeSelector 컴포넌트, AdminPromotionResponse 의 derived `linkType` 필드, Spec #7 의 `resolvePromotionHref` 헬퍼에 NOTICE 분기 한 줄 추가.

**Architecture:** 백엔드+프론트 한 묶음 단일 PR. 백엔드는 V42 migration + 신규 enum + entity 필드 + 3중 검증(`@AssertTrue` + Service Validator + DB CHECK) + Notice fetch 시점에 `isAccessible` derive + AdminPromotionResponse 의 `linkType` derive. 프론트는 NoticeSelector(ClubSelector 패턴 재사용) + AdminPromotionForm linkType 라디오 UX + 비공개/삭제 공지 경고 표시 + BannerCarousel mapper 의 NOTICE 분기. **`useAdminNoticeListQuery` 의 `visibility` 파라미터는 풀스택에 이미 구현되어 있어 보강 작업 zero.**

**Tech Stack:** Spring Boot 3.4 / Java 21 / Flyway / JPA / QueryDSL / Hibernate Validator / Lombok / Postgres 16 (TestContainers) / TypeScript / Next.js 15 / React 19 / TanStack Query / Vitest + RTL / pnpm workspaces.

**Branch:** `feat/promotion-notice-link` (cut from latest develop)

---

## File Structure

### 백엔드 (~12 파일)

| Action | Path | 변경 내용 |
|--------|------|----------|
| Create | `backend/src/main/resources/db/migration/V42__alter_promotion_add_notice_link.sql` | notice_id 컬럼 + chk_promo_single_link CHECK + 부분 인덱스 |
| Create | `backend/src/main/java/com/duing/domain/promotion/entity/PromotionLinkType.java` | `enum { NONE, URL, NOTICE, CLUB }` |
| Modify | `backend/src/main/java/com/duing/domain/promotion/entity/Promotion.java` | `noticeId` 필드 (clubId 다음), `create()` 시그니처 + Builder + `UpdatePayload` + `update()` 분기 |
| Modify | `backend/src/main/java/com/duing/domain/promotion/service/dto/command/CreatePromotionCommand.java` | `noticeId` 필드 끝에 추가 |
| Modify | `backend/src/main/java/com/duing/domain/promotion/service/dto/command/UpdatePromotionCommand.java` | `noticeId` + `clearNoticeId` 필드 끝에 추가 |
| Modify | `backend/src/main/java/com/duing/domain/promotion/service/GeneralPromotionService.java` | Command 매핑 + Notice 검증 + Notice fetch (`isAccessible`) + batch fetch |
| Modify | `backend/src/main/java/com/duing/domain/promotion/controller/dto/request/CreatePromotionRequest.java` | `noticeId` + `@AssertTrue isSingleLinkTarget` |
| Modify | `backend/src/main/java/com/duing/domain/promotion/controller/dto/request/UpdatePromotionRequest.java` | `noticeId` + `clearNoticeId` + `@AssertTrue` |
| Modify | `backend/src/main/java/com/duing/domain/promotion/controller/dto/response/AdminPromotionResponse.java` | `notice` + `linkType` 필드 + derive 로직 |
| Modify | `backend/src/main/java/com/duing/domain/promotion/controller/dto/response/PromotionCardResponse.java` | `notice` 필드 (title 누출 방지) |
| Modify | `backend/src/main/java/com/duing/domain/promotion/service/dto/query/PromotionAdminListQuery.java` | `noticeId` 필드 |
| Modify | `backend/src/main/java/com/duing/domain/promotion/exception/PromotionException.java` | `MultipleLinkTargetsException`, `NonPublicNoticeLinkException` |

### 백엔드 테스트 (~3 파일)

| Action | Path | 변경 내용 |
|--------|------|----------|
| Modify | `backend/src/test/java/com/duing/domain/promotion/entity/PromotionTest.java` | UpdatePayload 시그니처 보정 + noticeId 케이스 |
| Modify | `backend/src/test/java/com/duing/domain/promotion/service/GeneralPromotionServiceTest.java` | Command 시그니처 보정 + 422 케이스 (다중 link, 비공개 notice) + isAccessible derive |
| Modify | `backend/src/test/java/com/duing/domain/promotion/controller/dto/request/PromotionRequestValidationTest.java` | `@AssertTrue isSingleLinkTarget` 케이스 |

### 프론트엔드 (~5 파일)

| Action | Path | 변경 내용 |
|--------|------|----------|
| Modify | `frontend/packages/types/src/admin.ts` | `PromotionLinkType` union, `AdminPromotionSummary.notice/linkType`, `Create/UpdatePromotionPayload.noticeId/clearNoticeId`, `PromotionCard.notice` |
| Create | `frontend/apps/web/app/admin/promotions/_components/NoticeSelector.tsx` | ClubSelector 패턴 재사용 |
| Modify | `frontend/apps/web/app/admin/promotions/_components/AdminPromotionForm.tsx` | `FormState.linkType` + `noticeId/noticeTitle`, isCuration 제거, 라디오 UI, handleLinkTypeChange 자동 클리어, submit 매핑, edit 모드 경고 |
| Modify | `frontend/apps/web/app/_components/sections/BannerCarousel.tsx` | `resolvePromotionHref` 에 notice 분기 한 줄 추가 |
| Modify | `frontend/apps/web/test/sections/banner/resolve-promotion-href.test.ts` | NOTICE 우선순위 케이스 추가 |

### 프론트 신규 테스트 (~1 파일)

| Action | Path | 변경 내용 |
|--------|------|----------|
| Modify | `frontend/apps/web/test/admin/promotions/admin-promotion-form-render-mode.test.tsx` | linkType 라디오 토글 + NoticeSelector mock + edit 모드 경고 (+6 케이스) |

**총 ~21 파일. 신규 RTL/단위/JUnit 테스트 ~15 케이스.**

---

## Task 0: 브랜치 생성

**Files:** none

- [ ] **Step 1: develop 동기화 + 브랜치**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git checkout develop
git pull origin develop
git checkout -b feat/promotion-notice-link
```

Expected: `Switched to a new branch 'feat/promotion-notice-link'`

---

## Task 1: V42 마이그레이션 + pre-flight 검증

**Files:**
- Create: `backend/src/main/resources/db/migration/V42__alter_promotion_add_notice_link.sql`

- [ ] **Step 1: pre-flight 검증 SQL 직접 실행 (TestContainers 환경에서는 V42 가 새로 만들어 빈 테이블 → 자동 통과)**

운영 환경에서는 다음 SQL 로 \"동시에 두 링크가 set 된 row\" 가 없는지 확인. 0 row 가 아니면 운영자가 한쪽 null 처리 후 진행.

```sql
SELECT id, club_id, link_url
FROM promotion
WHERE deleted_at IS NULL
  AND link_url IS NOT NULL
  AND club_id IS NOT NULL;
```

본 PR 의 CI/TestContainers 단에서는 promotion 테이블이 V42 적용 직전엔 V41 상태 (빈 테이블 또는 test fixture 만) — 자동 통과.

- [ ] **Step 2: V42 SQL 작성**

`backend/src/main/resources/db/migration/V42__alter_promotion_add_notice_link.sql`:

```sql
-- promotion: 공지 연결 지원. link_url / notice_id / club_id 중 ≤1 만 set.

ALTER TABLE promotion
    ADD COLUMN notice_id BIGINT REFERENCES notice(id);

ALTER TABLE promotion
    ADD CONSTRAINT chk_promo_single_link CHECK (
        (CASE WHEN link_url IS NOT NULL THEN 1 ELSE 0 END)
      + (CASE WHEN notice_id IS NOT NULL THEN 1 ELSE 0 END)
      + (CASE WHEN club_id IS NOT NULL THEN 1 ELSE 0 END) <= 1
    );

-- 어드민 목록 / 공개 피드의 notice JOIN 가속.
CREATE INDEX idx_promo_notice_id ON promotion (notice_id)
    WHERE notice_id IS NOT NULL AND deleted_at IS NULL;
```

- [ ] **Step 3: Flyway 적용 sanity (기존 promotion 통합 테스트 한 건)**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew test --tests "com.duing.domain.promotion.service.GeneralPromotionServiceTest.createSucceeds"
```

Expected: `BUILD SUCCESSFUL` — V42 가 깨끗하게 적용되어 기존 createSucceeds 통과.

- [ ] **Step 4: 커밋**

```bash
git add backend/src/main/resources/db/migration/V42__alter_promotion_add_notice_link.sql
git commit -m "feat(promotion): V42 — notice_id 컬럼 + chk_promo_single_link CHECK 제약"
```

---

## Task 2: PromotionLinkType enum + Promotion entity + 단위 테스트

**Files:**
- Create: `backend/src/main/java/com/duing/domain/promotion/entity/PromotionLinkType.java`
- Modify: `backend/src/main/java/com/duing/domain/promotion/entity/Promotion.java`
- Modify: `backend/src/test/java/com/duing/domain/promotion/entity/PromotionTest.java`

### Step 1: PromotionTest 의 기존 시그니처 보정 + 신규 케이스 추가 (실패 상태)

기존 `PromotionTest.java` 의 모든 `Promotion.create(...)` 호출 끝에 `null` 하나 추가 (noticeId 자리, 끝 부착).
모든 `new Promotion.UpdatePayload(...)` 호출에 끝에 `null, null` 두 개 추가 (positions 26 noticeId, 27 clearNoticeId).

예 (`createInitializesDefaults` 보정):

```java
Promotion promotion = Promotion.create(
        42L, "행사 배너", "/files/banner.png", "https://example.com",
        false, 10, 99L,
        null, null, null, null, PromotionPalette.INK,
        null, null,
        PromotionRenderMode.SYSTEM_COMPOSED, null,
        null);   // ← noticeId 신규 추가
```

예 (`partialUpdate` 안의 UpdatePayload):

```java
promotion.update(new Promotion.UpdatePayload(
        "새 제목", null, null, null, false, null, null,
        null, null, null, null, null,
        null, null,
        null, null,
        null, null, null, null, null, null,
        null, null,
        null,
        null, null));   // ← noticeId, clearNoticeId 끝 추가
```

신규 케이스 2건 (파일 끝):

```java
@Test
@DisplayName("noticeId 가 지정된 create 는 그대로 저장된다")
void createWithNoticeId() {
    Promotion promotion = Promotion.create(
            null, "T", "/files/b.png", null, true, 0, 1L,
            null, null, null, null, PromotionPalette.INK,
            null, null,
            PromotionRenderMode.SYSTEM_COMPOSED, null,
            42L);
    assertThat(promotion.getNoticeId()).isEqualTo(42L);
}

@Test
@DisplayName("clearNoticeId=true 면 noticeId 가 null 로 비워진다")
void clearNoticeId() {
    Promotion promotion = Promotion.create(
            null, "T", "/files/b.png", null, true, 0, 1L,
            null, null, null, null, PromotionPalette.INK,
            null, null,
            PromotionRenderMode.SYSTEM_COMPOSED, null,
            42L);
    promotion.update(new Promotion.UpdatePayload(
            null, null, null, null, null, null, null,
            null, null, null, null, null,
            null, null,
            null, null,
            null, null, null, null, null, null,
            null, null,
            null,
            null, true));  // clearNoticeId=true
    assertThat(promotion.getNoticeId()).isNull();
}
```

### Step 2: 실패 확인

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew compileTestJava
```

Expected: `BUILD FAILED` — `getNoticeId()`, `create(...)` 신규 시그니처, `UpdatePayload` 새 필드 모두 없음.

### Step 3: PromotionLinkType enum 생성

`backend/src/main/java/com/duing/domain/promotion/entity/PromotionLinkType.java`:

```java
package com.duing.domain.promotion.entity;

/**
 * Promotion 의 연결 대상 종류. AdminPromotionResponse 가 derive 해서 노출한다.
 * <p>NONE: link_url / notice_id / club_id 모두 null. 클릭 불가 배너.
 * <p>URL: 외부/내부 URL 직접 입력.
 * <p>NOTICE: 공지 연결. 공개 응답에서는 가시성 더블 체크로 isAccessible=false 면 비인터랙티브.
 * <p>CLUB: 동아리 연결.
 */
public enum PromotionLinkType {
    NONE,
    URL,
    NOTICE,
    CLUB
}
```

### Step 4: Promotion entity 갱신

`backend/src/main/java/com/duing/domain/promotion/entity/Promotion.java`:

**4-a) `noticeId` 필드 추가** (clubId 다음 위치, 의미 그루핑):

```java
@Column(name = "club_id") private Long clubId;
@Column(name = "notice_id") private Long noticeId;   // ← 신규
@Column(nullable = false, length = 120) private String title;
```

**4-b) Builder 시그니처에 `noticeId` 끝 추가**:

```java
private Promotion(Long clubId, String title, String bannerImageUrl, String linkUrl,
                  boolean active, int displayOrder, Long createdBy,
                  String tag, String subtitle, String ctaLabel, String emoji,
                  PromotionPalette palette,
                  LocalDateTime startAt, LocalDateTime endAt,
                  PromotionRenderMode renderMode, String imageAltText,
                  Long noticeId) {            // ← 끝에 추가
    this.clubId = clubId;
    this.noticeId = noticeId;                  // ← 본문에 매핑
    // ... 기존 매핑 ...
}
```

**4-c) `create()` 정적 메서드 시그니처에 `noticeId` 끝 추가**:

```java
public static Promotion create(
        Long clubId, String title, String bannerImageUrl, String linkUrl,
        boolean active, int displayOrder, Long createdBy,
        String tag, String subtitle, String ctaLabel, String emoji,
        PromotionPalette palette,
        LocalDateTime startAt, LocalDateTime endAt,
        PromotionRenderMode renderMode, String imageAltText,
        Long noticeId) {                       // ← 끝
    return Promotion.builder()
            .clubId(clubId).title(title).bannerImageUrl(bannerImageUrl).linkUrl(linkUrl)
            .active(active).displayOrder(displayOrder).createdBy(createdBy)
            .tag(tag).subtitle(subtitle).ctaLabel(ctaLabel).emoji(emoji)
            .palette(palette == null ? PromotionPalette.INK : palette)
            .startAt(startAt).endAt(endAt)
            .renderMode(renderMode == null ? PromotionRenderMode.SYSTEM_COMPOSED : renderMode)
            .imageAltText(imageAltText)
            .noticeId(noticeId)                // ← 신규
            .build();
}
```

**4-d) `UpdatePayload` 끝에 `noticeId`, `clearNoticeId` 추가**:

```java
public record UpdatePayload(
        String title,
        String bannerImageUrl,
        // ... 기존 필드들 25개 그대로 ...
        Boolean clearImageAltText,
        Long noticeId,            // ← 26
        Boolean clearNoticeId     // ← 27
) {}
```

**4-e) `update()` 본문에 분기 추가** (`clearImageAltText` 분기 다음):

```java
if (Boolean.TRUE.equals(payload.clearImageAltText())) this.imageAltText = null;
else if (payload.imageAltText() != null) this.imageAltText = payload.imageAltText();

if (Boolean.TRUE.equals(payload.clearNoticeId())) this.noticeId = null;
else if (payload.noticeId() != null) this.noticeId = payload.noticeId();
```

### Step 5: PASS 확인

```bash
./gradlew test --tests "com.duing.domain.promotion.entity.PromotionTest"
```

Expected: 신규 2건 포함 모두 PASS.

### Step 6: 커밋

```bash
git add backend/src/main/java/com/duing/domain/promotion/entity/PromotionLinkType.java \
        backend/src/main/java/com/duing/domain/promotion/entity/Promotion.java \
        backend/src/test/java/com/duing/domain/promotion/entity/PromotionTest.java
git commit -m "feat(promotion): PromotionLinkType enum + Promotion entity 에 noticeId 추가"
```

---

## Task 3: Command DTO + Service 기본 매핑 (검증 전 단계)

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/promotion/service/dto/command/CreatePromotionCommand.java`
- Modify: `backend/src/main/java/com/duing/domain/promotion/service/dto/command/UpdatePromotionCommand.java`
- Modify: `backend/src/main/java/com/duing/domain/promotion/service/GeneralPromotionService.java`
- Modify: `backend/src/test/java/com/duing/domain/promotion/service/GeneralPromotionServiceTest.java`

### Step 1: 기존 service 테스트 시그니처 보정 (실패 상태)

모든 `new CreatePromotionCommand(...)` 끝에 `null` 추가 (noticeId 자리).
모든 `new UpdatePromotionCommand(...)` 끝에 `null, null` 추가 (noticeId + clearNoticeId).

예:
```java
Long id = promotionService.create(new CreatePromotionCommand(
        null, "배너", "/files/b.png", "https://x", true, 1, admin.getId(),
        null, null, null, null, PromotionPalette.INK,
        null, null,
        PromotionRenderMode.SYSTEM_COMPOSED, null,
        null));  // ← noticeId 신규
```

### Step 2: 컴파일 실패 확인

```bash
./gradlew compileTestJava
```

Expected: BUILD FAILED — Command 시그니처 불일치.

### Step 3: CreatePromotionCommand 갱신

`CreatePromotionCommand.java`:

```java
package com.duing.domain.promotion.service.dto.command;

import com.duing.domain.promotion.entity.PromotionPalette;
import com.duing.domain.promotion.entity.PromotionRenderMode;
import java.time.LocalDateTime;

public record CreatePromotionCommand(
        Long clubId,
        String title,
        String bannerImageUrl,
        String linkUrl,
        boolean active,
        int displayOrder,
        Long createdBy,
        String tag,
        String subtitle,
        String ctaLabel,
        String emoji,
        PromotionPalette palette,
        LocalDateTime startAt,
        LocalDateTime endAt,
        PromotionRenderMode renderMode,
        String imageAltText,
        Long noticeId           // ← 끝에 추가
) {}
```

### Step 4: UpdatePromotionCommand 갱신

`UpdatePromotionCommand.java`:

```java
package com.duing.domain.promotion.service.dto.command;

import com.duing.domain.promotion.entity.PromotionPalette;
import com.duing.domain.promotion.entity.PromotionRenderMode;
import java.time.LocalDateTime;

public record UpdatePromotionCommand(
        Long promotionId,
        String title,
        String bannerImageUrl,
        String linkUrl,
        Long clubId,
        Boolean active,
        Integer displayOrder,
        Boolean clearClubId,
        String tag,
        String subtitle,
        String ctaLabel,
        String emoji,
        PromotionPalette palette,
        PromotionRenderMode renderMode,
        String imageAltText,
        LocalDateTime startAt,
        LocalDateTime endAt,
        Boolean clearBannerImageUrl,
        Boolean clearLinkUrl,
        Boolean clearTag,
        Boolean clearSubtitle,
        Boolean clearCtaLabel,
        Boolean clearEmoji,
        Boolean clearStartAt,
        Boolean clearEndAt,
        Boolean clearImageAltText,
        Long noticeId,           // ← 신규
        Boolean clearNoticeId    // ← 신규
) {}
```

### Step 5: GeneralPromotionService 매핑 갱신 (기본 pass-through, 검증은 Task 4)

`GeneralPromotionService.java` 의 `create()` 안 `Promotion.create(...)` 호출 끝에 `command.noticeId()` 추가:

```java
return promotionRepository.save(Promotion.create(
        command.clubId(), command.title(), command.bannerImageUrl(), command.linkUrl(),
        command.active(), command.displayOrder(), command.createdBy(),
        command.tag(), command.subtitle(), command.ctaLabel(), command.emoji(),
        command.palette(), command.startAt(), command.endAt(),
        command.renderMode(), command.imageAltText(),
        command.noticeId()       // ← 신규
)).getId();
```

`update()` 안 `Promotion.UpdatePayload(...)` 호출 끝에 `command.noticeId(), command.clearNoticeId()` 추가:

```java
promotion.update(new Promotion.UpdatePayload(
        command.title(), command.bannerImageUrl(), command.linkUrl(),
        command.clubId(), command.active(), command.displayOrder(), command.clearClubId(),
        command.tag(), command.subtitle(), command.ctaLabel(), command.emoji(),
        command.palette(), command.renderMode(), command.imageAltText(),
        command.startAt(), command.endAt(),
        command.clearBannerImageUrl(), command.clearLinkUrl(),
        command.clearTag(), command.clearSubtitle(),
        command.clearCtaLabel(), command.clearEmoji(),
        command.clearStartAt(), command.clearEndAt(),
        command.clearImageAltText(),
        command.noticeId(), command.clearNoticeId()   // ← 신규
));
```

### Step 6: service 테스트 PASS 확인

```bash
./gradlew test --tests "com.duing.domain.promotion.service.GeneralPromotionServiceTest"
```

Expected: BUILD SUCCESSFUL. 기존 테스트 + Task 1 의 sanity 모두 PASS.

### Step 7: 커밋

```bash
git add backend/src/main/java/com/duing/domain/promotion/service/dto/command/CreatePromotionCommand.java \
        backend/src/main/java/com/duing/domain/promotion/service/dto/command/UpdatePromotionCommand.java \
        backend/src/main/java/com/duing/domain/promotion/service/GeneralPromotionService.java \
        backend/src/test/java/com/duing/domain/promotion/service/GeneralPromotionServiceTest.java
git commit -m "feat(promotion): Command DTO 와 service 매핑에 noticeId/clearNoticeId pass-through"
```

---

## Task 4: Request DTO + @AssertTrue cross-field + Validator 테스트

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/promotion/controller/dto/request/CreatePromotionRequest.java`
- Modify: `backend/src/main/java/com/duing/domain/promotion/controller/dto/request/UpdatePromotionRequest.java`
- Modify: `backend/src/test/java/com/duing/domain/promotion/controller/dto/request/PromotionRequestValidationTest.java`

### Step 1: Validator 신규 테스트 4 케이스 추가 (실패 상태)

`PromotionRequestValidationTest.java` 의 클래스 끝에 추가:

```java
@Test
@DisplayName("CreatePromotionRequest: linkUrl + noticeId 동시 set 이면 검증 실패")
void createRejectsTwoLinks() {
    CreatePromotionRequest request = new CreatePromotionRequest(
            null, "T", null, "https://example.com", true, 0,
            null, null, null, null, PromotionPalette.INK,
            null, null,
            PromotionRenderMode.SYSTEM_COMPOSED, null,
            42L);  // ← noticeId 도 set
    Set<ConstraintViolation<CreatePromotionRequest>> violations = validator.validate(request);
    assertThat(violations).anyMatch(v -> v.getMessage().contains("하나만 선택"));
}

@Test
@DisplayName("CreatePromotionRequest: noticeId 만 set 이면 통과")
void createAllowsNoticeOnly() {
    CreatePromotionRequest request = new CreatePromotionRequest(
            null, "T", "/files/b.png", null, true, 0,
            null, null, null, null, PromotionPalette.INK,
            null, null,
            PromotionRenderMode.SYSTEM_COMPOSED, null,
            42L);
    Set<ConstraintViolation<CreatePromotionRequest>> violations = validator.validate(request);
    assertThat(violations).isEmpty();
}

@Test
@DisplayName("CreatePromotionRequest: 세 link 모두 null 이면 통과 (연결 안 함)")
void createAllowsNoLinks() {
    CreatePromotionRequest request = new CreatePromotionRequest(
            null, "T", "/files/b.png", null, true, 0,
            null, null, null, null, PromotionPalette.INK,
            null, null,
            PromotionRenderMode.SYSTEM_COMPOSED, null,
            null);
    Set<ConstraintViolation<CreatePromotionRequest>> violations = validator.validate(request);
    assertThat(violations).isEmpty();
}

@Test
@DisplayName("UpdatePromotionRequest: linkUrl + clubId + noticeId 셋 다 set 이면 검증 실패")
void updateRejectsAllThreeLinks() {
    UpdatePromotionRequest request = new UpdatePromotionRequest(
            null, null, "https://x.com", 7L, null, null, null,
            null, null, null, null, PromotionPalette.INK,
            PromotionRenderMode.SYSTEM_COMPOSED, null,
            null, null,
            null, null, null, null, null, null,
            null, null,
            null,
            42L,            // noticeId
            null);          // clearNoticeId
    Set<ConstraintViolation<UpdatePromotionRequest>> violations = validator.validate(request);
    assertThat(violations).anyMatch(v -> v.getMessage().contains("하나만 선택"));
}
```

(주의: 기존 PromotionRequestValidationTest 의 다른 케이스들도 Request 시그니처가 noticeId 추가로 +1 → 인자 보정 필요. 위 신규 테스트와 함께 자동으로 처리됨.)

### Step 2: 실패 확인

```bash
./gradlew test --tests "com.duing.domain.promotion.controller.dto.request.PromotionRequestValidationTest"
```

Expected: 컴파일 실패 (기존 인자 부족) 또는 새 케이스 실패.

### Step 3: 기존 테스트 시그니처 보정

`PromotionRequestValidationTest.java` 의 모든 기존 `new CreatePromotionRequest(...)` 끝에 `null` (noticeId) 추가, 모든 `new UpdatePromotionRequest(...)` 끝에 `null, null` (noticeId, clearNoticeId) 추가.

### Step 4: CreatePromotionRequest 갱신

`CreatePromotionRequest.java`:

```java
public record CreatePromotionRequest(
        Long clubId,
        @NotBlank(message = "제목은 필수입니다.")
        @Size(max = 120, message = "제목은 120자 이하여야 합니다.") String title,
        @Size(max = 500, message = "배너 이미지 URL은 500자 이하여야 합니다.") String bannerImageUrl,
        @Size(max = 2000, message = "링크는 2000자 이하여야 합니다.") String linkUrl,
        boolean active,
        @Min(value = 0, message = "정렬 순서는 0 이상이어야 합니다.") int displayOrder,
        @Size(max = 60, message = "태그는 60자 이하여야 합니다.") String tag,
        @Size(max = 200, message = "부제는 200자 이하여야 합니다.") String subtitle,
        @Size(max = 40, message = "CTA 라벨은 40자 이하여야 합니다.") String ctaLabel,
        @Size(max = 8, message = "이모지는 8자 이하여야 합니다.") String emoji,
        @NotNull(message = "팔레트는 필수입니다.") PromotionPalette palette,
        LocalDateTime startAt,
        LocalDateTime endAt,
        PromotionRenderMode renderMode,
        @Size(max = 200, message = "Alt Text는 200자 이하여야 합니다.") String imageAltText,
        Long noticeId   // ← 신규
) {
    @AssertTrue(message = "노출 종료 시각은 시작 시각 이후여야 합니다.")
    public boolean isScheduleRangeValid() {
        return startAt == null || endAt == null || startAt.isBefore(endAt);
    }

    @AssertTrue(message = "완성 이미지형 배너는 Alt Text가 필수입니다.")
    public boolean isImageAltTextRequiredForFullBleed() {
        return renderMode != PromotionRenderMode.FULL_BLEED_IMAGE
                || (imageAltText != null && !imageAltText.isBlank());
    }

    @AssertTrue(message = "완성 이미지형 배너는 배너 이미지가 필수입니다.")
    public boolean isBannerImageRequiredForFullBleed() {
        return renderMode != PromotionRenderMode.FULL_BLEED_IMAGE
                || (bannerImageUrl != null && !bannerImageUrl.isBlank());
    }

    @AssertTrue(message = "링크 대상은 외부 URL / 공지 / 동아리 중 하나만 선택 가능합니다.")
    public boolean isSingleLinkTarget() {
        int count = 0;
        if (linkUrl != null && !linkUrl.isBlank()) count++;
        if (noticeId != null) count++;
        if (clubId != null) count++;
        return count <= 1;
    }

    public CreatePromotionCommand toCommand(Long createdBy) {
        return new CreatePromotionCommand(
                clubId, title, bannerImageUrl, linkUrl, active, displayOrder, createdBy,
                tag, subtitle, ctaLabel, emoji, palette, startAt, endAt,
                renderMode, imageAltText, noticeId);
    }
}
```

### Step 5: UpdatePromotionRequest 갱신

`UpdatePromotionRequest.java`:

```java
public record UpdatePromotionRequest(
        @Size(max = 120, message = "제목은 120자 이하여야 합니다.") String title,
        @Size(max = 500, message = "배너 이미지 URL은 500자 이하여야 합니다.") String bannerImageUrl,
        @Size(max = 2000, message = "링크는 2000자 이하여야 합니다.") String linkUrl,
        Long clubId,
        Boolean active,
        @Min(value = 0, message = "정렬 순서는 0 이상이어야 합니다.") Integer displayOrder,
        Boolean clearClubId,
        @Size(max = 60, message = "태그는 60자 이하여야 합니다.") String tag,
        @Size(max = 200, message = "부제는 200자 이하여야 합니다.") String subtitle,
        @Size(max = 40, message = "CTA 라벨은 40자 이하여야 합니다.") String ctaLabel,
        @Size(max = 8, message = "이모지는 8자 이하여야 합니다.") String emoji,
        PromotionPalette palette,
        PromotionRenderMode renderMode,
        @Size(max = 200, message = "Alt Text는 200자 이하여야 합니다.") String imageAltText,
        LocalDateTime startAt,
        LocalDateTime endAt,
        Boolean clearBannerImageUrl,
        Boolean clearLinkUrl,
        Boolean clearTag,
        Boolean clearSubtitle,
        Boolean clearCtaLabel,
        Boolean clearEmoji,
        Boolean clearStartAt,
        Boolean clearEndAt,
        Boolean clearImageAltText,
        Long noticeId,           // ← 신규
        Boolean clearNoticeId    // ← 신규
) {
    @AssertTrue(message = "노출 종료 시각은 시작 시각 이후여야 합니다.")
    public boolean isScheduleRangeValid() {
        return startAt == null || endAt == null || startAt.isBefore(endAt);
    }

    @AssertTrue(message = "완성 이미지형 배너는 Alt Text가 필수입니다.")
    public boolean isImageAltTextRequiredForFullBleed() {
        return renderMode != PromotionRenderMode.FULL_BLEED_IMAGE
                || (imageAltText != null && !imageAltText.isBlank());
    }

    @AssertTrue(message = "완성 이미지형 배너는 배너 이미지가 필수입니다.")
    public boolean isBannerImageRequiredForFullBleed() {
        return renderMode != PromotionRenderMode.FULL_BLEED_IMAGE
                || (bannerImageUrl != null && !bannerImageUrl.isBlank());
    }

    @AssertTrue(message = "링크 대상은 외부 URL / 공지 / 동아리 중 하나만 선택 가능합니다.")
    public boolean isSingleLinkTarget() {
        int count = 0;
        if (linkUrl != null && !linkUrl.isBlank()) count++;
        if (noticeId != null) count++;
        if (clubId != null) count++;
        return count <= 1;
    }

    public UpdatePromotionCommand toCommand(Long promotionId) {
        return new UpdatePromotionCommand(
                promotionId, title, bannerImageUrl, linkUrl, clubId, active, displayOrder, clearClubId,
                tag, subtitle, ctaLabel, emoji, palette, renderMode, imageAltText, startAt, endAt,
                clearBannerImageUrl, clearLinkUrl, clearTag, clearSubtitle, clearCtaLabel, clearEmoji,
                clearStartAt, clearEndAt, clearImageAltText,
                noticeId, clearNoticeId);
    }
}
```

### Step 6: PASS 확인

```bash
./gradlew test --tests "com.duing.domain.promotion.controller.dto.request.PromotionRequestValidationTest"
```

Expected: 신규 4건 + 기존 케이스 모두 PASS.

### Step 7: 전체 promotion 테스트 회귀

```bash
./gradlew test --tests "com.duing.domain.promotion.*"
```

Expected: BUILD SUCCESSFUL.

### Step 8: 커밋

```bash
git add backend/src/main/java/com/duing/domain/promotion/controller/dto/request/CreatePromotionRequest.java \
        backend/src/main/java/com/duing/domain/promotion/controller/dto/request/UpdatePromotionRequest.java \
        backend/src/test/java/com/duing/domain/promotion/controller/dto/request/PromotionRequestValidationTest.java
git commit -m "feat(promotion): Request DTO 에 noticeId + 다중 link 금지 cross-field 검증"
```

---

## Task 5: 신규 예외 + Service Notice 검증 + 통합 테스트

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/promotion/exception/PromotionException.java`
- Modify: `backend/src/main/java/com/duing/domain/promotion/service/GeneralPromotionService.java`
- Modify: `backend/src/test/java/com/duing/domain/promotion/service/GeneralPromotionServiceTest.java`

### Step 1: 통합 테스트 신규 케이스 추가 (실패 상태)

`GeneralPromotionServiceTest.java` 끝에 추가:

```java
@Test
@DisplayName("공지 연결 create 가 PUBLIC 공지에 대해 성공한다")
void createWithPublicNoticeSucceeds() {
    User admin = saveAdmin();
    Notice notice = saveNotice(NoticeVisibility.PUBLIC);
    Long id = promotionService.create(new CreatePromotionCommand(
            null, "공지 배너", "/files/b.png", null, true, 0, admin.getId(),
            null, null, null, null, PromotionPalette.INK,
            null, null,
            PromotionRenderMode.SYSTEM_COMPOSED, null,
            notice.getId()));
    assertThat(promotionRepository.findById(id).orElseThrow().getNoticeId())
            .isEqualTo(notice.getId());
}

@Test
@DisplayName("비공개 공지를 연결하려고 하면 NonPublicNoticeLinkException")
void createWithNonPublicNoticeThrows() {
    User admin = saveAdmin();
    Notice notice = saveNotice(NoticeVisibility.OFFICERS_ALL);
    assertThatThrownBy(() -> promotionService.create(new CreatePromotionCommand(
            null, "T", "/files/b.png", null, true, 0, admin.getId(),
            null, null, null, null, PromotionPalette.INK,
            null, null,
            PromotionRenderMode.SYSTEM_COMPOSED, null,
            notice.getId())))
            .isInstanceOf(PromotionException.NonPublicNoticeLinkException.class);
}

@Test
@DisplayName("Service Validator 도 다중 link 를 거부한다 (Request 우회 시 안전망)")
void createRejectsMultipleLinks() {
    User admin = saveAdmin();
    Club club = clubRepository.save(Club.create(
            "두잉" + sequence.incrementAndGet(), ClubCategory.ACADEMIC, "분과", "설명", null));
    assertThatThrownBy(() -> promotionService.create(new CreatePromotionCommand(
            club.getId(), "T", "/files/b.png", "https://x.com", true, 0, admin.getId(),
            null, null, null, null, PromotionPalette.INK,
            null, null,
            PromotionRenderMode.SYSTEM_COMPOSED, null,
            null)))
            .isInstanceOf(PromotionException.MultipleLinkTargetsException.class);
}
```

추가 헬퍼 (클래스 안):

```java
private Notice saveNotice(NoticeVisibility visibility) {
    User author = saveAdmin();
    return noticeRepository.save(Notice.create(
            "테스트 공지" + sequence.incrementAndGet(),
            "요약",
            "본문",
            "/files/cover.png",
            null,
            NoticeCategory.NOTICE,
            new String[0],
            visibility,
            null,
            false,
            null,
            false,
            author.getId()));
}
```

import 추가:
```java
@Autowired NoticeRepository noticeRepository;
import com.duing.domain.notice.entity.Notice;
import com.duing.domain.notice.entity.NoticeCategory;
import com.duing.domain.notice.entity.NoticeVisibility;
import com.duing.domain.notice.repository.NoticeRepository;
```

(Notice.create 시그니처는 `backend/src/main/java/com/duing/domain/notice/entity/Notice.java:76` 의 정의를 그대로 사용. 만약 정확한 인자가 다르면 implementer 가 동일 파일 읽어 보정.)

### Step 2: 실패 확인

```bash
./gradlew test --tests "com.duing.domain.promotion.service.GeneralPromotionServiceTest"
```

Expected: 신규 3건 모두 실패 — 예외 클래스 없음 + 검증 로직 없음.

### Step 3: PromotionException 에 두 신규 예외 추가

`PromotionException.java` 안:

```java
public static class MultipleLinkTargetsException extends PromotionException {
    public MultipleLinkTargetsException() {
        super("링크 대상은 외부 URL / 공지 / 동아리 중 하나만 선택 가능합니다.",
              HttpStatus.UNPROCESSABLE_ENTITY);
    }
}

public static class NonPublicNoticeLinkException extends PromotionException {
    public NonPublicNoticeLinkException() {
        super("공지 배너 연결은 공개 공지(PUBLIC) 만 가능합니다.",
              HttpStatus.UNPROCESSABLE_ENTITY);
    }
}
```

기존 `PromotionException` 의 static inner class 패턴(`PromotionNotFoundException` 등) 과 동일 구조. 메시지 포맷도 일관.

### Step 4: GeneralPromotionService 에 검증 + Notice fetch 추가

`GeneralPromotionService.java` 상단에 NoticeRepository 주입 추가:

```java
private final PromotionRepository promotionRepository;
private final ClubRepository clubRepository;
private final UserRepository userRepository;
private final NoticeRepository noticeRepository;   // ← 신규
```

import:
```java
import com.duing.domain.notice.entity.Notice;
import com.duing.domain.notice.entity.NoticeVisibility;
import com.duing.domain.notice.repository.NoticeRepository;
```

`create()` 메서드 본문 시작부에 검증 블록 추가 (기존 `clubRepository.findById` 검증 옆):

```java
@Override
@Transactional
public Long create(CreatePromotionCommand command) {
    validateSingleLinkTarget(command.linkUrl(), command.noticeId(), command.clubId());
    validateNoticeIsPublic(command.noticeId());

    if (command.clubId() != null && clubRepository.findById(command.clubId()).isEmpty()) {
        throw new ClubException.ClubNotFoundException();
    }
    return promotionRepository.save(Promotion.create(...)).getId();
}
```

`update()` 도 동일하게 시작부에 검증 추가:

```java
@Override
@Transactional
public void update(UpdatePromotionCommand command) {
    Promotion promotion = promotionRepository.findById(command.promotionId())
            .orElseThrow(PromotionException.PromotionNotFoundException::new);

    validateSingleLinkTarget(command.linkUrl(), command.noticeId(), command.clubId());
    validateNoticeIsPublic(command.noticeId());

    // ... 기존 clubId 검증 등 ...
}
```

private 메서드 추가 (`GeneralPromotionService` 클래스 안 끝):

```java
private void validateSingleLinkTarget(String linkUrl, Long noticeId, Long clubId) {
    int count = 0;
    if (linkUrl != null && !linkUrl.isBlank()) count++;
    if (noticeId != null) count++;
    if (clubId != null) count++;
    if (count > 1) {
        throw new PromotionException.MultipleLinkTargetsException();
    }
}

private void validateNoticeIsPublic(Long noticeId) {
    if (noticeId == null) return;
    Notice notice = noticeRepository.findById(noticeId)
            .orElseThrow(NoticeException.NoticeNotFoundException::new);
    if (notice.getVisibility() != NoticeVisibility.PUBLIC) {
        throw new PromotionException.NonPublicNoticeLinkException();
    }
}
```

(`NoticeException.NoticeNotFoundException` 은 `backend/src/main/java/com/duing/domain/notice/exception/NoticeException.java` 에 이미 존재 가정. 없으면 implementer 가 한 곳 확인 후 import 보정.)

### Step 5: PASS 확인

```bash
./gradlew test --tests "com.duing.domain.promotion.service.GeneralPromotionServiceTest"
```

Expected: 신규 3건 + 기존 케이스 모두 PASS.

### Step 6: 전체 promotion 테스트 회귀

```bash
./gradlew test --tests "com.duing.domain.promotion.*"
```

Expected: BUILD SUCCESSFUL.

### Step 7: 커밋

```bash
git add backend/src/main/java/com/duing/domain/promotion/exception/PromotionException.java \
        backend/src/main/java/com/duing/domain/promotion/service/GeneralPromotionService.java \
        backend/src/test/java/com/duing/domain/promotion/service/GeneralPromotionServiceTest.java
git commit -m "feat(promotion): Service 단 다중 link 금지 + 비공개 공지 거부 (NoticeRepository 주입)"
```

---

## Task 6: Response DTO + linkType derive + Notice fetch (어드민·공개)

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/promotion/service/dto/query/PromotionAdminListQuery.java`
- Modify: `backend/src/main/java/com/duing/domain/promotion/controller/dto/response/AdminPromotionResponse.java`
- Modify: `backend/src/main/java/com/duing/domain/promotion/controller/dto/response/PromotionCardResponse.java`
- Modify: `backend/src/main/java/com/duing/domain/promotion/service/GeneralPromotionService.java`

### Step 1: PromotionAdminListQuery 에 noticeId 추가

`PromotionAdminListQuery.java` record 의 끝에 추가:

```java
public record PromotionAdminListQuery(
        Long id,
        ClubRef club,
        // ... 기존 필드들 ...
        LocalDateTime startAt,
        LocalDateTime endAt,
        PromotionRenderMode renderMode,
        String imageAltText,
        Long noticeId            // ← 신규
) {
    // ... ClubRef / UserRef record / of(...) 그대로 ...

    public static PromotionAdminListQuery of(
            Promotion promotion, ClubRef club, UserRef createdBy
    ) {
        return new PromotionAdminListQuery(
                promotion.getId(), club, promotion.getTitle(), promotion.getBannerImageUrl(),
                promotion.getLinkUrl(), promotion.isActive(), promotion.getDisplayOrder(),
                createdBy, promotion.getCreatedAt(), promotion.getUpdatedAt(),
                promotion.getTag(), promotion.getSubtitle(), promotion.getCtaLabel(),
                promotion.getEmoji(), promotion.getPalette(),
                promotion.getStartAt(), promotion.getEndAt(),
                promotion.getRenderMode(), promotion.getImageAltText(),
                promotion.getNoticeId());   // ← 신규
    }
}
```

### Step 2: AdminPromotionResponse 에 notice + linkType 추가

`AdminPromotionResponse.java`:

```java
public record AdminPromotionResponse(
        Long id,
        ClubRef club,
        // ... 기존 필드들 ...
        PromotionRenderMode renderMode,
        String imageAltText,
        NoticeRef notice,                // ← 신규
        PromotionLinkType linkType       // ← 신규 (derived)
) {
    public record ClubRef(Long id, String name) {}
    public record UserRef(Long id, String name) {}

    /** 어드민 응답 전용 — 운영자가 비공개/삭제 공지도 식별 가능해야 하므로 title 그대로 노출. */
    public record NoticeRef(Long id, String title, NoticeVisibility visibility, boolean isAccessible) {}

    public static AdminPromotionResponse of(
            Promotion promotion, ClubRef club, UserRef createdBy, NoticeRef notice
    ) {
        return new AdminPromotionResponse(
                promotion.getId(), club, promotion.getTitle(), promotion.getBannerImageUrl(),
                promotion.getLinkUrl(), promotion.isActive(), promotion.getDisplayOrder(),
                createdBy, promotion.getCreatedAt(), promotion.getUpdatedAt(),
                promotion.getTag(), promotion.getSubtitle(), promotion.getCtaLabel(),
                promotion.getEmoji(), promotion.getPalette(),
                promotion.getStartAt(), promotion.getEndAt(),
                promotion.getRenderMode(), promotion.getImageAltText(),
                notice,
                deriveLinkType(promotion));
    }

    public static AdminPromotionResponse from(PromotionAdminListQuery query, NoticeRef notice) {
        ClubRef clubRef = query.club() == null
                ? null
                : new ClubRef(query.club().id(), query.club().name());
        UserRef userRef = new UserRef(query.createdBy().id(), query.createdBy().name());
        PromotionLinkType linkType = deriveLinkType(query.linkUrl(), query.noticeId(), query.club() == null ? null : query.club().id());
        return new AdminPromotionResponse(
                query.id(), clubRef, query.title(), query.bannerImageUrl(),
                query.linkUrl(), query.active(), query.displayOrder(),
                userRef, query.createdAt(), query.updatedAt(),
                query.tag(), query.subtitle(), query.ctaLabel(), query.emoji(), query.palette(),
                query.startAt(), query.endAt(),
                query.renderMode(), query.imageAltText(),
                notice,
                linkType);
    }

    private static PromotionLinkType deriveLinkType(Promotion promotion) {
        return deriveLinkType(promotion.getLinkUrl(), promotion.getNoticeId(), promotion.getClubId());
    }

    private static PromotionLinkType deriveLinkType(String linkUrl, Long noticeId, Long clubId) {
        if (linkUrl != null && !linkUrl.isBlank()) return PromotionLinkType.URL;
        if (noticeId != null) return PromotionLinkType.NOTICE;
        if (clubId != null) return PromotionLinkType.CLUB;
        return PromotionLinkType.NONE;
    }
}
```

import 갱신: `PromotionLinkType`, `NoticeVisibility`.

### Step 3: PromotionCardResponse 에 notice 추가 (title 누출 방지)

`PromotionCardResponse.java`:

```java
public record PromotionCardResponse(
        // ... 기존 필드들 ...
        NoticeRef notice
) {
    public record ClubRef(Long id, String name) {}

    /** 공개 응답 전용 — isAccessible=false 면 title 을 빈 문자열로 채워 누출 방지. */
    public record NoticeRef(Long id, String title, boolean isAccessible) {}

    public static PromotionCardResponse of(Promotion promotion, ClubRef club, NoticeRef notice) {
        return new PromotionCardResponse(
                promotion.getId(), promotion.getTitle(), promotion.getSubtitle(),
                promotion.getCtaLabel(), promotion.getLinkUrl(), promotion.getPalette(),
                promotion.getBannerImageUrl(), promotion.getActive() ? null : null,  // (기존 필드 그대로)
                // ... 기존 ...
                notice);
    }
}
```

(실제 PromotionCardResponse 의 정확한 필드 순서/타입은 `backend/src/main/java/com/duing/domain/promotion/controller/dto/response/PromotionCardResponse.java` 를 읽어 확인 후 끝에만 추가.)

### Step 4: GeneralPromotionService 에 NoticeRef batch resolve + AdminPromotionResponse 호출 갱신

`GeneralPromotionService.java`:

**4-a) 헬퍼 메서드 (`resolveAdminNoticeRef`, `resolveCardNoticeRef`) 추가**:

```java
private AdminPromotionResponse.NoticeRef resolveAdminNoticeRef(Long noticeId, Map<Long, Notice> noticeMap) {
    if (noticeId == null) return null;
    Notice notice = noticeMap.get(noticeId);
    if (notice == null) {
        return new AdminPromotionResponse.NoticeRef(noticeId, AdminLabels.DELETED, null, false);
    }
    boolean accessible = notice.getVisibility() == NoticeVisibility.PUBLIC;
    return new AdminPromotionResponse.NoticeRef(
            notice.getId(), notice.getTitle(), notice.getVisibility(), accessible);
}

private PromotionCardResponse.NoticeRef resolveCardNoticeRef(Long noticeId, Map<Long, Notice> noticeMap) {
    if (noticeId == null) return null;
    Notice notice = noticeMap.get(noticeId);
    if (notice == null) {
        return new PromotionCardResponse.NoticeRef(noticeId, "", false);  // title 빈 문자열
    }
    boolean accessible = notice.getVisibility() == NoticeVisibility.PUBLIC;
    String title = accessible ? notice.getTitle() : "";  // title 누출 방지
    return new PromotionCardResponse.NoticeRef(notice.getId(), title, accessible);
}
```

**4-b) `listForAdmin` 에 noticeId 배치 페치 추가**:

```java
@Override
public Page<PromotionAdminListQuery> listForAdmin(
        PromotionAdminSearchCondition condition, Pageable pageable
) {
    Page<Promotion> promotionPage = promotionRepository.searchForAdmin(condition, pageable);

    Set<Long> clubIds = new HashSet<>();
    Set<Long> userIds = new HashSet<>();
    Set<Long> noticeIds = new HashSet<>();
    for (Promotion promotion : promotionPage.getContent()) {
        if (promotion.getClubId() != null) clubIds.add(promotion.getClubId());
        if (promotion.getNoticeId() != null) noticeIds.add(promotion.getNoticeId());
        userIds.add(promotion.getCreatedBy());
    }
    Map<Long, Club> clubMap = clubRepository.findAllById(clubIds).stream()
            .collect(Collectors.toMap(Club::getId, Function.identity()));
    Map<Long, User> userMap = userRepository.findAllById(userIds).stream()
            .collect(Collectors.toMap(User::getId, Function.identity()));
    Map<Long, Notice> noticeMap = noticeRepository.findAllById(noticeIds).stream()
            .collect(Collectors.toMap(Notice::getId, Function.identity()));

    return promotionPage.map(promotion -> PromotionAdminListQuery.of(
            promotion,
            resolveClubRef(promotion.getClubId(), clubMap.get(promotion.getClubId())),
            resolveUserRef(promotion.getCreatedBy(), userMap.get(promotion.getCreatedBy()))));
}
```

(AdminPromotionResponse 변환은 컨트롤러에서 `AdminPromotionResponse.from(query, noticeRef)` 호출로 가능. 단, listForAdmin 은 Query 까지만 반환하므로 NoticeRef 는 컨트롤러에서 별도로 batch resolve 필요 — 또는 listForAdmin 이 응답 매핑까지 담당하도록 시그니처 변경.

Simpler approach: listForAdmin 이 `Page<AdminPromotionResponse>` 를 직접 반환하도록 시그니처 변경. AdminController 가 이걸 그대로 ApiResponse.ok 로 감쌈.

그러나 이건 큰 변경이라 본 plan 범위에서는 \"Service 가 AdminPromotionResponse 매핑까지 책임지는 새 메서드\" 를 추가하지 않고, 컨트롤러에서 noticeMap 을 한번 더 batch resolve 하는 방식으로 처리.)

**4-c) `getAdminItemById` 도 noticeRef resolve 추가**:

```java
@Override
public PromotionAdminListQuery getAdminItemById(Long promotionId) {
    // ... 기존 그대로 ...
}
```

(query 자체는 그대로 두고, 컨트롤러에서 `AdminPromotionResponse.from(query, resolveAdminNoticeRef(query.noticeId(), Map.of(...)))` 로 처리.)

이 task 는 \"Service 의 자료구조만 noticeId 까지 확장\". 실제 NoticeRef resolve 는 컨트롤러 단에서 별도 batch fetch (`noticeRepository.findAllById(noticeIds)`) 후 매핑하는 형태로 통일. 컨트롤러 변경도 본 task 에 포함.

**4-d) AdminPromotionController 갱신**:

`AdminPromotionController.java` 의 listPromotions, getPromotion 메서드:

```java
@Override
public ResponseEntity<ApiResponse<PageResponse<AdminPromotionResponse>>> listPromotions(...) {
    Page<PromotionAdminListQuery> page = promotionService.listForAdmin(condition, pageable);
    Set<Long> noticeIds = page.getContent().stream()
            .map(PromotionAdminListQuery::noticeId)
            .filter(Objects::nonNull)
            .collect(Collectors.toSet());
    Map<Long, Notice> noticeMap = noticeRepository.findAllById(noticeIds).stream()
            .collect(Collectors.toMap(Notice::getId, Function.identity()));
    Page<AdminPromotionResponse> responsePage = page.map(query ->
            AdminPromotionResponse.from(query, resolveAdminNoticeRef(query.noticeId(), noticeMap)));
    return ResponseEntity.ok(ApiResponse.ok(PageResponse.from(responsePage)));
}
```

이런 컨트롤러 단 매핑 로직은 PR1 #278 의 기존 패턴 (clubMap 등) 과 일관.

**4-e) `findPublic` 매핑도 동일하게 noticeMap 처리**:

`PublicPromotionController` (또는 동일 컨트롤러의 공개 API 핸들러) 에서:

```java
Page<Promotion> publicPage = promotionService.findPublic(pageable);
Set<Long> noticeIds = publicPage.getContent().stream()
        .map(Promotion::getNoticeId)
        .filter(Objects::nonNull)
        .collect(Collectors.toSet());
Map<Long, Notice> noticeMap = noticeRepository.findAllById(noticeIds).stream()
        .collect(Collectors.toMap(Notice::getId, Function.identity()));
Page<PromotionCardResponse> responsePage = publicPage.map(promotion ->
        PromotionCardResponse.of(promotion,
                resolveCardClubRef(promotion.getClubId()),
                resolveCardNoticeRef(promotion.getNoticeId(), noticeMap)));
```

(실제 컨트롤러 위치 / 시그니처는 PromotionController 또는 GeneralPromotionService 의 `findPublic` 호출자를 확인. implementer 가 grep 으로 위치 찾아 동일 패턴 적용.)

### Step 5: typecheck + 전체 promotion 테스트

```bash
./gradlew test --tests "com.duing.domain.promotion.*"
```

Expected: BUILD SUCCESSFUL. 기존 케이스 + Task 5 의 통합 테스트 (NoticeRef 응답 확인까지 추가 케이스 1건 권장 가능, optional) 모두 PASS.

### Step 6: 커밋

```bash
git add backend/src/main/java/com/duing/domain/promotion/service/dto/query/PromotionAdminListQuery.java \
        backend/src/main/java/com/duing/domain/promotion/controller/dto/response/AdminPromotionResponse.java \
        backend/src/main/java/com/duing/domain/promotion/controller/dto/response/PromotionCardResponse.java \
        backend/src/main/java/com/duing/domain/promotion/service/GeneralPromotionService.java \
        backend/src/main/java/com/duing/domain/promotion/controller/AdminPromotionController.java \
        backend/src/main/java/com/duing/domain/promotion/controller/PromotionController.java
git commit -m "feat(promotion): 응답 DTO 에 notice + derived linkType + 가시성 더블 체크 (어드민·공개)"
```

---

## Task 7: 프론트엔드 타입 갱신

**Files:**
- Modify: `frontend/packages/types/src/admin.ts`

### Step 1: PromotionLinkType union + 응답 타입 갱신

`frontend/packages/types/src/admin.ts` 의 `PromotionRenderMode` 정의 근처에 추가:

```ts
/** 백엔드 derived. NONE=클릭 불가, URL=직접 URL, NOTICE=공지 연결, CLUB=동아리 연결. */
export type PromotionLinkType = 'NONE' | 'URL' | 'NOTICE' | 'CLUB';

/** 어드민 응답 — 운영자가 비공개/삭제 공지도 식별 가능해야 하므로 title 그대로. */
export type AdminPromotionNoticeRef = {
  id: number;
  title: string;
  visibility: 'PUBLIC' | 'OFFICERS_ALL' | 'CLUB_SCOPED';
  isAccessible: boolean;
};

/** 공개 응답 — isAccessible=false 면 title 이 빈 문자열로 옴 (백엔드 누출 방지). */
export type PublicPromotionNoticeRef = {
  id: number;
  title: string;
  isAccessible: boolean;
};
```

`AdminPromotionSummary` 끝에 두 필드 추가:

```ts
export type AdminPromotionSummary = {
  // ... 기존 필드들 ...
  renderMode: PromotionRenderMode;
  imageAltText: string | null;
  notice: AdminPromotionNoticeRef | null;   // ← 신규
  linkType: PromotionLinkType;              // ← 신규 (derived)
};
```

`CreatePromotionPayload` 끝에:

```ts
export type CreatePromotionPayload = {
  // ... 기존 필드들 ...
  renderMode?: PromotionRenderMode | null;
  imageAltText?: string | null;
  noticeId?: number | null;   // ← 신규
};
```

`UpdatePromotionPayload` 끝에:

```ts
export type UpdatePromotionPayload = {
  // ... 기존 ...
  clearImageAltText?: boolean;
  noticeId?: number;          // ← 신규
  clearNoticeId?: boolean;    // ← 신규
};
```

`PromotionCard` (공개 응답) 끝에:

```ts
export type PromotionCard = {
  // ... 기존 ...
  renderMode: PromotionRenderMode;
  imageAltText: string | null;
  notice: PublicPromotionNoticeRef | null;   // ← 신규
};
```

### Step 2: typecheck

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm --filter web typecheck
```
Expected: 0.

### Step 3: 커밋

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add frontend/packages/types/src/admin.ts
git commit -m "feat(promotion): 프론트 타입에 PromotionLinkType + Notice 응답/페이로드 추가"
```

---

## Task 8: NoticeSelector 컴포넌트 신규

**Files:**
- Create: `frontend/apps/web/app/admin/promotions/_components/NoticeSelector.tsx`

### Step 1: 컴포넌트 작성

`frontend/apps/web/app/admin/promotions/_components/NoticeSelector.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useAdminNoticeListQuery } from '@duing/hooks';
import { useDebouncedValue } from '../../_hooks/useDebouncedValue';

type Props = {
  selectedNoticeId: number | null;
  selectedNoticeTitle: string | null;
  onSelect: (noticeId: number, noticeTitle: string) => void;
  onClear: () => void;
};

const RESULT_PAGE_SIZE = 8;

export function NoticeSelector({ selectedNoticeId, selectedNoticeTitle, onSelect, onClear }: Props) {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const debouncedQuery = useDebouncedValue(query.trim(), 250);

  const searchQuery = useAdminNoticeListQuery({
    visibility: 'PUBLIC',
    keyword: debouncedQuery,
    page: 0,
    size: RESULT_PAGE_SIZE,
  });

  if (selectedNoticeId !== null) {
    return (
      <div className="border-line flex items-center justify-between rounded-md border bg-white px-3 py-2">
        <div className="text-sm">
          <span className="font-medium text-slate-900">{selectedNoticeTitle ?? `#${selectedNoticeId}`}</span>
          <span className="text-charcoal-3 ml-2 text-xs">ID {selectedNoticeId}</span>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="text-charcoal-3 rounded px-2 py-1 text-xs hover:bg-slate-100"
        >
          변경
        </button>
      </div>
    );
  }

  const showDropdown = focused && debouncedQuery.length > 0 && !searchQuery.isLoading;
  const results = searchQuery.data?.content ?? [];

  return (
    <div className="relative">
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        placeholder="공지 제목으로 검색 (PUBLIC 공지만)"
        className="border-line bg-paper w-full rounded-md border px-3 py-2 text-sm"
        autoComplete="off"
      />

      {searchQuery.isFetching && debouncedQuery.length > 0 && (
        <p className="text-charcoal-3 mt-1 text-xs">검색 중…</p>
      )}

      {showDropdown && (
        <div className="border-line absolute left-0 right-0 top-full z-10 mt-1 max-h-64 overflow-auto rounded-md border bg-white shadow-lg">
          {results.length === 0 ? (
            <p className="text-charcoal-3 px-3 py-3 text-sm">검색 결과가 없습니다.</p>
          ) : (
            <ul role="listbox">
              {results.map((notice) => (
                <li key={notice.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={false}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      onSelect(notice.id, notice.title);
                      setQuery('');
                      setFocused(false);
                    }}
                    className="block w-full px-3 py-2 text-left hover:bg-slate-50"
                  >
                    <div className="text-sm font-medium text-slate-900">{notice.title}</div>
                    <div className="text-charcoal-3 text-xs">
                      {notice.category ?? '카테고리 미지정'} · ID {notice.id}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
```

(`useAdminNoticeListQuery` 응답의 정확한 필드 — `notice.category` 등 — 은 plan 작성 시점 미확인. implementer 가 `@duing/types` 의 `AdminNoticeSummary` 같은 타입을 확인 후 정확 필드명으로 보정. 카테고리 미존재면 두 번째 줄을 \"ID {notice.id}\" 만 표시.)

### Step 2: typecheck

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm --filter web typecheck
```
Expected: 0. (`useAdminNoticeListQuery` 가 이미 visibility 파라미터 지원 — 별도 보강 불필요.)

### Step 3: 커밋

```bash
git add frontend/apps/web/app/admin/promotions/_components/NoticeSelector.tsx
git commit -m "feat(promotion): NoticeSelector 컴포넌트 신규 (ClubSelector 패턴, PUBLIC 만 노출)"
```

---

## Task 9: AdminPromotionForm linkType 라디오 UX 통합

**Files:**
- Modify: `frontend/apps/web/app/admin/promotions/_components/AdminPromotionForm.tsx`

### Step 1: FormState + buildInitialState 갱신

기존 `FormState` 에서:
- **제거**: `isCuration: boolean`
- **신규 추가**: `linkType`, `noticeId`, `noticeTitle`

```tsx
type FormState = {
  // ... 기존 필드들 ...
  linkType: PromotionLinkType;
  noticeId: number | null;
  noticeTitle: string | null;
};
```

`buildInitialState` 의 create 분기:
- `isCuration: true` 제거
- 추가: `linkType: 'NONE'`, `noticeId: null`, `noticeTitle: null`

`buildInitialState` 의 edit 분기:
- `isCuration: initialValues.club === null` 제거
- 추가:
  - `linkType: initialValues.linkType`,
  - `noticeId: initialValues.notice?.id ?? null`,
  - `noticeTitle: initialValues.notice?.title ?? null`

### Step 2: handleLinkTypeChange 헬퍼 추가

`AdminPromotionForm` 함수 본문에 추가 (state 다음):

```tsx
function handleLinkTypeChange(next: PromotionLinkType) {
  setState((prev) => ({
    ...prev,
    linkType: next,
    linkUrl: next === 'URL' ? prev.linkUrl : '',
    noticeId: next === 'NOTICE' ? prev.noticeId : null,
    noticeTitle: next === 'NOTICE' ? prev.noticeTitle : null,
    clubId: next === 'CLUB' ? prev.clubId : null,
    clubName: next === 'CLUB' ? prev.clubName : null,
  }));
}
```

### Step 3: 기존 \"동아리 연결\" 섹션 (isCuration 체크박스 + ClubSelector) 를 \"연결 대상\" 라디오 + 동적 입력으로 교체

기존 (line ~430 부근) 의 \"동아리 연결\" 영역 통째 삭제하고 다음으로 교체:

```tsx
{/* 연결 대상 라디오 */}
<div className="space-y-2">
  <span className="block text-[12.5px] font-semibold text-charcoal-2">연결 대상</span>
  <div className="flex flex-col gap-2 text-[13.5px]">
    {([
      { type: 'NONE' as const, label: '연결 안 함 — 클릭 불가 배너' },
      { type: 'URL' as const, label: '외부/내부 URL' },
      { type: 'NOTICE' as const, label: '공지 연결' },
      { type: 'CLUB' as const, label: '동아리 연결' },
    ]).map(({ type, label }) => (
      <label key={type} className="inline-flex items-center gap-2">
        <input
          type="radio"
          name="linkType"
          checked={state.linkType === type}
          onChange={() => handleLinkTypeChange(type)}
        />
        {label}
      </label>
    ))}
  </div>
</div>

{/* URL 입력 */}
{state.linkType === 'URL' && (
  <Field label="링크 URL (≤2000자)">
    <input
      type="url"
      maxLength={2000}
      value={state.linkUrl}
      onChange={(event) => update('linkUrl', event.target.value)}
      placeholder="https://..."
      className="w-full px-3.5 py-2 rounded-md border border-line bg-paper text-[14px]"
    />
  </Field>
)}

{/* 공지 선택 + 비공개/삭제 경고 */}
{state.linkType === 'NOTICE' && (
  <Field label="공지 선택">
    <NoticeSelector
      selectedNoticeId={state.noticeId}
      selectedNoticeTitle={state.noticeTitle}
      onSelect={(id, title) => setState((prev) => ({ ...prev, noticeId: id, noticeTitle: title }))}
      onClear={() => setState((prev) => ({ ...prev, noticeId: null, noticeTitle: null }))}
    />
    {props.mode === 'edit'
      && state.linkType === 'NOTICE'
      && state.noticeId !== null
      && props.initialValues.notice?.id === state.noticeId
      && props.initialValues.notice?.isAccessible === false && (
        <p className="mt-1 text-[12px] text-amber-600">
          연결된 공지가 비공개/삭제 상태입니다. 다시 선택하거나 다른 연결을 골라주세요.
        </p>
    )}
  </Field>
)}

{/* 동아리 선택 */}
{state.linkType === 'CLUB' && (
  <Field label="동아리 선택">
    <ClubSelector
      selectedClubId={state.clubId}
      selectedClubName={state.clubName}
      onSelect={(id, name) => setState((prev) => ({ ...prev, clubId: id, clubName: name }))}
      onClear={() => setState((prev) => ({ ...prev, clubId: null, clubName: null }))}
    />
  </Field>
)}
```

import 추가:
```tsx
import { NoticeSelector } from './NoticeSelector';
import type { PromotionLinkType } from '@duing/types';
```

### Step 4: submit 매핑 갱신

기존 `handleSubmit` 의 `mode === 'create'` 분기에서 다음 변수 계산을 교체:

```tsx
const linkUrlValue = state.linkType === 'URL' ? trimToNull(state.linkUrl) : null;
const noticeIdValue = state.linkType === 'NOTICE' ? state.noticeId : null;
const clubIdValue = state.linkType === 'CLUB' ? state.clubId : null;
```

기존 `const clubId = state.isCuration ? null : state.clubId;` 를 위 `clubIdValue` 로 대체.

create payload 에 `noticeId: noticeIdValue` 추가, `clubId: clubIdValue`, `linkUrl: linkUrlValue` 로 매핑.

`mode === 'edit'` 분기도 동일하게:
- linkUrl assign-or-clear 그대로 (linkUrlValue 사용)
- noticeId/clubId 도 동일 패턴 적용 (assign-or-clear)

```tsx
// noticeId — Spec #8 신규
if (noticeIdValue === null) {
  if (initialValues.notice !== null) payload.clearNoticeId = true;
} else {
  payload.noticeId = noticeIdValue;
}
```

`hadClub` / `nowCuration` 로직 (isCuration 기반) 은 제거하고 clubId 도 위 동일 패턴으로:

```tsx
if (clubIdValue === null) {
  if (initialValues.club !== null) payload.clearClubId = true;
} else {
  payload.clubId = clubIdValue;
}
```

### Step 5: typecheck + lint

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm --filter web typecheck
```
Expected: 0.

```bash
pnpm --filter web lint 2>&1 | grep -E "Warning|Error" | head -5
```
Expected: 기존 경고만.

### Step 6: 커밋

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add frontend/apps/web/app/admin/promotions/_components/AdminPromotionForm.tsx
git commit -m "feat(promotion): 어드민 폼에 연결 대상 라디오 UX + NoticeSelector 통합 + 비공개 공지 경고"
```

---

## Task 10: BannerCarousel resolvePromotionHref 에 NOTICE 분기 + helper 테스트 보강

**Files:**
- Modify: `frontend/apps/web/app/_components/sections/BannerCarousel.tsx`
- Modify: `frontend/apps/web/test/sections/banner/resolve-promotion-href.test.ts`

### Step 1: 실패하는 테스트 케이스 2건 추가

`resolve-promotion-href.test.ts` 의 describe 안에 추가:

```ts
it('linkUrl 없고 notice 가 isAccessible=true 면 /notices/{id} 를 반환한다', () => {
  expect(
    resolvePromotionHref(
      makePromotion({
        notice: { id: 42, title: '공지', isAccessible: true },
      }),
    ),
  ).toBe('/notices/42');
});

it('notice.isAccessible=false 면 notice 를 건너뛰고 다음 폴백으로 간다', () => {
  expect(
    resolvePromotionHref(
      makePromotion({
        notice: { id: 42, title: '', isAccessible: false },
        club: { id: 7, name: '두잉' },
      }),
    ),
  ).toBe('/clubs/7');
});
```

`makePromotion` 의 기본 객체에 `notice: null` 도 추가.

### Step 2: 실패 확인

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm --filter web test -- resolve-promotion-href
```

Expected: 신규 2건 실패 (현재 헬퍼가 notice 모름).

### Step 3: resolvePromotionHref 에 NOTICE 분기 한 줄 추가

`BannerCarousel.tsx` 의 헬퍼 함수에서:

```tsx
export function resolvePromotionHref(promotion: PromotionCard): string | null {
  if (promotion.linkUrl) return promotion.linkUrl;
  if (promotion.notice?.isAccessible) return `/notices/${promotion.notice.id}`;  // ← 신규
  if (promotion.club) return `/clubs/${promotion.club.id}`;
  return null;
}
```

### Step 4: PASS 확인

```bash
pnpm --filter web test -- resolve-promotion-href
```

Expected: 신규 2 + 기존 4 = 6 PASS.

### Step 5: 커밋

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add frontend/apps/web/app/_components/sections/BannerCarousel.tsx \
        frontend/apps/web/test/sections/banner/resolve-promotion-href.test.ts
git commit -m "feat(promotion): resolvePromotionHref 에 NOTICE 분기 한 줄 추가 (isAccessible 가드)"
```

---

## Task 11: RTL 테스트 — 폼 linkType 라디오 + NoticeSelector 통합

**Files:**
- Modify: `frontend/apps/web/test/admin/promotions/admin-promotion-form-render-mode.test.tsx`

### Step 1: NoticeSelector mock 추가 + 신규 6 케이스

`admin-promotion-form-render-mode.test.tsx` 의 vi.mock 영역에 추가:

```tsx
vi.mock('../../../app/admin/promotions/_components/NoticeSelector', () => ({
  NoticeSelector: (props: {
    selectedNoticeId: number | null;
    selectedNoticeTitle: string | null;
    onSelect: (id: number, title: string) => void;
    onClear: () => void;
  }) => (
    <div data-testid="notice-selector">
      <button type="button" onClick={() => props.onSelect(42, '테스트 공지')}>공지 선택</button>
      {props.selectedNoticeId !== null && (
        <span data-testid="notice-selected">{props.selectedNoticeTitle ?? props.selectedNoticeId}</span>
      )}
    </div>
  ),
}));
```

(기존 ClubSelector mock 패턴과 동일.)

신규 테스트 케이스 (describe 끝에):

```tsx
it('초기 렌더는 연결 대상 NONE 라디오가 선택돼 있다', () => {
  renderCreateForm();
  expect(screen.getByRole('radio', { name: /연결 안 함/ })).toBeChecked();
});

it('URL 라디오 선택 시 URL 입력란만 노출된다', () => {
  renderCreateForm();
  fireEvent.click(screen.getByRole('radio', { name: /외부\/내부 URL/ }));
  expect(screen.getByPlaceholderText(/https:\/\//)).toBeInTheDocument();
  expect(screen.queryByTestId('notice-selector')).not.toBeInTheDocument();
  expect(screen.queryByTestId('club-selector')).not.toBeInTheDocument();
});

it('NOTICE 라디오 선택 시 NoticeSelector 만 노출된다', () => {
  renderCreateForm();
  fireEvent.click(screen.getByRole('radio', { name: /공지 연결/ }));
  expect(screen.getByTestId('notice-selector')).toBeInTheDocument();
  expect(screen.queryByPlaceholderText(/https:\/\//)).not.toBeInTheDocument();
  expect(screen.queryByTestId('club-selector')).not.toBeInTheDocument();
});

it('CLUB 라디오 선택 시 ClubSelector 만 노출된다', () => {
  renderCreateForm();
  fireEvent.click(screen.getByRole('radio', { name: /동아리 연결/ }));
  expect(screen.getByTestId('club-selector')).toBeInTheDocument();
  expect(screen.queryByTestId('notice-selector')).not.toBeInTheDocument();
  expect(screen.queryByPlaceholderText(/https:\/\//)).not.toBeInTheDocument();
});

it('URL → NOTICE 전환 시 URL 입력값이 자동 클리어된다', () => {
  renderCreateForm();
  fireEvent.click(screen.getByRole('radio', { name: /외부\/내부 URL/ }));
  const urlInput = screen.getByPlaceholderText(/https:\/\//);
  fireEvent.change(urlInput, { target: { value: 'https://example.com' } });
  fireEvent.click(screen.getByRole('radio', { name: /공지 연결/ }));
  // URL 입력란 사라짐
  expect(screen.queryByPlaceholderText(/https:\/\//)).not.toBeInTheDocument();
  // 다시 URL 로 토글 → 빈 값
  fireEvent.click(screen.getByRole('radio', { name: /외부\/내부 URL/ }));
  expect((screen.getByPlaceholderText(/https:\/\//) as HTMLInputElement).value).toBe('');
});

it('edit 모드 + 비공개 공지 연결 시 경고 문구가 노출된다', () => {
  const initialValues = {
    // ... 최소 필수 필드들 (id, title, club:null, palette, etc.) ...
    id: 1,
    club: null,
    title: '비공개 공지 연결 배너',
    bannerImageUrl: null,
    linkUrl: null,
    active: true,
    displayOrder: 0,
    createdBy: { id: 1, name: 'admin' },
    createdAt: '2026-06-01T00:00:00',
    updatedAt: '2026-06-01T00:00:00',
    tag: null,
    subtitle: null,
    ctaLabel: null,
    emoji: null,
    palette: 'INK' as const,
    startAt: null,
    endAt: null,
    renderMode: 'SYSTEM_COMPOSED' as const,
    imageAltText: null,
    notice: { id: 42, title: '비공개', visibility: 'OFFICERS_ALL' as const, isAccessible: false },
    linkType: 'NOTICE' as const,
  };
  render(
    <AdminPromotionForm
      mode="edit"
      initialValues={initialValues}
      isSubmitting={false}
      onSubmit={vi.fn().mockResolvedValue(undefined)}
    />,
  );
  expect(screen.getByText(/비공개\/삭제 상태입니다/)).toBeInTheDocument();
});
```

### Step 2: 테스트 실행

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm --filter web test -- admin-promotion-form-render-mode
```

Expected: 신규 6건 + 기존 케이스 모두 PASS.

### Step 3: 커밋

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add frontend/apps/web/test/admin/promotions/admin-promotion-form-render-mode.test.tsx
git commit -m "test(promotion): 어드민 폼 linkType 라디오 + NoticeSelector + 비공개 공지 경고 RTL"
```

---

## Task 12: 최종 회귀 + PR + 머지

**Files:** none

### Step 1: 전체 회귀

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew test --tests "com.duing.domain.promotion.*"
```
Expected: BUILD SUCCESSFUL.

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm --filter web typecheck && pnpm --filter web lint 2>&1 | grep -E "Warning|Error" | head -5 && pnpm --filter web test
```
Expected: typecheck 0, lint 기존 경고만, 전체 web 테스트 모두 PASS.

### Step 2: 브랜치 push

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git push -u origin feat/promotion-notice-link
```

### Step 3: PR 생성

```bash
gh pr create --base develop --title "feat(promotion): Spec #8 — 배너 공지 연결 (linkType 라디오 + NoticeSelector + 가시성 더블 체크)" --body "$(cat <<'EOF'
## 🚀 작업 내용
spec \`docs/superpowers/specs/2026-06-07-promotion-notice-link-design.md\` 구현. 배너의 연결 대상에 \"공지\" 를 추가하고 어드민이 \"연결 대상\" 라디오(NONE/URL/NOTICE/CLUB) 로 의도를 명시할 수 있도록 했습니다.

### 데이터 모델
- V42: \`notice_id BIGINT REFERENCES notice(id)\` 컬럼 + \`chk_promo_single_link\` CHECK 제약 (link_url / notice_id / club_id 중 ≤1)
- \`PromotionLinkType\` enum (NONE/URL/NOTICE/CLUB) — 백엔드 derived 후 AdminPromotionResponse 노출
- 기존 데이터 영향 zero (notice_id NULL 이 모든 행)

### 3중 검증
- Request \`@AssertTrue isSingleLinkTarget\` (1차)
- Service-level \`validateSingleLinkTarget\` + \`validateNoticeIsPublic\` (2차) — 친절한 422 메시지
- DB CHECK (3차 — last-resort)

### 가시성 더블 체크
- 저장 시: PUBLIC 외 공지 연결 시 \`NonPublicNoticeLinkException\` (422)
- 조회 시: 공개 응답에서 notice 가 \`isAccessible=false\` 면 title 을 빈 문자열로 채워 누출 방지 + 프론트 mapper 가 NOTICE 분기를 건너뛰어 href=null → Spec #7 비인터랙티브 컨테이너

### 어드민 UI
- 라디오 4종 (NONE/URL/NOTICE/CLUB) + 타입별 동적 입력
- 라디오 전환 시 다른 타입 입력값 자동 클리어
- edit 모드에서 연결된 공지가 비공개/삭제이면 amber 경고 노출
- \`isCuration\` boolean state 제거 (라디오에 흡수)
- NoticeSelector 신규 컴포넌트 (ClubSelector 패턴 재사용)

### 공개 렌더
- BannerCarousel 의 \`resolvePromotionHref\` 헬퍼에 NOTICE 분기 한 줄 추가 (Spec #7 의 helper 확장점 활용)
- 우선순위: linkUrl > notice (isAccessible) > club > null

### 테스트
- 백엔드 PromotionTest +2, GeneralPromotionServiceTest +3 (PUBLIC OK / 비공개 거부 / 다중 link 거부), PromotionRequestValidationTest +4
- 프론트 resolve-promotion-href +2, admin-promotion-form-render-mode +6
- 전체 회귀 PASS

## 🤔 고민했던 내용
spec §1 의 Option A (linkType enum + linkTarget polymorphic) vs Option B (별도 컬럼) 검토 끝에 **Option B + 어드민 라디오 UX** 채택. 기존 \`linkUrl\`, \`club_id\` 데이터 영향 zero / 마이그레이션 위험 낮음 / Option A 의 깔끔한 어드민 의도는 \"라디오 + derived linkType\" 로 동등하게 구현. \`AdminPromotionResponse.linkType\` 은 백엔드가 데이터에서 자동 도출해 프론트 edit 초기화가 한 줄로 끝남.

\`PromotionCardResponse.notice.title\` 은 \`isAccessible=false\` 일 때 빈 문자열로 채워 비공개 공지 제목이 공개 API 로 누출되지 않도록 했습니다 (AdminPromotionResponse 는 운영자 식별용이라 title 그대로 노출).

기존 PR2 의 \"모드 토글 보존 정책\" 과 본 PR 의 \"linkType 전환 시 자동 클리어\" 가 의도적으로 다릅니다. 모드(SYSTEM/FULL_BLEED) 는 \"표시 방식\" 토글이라 데이터 보존이 자연스럽지만, 연결 타입은 \"의도 자체가 갈리는\" 선택이라 자동 클리어가 DB CHECK 제약과 일치합니다.

\`useAdminNoticeListQuery\` 의 \`visibility\` 파라미터는 풀스택(hook + API client + 백엔드 controller) 에 이미 구현되어 있어 보강 작업이 zero 였습니다.

## 💬 리뷰 중점사항
- 3중 검증이 동작 일관성을 해치지 않는지 (Request @AssertTrue / Service Validator / DB CHECK 가 같은 의미 다른 시점)
- \`PromotionCardResponse.notice.title\` 빈 문자열 채우기가 비공개 공지 제목 누출 방지를 정확히 달성하는지
- 어드민이 PUBLIC 공지를 선택한 후 운영자가 그 공지를 비공개로 전환했을 때 — 메인 페이지에서 해당 배너가 클릭 불가 상태로 바뀌고, 어드민 edit 폼은 경고를 띄우는지
- linkType 라디오 전환 시 자동 클리어가 의도된 UX 인지 (선행 PR 의 \"보존 정책\" 과 다름이 합리적인지)
- NoticeSelector 가 PUBLIC 만 노출하고 운영자 의도 우회를 백엔드 422 가 막는지
EOF
)"
```

### Step 4: PR 번호 캡처 후 머지

```bash
PR_NUMBER=$(gh pr view --json number --jq .number)
gh pr merge $PR_NUMBER --squash --delete-branch
gh pr view $PR_NUMBER --json state,mergedAt
```

Expected: `"state":"MERGED"`.

### Step 5: develop 동기화

```bash
git checkout develop
git pull origin develop
```

---

## Self-Review (작성자 체크리스트)

**Spec coverage:**

| Spec § | 요구 | Task |
|--------|------|------|
| §3.1 V42 + CHECK 제약 | Task 1 |
| §3.2 pre-flight 검증 | Task 1 (CI 환경 자동 통과 + 운영 별도 명시) |
| §3.3 entity noticeId 필드 + UpdatePayload + update() 분기 | Task 2 |
| §4.1 DB CHECK | Task 1 |
| §4.2 Service Validator | Task 5 |
| §4.3 Notice 존재성 + visibility 검증 | Task 5 |
| §4.4 Request @AssertTrue cross-field | Task 4 |
| §5.1 PromotionLinkType enum | Task 2 |
| §5.2 AdminPromotionResponse: notice + linkType derived | Task 6 |
| §5.3 PromotionCardResponse: notice (title 누출 방지) | Task 6 |
| §5.4 PromotionAdminListQuery + batch fetch | Task 6 |
| §6 가시성 더블 체크 (저장 + 조회) | Task 5 (저장) + Task 6 (조회) |
| §7 resolvePromotionHref NOTICE 분기 | Task 10 |
| §8 어드민 폼 라디오 + 동적 입력 + 자동 클리어 + 경고 | Task 9 |
| §9 권한/삭제 정책 | Task 5 (저장 시 422) + Task 6 (조회 시 isAccessible false) |
| §10 NoticeSelector | Task 8 |
| §12 RTL 테스트 | Task 11 (form) + Task 10 (helper) |

**Placeholder scan:** \"TBD\", \"TODO\", \"적절히 처리\" 없음. 단, Task 6 의 \"PromotionCardResponse 정확한 필드 순서는 implementer 가 파일 읽고 확인\" / Task 8 의 \"useAdminNoticeListQuery 응답의 정확한 카테고리 필드는 implementer 가 확인\" 두 군데는 의도된 \"파일 read 후 보정\" 으로 명시 — 명확한 작업 지시.

**Type consistency:**
- `PromotionLinkType` 식별자 일관 (백엔드 enum / 프론트 union)
- `noticeId` / `clearNoticeId` 필드명 일관 (Promotion entity / UpdatePayload / Command / Request / Payload 모두 동일)
- `isAccessible` boolean 명 일관 (백엔드 NoticeRef / 프론트 NoticeRef / 프론트 mapper 가드)
- `validateSingleLinkTarget` / `validateNoticeIsPublic` 메서드명 일관 (Task 5)

---

## 참고

- spec: `docs/superpowers/specs/2026-06-07-promotion-notice-link-design.md`
- 선행 사양: PR1~3 + refinements + Spec #7
- 선행 PR: #278 / #279 / #280 / #281 / #285 / #286 / #287
- 메모리 가이드 준수: Conventional Commits, `[#이슈번호]` 형식 금지, Co-Authored-By 라인 금지, `gh pr checks --watch` 금지.
