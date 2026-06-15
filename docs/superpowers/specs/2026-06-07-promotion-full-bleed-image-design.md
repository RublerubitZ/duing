# FULL_BLEED_IMAGE (완성형 포스터 배너) 설계 사양

작성일: 2026-06-07
대상 도메인: `backend/domain/promotion` / `frontend/apps/web/app/_components/sections/BannerCarousel.tsx` / `frontend/apps/web/app/admin/promotions/**`
선행 사양: SYSTEM_COMPOSED 모드 (현재 운영 중)

---

## 1. 배경

현재 프로모션 배너는 어드민이 입력한 (제목, 부제목, CTA, 팔레트, 이미지) 를 프론트엔드가 조합해 렌더링하는 **SYSTEM_COMPOSED** 단일 모드로 동작한다.

축제 포스터·모집 포스터·행사 홍보물처럼 디자인이 이미 완료된 이미지를 그대로 배너로 노출하고 싶다는 요구에 대응하기 위해 **FULL_BLEED_IMAGE** 모드를 추가한다. 이 모드의 핵심 가치는 \"이미지에 시스템 가공을 더하지 않는다\" 이다.

---

## 2. 목표 / Non-목표

### 2.1 목표
- 업로드한 배너 이미지를 가공 없이 그대로 노출하는 새 렌더 모드 `FULL_BLEED_IMAGE` 를 도입한다.
- 기존 SYSTEM_COMPOSED 데이터·동작·렌더링에 영향이 없는 backward-compatible 변경으로 출시한다.
- 기간 노출·활성 토글·동아리 연결 등 기존 프로모션 운영 기능은 두 모드 모두에서 동일하게 동작한다.

### 2.2 Out of Scope
- **모바일 전용 배너 이미지**(`mobileBannerImageUrl`). 추후 수요 확인 후 별도 사양.
- **어드민 목록의 모드별 필터링**. 초기 도입은 배지 표시까지만.
- **이미지 자동 리사이즈 / 변환 / CDN 변환**. 어드민이 권장 사이즈로 직접 업로드한다.
- **포스터 안 텍스트에 대한 OCR / 자동 alt 생성**. alt 는 어드민 직접 입력.
- **palette 의 모드별 필수 검증**(현재는 호환성 우선으로 항상 필수 유지). 후속 사양으로 분리.
- **FULL_BLEED 전용 배너 카드 컴포넌트의 디자인 토큰 분리**. 첫 도입은 단순 `<a><img/></a>` 로 시작.

---

## 3. Render Mode 정의

```ts
export type PromotionRenderMode = 'SYSTEM_COMPOSED' | 'FULL_BLEED_IMAGE';
```

```java
public enum PromotionRenderMode {
    SYSTEM_COMPOSED,
    FULL_BLEED_IMAGE
}
```

기본값: `SYSTEM_COMPOSED` (DB DEFAULT + 백엔드 enum fallback + 프론트 폼 초기 상태).

---

## 4. 데이터 모델 변경

### 4.1 DB 마이그레이션 (V41)

```sql
-- V41__alter_promotion_add_render_mode.sql
ALTER TABLE promotion
    ADD COLUMN render_mode    VARCHAR(20)  NOT NULL DEFAULT 'SYSTEM_COMPOSED',
    ADD COLUMN image_alt_text VARCHAR(200);

ALTER TABLE promotion
    ADD CONSTRAINT chk_promo_render_mode
    CHECK (render_mode IN ('SYSTEM_COMPOSED','FULL_BLEED_IMAGE'));
```

- `render_mode` 는 NOT NULL + DEFAULT 로 기존 데이터 전부 SYSTEM_COMPOSED 자동 채움 → 데이터 영향 zero.
- `image_alt_text` 는 nullable. SYSTEM_COMPOSED 에서는 의미 없음(필수 아님), FULL_BLEED_IMAGE 에서만 application-level 검증으로 필수.
- 길이 200자: 한 줄 alt 텍스트로 충분.

### 4.2 Promotion entity

```java
@Enumerated(EnumType.STRING)
@Column(name = "render_mode", nullable = false, length = 20)
private PromotionRenderMode renderMode;

@Column(name = "image_alt_text", length = 200)
private String imageAltText;
```

- `create(...)` / `UpdatePayload` / `update(...)` 시그니처에 두 필드 추가 (기존 nullable 필드 패턴과 동일하게 clear 플래그 `clearImageAltText` 도 함께 도입).
- `renderMode` 는 enum 이라 `create()` 시 null 입력은 `SYSTEM_COMPOSED` 폴백 (`PromotionPalette` 가 INK 로 폴백되는 것과 동일 패턴).
- `update()` 에서 `renderMode == null` 은 \"변경 안 함\" 으로 해석 (`palette` / `active` 등 다른 partial-update 필드와 동일 규칙). 즉 어드민이 모드를 명시적으로 바꾸지 않은 요청은 기존 모드를 유지한다.

---

## 5. API 변경

### 5.1 Request

`CreatePromotionRequest` / `UpdatePromotionRequest` 양쪽에 동시 추가:

```java
PromotionRenderMode renderMode,                                // null 허용, 서비스에서 SYSTEM_COMPOSED 폴백
@Size(max = 200, message = "Alt Text는 200자 이하여야 합니다.")
String imageAltText,
Boolean clearImageAltText                                       // UpdateRequest 에만
```

Cross-field 검증 (Create / Update 양쪽에 동일 메서드):

```java
@AssertTrue(message = "완성 이미지형 배너는 Alt Text 가 필수입니다.")
public boolean isImageAltTextRequiredForFullBleed() {
    return renderMode != PromotionRenderMode.FULL_BLEED_IMAGE
        || (imageAltText != null && !imageAltText.isBlank());
}

@AssertTrue(message = "완성 이미지형 배너는 배너 이미지가 필수입니다.")
public boolean isBannerImageRequiredForFullBleed() {
    return renderMode != PromotionRenderMode.FULL_BLEED_IMAGE
        || (bannerImageUrl != null && !bannerImageUrl.isBlank());
}
```

- `palette` 의 `@NotNull` 은 **현행 유지**. FULL_BLEED 에서도 값을 받아 DB 에 저장하지만 렌더링에서 무시. (이유: API 호환성 + 마이그레이션 비용 최소화. 후속 사양에서 모드별 검증으로 재검토.)

### 5.2 Response

`AdminPromotionResponse` / `PromotionCardResponse` / `PromotionAdminListQuery` 세 곳 모두에 동일 필드 추가:

```ts
renderMode: 'SYSTEM_COMPOSED' | 'FULL_BLEED_IMAGE';
imageAltText: string | null;
```

- 어드민 목록에서 모드 배지 표시는 한 번의 페치로 가능해야 하므로 `PromotionAdminListQuery` 갱신 필수.
- 공개 응답에도 노출해 클라이언트 렌더 분기에 사용.

### 5.3 Swagger 인터페이스 (`api/` 패키지)

백엔드 컨벤션상 `api/AdminPromotionApi.java` 등의 Swagger 명세에 새 필드를 동시 갱신한다.

---

## 6. 어드민 UI 변경

### 6.1 폼 최상단 모드 라디오

```
[ 배너 유형 ]
(●) 시스템 조합형   제목/부제목/버튼을 자동 배치
( ) 완성 이미지형   업로드한 이미지 그대로 노출
```

위치: `AdminPromotionForm` 의 첫 번째 섹션 (제목 입력 위). 모드 결정이 다른 모든 입력 의미를 좌우하므로 가장 위.

### 6.2 모드별 입력 UI (입력 자체는 항상 유지, 의미만 분기)

| 필드 | SYSTEM_COMPOSED | FULL_BLEED_IMAGE |
|------|----------------|------------------|
| 제목 | 화면 렌더용 (필수) | SEO/메타 (입력 가능) |
| 부제목 | 화면 렌더용 (선택) | SEO/메타 (입력 가능) |
| 태그 | 화면 렌더용 (선택) | 보존만 (렌더 안 함) |
| CTA 라벨 | 화면 렌더용 (선택) | 보존만 (렌더 안 함) |
| 이모지 | 화면 데코 (선택) | 보존만 (렌더 안 함) |
| 팔레트 | 화면 배경 (필수) | 저장만, 렌더 안 함 |
| 배너 이미지 | 선택 | **필수** (애드민 즉시 경고) |
| Alt Text | 보존만 (필드 자체가 신규) | **필수** |
| 링크 URL | 선택 | 선택 (폴백 규칙 동일) |
| 동아리 연결 | 선택 | 선택 (폴백 규칙 동일) |
| active / startAt / endAt / displayOrder | 동일 | 동일 |

\"입력 UI 자체를 숨기지 않는다\" 가 핵심. 모드 전환 시 데이터 보존 정책과 일치. 다만 어드민 가독성을 위해 모드별로 \"화면에 사용됨\" / \"메타데이터\" 같은 작은 헬프 텍스트로 의미 차이는 노출한다.

### 6.3 모드 전환 가드

FULL_BLEED_IMAGE 의 필수 필드(`bannerImageUrl`, `imageAltText`) 가 비어 있는 상태에서 라디오를 FULL_BLEED 로 토글하면 각각 인라인 경고:

- `bannerImageUrl` 비어 있을 때: \"완성 이미지형으로 전환하려면 배너 이미지 업로드가 필요합니다.\"
- `imageAltText` 비어 있을 때: \"완성 이미지형으로 전환하려면 Alt Text 입력이 필요합니다.\"

두 경고는 독립적으로 동시 노출 가능 (둘 다 비어 있으면 두 줄). 전환 자체는 막지 않고 \"필수 입력이 비어 있음\" 으로 저장 시 422 가 발생하게 둔다 (백엔드 cross-field 검증과 일치).

### 6.4 이미지 권장 비율 즉시 경고

`ImageUploader.onChange` 직후 (또는 onLoad 시점) `Image` 객체의 `naturalWidth / naturalHeight` 측정:

- 짧은 변 < 840 또는 비율이 16:7 (±10%) 을 벗어나면 \"권장 1920×840, 16:7. 모바일에서 잘릴 수 있음\" 안내.
- 저장 차단 아님. FULL_BLEED 모드에서만 노출.

### 6.5 라이브 미리보기 분기

폼 우측 미리보기 박스도 모드별로 분기:

- SYSTEM_COMPOSED: 현재 그대로 (이미지 + 그라데이션 + 텍스트 + CTA).
- FULL_BLEED_IMAGE: 이미지만 표시. alt 가 비어 있으면 우측 상단에 \"⚠ Alt 미입력\" 배지.

### 6.6 어드민 목록 배지

기존 \"상태\" 컬럼 옆 또는 \"유형\" 컬럼 신설:

- `SYSTEM` (회색 톤 배지)
- `FULL_BLEED` (강조 톤 배지)

`AdminPromotionsTable` 에 컬럼 한 줄 추가 + `_lib/promotionLabels.ts` 에 라벨/스타일 매핑 추가.

---

## 7. 공개 렌더링 (BannerCarousel)

### 7.1 분리 컴포넌트 도입

`apps/web/app/_components/sections/BannerCarousel.tsx` 가 이미 큰 파일이므로 새 컴포넌트로 분리:

- `_components/sections/banner/SystemComposedSlide.tsx` (기존 `MainSlide` / `PreviewSlide` 이전)
- `_components/sections/banner/FullBleedSlide.tsx` (신규)

`BannerCarousel` 본체는 캐러셀 제어(activeIndex, autoplay, 인디케이터, 화살표) 만 담당하고 슬라이드 렌더 자체는 mode 분기로 두 컴포넌트에 위임한다.

### 7.2 FullBleedSlide 렌더 규칙

```tsx
<a href={resolvedHref} className="block h-full">
  <img
    src={slide.bannerImageUrl}
    alt={slide.imageAltText ?? ''}
    className="block h-full w-full object-cover"
  />
</a>
```

- 그라데이션 / 팔레트 / 시스템 텍스트 / 이모지 / Sparkle 데코: **모두 없음**.
- `resolvedHref`: `linkUrl > clubId 폴백 > /clubs` (SYSTEM_COMPOSED 와 동일 로직 공유).
- 캐러셀 컨트롤(인디케이터·자동재생·화살표) 은 그대로 유지.

### 7.3 사이드 미리보기

같은 규칙으로 작은 썸네일만. \"포스터\" 배지는 초기 도입에는 추가하지 않음 — 시각적으로 SYSTEM 의 작은 카드와 FULL_BLEED 의 이미지 썸네일이 자연스럽게 구분되므로 불필요한 노이즈는 피한다.

---

## 8. 모드 전환 데이터 정책

| 시나리오 | 동작 |
|---------|------|
| SYSTEM → FULL_BLEED | 기존 `tag / subtitle / ctaLabel / emoji / palette` 값 모두 DB 보존. 화면 렌더에서만 무시. |
| FULL_BLEED → SYSTEM | 기존 `imageAltText` 값 보존 (메타데이터). 화면 렌더에서 무시. SYSTEM 의 시스템 텍스트 필드들은 그대로 복구. |
| 신규 등록 후 모드 변경 | 동일. 어떤 모드 토글도 자동 클리어를 유발하지 않는다. |
| 어드민이 명시적으로 비우기 | 기존 clear 플래그(`clearTag` 등) 패턴 그대로. `clearImageAltText` 도 같이 도입. |

백엔드 update 로직 분기는 추가되지 않는다 — 모드 토글이 데이터 의미를 \"렌더에서 무시\" 로 바꿀 뿐 데이터 자체에는 영향이 없다.

---

## 9. 단계별 PR 분할

### PR1 — 스키마 + enum + 응답 노출 (데이터 무영향)
- V41 마이그레이션
- `PromotionRenderMode` enum 추가
- `Promotion` entity 두 필드 + `create()` / `UpdatePayload` / `update()` 시그니처 갱신
- Create/Update Request·Command + cross-field `@AssertTrue` 검증 두 개
- AdminPromotionResponse / PromotionCardResponse / PromotionAdminListQuery 갱신
- Service mapping 갱신
- 백엔드 테스트: 기존 테스트 시그니처 보정 + `renderMode=FULL_BLEED + alt 비어있음 → 422` / `renderMode=FULL_BLEED + 이미지 비어있음 → 422` / `clearImageAltText 동작` 케이스 추가
- 프론트 types 갱신만 (UI 변경 없음, 회귀 zero)

### PR2 — 어드민 UI (모드 라디오 + alt input + 미리보기 분기 + 목록 배지)
- `AdminPromotionForm` 최상단에 모드 라디오, alt text input, 이미지 권장 비율 경고
- 모드별 헬프 텍스트
- 라이브 미리보기 모드 분기
- `AdminPromotionsTable` 에 유형 배지 컬럼
- `_lib/promotionLabels.ts` 에 라벨/스타일 매핑

### PR3 — 공개 렌더링 (FullBleedSlide 분리)
- `BannerCarousel` 슬라이드 렌더를 `SystemComposedSlide` / `FullBleedSlide` 두 컴포넌트로 분리
- `FullBleedSlide` 메인/프리뷰 두 사이즈 지원
- 기존 SYSTEM_COMPOSED 시각이 그대로 유지되는지 회귀 검증

세 PR 모두 단독으로 머지 가능하고 (1번만 머지된 상태에서도 시스템 동작 정상), 단계 차단점은 \"PR1 머지 → PR2 시작\", \"PR2 머지 → PR3 시작\" 으로 명확히 직렬화된다.

---

## 10. 검증 / 회귀 항목

PR1 머지 후:
- 기존 SYSTEM_COMPOSED 배너의 응답 / 렌더 / 어드민 폼이 모두 그대로 동작.
- 모든 기존 배너의 `renderMode` 가 `SYSTEM_COMPOSED` 로 자동 채워졌는지 확인.
- FULL_BLEED 신규 등록은 어드민 폼이 없으니 직접 API 호출로만 가능. 422 검증 케이스 테스트로 보장.

PR1 백엔드 테스트 추가 케이스 (§8 데이터 정책의 핵심 가드):
- `renderMode=FULL_BLEED + imageAltText=null` 으로 create → 422 (`isImageAltTextRequiredForFullBleed`).
- `renderMode=FULL_BLEED + bannerImageUrl=null` 으로 create → 422 (`isBannerImageRequiredForFullBleed`).
- `clearImageAltText=true` 동작 (다른 clear 플래그와 동일 패턴).
- **모드 토글 보존 회귀 가드** —
  - FULL_BLEED 로 update 후 SYSTEM_COMPOSED 로 다시 update 시 `imageAltText` 가 DB 에 그대로 남아 있는지.
  - `renderMode` 만 토글하는 update 가 `tag` / `subtitle` / `ctaLabel` / `emoji` / `palette` 어느 것도 건드리지 않는지.
- `update()` 에서 `renderMode == null` 인 요청이 기존 모드를 그대로 유지하는지 (partial-update 회귀).

PR2 머지 후:
- 어드민이 FULL_BLEED 신규 등록 / 기존 배너 모드 토글 / 모드 전환 시 데이터 보존 확인.
- 권장 비율 경고가 잘못된 이미지에서 정확히 뜨는지.
- 목록 배지가 두 모드 모두에서 잘 보이는지.

PR3 머지 후:
- 공개 메인 페이지에서 FULL_BLEED 배너가 \"이미지 외 데코 zero\" 로 노출되는지.
- SYSTEM_COMPOSED 배너의 캐러셀 시각이 회귀 없이 동일한지.
- alt text 가 화면에는 안 뜨고 DOM `alt` 속성으로만 들어가는지 (스크린리더 검증).

---

## 11. Open Questions

- (없음 — 5개 핵심 결정으로 모두 닫힘)

---

## 12. 참고

- 사용자 우선순위 메모: \"기간 노출, 동아리 연결, 이미지 배너 안정화\" 가 FULL_BLEED 도입보다 앞섰음. 본 사양은 위 세 기능이 모두 머지된 시점(2026-06-07) 이후 단계적 도입을 전제한다.
- 본 사양은 [#272 ~ #277] PR 시리즈로 안정화된 SYSTEM_COMPOSED 의 위에 얹는 추가 모드이므로 SYSTEM_COMPOSED 측 변경은 최소화한다.
