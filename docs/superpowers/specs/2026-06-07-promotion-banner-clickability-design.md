# 배너 조건부 클릭 설계 사양 (Issue #7)

작성일: 2026-06-07
대상 도메인: `frontend/apps/web/app/_components/sections/{BannerCarousel,banner/SystemComposedSlide,banner/FullBleedSlide}.tsx`
선행 사양: `2026-06-07-promotion-banner-ux-refinements-design.md` (PR #281 머지 완료) + PR3 (#280) 의 슬라이드 컴포넌트 분리
후속 사양: `2026-06-07-promotion-notice-link-design.md` (예정, Issue #8 — 공지 연결)

---

## 1. 배경 / 현상

현재 메인 슬라이드는 **연결 대상이 없어도 항상 링크로 렌더된다**:

```tsx
// BannerCarousel.tsx:67
cta: promotion.ctaLabel ?? '자세히 보기',
href: promotion.linkUrl ?? (promotion.club ? `/clubs/${promotion.club.id}` : '/clubs'),
//                                                                          ^^^^^^^^^
//                                                                          폴백
```

```tsx
// SystemComposedSlide.tsx (MainSlideBody) / FullBleedSlide.tsx (FullBleedMainBody)
if (slide.href.startsWith('http')) return <a href={...} target="_blank">...</a>;
return <Link href={slide.href as never}>...</Link>;
```

문제:
- 어드민이 `linkUrl` / `clubId` 둘 다 비워둔 배너도 `/clubs` 로 자동 이동
- 사용자가 \"클릭하면 뭔가 될 것 같은\" 인터랙티브 UI 로 인식하지만 실제로는 의미 없는 일반 페이지로 이동
- 접근성 측면: `role="link"` / Tab focus 가 살아 있지만 도착지가 무의미

목표는 **\"실제 도착지가 없으면 시각·접근성 양 측면에서 비인터랙티브\"**.

---

## 2. 목표 / Non-목표

### 2.1 목표
- mapper 의 `/clubs` 폴백 제거. `href` 는 `linkUrl` / `clubId` 둘 다 비면 `null`.
- 메인 슬라이드(MainSlideBody / FullBleedMainBody) 가 `href === null` 일 때 완전 비인터랙티브 컨테이너로 렌더.
- 후속 Spec #8 (공지 연결) 이 한 줄 추가만으로 NOTICE 경로를 끼울 수 있도록 href 결정 로직을 단일 helper 로 추출.

### 2.2 Non-목표 (Out of Scope)
- 사이드 미리보기 슬라이드의 클릭 동작 — 이는 \"캐러셀 활성 슬라이드 전환\" 액션이지 \"배너 navigation\" 이 아니므로 그대로 `<button>` 유지.
- `linkUrl` / `clubId` 외의 새로운 연결 종류 (공지 등) — 별도 spec #8.
- 어드민 폼의 \"연결 안 함\" 옵션 명시화 — 어드민은 그냥 `linkUrl` 과 `clubId` 를 모두 비우면 됨. UI 라벨 변경은 spec #8 에서 라디오 UX 도입 시 같이.
- 기존 mock landingBanners — `cta` / `href` 가 이미 채워져 있어 영향 zero.

---

## 3. 비인터랙티브 컨테이너의 정확한 정의 (가장 중요)

`href === null` 인 메인 슬라이드 wrapping 컨테이너는 다음 5가지를 **모두** 만족한다 — 한 가지라도 누락되면 사용자가 클릭 가능 UI 로 오인할 수 있다.

| # | 요소 | href 있음 | href === null |
|---|------|-----------|---------------|
| 1 | DOM 요소 | `<a>` (외부) 또는 `<Link>` (내부, Next.js) | `<div>` |
| 2 | 암시적 ARIA role | `role=\"link\"` (a/Link 가 기본 제공) | 없음 |
| 3 | Tab focus | 가능 (a/Link 기본 `tabindex=0`) | 불가능 (`<div>` 기본 비포커스) |
| 4 | 커서 | `cursor: pointer` (브라우저 기본 + `block h-full` 그대로) | **`cursor-default` 명시** |
| 5 | hover 효과 | 컨테이너 자체에는 없으나 anchor 의 색·아이콘 변화 가능 | 컨테이너에 hover 클래스 추가 금지 |

### 3.1 Wrapping 컴포넌트 구현

`SystemComposedSlide.tsx` MainSlideBody 와 `FullBleedSlide.tsx` FullBleedMainBody 의 wrapping 분기:

```tsx
// href === null → 비인터랙티브 div
if (slide.href === null) {
  return (
    <div className="block h-full cursor-default" aria-hidden="false">
      {body}
    </div>
  );
}
// href === 외부 URL
if (slide.href.startsWith('http')) {
  return (
    <a href={slide.href} target="_blank" rel="noopener noreferrer" className="block h-full">
      {body}
    </a>
  );
}
// href === 내부 라우트
return (
  <Link href={slide.href as never} className="block h-full">
    {body}
  </Link>
);
```

핵심:
- `<div>` 사용 → 암시적 role 없음, tabindex 없음
- `cursor-default` 명시 → 브라우저 기본 텍스트 커서가 아닌 \"명시적 비클릭\" 의도 전달
- `tabIndex` / `role` / `onClick` 일체 부착 금지
- hover-prefix 클래스 (`hover:bg-...` 등) 부착 금지
- `aria-hidden="false"` 명시는 옵션 — 내부 텍스트가 스크린리더에 정상 노출되어야 하므로 hide 하지 않음을 표현. 기본값이라 생략해도 무방.

---

## 4. href 결정 로직 helper 추출 (Spec #8 확장 대비)

현재는 mapper 안에 인라인 로직:

```tsx
href: promotion.linkUrl ?? (promotion.club ? `/clubs/${promotion.club.id}` : '/clubs'),
```

본 spec 에서:

```tsx
// BannerCarousel.tsx 모듈 스코프
function resolvePromotionHref(promotion: PromotionCard): string | null {
  if (promotion.linkUrl) return promotion.linkUrl;
  if (promotion.club) return `/clubs/${promotion.club.id}`;
  return null;
}

// promotionToSlide 안:
href: resolvePromotionHref(promotion),
```

향후 Spec #8 (공지 연결) 가 합류할 때 한 줄 삽입:

```tsx
function resolvePromotionHref(promotion: PromotionCard): string | null {
  if (promotion.linkUrl) return promotion.linkUrl;
  if (promotion.notice?.isAccessible) return `/notices/${promotion.notice.id}`;  // ← Spec #8 추가
  if (promotion.club) return `/clubs/${promotion.club.id}`;
  return null;
}
```

순서:
1. `linkUrl` (외부/내부 URL — 직접 입력 우선)
2. `notice` (Spec #8 에서 추가, `isAccessible=true` 인 경우만)
3. `club`
4. `null`

근거: Spec #8 의 백엔드 CHECK 제약이 \"≤1 set\" 을 강제하므로 실제론 우선순위 충돌이 발생할 일이 없지만, 정의된 결정 순서가 있는 게 디버그·테스트에 명확하다.

---

## 5. 타입 변경

### 5.1 CarouselSlide (BannerCarousel.tsx 내부)

```diff
type CarouselSlide = {
  // ...
- href: string;
+ href: string | null;
  // ...
};
```

### 5.2 SystemComposedSlideData (SystemComposedSlide.tsx export)

```diff
export type SystemComposedSlideData = {
  // ...
- href: string;
+ href: string | null;
  // ...
};
```

### 5.3 FullBleedSlideData (FullBleedSlide.tsx export)

```diff
export type FullBleedSlideData = {
  // ...
- href: string;
+ href: string | null;
  // ...
};
```

### 5.4 mock 슬라이드 매핑

`mockToSlide` 의 href 빌드 로직 (line 36-40) 은 그대로 — 모든 landing banner 가 명시적 href 를 가짐. 영향 없음.

---

## 6. 영향 파일

| Action | Path | 내용 |
|--------|------|------|
| Modify | `frontend/apps/web/app/_components/sections/BannerCarousel.tsx` | `resolvePromotionHref` 헬퍼 추가, `promotionToSlide` 호출 변경, `CarouselSlide.href` 타입 `string \| null` |
| Modify | `frontend/apps/web/app/_components/sections/banner/SystemComposedSlide.tsx` | `SystemComposedSlideData.href: string \| null`, MainSlideBody 의 null 분기 (비인터랙티브 `<div>` + `cursor-default`) |
| Modify | `frontend/apps/web/app/_components/sections/banner/FullBleedSlide.tsx` | `FullBleedSlideData.href: string \| null`, FullBleedMainBody 의 null 분기 |
| Modify | `frontend/apps/web/test/sections/banner/system-composed-slide.test.tsx` | href=null 시 비인터랙티브 검증 (+2 케이스) |
| Modify | `frontend/apps/web/test/sections/banner/full-bleed-slide.test.tsx` | href=null 시 비인터랙티브 검증 (+1 케이스) |

**백엔드 변경 zero.**

---

## 7. RTL 테스트 명세

### 7.1 SystemComposedSlide (+2 케이스)
```tsx
it('main 의 href 가 null 이면 role=link 가 없고 cursor-default 가 적용된 div 로 렌더된다', () => {
  const { container } = render(<SystemComposedSlide variant="main" slide={makeSlide({ href: null })} />);
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
  // 내부 콘텐츠는 그대로 보임 (제목 등)
  expect(screen.getByText('테스트 배너 제목')).toBeInTheDocument();
  // wrapping div 에 cursor-default 클래스
  const wrappingDiv = container.firstChild as HTMLElement;
  expect(wrappingDiv.className).toContain('cursor-default');
});

it('main 의 href 가 null 이면 wrapping 요소가 Tab focus 불가능하다', () => {
  const { container } = render(<SystemComposedSlide variant="main" slide={makeSlide({ href: null })} />);
  // div 는 기본 tabindex 없음 → focusable 자체가 false
  const wrappingDiv = container.firstChild as HTMLElement;
  expect(wrappingDiv.tagName.toLowerCase()).toBe('div');
  expect(wrappingDiv.tabIndex).toBe(-1);
});
```

### 7.2 FullBleedSlide (+1 케이스)
```tsx
it('main 의 href 가 null 이면 role=link 가 없는 div 로 이미지만 렌더된다', () => {
  render(<FullBleedSlide variant="main" slide={makeSlide({ href: null })} />);
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
  // 이미지는 그대로
  expect(screen.getByRole('img')).toBeInTheDocument();
});
```

### 7.3 기존 테스트 영향
- 기존 \"외부 URL\" / \"내부 라우트\" 케이스는 `href: 'https://...'` 또는 `href: '/clubs'` 를 명시 전달 → 동작 그대로 PASS.

---

## 8. 검증 / 회귀 항목

### 8.1 자동화
- 위 7절 RTL 케이스
- 전체 web 테스트 풀-스위트 PASS

### 8.2 브라우저 sanity
- 메인 페이지: 어드민이 linkUrl/clubId 둘 다 비운 DB 배너를 만든 후,
  - 마우스 hover 시 커서가 클릭 모양으로 변하지 않음
  - 클릭해도 페이지 이동 zero
  - Tab 키로 포커스 이동 시 해당 배너에 focus 가지지 않음 (다음 인터랙티브 요소로 skip)
- 메인 페이지: 어드민이 linkUrl 또는 clubId 를 채운 배너는 기존 그대로 클릭/Tab focus 정상 동작
- 사이드 미리보기 슬라이드는 모든 경우에 그대로 `<button>` 으로 동작 (캐러셀 활성 슬라이드 전환)

---

## 9. PR 분할

본 사양은 단일 PR. 변경이 작고 (3 파일 + 테스트 2 파일) 같은 도메인.

브랜치명: `fix/promotion-banner-conditional-click`

---

## 10. 후속 사양 (Out of Scope)

- **Spec #8 (`2026-06-07-promotion-notice-link-design.md`)**: 공지 연결. 본 spec 의 `resolvePromotionHref` 헬퍼에 `notice` 분기 한 줄 추가. 백엔드 schema + 어드민 폼 + 가시성 더블 체크는 별도 사양에서.
- 어드민 폼의 \"연결 안 함\" UI 라벨 명시화는 Spec #8 의 라디오 UX 에 자연스럽게 포함.

---

## 11. Open Questions

(없음 — 비인터랙티브 정의 5요소 + helper 추출 모두 확정.)

---

## 12. 참고

- 선행 사양: `docs/superpowers/specs/2026-06-07-promotion-banner-ux-refinements-design.md`
- 선행 PR: PR #281 / #285 / #286 (refinements + preview 카드 fix)
- 메모리 가이드 준수: Conventional Commits, `[#이슈번호]` 형식 금지, Co-Authored-By 라인 금지.
