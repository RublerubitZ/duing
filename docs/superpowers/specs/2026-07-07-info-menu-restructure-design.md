# 정보(Information) 메뉴 구조 개편 설계

날짜: 2026-07-07
대상: frontend (apps/web)
상태: 사용자 승인 대기

## 1. 배경과 목표

현재 GNB(PC/태블릿/모바일)의 "공지" 메뉴를 "정보" 메뉴로 변경하고, 흩어져 있는
정보성 페이지 4개(/notices, /faq, /terms, /introduce)를 하나의 정보 IA로 묶는다.

- 이번 작업은 **메뉴 구조(UI/UX) 변경**이 목적이다. 기존 페이지의 콘텐츠·기능은 유지한다.
- 기존 URL·SEO·북마크·외부 링크는 전부 그대로 유지한다.
- 새 `/info` 라우트를 만들지 않고, Route Group Layout도 만들지 않는다.
- PC/태블릿/모바일 모두 동일한 정보 구조(IA)를 제공하고 레이아웃만 반응형으로 달라진다.
- 향후 도움말·가이드·릴리즈 노트 등 정보성 콘텐츠가 추가되어도 메뉴 구조를 바꾸지 않도록
  단일 정의(SoT) 기반으로 구성한다.

### 메뉴 → 페이지 매핑

| 탭 라벨 | 연결 URL |
|---|---|
| 공지 | /notices |
| 자주 묻는 질문 | /faq |
| 운영정책 | /terms |
| 서비스 소개 | /introduce |

## 2. 확정된 결정 사항

대화로 확정된 설계 결정과 근거:

1. **허브 방식**: 새 라우트/레이아웃 없이 **공용 InfoTabs 컴포넌트를 4개 페이지에 각각 삽입**.
   드롭다운 대안은 모바일 스펙(가로 스크롤 탭)과 이어지지 않아 기각.
   Route Group은 4개 페이지 상단 구조가 제각각이고 notices 상세에 탭이 따라붙는 문제로 기각.
2. **GNB 통일**: 4개 페이지 모두 ExploreNav 사용.
   - /introduce: HomeNav → ExploreNav 교체 (HomeNav는 active 판정이 없어 "홈" 고정 밑줄 →
     InfoTabs의 "서비스 소개" active와 모순되므로)
   - /terms: 자체 미니 헤더(BrandMark + "← 홈으로") 제거 → ExploreNav 교체
3. **최상위 "서비스 소개" 링크 제거**: HomeNav의 독립 "서비스 소개" li는 제거.
   진입 경로가 "정보 → 서비스 소개"로 이동하는 것이며 페이지 자체는 유지.
4. **BottomNav 노출 확대**: 기존에 하단 탭바가 없던 /faq·/terms·/introduce 에서도
   탭바를 노출한다(모바일 동일 IA). 정보 탭은 4개 경로 모두에서 active.
   아이콘은 Megaphone → lucide `Info` 계열로 교체.
5. **InfoTabs에 "정보" 제목 없음**: 각 페이지가 이미 고유 H1/히어로 타이틀을 갖고 있어
   탭 바는 섹션 전환 내비게이션으로만 기능한다.
6. **마지막 방문 기억**: GNB/BottomNav의 "정보" 클릭 시 마지막 방문 허브 페이지로 이동,
   이력이 없거나 유효하지 않으면 /notices 폴백.
7. **판정 함수 역할 분리**: `isInfoSection`(섹션 여부, 상세 포함)과
   `isInfoHubPage`(허브 4페이지만) 를 분리한다.
8. **방문 기록 시점**: 마운트 1회가 아니라 `useEffect(..., [pathname])` 로 pathname 변경마다 기록.
9. **이동 정책 단일화**: `getLastInfoPath()` 가 내부에서 검증+폴백까지 끝내고 항상 유효한
   경로만 반환하며, ExploreNav·HomeNav 슬롯·BottomNav 세 소비처가 이 함수 하나만 쓴다.
10. **상세 페이지 정책 유지**: 정보 섹션에 속하더라도 상세 페이지(예: `/notices/[id]`)에서는
    기존 정책을 그대로 유지한다 — BottomNav 미노출(상세 숨김 정규식), InfoTabs 미노출.
    읽기에 집중하는 화면에는 섹션 전환 UI를 얹지 않는다. 향후 FAQ 상세 등이 생겨도 동일 원칙.
11. **PC HomeNav Hover Quick Menu** (후속 추가, 사용자 확인 완료): HomeNav 의 "정보" 메뉴에
    hover 시 허브 4개로 직행하는 Quick Menu 를 붙인다. **컴포넌트 단위 적용** — HomeNav 가
    렌더되는 모든 화면(`/`·`/admin`·`/me`·`/me/settings`)에서 동작한다(사용자 확인: 전체 적용).
    제외 조건은 자연 충족된다: ExploreNav 는 별도 구현이라 미적용, 정보 섹션 4페이지는 HomeNav
    를 쓰지 않음, 모바일은 slimOnMobile 로 링크 숨김, 터치 태블릿은 hover 이벤트가 없어 메뉴가
    뜨지 않고 탭=클릭=기존 이동. **클릭 정책 불변**: "정보" 클릭은 `getLastInfoPath()`,
    Quick Menu 항목 클릭은 해당 URL 직행. 정보 섹션의 메인 내비게이션은 계속 InfoTabs 다.

## 3. 상세 설계

### 3.1 공유 정의 — `apps/web/app/_lib/infoMenu.ts` (신설)

정보 섹션의 단일 정의(SoT). admin 영역의 `adminSections.ts` 단일 정의 공유 전례를 따른다.

```ts
export const INFO_MENU_ITEMS = [
  { label: '공지', href: '/notices' },
  { label: '자주 묻는 질문', href: '/faq' },
  { label: '운영정책', href: '/terms' },
  { label: '서비스 소개', href: '/introduce' },
] as const

export const DEFAULT_INFO_PATH = '/notices'
```

판정 함수 (역할 분리):

- `isInfoSection(pathname)`: 정보 **섹션** 여부. 4개 href 각각에 대해
  `pathname === href || pathname.startsWith(href + '/')` prefix 매칭.
  `/notices/[id]` 상세도 true. → **GNB·BottomNav active 판정 전용**.
  **InfoTabs 노출 여부 판단에는 사용하지 않는다** — InfoTabs 노출은 조건부 렌더링이 아니라
  허브 4페이지에 대한 수동 배치로 결정된다.
- `isInfoHubPage(pathname)`: InfoTabs를 표시하는 **허브 페이지**만 exact 매칭
  (INFO_MENU_ITEMS href 4개 중 하나와 정확히 일치). 상세 페이지는 false.
  → **방문 기록 가드·저장값 검증 전용**.

마지막 방문 기억 (localStorage, faqFeedbackSession.ts 패턴):

- 키: `duing:info-last-path` (콜론 프리픽스 — 최신 컨벤션)
- `rememberInfoPath(pathname)`: `isInfoHubPage(pathname)` 일 때만 저장.
  try/catch(차단 환경 무시) + SSR 가드.
- `getLastInfoPath(): '/notices' | '/faq' | '/terms' | '/introduce'`:
  저장값을 읽어 `isInfoHubPage` 로 검증, 없거나 유효하지 않으면 `DEFAULT_INFO_PATH` 반환.
  **null 을 반환하지 않는다** — 소비처 3곳이 폴백 로직 없이 그대로 쓴다.

확장 시나리오: 새 정보 페이지 추가 = `INFO_MENU_ITEMS` 에 1줄 추가.
탭 노출·GNB active·BottomNav active·저장값 검증이 전부 자동으로 따라온다.

### 3.2 InfoTabs 컴포넌트 — `apps/web/app/_components/InfoTabs.tsx` (신설)

`'use client'`. `usePathname` 으로 active 판정.

- **시맨틱**: 페이지 이동이므로 Radix Tabs(인페이지 상태 전환 위젯)가 아니라
  `<nav aria-label="정보">` + 링크 4개. active 탭에 `aria-current="page"`.
- **Link**: `next-view-transitions` 의 Link (ExploreNav/BottomNav 등 전역 내비 컨벤션).
  typedRoutes 대응은 as const href 로 충분(동적 경로는 `toRoute()` 사용).
- **스타일**: 기존 언더라인 탭 관례(ClubExplorePage 카테고리 탭, shadcn tabs.tsx 토큰)를 따름.
  - 컨테이너: `border-b border-line`, 탭 라벨은 `font-body`(Pretendard) — 헤딩 태그 사용 금지
    (`.duing h1~h4` 가 GmarketSans 자동 적용).
  - 활성: `border-ink text-ink` (언더라인 `border-b-[2.5px]`), 비활성:
    `border-transparent text-charcoal-3 hover:text-ink`.
- **반응형**:
  - 모바일(<768px): 래퍼 `overflow-x-auto` + **`pb-px`** (음수 마진 언더라인 세로 클립 방지 —
    ClubDetailTabs 에 명시된 함정), 탭 `shrink-0 whitespace-nowrap`,
    세로 패딩으로 터치 영역 **44px 이상** 확보.
    **`sticky top-0 z-40`** + `bg-cream/95 backdrop-blur` (HomeMobileSearchBar 전례.
    전역 헤더는 sticky 가 아니므로 스크롤 시 탭만 상단에 남는다).
    **sticky 는 모바일(<768px) 전용이 의도된 UX 다** — 태블릿·PC(md+)는 `md:static`.
    전역 헤더가 sticky 가 아닌 사이트 구조와 일관되며, PC/태블릿 스펙은 sticky 를 요구하지 않는다.
  - 폭: GNB 와 동일한 `max-w-layout mx-auto px-4 sm:px-6 md:px-10` 컨테이너 정렬.
    태블릿/PC 콘텐츠 폭은 각 페이지 본문이 기존대로 결정.
- **방문 기록**:

  ```tsx
  useEffect(() => {
    rememberInfoPath(pathname) // 내부에서 isInfoHubPage 가드
  }, [pathname])
  ```

  InfoTabs 는 허브 4페이지에만 배치되므로 상세 페이지는 기록되지 않는다
  (마지막 "허브" 페이지만 기억됨).

- **z-index 정합**: 헤더 z-50(비 sticky) > InfoTabs z-40(sticky) — 기존 계층
  (BottomNav z-40, 콘솔 sticky 바 z-30)과 충돌 없음.

### 3.3 GNB 3벌 변경

메뉴 항목이 HomeNav(하드코딩 li)·ExploreNav(NAV_ITEMS)·BottomNav(TABS) 3곳에 중복 정의된
현 구조에서, "정보" 항목의 active 판정·이동 정책은 `infoMenu.ts` 를 공유해 동기화한다.

**ExploreNav** (`app/_components/ExploreNav.tsx`):

- NAV_ITEMS: `공지 /notices` → `정보`. 정보 항목에 선택적 매칭 함수(`match?: (pathname) => boolean`)를
  부여하고 정보 항목만 `isInfoSection` 을 지정 — isActive 는 match 가 있으면 그것을,
  없으면 기존 exact+prefix 규칙을 쓴다.
- href: 초기 렌더는 `/notices`(서버/클라이언트 첫 페인트 일치 → 하이드레이션 mismatch 없음),
  마운트 후 `getLastInfoPath()` 값으로 상태 교체.
- 기존 `active="공지"` 강제 prop 사용처 4곳(NoticePage 1 + notices 상세 3분기)은
  pathname 매칭이 커버하므로 **제거**. active prop 기능 자체는 유지.
- `isDetailFocus` 정규식(`/^\/(clubs|notices)\/\d+$/`, 상세 모바일 헤더 숨김)은 변경 없음.

**HomeNav** (`app/_components/HomeNav.tsx`, Server Component):

- 공지 li → 정보. 마지막 방문 링크는 클라이언트 훅이 필요하므로
  `HomeNavAdminLink`/`HomeNavAuthSlot` 전례대로 소형 클라이언트 슬롯
  `InfoNavLink`(신설, `'use client'`) 로 분리 — 초기 href `/notices`,
  마운트 후 `getLastInfoPath()` 로 교체. 스타일은 HomeNav 의 inactiveLink 상수를 prop 으로 주입.
- **최상위 "서비스 소개" li 제거** (ml-6 구분 포함).
- HomeNav 는 홈(/)·/admin·/me 계열에서 계속 사용된다 (이번 개편으로 /introduce 만 이탈).

**BottomNav** (`app/_components/BottomNav.tsx`):

- TABS: `공지(Megaphone)` → `정보(lucide Info)`.
- active/노출: 정보 탭은 `isInfoSection` 으로 4개 경로 모두 매칭 →
  /faq·/terms·/introduce 에서 **탭바가 새로 노출**된다(기존에는 미노출).
- href: ExploreNav 와 동일하게 초기 `/notices` → 마운트 후 `getLastInfoPath()`.
- 상세 숨김 정규식(`/^\/(clubs|notices)\/\d+$/` → 탭바 자체 숨김)은 변경 없음 —
  공지 상세에서는 기존대로 탭바 미노출.

### 3.4 페이지별 수정

| 페이지 | 변경 내용 |
|---|---|
| `/notices` (NoticePage) | ExploreNav 유지(`active="공지"` prop 제거) + 히어로("NOTICE / 캠퍼스 소식") 위에 InfoTabs 삽입. 필터·콘텐츠 변경 없음 |
| `/faq` (FaqPage) | ExploreNav 아래 InfoTabs 삽입. `page.tsx` 의 `<Suspense>` 경계(useSearchParams CSR bailout) 반드시 유지 |
| `/terms` (page.tsx) | 미니 헤더(BrandMark + "← 홈으로") 제거 → ExploreNav + InfoTabs. 본문 `max-w-3xl`·HomeFooter·약관 전문(RETENTION_PERIOD "탈퇴 후 45일" 문구 포함) 그대로 유지 |
| `/introduce` (page.tsx) | HomeNav → ExploreNav 교체 + 히어로 위 InfoTabs. 루트 `overflow-x-clip`(스크롤 모션 가로 클립)·framer-motion 섹션·HomeFooter 유지 |
| `/notices/[id]` | InfoTabs 미노출. `active="공지"` prop 제거만 (3개 렌더 분기 모두) |

부수 라벨 통일: 홈 섹션(HomeQnaSection)의 "FAQ 전체 보기" 버튼 문구 →
"자주 묻는 질문 전체 보기" (FAQ 명칭 통일 원칙).

### 3.5 InfoNavLink Hover Quick Menu (결정 11)

`InfoNavLink` 내부에 경량 커스텀 hover 패널을 구현한다 (shadcn NavigationMenu 미설치·
Radix DropdownMenu 는 클릭-오픈 전용이라 신규 의존성 없이 구현):

- **열림**: 래퍼 mouse enter 또는 focus 진입(키보드 접근). **닫힘**: mouse leave,
  포커스가 래퍼 밖으로 이탈, Escape. 트리거 링크에 `aria-expanded` 반영.
- **패널**: `absolute top-full` + 상단 `pt-2` 브리지(패널 wrapper 의 패딩이라 hover 연속성
  유지 — 데드존 없음). 항목은 `INFO_MENU_ITEMS` SoT 를 순회 — 새 정보 페이지 추가 시
  Quick Menu 도 자동 반영. 스타일은 UserMenu 드롭다운과 같은 계열 토큰(bg-paper·border-line·
  rounded-md·shadow, 항목 hover bg-cream).
- **트리거 href 는 기존 그대로** `useLastInfoPath` — Quick Menu 항목만 직행 URL.
- 터치 기기: hover 이벤트 부재로 메뉴가 열리지 않고 탭=클릭 이동(모바일·태블릿 제외 충족).

### 3.6 테스트

기존 테스트 갱신:

- `test/components/explore-nav.test.tsx`: 라벨 공지→정보, 4개 경로 active,
  `active="공지"` prop 케이스 정리, 마운트 후 href 교체.
- `test/components/bottom-nav.test.tsx`: 라벨/아이콘 교체, /faq·/terms·/introduce 노출,
  4개 경로 active, 공지 상세 숨김 유지.

신규 테스트:

- `info-tabs.test.tsx`: pathname 별 active(aria-current) 표시, 탭 4개 렌더·href,
  pathname 변경 시 `duing:info-last-path` 저장, 허브 외 경로 미기록.
- `infoMenu` 유틸 테스트: `isInfoSection`(상세 포함) vs `isInfoHubPage`(상세 제외) 분리 검증,
  `getLastInfoPath` 의 유효하지 않은 저장값 → `/notices` 폴백, SSR(서버) 가드.

검증: `pnpm` 테스트/린트/빌드는 `frontend/` cwd 에서 실행하고, 실브라우저(:3000)
시각 QA 로 모바일 sticky 탭·가로 스크롤·BottomNav 노출을 확인한다
(jsdom 이 못 잡는 포인터/스크롤 동작 전례).

## 4. Out of Scope

- 공지 필터에 "총동연" 구분 추가 — 스펙 초안의 "전체/동아리/총동연" 필터는 현재 구현
  (출처 세그먼트 학교/내 동아리 + 카테고리 + 검색)과 다르며, NoticeSource 타입·백엔드 API
  확장이 필요해 이번 범위에서 제외. 기존 필터 그대로 유지.
- NoticePage 인라인 스타일 → Tailwind 클래스 리팩토링 (탭 삽입에 필요한 최소 수정만).
- HomeNav/ExploreNav 두 GNB 변형의 완전 통합 (이번에는 "정보" 항목 동기화까지만).
- 데드코드 삭제 (NavDropdown.tsx, NoticeFilterBar.tsx — 이번 작업과 무관).
- /notices·/introduce 메타데이터 보강 (introduce title 이 홈과 중복인 문제 포함 — 별도 SEO 작업).
- zustand persist 도입 — localStorage 직접 접근 관례(try/catch + SSR 가드)를 따른다.

## 5. 리스크와 함정 (구현 시 주의)

- **하이드레이션**: 마지막 방문 href 는 초기 `/notices` 렌더 후 마운트 시 교체.
  초기 렌더에서 localStorage 를 읽으면 서버/클라이언트 mismatch.
- **언더라인 클립**: 가로 스크롤 래퍼에 `pb-px` 필수 (ClubDetailTabs 함정).
- **`.duing` bg-cream**: sticky 탭 배경은 의도적 `bg-cream/95` — 페이지 플로우 내부라 안전.
  단, 탭을 fixed 오버레이로 바꾸는 변경은 금지(크림 띠 함정).
- **FaqPage Suspense**: page.tsx 의 Suspense 경계를 제거하면 빌드 에러(CSR bailout).
- **NoticePage 인라인 스타일**: 인라인 `display` 가 `md:hidden` 클래스를 덮는 함정이
  이미 존재 — InfoTabs 삽입 위치 주변에서 인라인 스타일과 충돌하지 않게 클래스 기반 유지.
- **라벨 결합 active prop**: `active="공지"` 는 라벨 문자열 비교라 라벨 변경 시 조용히
  active 소실 — 사용처 4곳을 모두 제거해야 잔존 결합이 없다.
- **정규식 이중 정의**: ExploreNav.isDetailFocus 와 BottomNav.matchTabHref 의 상세 정규식은
  이번에 변경하지 않지만, 둘 다 건드리게 되면 반드시 동기화.
- **테스트 클래스 결합**: 기존 테스트가 클래스명(hidden/md:block)·라벨에 결합 —
  구조 변경 시 테스트 동반 수정 없으면 CI 실패.
- **packages/* 제약**: localStorage 로직은 apps/web(`app/_lib/infoMenu.ts`) 에 배치
  (packages 에는 window/document 직접 접근 금지).
