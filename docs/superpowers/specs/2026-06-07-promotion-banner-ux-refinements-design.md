# 배너 UX Refinements 설계 사양

작성일: 2026-06-07
대상 도메인: `frontend/apps/web/app/_components/sections/{BannerCarousel,banner/SystemComposedSlide}.tsx` / `frontend/apps/web/app/admin/promotions/_components/AdminPromotionForm.tsx`
선행 사양: `2026-06-07-promotion-full-bleed-image-design.md` (PR1 #278 / PR2 #279 / PR3 #280 머지 완료)

---

## 1. 배경

FULL_BLEED_IMAGE 도입(PR1~PR3) 이후 실사용에서 발견된 6가지 UX 어색함을 정리한다. 모두 백엔드 데이터 모델은 그대로 두고 **프론트엔드 렌더링과 어드민 폼 표시만 다듬는다**.

| # | 현상 | 원인 |
|---|------|------|
| 1 | CTA 라벨을 비워둬도 메인 배너에 "자세히 보기" 가 자동 노출 | `BannerCarousel.tsx:67` 의 `cta: promotion.ctaLabel ?? '자세히 보기'` 폴백 + `SystemComposedSlide.tsx:133-142` 의 무조건 렌더 |
| 2 | 보조 배너의 부제가 화살표 아이콘과 함께 "자세히 보기 →" 처럼 보임 | `SystemComposedSlide.tsx:234-242` (PreviewSlideBody) 가 sub 를 `<ArrowRight size={12} />` + `flex items-center` 로 표시 |
| 3 | FULL_BLEED 모드에서도 텍스트 입력란(태그/부제/CTA/이모지) 이 노출되어 폼이 무거움 | `AdminPromotionForm.tsx:303-346` 의 입력란이 모드 무관 노출. spec §6.2 의 "입력 UI 항상 유지" 결정을 부분적으로 뒤집는다 |
| 4 | (해결됨) FULL_BLEED 에서 그라데이션/팔레트/마스크 적용 보고 | PR3 머지로 이미 데코 zero. 사용자 확인 완료 |
| 5 | Alt Text 헬프 문구가 "스크린리더와 SEO" 라는 비개발자에게 난해한 표현 | `AdminPromotionForm.tsx:380-383` |
| 6 | 1896×830 (16:7) 권장 이미지가 메인 슬라이드에서 상하 ~14% 잘림 | 컨테이너 (`BannerCarousel.tsx:151`) `h-[280px]` × 가로 ~924px = **약 3.3:1**. 권장 16:7=2.28:1 과 mismatch |

---

## 2. 목표 / Non-목표

### 2.1 목표
- 어드민 의도와 사용자 인식 사이의 어색함을 해소한다.
- 백엔드 데이터 모델, API, 검증은 일체 변경하지 않는다.
- FULL_BLEED 모드의 "이미지가 곧 결과물" 원칙을 어드민 UX 측면까지 일관되게 적용한다.

### 2.2 Non-목표 (Out of Scope)
- 백엔드 변경 — `title @NotBlank` 등 검증 그대로 유지.
- 모드 전환 시 데이터 손실 — `state` 보존 정책은 spec §8 (선행 사양) 그대로.
- 사이드 미리보기 슬라이드의 비율 별도 조정 — 메인 컨테이너 변화에 따라 자연스럽게 늘어나는 정도만 허용. 작은 미리보기라 약간의 크롭은 의도된 영역.
- mock 슬라이드(랜딩 폴백) 의 cta/href 매핑 — 그대로 유지. 폴백 제거가 mock 표시에 영향 없도록(이미 cta 값 채워져 있음) 확인만 한다.
- "관리자 목록에서 FULL_BLEED 배너의 title 자동 동기화" — title 은 어드민 식별용으로 어드민이 직접 입력. Alt Text 와 자동 동기화하지 않는다 (목적이 다름).

---

## 3. 결정 사항 (확정)

### 3.1 CTA 폴백 제거 + 조건부 렌더 (Issue #1)
- `promotionToSlide`: `cta: promotion.ctaLabel ?? ''` (폴백 제거).
- `MainSlideBody`: `slide.cta` 가 빈 문자열이면 `<span className="btn">` 영역 자체를 렌더하지 않는다.
- mock 슬라이드는 기존 `banner.cta` 값을 그대로 받으므로 표시 변경 없음.

### 3.2 보조 배너 부제 디자인 (Issue #2)
- `PreviewSlideBody` 의 sub 영역에서 `<ArrowRight size={12} />` 제거.
- `flex items-center gap-1.5` 컨테이너 → 단순 `<div>` (텍스트만).
- 클릭 액션 오인 방지가 목적. 클릭 자체는 `<button>` wrapper (preview slide 전체) 가 받음 — 변경 없음.

### 3.3 FULL_BLEED 어드민 폼 입력란 단순화 (Issue #3)
- **title 은 두 모드 모두 노출 유지**. 어드민 식별용 메타데이터.
- FULL_BLEED 모드에서 다음 4개 입력 섹션을 조건부 렌더로 숨긴다:
  - 태그
  - 부제
  - CTA 라벨 + 이모지 (한 grid 묶음 통째)
- 모드 토글 시 `state` 값은 유지. SYSTEM 으로 되돌리면 입력값 자동 복구.
- title 입력란 헬프 텍스트 모드별 분기:
  - **FULL_BLEED**: `"관리자 화면에서 배너를 구분하기 위한 이름입니다. 사용자에게는 노출되지 않습니다."`
  - **SYSTEM_COMPOSED**: 기존 라벨 그대로 ("제목 (≤120자)"), 별도 헬프 텍스트 추가하지 않음.

### 3.4 (Issue #4: 해결 완료) — 조치 없음
PR3 머지로 FullBleedSlide / 어드민 폼 미리보기 모두 데코 zero 가 적용된 상태. 사용자 확인 완료.

### 3.5 Alt Text 헬프 문구 개선 (Issue #5)
- **FULL_BLEED**: `"이미지가 표시되지 않을 때 대신 보여주거나 읽어주는 설명입니다."`
- **SYSTEM_COMPOSED**: `"지금 입력해두면 완성 이미지형으로 전환할 때 자동 적용됩니다."`
- "스크린리더", "SEO", "접근성" 같은 기술 용어 제거. 일반 사용자가 즉시 이해하는 시나리오 묘사로 통일.

### 3.6 메인 캐러셀 컨테이너 비율 (Issue #6)
- `BannerCarousel.tsx:151` 의 `h-[280px]` → `aspect-[16/7]` (Tailwind 기본 지원).
- 컨테이너 비율을 권장 사이즈 (1920×840, 16:7) 와 정확히 일치시켜 `object-cover` 가 크롭 없이 채우게 한다.
- 메인 슬라이드 박스가 ~924×280 → ~924×404 로 세로 ~44% 커짐. 페이지 상단이 더 차지하지만 권장 사이즈 잘림 zero.
- 사이드 미리보기 슬라이드(우측 340px 컬럼) 도 메인 컨테이너 높이에 따라 자연스럽게 늘어남(`flex-1` 분배). 별도 비율 조정 없음.
- 어드민 폼의 라이브 미리보기 박스 (`h-[200px]`) 는 그대로 유지 (작은 미리보기 + 권장 비율 안내는 폼 자체에 있음).

---

## 4. 영향 파일

| Action | Path | 변경 내용 |
|--------|------|----------|
| Modify | `frontend/apps/web/app/_components/sections/BannerCarousel.tsx` | promotionToSlide CTA 폴백 제거 (line 67), 컨테이너 `h-[280px]` → `aspect-[16/7]` (line 151) |
| Modify | `frontend/apps/web/app/_components/sections/banner/SystemComposedSlide.tsx` | MainSlideBody CTA 조건부 렌더, PreviewSlideBody sub 디자인 정리 |
| Modify | `frontend/apps/web/app/admin/promotions/_components/AdminPromotionForm.tsx` | 4개 입력란 조건부 숨김, title/Alt 헬프 문구 분기 |
| Modify | `frontend/apps/web/test/sections/banner/system-composed-slide.test.tsx` | CTA 조건부 + preview sub 디자인 검증 (+2 케이스) |
| Modify | `frontend/apps/web/test/admin/promotions/admin-promotion-form-render-mode.test.tsx` | FULL_BLEED 입력란 숨김/복구 + title 유지 검증 (+3 케이스) |

**백엔드 변경 zero. RTL 테스트 +5 케이스.**

---

## 5. 데이터 보존 정책 (Issue #3 의 핵심)

선행 사양 §8 의 "모드 토글이 데이터에 영향 zero" 정책을 그대로 이어받는다.

| 시나리오 | 동작 |
|---------|------|
| SYSTEM 에서 tag/subtitle/ctaLabel/emoji 입력 → FULL_BLEED 토글 | UI 만 숨김, `state` 값 보존, submit 시 그대로 전송 |
| FULL_BLEED → SYSTEM 되돌림 | 이전 입력값으로 입력란 자동 복구 |
| FULL_BLEED 에서 저장 | `state.tag/subtitle/ctaLabel/emoji` 가 비어 있으면 비어 있는 채 전송, 채워져 있으면 그대로. 어드민이 SYSTEM 에서 먼저 입력했다가 FULL_BLEED 로 전환해 저장하는 경우, 그 값들이 DB 에 살아 있고 다시 SYSTEM 으로 전환 시 즉시 사용 가능 |
| FULL_BLEED 신규 등록 (한 번도 SYSTEM 모드 입력 안 함) | tag/subtitle/ctaLabel/emoji 모두 빈 채로 전송 → DB 에도 null/empty 로 저장. SYSTEM 으로 전환 시 사용자가 새로 입력해야 함 |

→ UI 단순화는 "표시" 의 영역이고 "데이터" 영역은 그대로 보존한다.

---

## 6. 검증 / 회귀 항목

### 6.1 자동화 (RTL 테스트)
- SystemComposedSlide:
  - CTA 빈 문자열 시 `<span>` 미렌더
  - PreviewSlideBody sub 영역에 `ArrowRight` 아이콘 없음
- AdminPromotionForm:
  - FULL_BLEED 라디오 클릭 시 `placeholder='EVENT · 9.25 ...'` (tag) / `placeholder='67개 동아리 ...'` (subtitle) / `placeholder='박람회 자세히 보기'` (ctaLabel) / `placeholder='🍂'` (emoji) 모두 DOM 에 없음
  - title 입력란은 두 모드 모두 노출
  - SYSTEM 에서 입력 → FULL_BLEED → SYSTEM 왕복 시 입력값 보존 (placeholder 가 아닌 displayValue 로 확인)

### 6.2 브라우저 sanity
- 메인 페이지: 컨테이너 비율 변경 후 mock 배너(404px 세로) 가 정상 표시, 슬라이드 전환 애니메이션 회귀 없음.
- 메인 페이지: 어드민이 ctaLabel 비워둔 DB 배너에 "자세히 보기" 가 안 보임.
- 메인 페이지: 보조 배너의 부제가 더 이상 화살표와 함께 표시되지 않음.
- 어드민: FULL_BLEED 라디오 토글 시 4개 입력란이 부드럽게 숨김/복구. title 입력란은 항상 보임. Alt Text 헬프 문구가 새 표현으로.
- 어드민: 1896×830 권장 이미지를 업로드한 FULL_BLEED 배너가 메인 페이지에서 잘림 없이 표시.

---

## 7. PR 분할 / 머지 전략

6가지 이슈가 모두 작은 변경이고 같은 도메인(공개 캐러셀 + 어드민 폼) 이므로 **단일 PR** 로 묶는다.

브랜치명: `fix/promotion-banner-ux-refinements`

커밋은 task 단위(예: CTA 정리 / preview sub / 폼 입력란 숨김 / Alt 헬프 / 컨테이너 비율 / 테스트)로 5-7개로 분리해 리뷰 가시성을 확보한다.

---

## 8. 후속 이슈 / Out of Scope

- 사이드 미리보기 슬라이드 비율의 정밀 튜닝: 메인 컨테이너 변경의 자연 변화로 충분하다고 판단. 정밀 조정이 필요해지면 별도 이슈로.
- 어드민 폼 라이브 미리보기 박스 (`h-[200px]`) 비율: 작은 미리보기라 그대로 유지. 정밀 조정이 필요해지면 별도 이슈로.
- 어드민 목록의 FULL_BLEED 배너 표시 라벨 (현재 title 표시): title 을 어드민이 직접 입력하므로 추가 변환 로직 불필요.
- `CarouselSlide` / `SystemComposedSlideData` 타입 통합 (이전 PR3 코드 리뷰의 Important #1 보강): 본 사양과 무관, 별도 리팩토링 이슈.
- SystemComposedSlide CTA `<span>` → `<button>` 접근성 보강 (PR3 리뷰의 Important #2): 별도 접근성 이슈.

---

## 9. Open Questions

(없음 — 4가지 결정 + title 처리까지 모두 확정.)

---

## 10. 참고

- 선행 사양: `docs/superpowers/specs/2026-06-07-promotion-full-bleed-image-design.md` §6.2 (입력 UI 정책), §6.4 (권장 비율), §7 (공개 렌더링), §8 (보존 정책).
- 선행 PR: #278 / #279 / #280.
- 메모리 가이드 준수: Conventional Commits, `[#이슈번호]` 형식 금지, Co-Authored-By 라인 금지, `gh pr checks --watch` 금지.
