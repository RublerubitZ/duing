# 모바일 탐색 화면 — 카테고리 레일 스크롤 체이닝 + 검색창 sticky

- 작성일: 2026-07-31
- 범위: `frontend/apps/web/app/clubs` (모바일 `<md` 만)

## 배경

모바일 탐색 화면에서 두 가지를 개선한다.

1. 카테고리 레일을 가로로 드래그할 때 화면 전체가 같이 끌려오는 느낌 제거
2. 홈과 동일하게 검색 영역을 상단 고정

## 관측 (실측)

개발 서버 `:3000`, 뷰포트 390×844 에서 측정했다.

| 항목 | 값 |
|---|---|
| 카테고리 레일 콘텐츠 폭 / 보이는 폭 | 408px / 390px — **스크롤 가능 거리 18px** |
| 레일 `overflow-x` | `auto` |
| 레일 `overscroll-behavior-x` | `auto` |
| 레일 `scroll-snap-type` | `none` |
| 레일 `touch-action` | `auto` |
| 레일의 커스텀 포인터/터치 핸들러 | 없음 |
| 조상 체인의 스크롤·오버스크롤 설정 | 없음 |
| `document.scrollWidth` vs `clientWidth` | 동일 — **문서에 가로 스크롤 없음** |
| 상단 `ExploreNav` | `position: relative` — 스크롤로 사라짐 |
| 모바일 블록 높이 | 제목+검색 160px · 레일 44px · 필터행 61px |

## 진단

**관성 스크롤은 이미 네이티브로 동작하고 있으며, 이를 막는 설정은 없다.** 레일은 커스텀 드래그 핸들러 없는 순수 `overflow-x-auto` 이고 `scroll-snap` · `touch-action` 오버라이드도 없다. `-webkit-overflow-scrolling: touch` 를 추가해도 최신 iOS 에서는 달라지는 것이 없다.

체감 문제의 실체는 두 가지다.

**1. 스크롤 거리가 18px 뿐이다.** 카테고리 9개가 모두 두 글자라 390px 화면에 거의 다 들어간다. 이 거리에서는 관성이나 바운스가 물리적으로 드러나지 않는다. 화면이 좁아지면 늘어난다(360px ≈ 48px, 320px ≈ 88px).

**2. 레일의 오버스크롤이 상위로 전파된다.** 레일은 18px 만에 끝에 닿는데, `overscroll-behavior-x` 가 `auto` 이고 조상 체인에 이를 막는 설정이 없어 오버스크롤이 문서까지 올라간다. 문서에 가로 스크롤이 없고 레일의 오버스크롤이 상위로 전파되면서, iOS Safari 에서는 viewport rubber-band 또는 edge-swipe 탐색 제스처로 이어질 수 있다. 사용자는 이를 화면 전체가 같이 끌려오는 느낌으로 인지할 수 있다.

## 결정

### 카테고리 레일 — 클래스만 추가, 구조 불변

```
flex gap-5 overflow-x-auto bg-cream px-4
  → flex gap-5 overflow-x-auto overscroll-x-contain bg-cream px-4
    [scrollbar-width:none] [&::-webkit-scrollbar]:hidden
```

- `overscroll-x-contain` — 레일 끝의 오버스크롤을 레일 안에서 끝내 상위 전파를 차단한다. **지원 브라우저에서는 `overscroll-behavior` 가 적용되며, 미지원 Safari 에서는 기존 동작을 유지한다.** 기능 추가가 아니라 전파 차단이므로 미지원 환경에서도 회귀가 없다.
- 세로축은 `auto` 로 둔다. 레일 위에서 시작한 세로 드래그는 페이지가 받아야 한다.
- 스크롤바 숨김 — Android Chrome 에서 스크롤 중 막대가 노출된다. 같은 레포의 `ClubHeroSwipe` 가 이미 `[scrollbar-width:none]` 을 쓰는 전례가 있고, 여기에 WebKit 변형을 함께 둔다.

### 검색창 sticky — 검색 폼만 분리

제목 블록(`EXPLORE` / `동아리 탐색`)은 스크롤로 흘려보내고 검색 폼만 홈과 동일한 sticky 래퍼로 감싼다.

```
<section pt-8 pb-4>  EXPLORE · 동아리 탐색        ← 스크롤로 사라짐
<div sticky top-0 z-40 border-b border-line
     bg-cream/95 backdrop-blur px-4 py-2.5>       ← 상단 고정 (약 64px)
  <form>  검색 입력                                 ← 스타일 기존 유지
<nav>  카테고리 레일                                ← 바 아래로 지나감
```

- 홈(`HomeMobileSearchBar`)과 **동일한 래퍼 클래스**를 쓴다. 입력창 자체 스타일(`rounded-[14px]` · 테두리 · 포커스 효과)은 탐색 화면 것을 그대로 둔다 — 요청은 sticky 동작 통일이지 입력창 디자인 통일이 아니다.
- 하단 헤어라인은 둔다. 반투명 바 뒤로 카드가 지나가는데 배경색이 거의 같아 선이 없으면 카드가 잘려 보인다. `DESIGN.md` 의 "고정 바 chrome 판정 기준"에 해당한다.
- 별도 `padding` 보정은 필요 없다. `sticky` 는 `fixed` 와 달리 자기 자리를 차지하므로 콘텐츠가 가려지지 않는다.
- safe-area 보정은 필요 없다. `viewport-fit=cover` 가 켜져 있지만 보정이 필요한 것은 `fixed` / `absolute` 오버레이이고, `sticky` 는 스크롤포트 기준이라 노치와 겹치지 않는다. 홈이 같은 구조로 이미 동작 중이다.
- 공용 컴포넌트로 추출하지 않는다. 홈은 `/clubs` 로 넘기는 GET 폼이고 탐색은 현재 URL 파라미터를 갱신한다 — 동작이 달라 억지 추상화가 된다.

### 로딩 스켈레톤 동기화

`ClubExploreSkeleton` 의 모바일 블록도 같은 구조로 맞춘다. 검색창 위치가 어긋나면 로딩이 끝나는 순간 튄다.

## Out of Scope

- **터치 영역 확대 · 버튼 패딩 변경** — 카테고리 탭의 터치 영역이 24×44px(가로가 글자 폭)이라 개선 여지가 있으나, 이번 범위에서 제외한다. 활성 탭 밑줄 폭이 함께 바뀌어 공용 탭 컴포넌트의 글자폭 밑줄 컨벤션과 갈리는 문제가 붙어 있다.
- **`touch-action: pan-x`** — 레일에서 시작한 드래그를 가로로 고정할 수 있으나, 그 44px 띠 위에서 페이지 세로 스크롤이 막힌다. 손해가 커서 적용하지 않는다. 실기기에서 `overscroll-x-contain` 만으로 부족할 때 재검토할 마지막 수단으로 남긴다.
- **`-webkit-overflow-scrolling: touch`** — 최신 iOS 에서 기본값이라 무의미하고, 이번 문제의 원인도 아니다.
- **레일에 인위적 오버플로 부여** — 스크롤 느낌을 위해 간격이나 패딩을 키우는 것. 보이던 카테고리가 잘리고 화면을 낭비한다.
- **JS 기반 커스텀 관성 스크롤** — 네이티브보다 나은 결과를 내기 어렵고, 이 레포에는 드래그 컨테이너가 자식 버튼 클릭을 삼킨 사고와 네이티브 드래그가 스와이프를 끊은 사고 전례가 있다. 현재 터치·클릭 충돌이 없는 것은 네이티브 스크롤이 보장해 주는 것인데, 직접 구현하면 그 보장을 스스로 깬다.
- 데스크탑(`md` 이상) 레이아웃, 백엔드.

## 검증

1. `pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm build` (cwd `frontend/`)
2. 실브라우저(Chromium) — 390 / 360 / 320 세 폭에서 레일의 `overscroll-behavior-x` 적용값, sticky 동작, 스크롤바 비노출, 레이아웃 어긋남 확인
3. 스켈레톤과 실제 화면의 검색창 세로 위치 대조

### 검증의 한계 — 명시

Playwright 는 Chromium 을 구동한다. **CSS 적용 여부와 레이아웃은 확인할 수 있으나, iOS Safari 의 rubber-band 반동과 탐색 제스처는 재현할 수 없다.** 해당 부분은 실기기 확인이 필요하며, 이 작업이 보장하는 범위는 "전파를 차단하는 올바른 처방을 적용했다" 까지다.

또한 iOS 는 화면 가장자리 근처에서 시작한 드래그를 시스템 탐색 제스처로 먼저 채간다. 오버스크롤 규칙이 적용되기 이전 단계라 `overscroll-behavior` 로 닿지 않으며, 이를 막으려면 탐색 제스처 자체를 무력화해야 해서 다루지 않는다.

## 롤백

시각·동작 변경만 있고 데이터·API 영향이 없다. 문제 시 revert 한다.
