# FULL_BLEED_IMAGE PR1 — 스키마 + enum + 응답 노출 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Spec `docs/superpowers/specs/2026-06-07-promotion-full-bleed-image-design.md` §9 의 PR1 단계를 구현한다 — `PromotionRenderMode` enum, `image_alt_text` 컬럼, cross-field 검증을 추가하되 기존 데이터·렌더링·UI 에 영향이 zero 인 backward-compatible 변경.

**Architecture:** 백엔드 단방향 추가 변경. `render_mode VARCHAR(20) NOT NULL DEFAULT 'SYSTEM_COMPOSED'` 컬럼이 기존 row 를 자동 채워 데이터 영향 zero. Cross-field `@AssertTrue` 두 개가 FULL_BLEED 의 필수 조건(이미지 + alt) 을 강제하지만 SYSTEM_COMPOSED 경로는 그대로. 프론트엔드는 타입 갱신만, UI 는 PR2 에서.

**Tech Stack:** Spring Boot 3.4 / Java 21 / Flyway / JPA / QueryDSL / Hibernate Validator (Jakarta) / Lombok / Postgres 16 (TestContainers) / TypeScript / pnpm workspaces / `tsc --noEmit` / next lint.

**Branch:** `feat/promotion-render-mode-schema` (cut from latest develop)

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `backend/src/main/resources/db/migration/V41__alter_promotion_add_render_mode.sql` | `render_mode` / `image_alt_text` 컬럼 추가 + CHECK 제약 |
| Create | `backend/src/main/java/com/duing/domain/promotion/entity/PromotionRenderMode.java` | enum 두 값 |
| Modify | `backend/src/main/java/com/duing/domain/promotion/entity/Promotion.java` | 필드 2개, `create()` 시그니처, `UpdatePayload` 확장, `update()` 의 partial-update 로직 |
| Modify | `backend/src/main/java/com/duing/domain/promotion/service/dto/command/CreatePromotionCommand.java` | 필드 2개 추가 |
| Modify | `backend/src/main/java/com/duing/domain/promotion/service/dto/command/UpdatePromotionCommand.java` | 필드 3개 추가 (renderMode, imageAltText, clearImageAltText) |
| Modify | `backend/src/main/java/com/duing/domain/promotion/service/GeneralPromotionService.java` | create/update 매핑에 새 필드 pass-through |
| Modify | `backend/src/main/java/com/duing/domain/promotion/controller/dto/request/CreatePromotionRequest.java` | 필드 2개 + `@AssertTrue` 검증 메서드 2개 |
| Modify | `backend/src/main/java/com/duing/domain/promotion/controller/dto/request/UpdatePromotionRequest.java` | 필드 3개 + `@AssertTrue` 검증 메서드 2개 |
| Modify | `backend/src/main/java/com/duing/domain/promotion/controller/dto/response/AdminPromotionResponse.java` | 응답에 `renderMode` / `imageAltText` 노출 |
| Modify | `backend/src/main/java/com/duing/domain/promotion/controller/dto/response/PromotionCardResponse.java` | 공개 응답에 `renderMode` / `imageAltText` 노출 |
| Modify | `backend/src/main/java/com/duing/domain/promotion/service/dto/query/PromotionAdminListQuery.java` | 어드민 목록 query DTO 확장 |
| Modify | `backend/src/test/java/com/duing/domain/promotion/entity/PromotionTest.java` | 기존 시그니처 보정 + 신규 5케이스 |
| Modify | `backend/src/test/java/com/duing/domain/promotion/service/GeneralPromotionServiceTest.java` | 기존 시그니처 보정 |
| Create | `backend/src/test/java/com/duing/domain/promotion/controller/dto/request/PromotionRequestValidationTest.java` | Validator 직접 호출로 cross-field 422 케이스 검증 |
| Modify | `frontend/packages/types/src/admin.ts` | `PromotionRenderMode` union + Summary/Card/Payload 갱신 |

`api/` 패키지(`AdminPromotionApi.java` 등) 는 springdoc 가 record 의 Bean Validation 어노테이션을 자동 Swagger 화하므로 PR1 에서 손대지 않는다.

---

## Task 0: 브랜치 생성

**Files:** none

- [ ] **Step 1: develop 동기화 + 브랜치 생성**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git checkout develop
git pull origin develop
git checkout -b feat/promotion-render-mode-schema
```

Expected: `Switched to a new branch 'feat/promotion-render-mode-schema'`

---

## Task 1: V41 마이그레이션

**Files:**
- Create: `backend/src/main/resources/db/migration/V41__alter_promotion_add_render_mode.sql`

- [ ] **Step 1: 마이그레이션 SQL 작성**

```sql
-- promotion: 렌더 모드 + 완성 이미지형용 alt 텍스트.
-- render_mode NOT NULL DEFAULT 'SYSTEM_COMPOSED' 로 기존 row 모두 자동 채워 데이터 영향 zero.
ALTER TABLE promotion
    ADD COLUMN render_mode    VARCHAR(20)  NOT NULL DEFAULT 'SYSTEM_COMPOSED',
    ADD COLUMN image_alt_text VARCHAR(200);

ALTER TABLE promotion
    ADD CONSTRAINT chk_promo_render_mode
    CHECK (render_mode IN ('SYSTEM_COMPOSED','FULL_BLEED_IMAGE'));
```

- [ ] **Step 2: Flyway 가 적용되는지 기존 통합 테스트로 sanity 확인**

Run: `cd backend && ./gradlew test --tests "com.duing.domain.promotion.service.GeneralPromotionServiceTest.createSucceeds"`

Expected: `BUILD SUCCESSFUL` (TestContainers 가 Postgres 띄우면서 V40 까지 + V41 까지 모두 적용된 후 기존 createSucceeds 가 통과한다).

- [ ] **Step 3: 커밋**

```bash
git add backend/src/main/resources/db/migration/V41__alter_promotion_add_render_mode.sql
git commit -m "feat(promotion): V41 — render_mode / image_alt_text 컬럼 추가"
```

---

## Task 2: PromotionRenderMode enum + Promotion entity + entity 단위 테스트

**Files:**
- Create: `backend/src/main/java/com/duing/domain/promotion/entity/PromotionRenderMode.java`
- Modify: `backend/src/main/java/com/duing/domain/promotion/entity/Promotion.java`
- Modify: `backend/src/test/java/com/duing/domain/promotion/entity/PromotionTest.java`

- [ ] **Step 1: 신규 테스트 + 기존 테스트 시그니처 보정 (실패 상태)**

`backend/src/test/java/com/duing/domain/promotion/entity/PromotionTest.java` 의 모든 `Promotion.create(...)` 호출 끝에 `, PromotionRenderMode.SYSTEM_COMPOSED, null` (또는 케이스별 의도된 값) 두 인자를 더하고, 모든 `new Promotion.UpdatePayload(...)` 호출에 `renderMode` / `imageAltText` (위치 13~14) + `clearImageAltText` (마지막) 인자 3개를 더한다.

기존 호출 보정 예 (`createInitializesDefaults`):

```java
Promotion promotion = Promotion.create(
        42L, "행사 배너", "/files/banner.png", "https://example.com",
        false, 10, 99L,
        null, null, null, null, PromotionPalette.INK,
        null, null,
        PromotionRenderMode.SYSTEM_COMPOSED, null);
```

기존 `UpdatePayload` 호출 보정 예 (`partialUpdate`):

```java
promotion.update(new Promotion.UpdatePayload(
        "새 제목", null, null, null, false, null, null,
        null, null, null, null, null,
        null, null,
        null, null,
        null, null, null, null, null, null,
        null, null,
        null));
```

(위치 카운트: 1-7 title~clearClubId, 8-12 tag~palette, **13-14 renderMode/imageAltText**, 15-16 startAt/endAt, 17-22 clearBannerImageUrl~clearEmoji, 23-24 clearStartAt/clearEndAt, **25 clearImageAltText**)

신규 케이스 5개를 파일 끝에 추가:

```java
@Test
@DisplayName("renderMode 가 명시되지 않은 create 는 SYSTEM_COMPOSED 로 폴백된다")
void createDefaultsToSystemComposed() {
    Promotion promotion = Promotion.create(
            null, "T", "/files/b.png", null, true, 0, 1L,
            null, null, null, null, PromotionPalette.INK,
            null, null,
            null, null);
    assertThat(promotion.getRenderMode()).isEqualTo(PromotionRenderMode.SYSTEM_COMPOSED);
    assertThat(promotion.getImageAltText()).isNull();
}

@Test
@DisplayName("FULL_BLEED_IMAGE + imageAltText 가 지정된 create 는 그대로 저장된다")
void createWithFullBleed() {
    Promotion promotion = Promotion.create(
            null, "T", "/files/b.png", null, true, 0, 1L,
            null, null, null, null, PromotionPalette.INK,
            null, null,
            PromotionRenderMode.FULL_BLEED_IMAGE, "2026 해커톤 포스터");
    assertThat(promotion.getRenderMode()).isEqualTo(PromotionRenderMode.FULL_BLEED_IMAGE);
    assertThat(promotion.getImageAltText()).isEqualTo("2026 해커톤 포스터");
}

@Test
@DisplayName("update 에서 renderMode 가 null 이면 기존 모드를 유지한다 (partial-update 규칙)")
void updateRenderModeNullIsNoChange() {
    Promotion promotion = Promotion.create(
            null, "T", "/files/b.png", null, true, 0, 1L,
            null, null, null, null, PromotionPalette.INK,
            null, null,
            PromotionRenderMode.FULL_BLEED_IMAGE, "alt");
    promotion.update(new Promotion.UpdatePayload(
            "새 제목", null, null, null, null, null, null,
            null, null, null, null, null,
            null, null,
            null, null,
            null, null, null, null, null, null,
            null, null,
            null));
    assertThat(promotion.getRenderMode()).isEqualTo(PromotionRenderMode.FULL_BLEED_IMAGE);
    assertThat(promotion.getImageAltText()).isEqualTo("alt");
}

@Test
@DisplayName("renderMode 만 토글하는 update 가 다른 필드를 건드리지 않는다 (모드 보존 가드)")
void updateRenderModeToggleDoesNotClearOtherFields() {
    Promotion promotion = Promotion.create(
            null, "원래 제목", "/files/b.png", "https://x", true, 0, 1L,
            "TAG", "sub", "CTA", "🎉", PromotionPalette.WARM,
            null, null,
            PromotionRenderMode.SYSTEM_COMPOSED, null);
    promotion.update(new Promotion.UpdatePayload(
            null, null, null, null, null, null, null,
            null, null, null, null, null,
            PromotionRenderMode.FULL_BLEED_IMAGE, null,
            null, null,
            null, null, null, null, null, null,
            null, null,
            null));
    assertThat(promotion.getRenderMode()).isEqualTo(PromotionRenderMode.FULL_BLEED_IMAGE);
    assertThat(promotion.getTitle()).isEqualTo("원래 제목");
    assertThat(promotion.getTag()).isEqualTo("TAG");
    assertThat(promotion.getSubtitle()).isEqualTo("sub");
    assertThat(promotion.getCtaLabel()).isEqualTo("CTA");
    assertThat(promotion.getEmoji()).isEqualTo("🎉");
    assertThat(promotion.getPalette()).isEqualTo(PromotionPalette.WARM);
    assertThat(promotion.getLinkUrl()).isEqualTo("https://x");
}

@Test
@DisplayName("clearImageAltText=true 면 imageAltText 가 null 로 비워진다")
void clearImageAltText() {
    Promotion promotion = Promotion.create(
            null, "T", "/files/b.png", null, true, 0, 1L,
            null, null, null, null, PromotionPalette.INK,
            null, null,
            PromotionRenderMode.SYSTEM_COMPOSED, "기존 alt");
    promotion.update(new Promotion.UpdatePayload(
            null, null, null, null, null, null, null,
            null, null, null, null, null,
            null, null,
            null, null,
            null, null, null, null, null, null,
            null, null,
            true));
    assertThat(promotion.getImageAltText()).isNull();
}
```

import 도 함께 추가: `import static org.assertj.core.api.Assertions.assertThat;` 는 이미 있고, `PromotionRenderMode` 는 같은 패키지라 import 불필요.

- [ ] **Step 2: 테스트 컴파일 실패 확인**

Run: `cd backend && ./gradlew compileTestJava`

Expected: `BUILD FAILED` — `PromotionRenderMode` 심볼 없음, `Promotion.create` / `UpdatePayload` 시그니처 불일치.

- [ ] **Step 3: enum 작성**

`backend/src/main/java/com/duing/domain/promotion/entity/PromotionRenderMode.java`:

```java
package com.duing.domain.promotion.entity;

/**
 * 프로모션 배너 렌더 모드.
 * <p>SYSTEM_COMPOSED: 어드민 입력(제목/부제목/CTA/팔레트/이미지) 을 프론트가 조합해 렌더.
 * <p>FULL_BLEED_IMAGE: 업로드한 이미지만 가공 없이 그대로 노출(시스템 텍스트·그라데이션·팔레트 미사용).
 */
public enum PromotionRenderMode {
    SYSTEM_COMPOSED,
    FULL_BLEED_IMAGE
}
```

- [ ] **Step 4: Promotion entity 수정**

`backend/src/main/java/com/duing/domain/promotion/entity/Promotion.java` 의 필드 영역에 추가 (`palette` 다음, `startAt` 위):

```java
@Enumerated(EnumType.STRING)
@Column(name = "render_mode", nullable = false, length = 20)
private PromotionRenderMode renderMode;

/** 완성 이미지형 배너의 접근성/SEO 용 alt 텍스트. SYSTEM_COMPOSED 에서는 의미 없음. */
@Column(name = "image_alt_text", length = 200)
private String imageAltText;
```

Builder 생성자 시그니처와 본문에 두 필드 추가:

```java
@Builder(access = AccessLevel.PRIVATE)
private Promotion(Long clubId, String title, String bannerImageUrl, String linkUrl,
                  boolean active, int displayOrder, Long createdBy,
                  String tag, String subtitle, String ctaLabel, String emoji,
                  PromotionPalette palette, LocalDateTime startAt, LocalDateTime endAt,
                  PromotionRenderMode renderMode, String imageAltText) {
    this.clubId = clubId;
    this.title = title;
    this.bannerImageUrl = bannerImageUrl;
    this.linkUrl = linkUrl;
    this.active = active;
    this.displayOrder = displayOrder;
    this.createdBy = createdBy;
    this.tag = tag;
    this.subtitle = subtitle;
    this.ctaLabel = ctaLabel;
    this.emoji = emoji;
    this.palette = palette;
    this.startAt = startAt;
    this.endAt = endAt;
    this.renderMode = renderMode;
    this.imageAltText = imageAltText;
}
```

`create()` 정적 메서드 시그니처와 body 갱신 — `renderMode == null` 이면 `SYSTEM_COMPOSED` 폴백(`palette` 가 INK 로 폴백되는 것과 동일 패턴):

```java
public static Promotion create(Long clubId, String title, String bannerImageUrl, String linkUrl,
                               boolean active, int displayOrder, Long createdBy,
                               String tag, String subtitle, String ctaLabel, String emoji,
                               PromotionPalette palette,
                               LocalDateTime startAt, LocalDateTime endAt,
                               PromotionRenderMode renderMode, String imageAltText) {
    return Promotion.builder()
            .clubId(clubId).title(title).bannerImageUrl(bannerImageUrl).linkUrl(linkUrl)
            .active(active).displayOrder(displayOrder).createdBy(createdBy)
            .tag(tag).subtitle(subtitle).ctaLabel(ctaLabel).emoji(emoji)
            .palette(palette == null ? PromotionPalette.INK : palette)
            .startAt(startAt).endAt(endAt)
            .renderMode(renderMode == null ? PromotionRenderMode.SYSTEM_COMPOSED : renderMode)
            .imageAltText(imageAltText)
            .build();
}
```

`UpdatePayload` record 확장 (renderMode, imageAltText 를 palette 다음에 / clearImageAltText 를 끝에):

```java
public record UpdatePayload(
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
        Boolean clearImageAltText
) {}
```

`update()` 본문 끝에 두 분기 추가 (`renderMode==null` 은 \"변경 안 함\", `imageAltText` 는 clear 플래그 + 일반 set 분기):

```java
if (payload.palette() != null) this.palette = payload.palette();

if (payload.renderMode() != null) this.renderMode = payload.renderMode();

if (Boolean.TRUE.equals(payload.clearImageAltText())) this.imageAltText = null;
else if (payload.imageAltText() != null) this.imageAltText = payload.imageAltText();

if (Boolean.TRUE.equals(payload.clearStartAt())) this.startAt = null;
else if (payload.startAt() != null) this.startAt = payload.startAt();
// ... (기존 clearEndAt 분기 그대로)
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd backend && ./gradlew test --tests "com.duing.domain.promotion.entity.PromotionTest"`

Expected: `BUILD SUCCESSFUL`, 신규 5케이스 포함 모두 PASS.

- [ ] **Step 6: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/promotion/entity/PromotionRenderMode.java \
        backend/src/main/java/com/duing/domain/promotion/entity/Promotion.java \
        backend/src/test/java/com/duing/domain/promotion/entity/PromotionTest.java
git commit -m "feat(promotion): PromotionRenderMode enum + Promotion entity 에 renderMode/imageAltText 추가"
```

---

## Task 3: Command DTO + Service mapping + service test 시그니처 보정

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/promotion/service/dto/command/CreatePromotionCommand.java`
- Modify: `backend/src/main/java/com/duing/domain/promotion/service/dto/command/UpdatePromotionCommand.java`
- Modify: `backend/src/main/java/com/duing/domain/promotion/service/GeneralPromotionService.java`
- Modify: `backend/src/test/java/com/duing/domain/promotion/service/GeneralPromotionServiceTest.java`

- [ ] **Step 1: 기존 service 테스트 시그니처를 새 Command 모양에 맞춰 보정 (실패 상태)**

모든 `new CreatePromotionCommand(...)` 끝에 `, PromotionRenderMode.SYSTEM_COMPOSED, null` 두 인자 추가.

예 (`createSucceeds`):

```java
Long id = promotionService.create(new CreatePromotionCommand(
        null, "배너", "/files/b.png", "https://x", true, 1, admin.getId(),
        null, null, null, null, PromotionPalette.INK,
        null, null,
        PromotionRenderMode.SYSTEM_COMPOSED, null));
```

모든 `new UpdatePromotionCommand(...)` 의 시그니처에 위치 14-15 에 `renderMode/imageAltText` 두 인자, 마지막에 `clearImageAltText` 인자 추가. 기존 partialUpdate 호출:

```java
promotionService.update(new UpdatePromotionCommand(
        id, null, null, null, null, false, 5, null,
        null, null, null, null, null,
        null, null,
        null, null,
        null, null, null, null, null, null,
        null, null,
        null));
```

(위치: 1-13 promotionId~palette, 14-15 renderMode/imageAltText, 16-17 startAt/endAt, 18-23 clearBannerImageUrl~clearEmoji, 24-25 clearStartAt/clearEndAt, **26 clearImageAltText**)

- [ ] **Step 2: 컴파일 실패 확인**

Run: `cd backend && ./gradlew compileTestJava`

Expected: `BUILD FAILED` — Command 시그니처 불일치.

- [ ] **Step 3: CreatePromotionCommand 갱신**

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
        String imageAltText
) {}
```

- [ ] **Step 4: UpdatePromotionCommand 갱신**

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
        Boolean clearImageAltText
) {}
```

- [ ] **Step 5: GeneralPromotionService 의 create / update 매핑 갱신**

`create()` 안의 `Promotion.create(...)` 호출:

```java
return promotionRepository.save(Promotion.create(
        command.clubId(), command.title(), command.bannerImageUrl(), command.linkUrl(),
        command.active(), command.displayOrder(), command.createdBy(),
        command.tag(), command.subtitle(), command.ctaLabel(), command.emoji(),
        command.palette(), command.startAt(), command.endAt(),
        command.renderMode(), command.imageAltText()
)).getId();
```

`update()` 안의 `promotion.update(new Promotion.UpdatePayload(...))`:

```java
promotion.update(new Promotion.UpdatePayload(
        command.title(), command.bannerImageUrl(), command.linkUrl(),
        command.clubId(), command.active(), command.displayOrder(), command.clearClubId(),
        command.tag(), command.subtitle(), command.ctaLabel(), command.emoji(),
        command.palette(),
        command.renderMode(), command.imageAltText(),
        command.startAt(), command.endAt(),
        command.clearBannerImageUrl(), command.clearLinkUrl(),
        command.clearTag(), command.clearSubtitle(),
        command.clearCtaLabel(), command.clearEmoji(),
        command.clearStartAt(), command.clearEndAt(),
        command.clearImageAltText()
));
```

- [ ] **Step 6: 백엔드 컴파일 + service 테스트 통과 확인**

Run: `cd backend && ./gradlew test --tests "com.duing.domain.promotion.service.GeneralPromotionServiceTest"`

Expected: `BUILD SUCCESSFUL`. 기존 service 테스트 모두 PASS — 422 케이스는 아직 미추가 상태로 그대로 통과.

- [ ] **Step 7: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/promotion/service/dto/command/CreatePromotionCommand.java \
        backend/src/main/java/com/duing/domain/promotion/service/dto/command/UpdatePromotionCommand.java \
        backend/src/main/java/com/duing/domain/promotion/service/GeneralPromotionService.java \
        backend/src/test/java/com/duing/domain/promotion/service/GeneralPromotionServiceTest.java
git commit -m "feat(promotion): Command DTO 와 service 매핑에 renderMode/imageAltText pass-through"
```

---

## Task 4: Request DTO + cross-field 검증 + Validator 단위 테스트

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/promotion/controller/dto/request/CreatePromotionRequest.java`
- Modify: `backend/src/main/java/com/duing/domain/promotion/controller/dto/request/UpdatePromotionRequest.java`
- Create: `backend/src/test/java/com/duing/domain/promotion/controller/dto/request/PromotionRequestValidationTest.java`

- [ ] **Step 1: Validator 단위 테스트 작성 (실패 상태)**

`backend/src/test/java/com/duing/domain/promotion/controller/dto/request/PromotionRequestValidationTest.java`:

```java
package com.duing.domain.promotion.controller.dto.request;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.domain.promotion.entity.PromotionPalette;
import com.duing.domain.promotion.entity.PromotionRenderMode;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import java.util.Set;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class PromotionRequestValidationTest {

    private static ValidatorFactory factory;
    private static Validator validator;

    @BeforeAll
    static void setUp() {
        factory = Validation.buildDefaultValidatorFactory();
        validator = factory.getValidator();
    }

    @AfterAll
    static void tearDown() {
        factory.close();
    }

    @Test
    @DisplayName("CreatePromotionRequest: FULL_BLEED_IMAGE 인데 imageAltText 가 비어 있으면 검증 실패")
    void createFullBleedRequiresAltText() {
        CreatePromotionRequest request = new CreatePromotionRequest(
                null, "T", "/files/b.png", null, true, 0,
                null, null, null, null, PromotionPalette.INK,
                null, null,
                PromotionRenderMode.FULL_BLEED_IMAGE, null);
        Set<ConstraintViolation<CreatePromotionRequest>> violations = validator.validate(request);
        assertThat(violations).anyMatch(v -> v.getMessage().contains("Alt Text"));
    }

    @Test
    @DisplayName("CreatePromotionRequest: FULL_BLEED_IMAGE 인데 bannerImageUrl 이 비어 있으면 검증 실패")
    void createFullBleedRequiresBannerImage() {
        CreatePromotionRequest request = new CreatePromotionRequest(
                null, "T", null, null, true, 0,
                null, null, null, null, PromotionPalette.INK,
                null, null,
                PromotionRenderMode.FULL_BLEED_IMAGE, "alt");
        Set<ConstraintViolation<CreatePromotionRequest>> violations = validator.validate(request);
        assertThat(violations).anyMatch(v -> v.getMessage().contains("배너 이미지가 필수"));
    }

    @Test
    @DisplayName("CreatePromotionRequest: SYSTEM_COMPOSED 는 alt / 이미지 누락이어도 통과")
    void createSystemComposedAllowsMissingAltAndImage() {
        CreatePromotionRequest request = new CreatePromotionRequest(
                null, "T", null, null, true, 0,
                null, null, null, null, PromotionPalette.INK,
                null, null,
                PromotionRenderMode.SYSTEM_COMPOSED, null);
        Set<ConstraintViolation<CreatePromotionRequest>> violations = validator.validate(request);
        assertThat(violations).isEmpty();
    }

    @Test
    @DisplayName("UpdatePromotionRequest: FULL_BLEED_IMAGE + alt 공백이면 검증 실패")
    void updateFullBleedRequiresAltText() {
        UpdatePromotionRequest request = new UpdatePromotionRequest(
                null, null, null, null, null, null, null,
                null, null, null, null, PromotionPalette.INK,
                PromotionRenderMode.FULL_BLEED_IMAGE, "   ",
                null, null,
                null, null, null, null, null, null,
                null, null, null);
        Set<ConstraintViolation<UpdatePromotionRequest>> violations = validator.validate(request);
        assertThat(violations).anyMatch(v -> v.getMessage().contains("Alt Text"));
    }
}
```

- [ ] **Step 2: 테스트 컴파일 실패 확인**

Run: `cd backend && ./gradlew compileTestJava`

Expected: `BUILD FAILED` — Request 시그니처가 아직 새 필드를 모름.

- [ ] **Step 3: CreatePromotionRequest 갱신**

```java
package com.duing.domain.promotion.controller.dto.request;

import com.duing.domain.promotion.entity.PromotionPalette;
import com.duing.domain.promotion.entity.PromotionRenderMode;
import com.duing.domain.promotion.service.dto.command.CreatePromotionCommand;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDateTime;

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
        @Size(max = 200, message = "Alt Text는 200자 이하여야 합니다.") String imageAltText
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

    public CreatePromotionCommand toCommand(Long createdBy) {
        return new CreatePromotionCommand(
                clubId, title, bannerImageUrl, linkUrl, active, displayOrder, createdBy,
                tag, subtitle, ctaLabel, emoji, palette, startAt, endAt,
                renderMode, imageAltText);
    }
}
```

- [ ] **Step 4: UpdatePromotionRequest 갱신**

```java
package com.duing.domain.promotion.controller.dto.request;

import com.duing.domain.promotion.entity.PromotionPalette;
import com.duing.domain.promotion.entity.PromotionRenderMode;
import com.duing.domain.promotion.service.dto.command.UpdatePromotionCommand;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import java.time.LocalDateTime;

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
        Boolean clearImageAltText
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

    public UpdatePromotionCommand toCommand(Long promotionId) {
        return new UpdatePromotionCommand(
                promotionId, title, bannerImageUrl, linkUrl, clubId, active, displayOrder, clearClubId,
                tag, subtitle, ctaLabel, emoji, palette, renderMode, imageAltText, startAt, endAt,
                clearBannerImageUrl, clearLinkUrl, clearTag, clearSubtitle, clearCtaLabel, clearEmoji,
                clearStartAt, clearEndAt, clearImageAltText);
    }
}
```

- [ ] **Step 5: 테스트 PASS 확인**

Run: `cd backend && ./gradlew test --tests "com.duing.domain.promotion.controller.dto.request.PromotionRequestValidationTest"`

Expected: `BUILD SUCCESSFUL`, 4건 모두 PASS.

- [ ] **Step 6: 전체 promotion 테스트 회귀 확인**

Run: `cd backend && ./gradlew test --tests "com.duing.domain.promotion.*"`

Expected: `BUILD SUCCESSFUL`, 신규 + 기존 케이스 모두 PASS.

- [ ] **Step 7: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/promotion/controller/dto/request/CreatePromotionRequest.java \
        backend/src/main/java/com/duing/domain/promotion/controller/dto/request/UpdatePromotionRequest.java \
        backend/src/test/java/com/duing/domain/promotion/controller/dto/request/PromotionRequestValidationTest.java
git commit -m "feat(promotion): Request DTO 에 renderMode/imageAltText + FULL_BLEED 필수 cross-field 검증"
```

---

## Task 5: Response DTO + admin list query

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/promotion/controller/dto/response/AdminPromotionResponse.java`
- Modify: `backend/src/main/java/com/duing/domain/promotion/controller/dto/response/PromotionCardResponse.java`
- Modify: `backend/src/main/java/com/duing/domain/promotion/service/dto/query/PromotionAdminListQuery.java`

- [ ] **Step 1: PromotionAdminListQuery 갱신**

`backend/src/main/java/com/duing/domain/promotion/service/dto/query/PromotionAdminListQuery.java` 의 record 필드 끝에 두 필드 추가하고 `of()` 매핑에 `promotion.getRenderMode()`, `promotion.getImageAltText()` pass-through:

```java
package com.duing.domain.promotion.service.dto.query;

import com.duing.domain.promotion.entity.Promotion;
import com.duing.domain.promotion.entity.PromotionPalette;
import com.duing.domain.promotion.entity.PromotionRenderMode;
import java.time.LocalDateTime;

public record PromotionAdminListQuery(
        Long id,
        ClubRef club,
        String title,
        String bannerImageUrl,
        String linkUrl,
        boolean active,
        int displayOrder,
        UserRef createdBy,
        LocalDateTime createdAt,
        LocalDateTime updatedAt,
        String tag,
        String subtitle,
        String ctaLabel,
        String emoji,
        PromotionPalette palette,
        LocalDateTime startAt,
        LocalDateTime endAt,
        PromotionRenderMode renderMode,
        String imageAltText
) {
    public record ClubRef(Long id, String name) {}
    public record UserRef(Long id, String name) {}

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
                promotion.getRenderMode(), promotion.getImageAltText());
    }
}
```

- [ ] **Step 2: AdminPromotionResponse 갱신**

`backend/src/main/java/com/duing/domain/promotion/controller/dto/response/AdminPromotionResponse.java` 의 record 필드 끝에 두 필드 추가, `of()` / `from()` 매핑도 갱신:

```java
package com.duing.domain.promotion.controller.dto.response;

import com.duing.domain.promotion.entity.Promotion;
import com.duing.domain.promotion.entity.PromotionPalette;
import com.duing.domain.promotion.entity.PromotionRenderMode;
import com.duing.domain.promotion.service.dto.query.PromotionAdminListQuery;
import java.time.LocalDateTime;

public record AdminPromotionResponse(
        Long id,
        ClubRef club,
        String title,
        String bannerImageUrl,
        String linkUrl,
        boolean active,
        int displayOrder,
        UserRef createdBy,
        LocalDateTime createdAt,
        LocalDateTime updatedAt,
        String tag,
        String subtitle,
        String ctaLabel,
        String emoji,
        PromotionPalette palette,
        LocalDateTime startAt,
        LocalDateTime endAt,
        PromotionRenderMode renderMode,
        String imageAltText
) {
    public record ClubRef(Long id, String name) {}
    public record UserRef(Long id, String name) {}

    public static AdminPromotionResponse of(
            Promotion promotion, ClubRef club, UserRef createdBy
    ) {
        return new AdminPromotionResponse(
                promotion.getId(), club, promotion.getTitle(), promotion.getBannerImageUrl(),
                promotion.getLinkUrl(), promotion.isActive(), promotion.getDisplayOrder(),
                createdBy, promotion.getCreatedAt(), promotion.getUpdatedAt(),
                promotion.getTag(), promotion.getSubtitle(), promotion.getCtaLabel(),
                promotion.getEmoji(), promotion.getPalette(),
                promotion.getStartAt(), promotion.getEndAt(),
                promotion.getRenderMode(), promotion.getImageAltText());
    }

    public static AdminPromotionResponse from(PromotionAdminListQuery query) {
        ClubRef clubRef = query.club() == null
                ? null
                : new ClubRef(query.club().id(), query.club().name());
        UserRef userRef = new UserRef(query.createdBy().id(), query.createdBy().name());
        return new AdminPromotionResponse(
                query.id(), clubRef, query.title(), query.bannerImageUrl(),
                query.linkUrl(), query.active(), query.displayOrder(),
                userRef, query.createdAt(), query.updatedAt(),
                query.tag(), query.subtitle(), query.ctaLabel(), query.emoji(), query.palette(),
                query.startAt(), query.endAt(),
                query.renderMode(), query.imageAltText());
    }
}
```

- [ ] **Step 3: PromotionCardResponse 갱신**

`backend/src/main/java/com/duing/domain/promotion/controller/dto/response/PromotionCardResponse.java` 의 record 필드 끝에 두 필드 추가하고 정적 빌더(`of` / `from`) 매핑도 동일하게 갱신. 파일을 열어 시그니처를 보고 위치를 맞춘다.

`PromotionCardResponse` 의 `of(Promotion)` 호출 부분 (필드는 `id, title, subtitle, ctaLabel, linkUrl, palette, bannerImageUrl, ...` 순으로 정의되어 있을 것):

```java
// 신규 필드는 record 끝에 추가:
PromotionRenderMode renderMode,
String imageAltText

// of(Promotion) 매핑:
return new PromotionCardResponse(
        promotion.getId(), promotion.getTitle(), promotion.getSubtitle(),
        promotion.getCtaLabel(), promotion.getLinkUrl(), promotion.getPalette(),
        promotion.getBannerImageUrl(),
        /* ... 기존 필드 ... */,
        promotion.getRenderMode(), promotion.getImageAltText());
```

(파일을 열어 현재 시그니처를 정확히 보고 위치를 맞춰서 추가. 다른 필드들은 건드리지 않는다.)

- [ ] **Step 4: 백엔드 컴파일 + 전체 promotion 테스트 통과 확인**

Run: `cd backend && ./gradlew test --tests "com.duing.domain.promotion.*"`

Expected: `BUILD SUCCESSFUL`, 모든 테스트 PASS.

- [ ] **Step 5: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/promotion/controller/dto/response/AdminPromotionResponse.java \
        backend/src/main/java/com/duing/domain/promotion/controller/dto/response/PromotionCardResponse.java \
        backend/src/main/java/com/duing/domain/promotion/service/dto/query/PromotionAdminListQuery.java
git commit -m "feat(promotion): 응답 DTO 와 어드민 목록 query 에 renderMode/imageAltText 노출"
```

---

## Task 6: 프론트엔드 타입 갱신

**Files:**
- Modify: `frontend/packages/types/src/admin.ts`

- [ ] **Step 1: PromotionRenderMode union + 타입 갱신**

`frontend/packages/types/src/admin.ts` 의 `PromotionPalette` 정의 위/아래에 새 union 을 추가하고, `AdminPromotionSummary` / `CreatePromotionPayload` / `UpdatePromotionPayload` 에 필드 추가.

```ts
/** 프로모션 배너 렌더 모드. SYSTEM_COMPOSED=시스템 조합형, FULL_BLEED_IMAGE=완성 이미지형. */
export type PromotionRenderMode = 'SYSTEM_COMPOSED' | 'FULL_BLEED_IMAGE';
```

`AdminPromotionSummary` 끝에 두 필드 추가:

```ts
export type AdminPromotionSummary = {
  // ... 기존 필드들 ...
  startAt: string | null;
  endAt: string | null;
  renderMode: PromotionRenderMode;
  imageAltText: string | null;
};
```

`CreatePromotionPayload` 끝에 두 필드 추가:

```ts
export type CreatePromotionPayload = {
  // ... 기존 필드들 ...
  startAt?: string | null;
  endAt?: string | null;
  renderMode?: PromotionRenderMode | null;
  imageAltText?: string | null;
};
```

`UpdatePromotionPayload` 에 세 필드 추가 (renderMode, imageAltText, clearImageAltText):

```ts
export type UpdatePromotionPayload = {
  // ... 기존 필드들 ...
  startAt?: string;
  endAt?: string;
  renderMode?: PromotionRenderMode;
  imageAltText?: string;
  clearBannerImageUrl?: boolean;
  clearLinkUrl?: boolean;
  clearTag?: boolean;
  clearSubtitle?: boolean;
  clearCtaLabel?: boolean;
  clearEmoji?: boolean;
  clearStartAt?: boolean;
  clearEndAt?: boolean;
  clearImageAltText?: boolean;
};
```

만약 `PromotionCard` (공개 응답 타입) 가 같은 파일 또는 `club.ts` 에 정의되어 있으면 거기도 두 필드 추가:

```ts
renderMode: PromotionRenderMode;
imageAltText: string | null;
```

- [ ] **Step 2: typecheck + lint 통과 확인**

Run: `cd frontend && pnpm --filter web typecheck`

Expected: `BUILD SUCCESSFUL` (또는 종료 코드 0). `tsc --noEmit` 통과.

Run: `cd frontend && pnpm --filter web lint`

Expected: 기존 경고 외 신규 경고/에러 없음.

- [ ] **Step 3: 커밋**

```bash
git add frontend/packages/types/src/admin.ts
# PromotionCard 위치 따라 추가
git commit -m "feat(promotion): 프론트 타입에 PromotionRenderMode + imageAltText 추가"
```

---

## Task 7: 최종 회귀 확인 + PR + 머지

**Files:** none

- [ ] **Step 1: 전체 백엔드 promotion 테스트 풀-스위트 회귀**

Run: `cd backend && ./gradlew test --tests "com.duing.domain.promotion.*"`

Expected: `BUILD SUCCESSFUL`, 신규 + 기존 + Validator 테스트 전부 PASS.

- [ ] **Step 2: 프론트엔드 typecheck/lint 최종 확인**

Run: `cd frontend && pnpm --filter web typecheck && pnpm --filter web lint`

Expected: typecheck 성공, lint 는 기존 경고만.

- [ ] **Step 3: 브랜치 push**

```bash
git push -u origin feat/promotion-render-mode-schema
```

- [ ] **Step 4: PR 생성**

```bash
gh pr create --base develop --title "feat(promotion): FULL_BLEED_IMAGE PR1 — 스키마 + enum + 응답 노출" --body "$(cat <<'EOF'
## 🚀 작업 내용
FULL_BLEED_IMAGE (완성형 포스터 배너) 도입을 위한 1단계 backward-compatible 변경입니다. 어드민 UI 와 공개 렌더링은 손대지 않고 (각각 PR2 / PR3) 데이터 모델·API·검증만 깔아둡니다.

`promotion` 테이블에 `render_mode VARCHAR(20) NOT NULL DEFAULT 'SYSTEM_COMPOSED'` 와 `image_alt_text VARCHAR(200)` 두 컬럼을 추가했습니다. DEFAULT 와 CHECK 제약으로 기존 행은 자동으로 SYSTEM_COMPOSED 로 채워져 데이터 영향이 zero 입니다. 백엔드 측은 enum 도입과 entity / Command / Request / Response DTO 갱신, FULL_BLEED 모드에서만 동작하는 cross-field 검증 두 개(`isImageAltTextRequiredForFullBleed`, `isBannerImageRequiredForFullBleed`) 가 핵심입니다.

partial-update 의 \"renderMode == null 은 변경 안 함\" 의미와 \"모드 토글이 다른 필드를 건드리지 않는다\" 는 보존 가드를 entity 단위 테스트로 못박았습니다. 프론트엔드는 `@duing/types` 갱신만으로 폼·렌더 코드는 그대로 둡니다.

## 🤔 고민했던 내용
`palette` 는 호환성 우선으로 `@NotNull` 을 유지했습니다. FULL_BLEED 에서는 의미 없는 값이지만 어드민이 모드를 전환하더라도 클라이언트가 늘 같은 모양의 payload 를 보낼 수 있어 마이그레이션 비용이 zero 입니다. `imageAltText` 는 `@AssertTrue` cross-field 검증으로 FULL_BLEED 일 때만 강제했습니다.

`renderMode` 의 partial-update 동작은 `palette` / `active` / `displayOrder` 와 동일하게 \"null 이면 변경 안 함\" 으로 통일했습니다. 단위 테스트에 \"모드만 토글하는 update 가 다른 필드를 건드리지 않는다\" 보존 가드를 명시적으로 두어 후속 PR2/PR3 에서 데이터 정합성 회귀가 발생하지 않도록 했습니다.

`api/` 패키지의 Swagger 인터페이스는 따로 손대지 않았습니다 — springdoc 가 record 의 Bean Validation 어노테이션을 자동으로 schema 로 노출합니다.

## 💬 리뷰 중점사항
- V41 마이그레이션이 기존 행을 SYSTEM_COMPOSED 로 자동 채워 데이터 영향 zero 인지
- `@AssertTrue` cross-field 두 개가 SYSTEM_COMPOSED 케이스를 통과시키고 FULL_BLEED 의 alt/이미지 누락만 422 로 막는지 (Validator 단위 테스트)
- update 의 `renderMode == null` partial-update 시멘틱과 \"모드 토글 이외 필드 보존\" 가드가 단위 테스트로 보장되는지
- 모든 응답 DTO (Admin / Card / AdminListQuery) 가 동시에 새 필드를 노출해 PR2 에서 한 번의 페치로 모드 배지를 그릴 수 있는지
EOF
)"
```

- [ ] **Step 5: PR 번호 캡처 후 머지**

```bash
PR_NUMBER=$(gh pr view --json number --jq .number)
gh pr merge $PR_NUMBER --squash --delete-branch
gh pr view $PR_NUMBER --json state,mergedAt
```

Expected: `"state":"MERGED"`.

- [ ] **Step 6: develop 동기화**

```bash
git checkout develop
git pull origin develop
```

Expected: 로컬 develop 가 squash merge 결과(`feat(promotion): FULL_BLEED_IMAGE PR1 ...`) 까지 fast-forward.

---

## Self-Review (작성자 체크리스트)

**Spec coverage (spec §4 ~ §10):**
- §3 enum 정의 → Task 2 (Step 3)
- §4.1 V41 마이그레이션 → Task 1
- §4.2 entity 필드 + create 폴백 + update null-no-change → Task 2 (Step 4) + 단위 테스트 3건
- §5.1 Request 필드 + AssertTrue 2개 → Task 4 (Step 3, 4)
- §5.2 Response 세 DTO 갱신 → Task 5
- §5.3 Swagger 자동 노출 → springdoc 가 자동으로 처리 (별도 Task 없음)
- §6 어드민 UI → PR2 (out of scope for PR1)
- §7 공개 렌더링 → PR3 (out of scope for PR1)
- §8 모드 전환 데이터 정책 → Task 2 (단위 테스트 `updateRenderModeToggleDoesNotClearOtherFields`)
- §10 PR1 회귀/검증 항목 → Task 2 + Task 4 + Task 7 (전체 풀-스위트)

**Placeholder scan:** \"TBD\", \"TODO\", \"appropriate error handling\" 등 패턴 검색 결과 zero.

**Type consistency:**
- `PromotionRenderMode` 는 모든 Task 에서 동일 식별자 사용 (`SYSTEM_COMPOSED` / `FULL_BLEED_IMAGE`).
- `imageAltText` 필드명·메서드명·DB 컬럼명(`image_alt_text`) 일관.
- `clearImageAltText` 플래그명은 다른 clear 플래그(`clearBannerImageUrl`, `clearStartAt`) 와 동일 네이밍 컨벤션.
- `UpdatePayload` / `UpdatePromotionCommand` 의 필드 추가 위치(palette 다음에 renderMode/imageAltText, startAt/endAt 다음에 기존 clear 플래그, 끝에 clearStartAt/clearEndAt/clearImageAltText) Task 2/3/4 에서 일관.

---

## 참고

- spec: `docs/superpowers/specs/2026-06-07-promotion-full-bleed-image-design.md`
- 후속: PR2 (어드민 UI) / PR3 (공개 렌더링) 의 plan 은 본 PR1 머지 후 별도로 작성한다 (UpdatePayload / Command 시그니처 최종 모양을 보고 작성해야 정확).
- 메모리 가이드 준수: 커밋 메시지는 Conventional Commits (`feat(promotion): ...`), `[#이슈번호] ...` 형식 금지, Co-Authored-By 라인 금지, PR 머지 시 `gh pr checks --watch` 사용 금지.
