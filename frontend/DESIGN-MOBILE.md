# Du-ing — Mobile UX Architecture & Design Spec

> `DESIGN.md`(데스크탑 기준 SoT)의 **모바일 확장 명세.** 새 디자인 시스템이 아니라 기존 두잉 토큰/타입/카피 규칙을 모바일로 확장한다.
> **본 문서는 설계 문서다 — 코드 변경 없음.** §3(모바일 UX 원칙)은 그대로 `DESIGN.md` 에 `## Mobile` 섹션으로 append 가능한 형태로 작성했다.

## 0. 요약 (TL;DR)

DUING(apps/web)은 **구조적으로 데스크탑 퍼스트**다 — `md:`(768px)가 유일한 분기점이고, **unprefixed(기본) 클래스가 곧 모바일 렌더**인데 모바일 폴백이 사실상 없다. 전역 진단:

| 신호 | 실측 | 모바일 영향 |
|------|------|------------|
| `viewport` meta / `viewport-fit=cover` | **0** (`layout.tsx` 어디에도 없음) | 세이프에어리어 전제 자체가 성립 안 됨 |
| 모바일 네비(드로어/바텀바/햄버거) | **0** | 운영/관리 사이드바가 360px를 점령, 공개 네비는 데스크탑 상단바 단일 |
| `dvh` 사용 | **0** (`min-h-screen` 22회 + `h-screen` 23회) | 모바일 브라우저 크롬으로 100vh 잘림 |
| `max-w-layout`(1280) + `px-10`(좌우 40px) | 44 / 48 파일 | 360px에서 콘텐츠폭 280px, 320px에서 240px |
| 무폴백 `grid-cols-4` | 6곳 | 360px에서 셀 ~80px — 판독·터치 불가 |
| 입력 폰트 <16px(`text-[12.5~15px]`/`text-sm`) | 광범위 | iOS 포커스 자동 줌 |
| `<table>`(관리자) | 11개 (10개 `overflow-x-auto`, 2개 누락) | 가로 스크롤 의존 |
| hover 의존 | `hover:` 327 / `group-hover:` 9 | 색전환은 무해, **hover-only 노출**은 터치 대체 필요 |

**핵심 구분 (DESIGN.md 가 모바일을 규정하지 않으므로):**
- **`[위반]`** = 기존 DESIGN.md 규칙(두잉 토큰/색/카피)을 어김 — 모바일 작업 중 발견되나 **대부분 데스크탑 감사 트랙 소관(본 명세 범위 외)**
- **`[미정의]`** = DESIGN.md 가 모바일을 규정 안 함 → **본 명세(§3)가 새로 정의** — 모바일 발견의 절대다수

> 솔직한 결론: 모바일 이슈의 거의 전부는 `[미정의]`다. DESIGN.md 에는 브레이크포인트·터치타겟·세이프에어리어·하단네비·모바일 타입스케일 규정이 없다. 따라서 본 문서의 1차 목적은 "위반 적발"이 아니라 **"모바일 규칙의 부재를 메우는 것"**이다.

---

## 1. 현재 상태 분석 (정적 분석, 폭 360px 기준)

### 1.1 등급 정의
- **Ready** — 기본(모바일) 레이아웃이 320~430에서 무결
- **Partial** — 일부 깨짐(overflow/잘림/작은 터치타겟)이나 사용 가능
- **Desktop-first** — `md:`만 있고 모바일 폴백 부재, 모바일 사실상 불가

### 1.2 화면 분류표 — 공개/지원자 플로우 (P0)

| 라우트 | 등급 | 핵심 모바일 리스크 (증거) |
|--------|------|--------------------------|
| `/` 홈 | Desktop-first | `HomeHero.tsx:33` `text-[84px]` 무clamp · `:114` `h-[540px]` 콜라주 + rotate(7/-4/3/-6deg) 절대배치 잘림 |
| `/clubs` 탐색 | Desktop-first | `ClubExplorePage.tsx:166` `w-[360px]` 검색박스 · `:441` `grid-cols-4` 무폴백 |
| `/clubs/[clubId]` 상세 | Partial | `ClubDetailHero.tsx:87` `text-[44px] md:text-[56px]`(상단만 폴백) · `ClubDetailPhotos.tsx:16`·`ClubDetailStats.tsx:26` `grid-cols-4` 무폴백 |
| `/apply/[recruitmentId]` 지원서 | Partial | `ApplyAnswersStep` textarea `text-sm`(14px, iOS 줌) · 컨테이너 패딩 타이트하나 단일컬럼이라 사용가능 |
| `/me` 마이 | Desktop-first | `SectionActivity.tsx:39`·`SectionSaved.tsx:47` `grid-cols-4` 무폴백 |
| `/me/applications` | Partial | `ApplicationsPage` inline `gridTemplateColumns:'1fr 200px'` 사이드바 무폴백 |
| `/me/applications/[id]` | Partial | 상세 그리드 고정, 모바일 뷰포트 조정 없음 |
| `/me/favorites` | **Ready** | `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` ✓ 올바른 반응형 (모범 사례) |
| `/notices` | Desktop-first | `NoticePage` inline `gridTemplateColumns:'220px 1fr'` + `width:280` 검색 무폴백 |
| `/notices/[noticeId]` | Partial | 다열 메타 그리드 `sm:` 부재 |
| `/(auth)/login`·`/signup` | **Ready** | 좌측 패널 `hidden lg:flex`, 우측 폼 단일컬럼 반응형 ✓ |
| `/introduce` 소개 | Desktop-first | `Solution.tsx` `text-[76px]` · `Testimonials` `text-[64px]` · 배너 `text-[220px]` 워터마크 · `Hero` `grid-cols-4` |

### 1.3 화면 분류표 — 운영진 플로우 (P1, manage)

| 라우트 | 등급 | 핵심 리스크 (증거) |
|--------|------|-------------------|
| `/manage` | Ready | 리다이렉트/로딩만 |
| `/manage/clubs/[clubId]/*` (전체) | Desktop-first | `ManageShell.tsx:21` `<aside className="w-[248px] shrink-0">` — **사이드바가 360px의 69% 점령, 본문 112px** (모든 manage 하위에 적용) |
| `…/recruitments/new`·`/edit` | Desktop-first | `RecruitmentForm.tsx:201,380` `grid-cols-2` 무폴백 · `:56` 입력 `text-sm` |
| `…/applicants` | Desktop-first | `ApplicantTable.tsx:86` 9열 테이블 `overflow-x-auto`만(총폭 ~740px, 가로스크롤 강제) |
| `…/applicants/[id]` | Desktop-first | `ApplicantDetailPage.tsx:55` `lg:grid-cols-2` · `ApplicantProfilePanel.tsx:10` `grid-cols-2` dl 좁음 |
| `…/info` | Desktop-first | `ClubInfoForm.tsx:171` `px-12` · `text-[14px]` 입력 · `grid-cols-[140px_1fr_auto]` SNS행 |
| `…/members` | Partial | `MemberRow.tsx:96~` 액션버튼 `px-2 py-1`(터치타겟 ~16px) |
| `…/photos` | Partial | `grid-cols-2`(360에서 ~168px 각, 사용가능) |
| `…/interview/rounds/[roundId]` | Desktop-first | `RoundMemberTable` flex 행 + 버튼 `px-2 py-1` · `RoundCountCards` `grid-cols-2 sm:grid-cols-4` |
| 일괄 액션바 | — | `BulkActionBar` `fixed inset-x-0 bottom-0` + 버튼 4개 `px-3 py-1.5 text-xs` → 360px 거의 꽉 참, 세이프에어리어 미적용 |

### 1.4 화면 분류표 — 관리자 콘솔 (P2, admin)

관리자는 **데이터 밀도형 테이블 콘솔** — P2 우선순위, "가로 스크롤 허용" 현실적 타협 가능.

| 항목 | 상태 | 증거 |
|------|------|------|
| `AdminSidebar` | 모바일 숨김됨 + 진입로 미정의 | `AdminSidebar.tsx:24` `hidden md:block w-60` — 깨지진 않으나 모바일 네비 진입점 없음 [미정의] |
| 전역 레이아웃 | 280px 콘텐츠 | `max-w-layout px-10` (20+ 페이지) |
| 폼 | 다단 무폴백 | `AdminPromotionForm.tsx:360,424,551` `grid-cols-2/3` · `:648` `text-[140px]` 워터마크 · `text-[14px]` 입력 |

**테이블 인벤토리 (11개):**

| 테이블 | 컬럼 | `overflow-x-auto` | 권고 |
|--------|------|-------------------|------|
| AdminClubsTable | 6 | **❌ 누락** | overflow 래핑 추가 (S) |
| AdminGlobalEventTable | 5 | **❌ 누락** + `w-[140px]` 고정열 | overflow 래핑 추가 (S) |
| AdminNoticesTable | 8 | ✅ | 가로스크롤 유지 |
| AdminPromotionsTable | 10 | ✅ | 가로스크롤 유지 |
| AdminReportsTable | 6 | ✅ | 가로스크롤 유지 |
| AdminPromotionRequestsTable | 6 | ✅ | 가로스크롤 유지 |
| AdminRecertificationRequestsTable | 7 | ✅ | 가로스크롤 유지 |
| AdminRecertificationRoundsTable | 8 | ✅ | 가로스크롤 유지 |
| AdminCentralClubRecertificationStatusTable | 4 | ✅ | 가로스크롤 유지 |
| AdminSuccessionTable | 5 | ✅ | 가로스크롤 유지 |
| AdminClubMemberHistoryTable | 6 | ✅ | 가로스크롤 유지 |

### 1.5 전역 필수 점검 결과 (9항목)

| # | 점검 | 결과 | 태그 |
|---|------|------|------|
| 1 | viewport / `viewport-fit=cover` | **부재** | [미정의] |
| 2 | 디스플레이 타입 모바일 오버플로 | `text-[84px]`(홈)·`[76px]`(소개)·`[56px]`(상세)·`[44px]`(다수), clamp/폴백 없음 | [미정의] |
| 3 | 콜라주 `h-[540px]`+rotate 잘림 | `HomeHero` 4카드 절대배치, `introduce/Hero` `min-h-[560px]` | [미정의] |
| 4 | 입력 폰트 <16px | `text-sm`/`text-[12.5~15px]` 광범위 (manage·admin 폼 전반) | [미정의] |
| 5 | `px-10` 좌우 패딩 과다 | 48파일, 320px에서 콘텐츠 240px | [미정의] |
| 6 | 모바일 네비 부재 | 공개·운영·관리 전부 | [미정의] |
| 7 | `min-h-screen`(100vh) vs `dvh` | dvh 0회, 100vh 계열 45+회 | [미정의] |
| 8 | 가로 overflow 유발원 | `grid-cols-4` 6곳, 워터마크 `text-[220px]`/`[140px]`, 테이블 2개 무래핑 | [미정의] |
| 9 | hover 의존 | 색전환 hover는 무해(터치서 단순 무시)·**hover-only 노출(드롭다운/툴팁)**만 터치 대체 필요 | [미정의] |

> **범위 외(별도 감사 트랙):** 조사 중 manage/admin 컴포넌트에서 `border-slate-*`·`bg-slate-50`·`border-amber/emerald/rose/purple-*`·`shadow-lg` 등 **뉴트럴/비토큰 색·섀도 `[위반]`** 다수 확인(예: `ApplicantTable.tsx:86` `border-slate-200`, `BulkActionBar` `emerald-600`/`rose-200`, `RecruitmentForm.tsx:56` `border-slate-300`). 이는 **데스크탑 감사 finding 으로 본 모바일 명세 범위가 아니다** — 재처리하지 않는다.

---

## 2. 사용자 그룹별 핵심 플로우 평가 (폭 360px)

### 2.1 지원자 (핵심 P0) — 모집 목록 → 상세 → 지원서 → 완료 → 결과
- **목록(`/clubs`)**: `grid-cols-4` + `w-[360px]` 검색 → **차단**. 카드 4열·검색박스 화면폭 초과.
- **상세(`/clubs/[clubId]`)**: 히어로 타이틀은 `md:` 폴백 있어 견딤, **사진/스탯 `grid-cols-4` 무폴백**으로 깨짐.
- **지원서(`/apply`)**: 단일 컬럼이라 구조는 견딤, **입력 14px iOS 줌**만 해결하면 사용가능 — 가장 모바일에 가까움.
- **완료/결과(`/me/applications`)**: inline `1fr 200px` 사이드바가 본문 압박.
- **총평:** 지원자 여정은 모바일 사용 빈도가 가장 높은데 **목록·상세·마이가 Desktop-first** — P0 최우선. 다만 지원서 스텝은 거의 준비됨(입력 16px만).

### 2.2 운영진 (P1) — 모집 생성 → 공지 → 지원자 관리 → 면접
- **구조적 차단:** `ManageShell` 사이드바 248px 고정이 모든 manage 화면 본문을 112px로 압축 → **드로어 전환이 선결 과제**.
- **지원자 관리 테이블:** 9열 가로스크롤 강제 → 회장이 모바일로 합/불을 처리하는 빈도가 높으므로 **카드 변환 1순위 후보**.
- **폼:** `grid-cols-2` 무폴백(모집기간·면접기간) + 14px 입력 + 작은 터치타겟.
- **총평:** 사이드바(드로어) → 테이블(카드) → 폼(단일컬럼+16px) 순. 2~3주 규모.

### 2.3 관리자 (P2) — 승인 → 재인증 → 공지
- 사이드바는 이미 `hidden md:block` 으로 숨겨져 깨지진 않으나 **모바일 진입로(햄버거) 부재**.
- 테이블 11개 중 10개 가로스크롤 OK, **2개(Clubs·GlobalEvent) 래핑만 추가**하면 P2 목표 충족.
- 폼 다단·워터마크·14px 입력은 공통 규칙으로 일괄.
- **총평:** 데이터 콘솔 특성상 **가로 스크롤 허용**이 현실적. 풀 카드 변환은 비용 대비 가치 낮음.

---

## 3. 모바일 UX 원칙 → `DESIGN.md` `## Mobile` 로 이관(확정)

§3 원칙(Breakpoints · Touch Target · Safe Area · Navigation · Dialog↔Sheet · Table↔Card · Form)은 **SoT 인 `DESIGN.md` 의 `## Mobile` 섹션으로 확정·이관**했다. 규칙 본문은 거기서 단일 관리한다(중복 방지). 확정된 두 판단:

- **Navigation(하이브리드):** 공개 콘텐츠 = **하단 탭바**(홈·탐색·캘린더·공지 — 4개 모두 공개 라우트) · 개인영역(`/me`) = **상단 우측 유저메뉴**(하단 탭 미포함) · 도구형 콘솔(운영·관리) = **Sheet 드로어**. `/apply` 포커스 플로우에선 하단바 숨김. 하단바용 thin-stroke 두잉 아이콘 4종 추가 필요.
- **Table↔Card:** 관리자 콘솔 = **가로 스크롤**(P2), 운영진 `ApplicantTable` = **카드 변환**(P1).

→ 규칙은 `DESIGN.md` `## Mobile`, 화면별 적용·로드맵은 본 문서 §4·§5.

---

## 4. 화면별 적용 전략

| 영역 | 전략 요지 |
|------|----------|
| **홈 `/`** | 공개 비주얼 정체성 유지(**리디자인 금지**) — 히어로 `text-[84px]`는 **`text-[40px] sm:text-[56px] md:text-[84px]`** 식 단계화(clamp 가능), 콜라주는 모바일에서 **세로 스택 또는 rotate 축소/숨김**, 배너 워터마크 `text-[220px]`는 모바일 축소(`text-[88px]`). FadeIn 등장 모션은 유지. |
| **탐색 `/clubs`** | 검색 `w-[360px]`→`w-full`, 카드 `grid-cols-4`→`grid-cols-1 sm:grid-cols-2 md:grid-cols-4`(favorites 모범 사례 차용). |
| **상세 `/clubs/[clubId]`** | 사진/스탯 `grid-cols-4`→`grid-cols-2 md:grid-cols-4`. 탭(이미 Radix Tabs)은 모바일 가로스크롤 탭리스트 검토. |
| **지원서 `/apply`** | 입력 16px만 적용하면 사실상 완료(단일 컬럼). |
| **마이 `/me`** | `SectionActivity`/`SectionSaved` `grid-cols-4`→단계화, `/me/applications` inline `1fr 200px`→모바일 단일 컬럼. |
| **공지 `/notices`** | inline `220px 1fr`·`width:280` → 모바일 단일 컬럼 + 검색 풀폭. |
| **운영 `/manage`** | `ManageShell` 사이드바→Sheet 드로어, ApplicantTable→카드, 폼 단일컬럼+16px, 터치타겟·BulkActionBar 세이프에어리어. |
| **관리 `/admin`** | 상단바 햄버거→Sheet 드로어, 누락 테이블 2개 래핑, 폼 단계화+16px+워터마크 모바일 숨김, **나머지 테이블 가로스크롤 허용**. |
| **인증 `/(auth)`** | 이미 Ready — 변경 불요. |

---

## 5. 구현 로드맵 (P0/P1/P2 · 규모 S/M/L · 후속 페이지 단위 1PR)

### P0 — 전역 기반 + 지원자 플로우 (모바일 진입 가능선)
| 항목 | 규모 | 영향 | 단위 |
|------|------|------|------|
| viewport 메타 + `viewport-fit=cover` + themeColor + `dvh` 전환 | **S** | 전역(세이프에어리어 전제) | 1 PR |
| 전역 컨테이너 `px-10`→`px-4 sm:px-6 md:px-10` | **S** | 전역 콘텐츠폭 | 1 PR |
| 공개 **하단 탭바**(홈·탐색·캘린더·공지) + thin-stroke 두잉 아이콘 4종 추가 + `/apply` 숨김·세이프에어리어·콘텐츠 하단 패딩 | **M** | 공개 모바일 네비(핵심) | 1 PR |
| 모바일 상단바 슬림화(브랜드 + 알림 벨 + 유저메뉴/로그인) — 공개 영역 | **S** | 상단 네비 | 1 PR |
| 입력 16px 하한(`text-[16px] md:text-[14px]`) — 공개/지원 영역 | **S~M** | iOS 줌 제거 | 영역별 PR |
| 무폴백 `grid-cols-4` 6곳 단계화 | **S~M** | 탐색·상세·마이 | 페이지별 PR |
| 홈 히어로 타입·콜라주·배너 워터마크 모바일 적응(리디자인 X) | **M** | 첫인상 | 1~2 PR |
| `/clubs` 탐색(검색 풀폭 + 카드 그리드) | **M** | 핵심 진입 | 1 PR |
| `/clubs/[clubId]` 상세(사진/스탯/탭) | **M** | 핵심 | 1 PR |
| `/me`·`/notices` 사이드바 단일컬럼화 | **M** | 지원 현황·공지 | 페이지별 PR |
| `/apply` 입력 16px | **S** | 지원서 | 1 PR |

### P1 — 운영진 플로우
| 항목 | 규모 | 영향 | 단위 |
|------|------|------|------|
| `ManageShell` 사이드바 → 모바일 상단바 + Sheet 드로어 | **M** | 모든 manage 화면 | 1 PR |
| ApplicantTable → 카드 변환(정보 우선순위) | **M~L** | 지원자 관리 | 1 PR |
| 운영 폼(`grid-cols-2`→`md:`, 16px 입력) | **S** | 모집/정보/면접 폼 | 영역별 PR |
| 터치타겟 확대(QuestionBuilder·MemberRow·RoundMemberTable) | **S** | 조작성 | 1 PR |
| BulkActionBar 세이프에어리어 + 버튼 wrap/축약 | **S** | 일괄처리 | 1 PR |

### P2 — 관리자 콘솔 (현실적 타협)
| 항목 | 규모 | 영향 | 단위 |
|------|------|------|------|
| 모바일 상단바 햄버거 + AdminSidebar Sheet 드로어 | **S** | 진입로 | 1 PR |
| 누락 테이블 2개(`AdminClubsTable`·`AdminGlobalEventTable`) `overflow-x-auto` 래핑 | **S** | 열람 | 1 PR |
| admin 폼 단계화 + 16px + 워터마크 모바일 숨김 | **S** | 폼 작성 | 영역별 PR |
| 나머지 9개 테이블 — **가로 스크롤 유지(현상)** | — | — | 작업 없음 |

### 교차 항목 — 성능 기반 (P0~P1 병행)
| 항목 | 규모 | 영향 | 단위 |
|------|------|------|------|
| 폰트 외부 CDN → `preconnect` + woff2(또는 `next/font` 셀프호스팅) | **S** | LCP·연결 비용 | 1 PR |
| raw `<img>` 치수/`aspect-ratio` + `loading="lazy"`, LCP 이미지 `priority` 확대 | **S~M** | CLS·전송량 | 영역별 PR |
| framer-motion `LazyMotion`+`domAnimation` 전환(사용처 증가 시) | **S** | 번들 | 1 PR |

> 각 P 항목은 **페이지(또는 독립 기능) 1개 = 1 PR** 원칙으로 쪼갠다. 전역 기반(P0 상단 2개)은 먼저 머지해 후속 페이지 PR이 토대를 공유하게 한다. **모든 모바일 PR 은 DESIGN.md `## Mobile` 의 Testing(실기기 매트릭스 320·390·768 + iOS/Android)·Performance 예산(LCP<2.5s·CLS<0.1·INP<200ms)을 머지 전 통과 기준으로 삼는다.**

---

## Out of Scope (재확인)
- **코드 변경 일절 없음** — 본 문서는 설계만.
- 새 디자인 시스템·새 토큰 제안 없음 — 두잉 토큰 **확장**만(브레이크포인트/세이프에어리어/터치타겟/모바일 타입 단계).
- Button/Card/Input의 shadcn 교체 제안 없음 — 동작 컴포넌트(Sheet/Drawer/Dialog/Popover)만 shadcn 두잉 셋업.
- 공개 화면 비주얼 리디자인 없음 — 반응형 적응만(외관 정체성 유지).
- 데스크탑 감사 finding(slate/neutral 색·섀도 `[위반]`) 재처리 없음 — 별도 트랙.

## 후속
본 명세 확정 후 로드맵 **P0 전역 기반부터** 페이지 단위 PR로 구현. shadcn 동작 컴포넌트는 Phase 1 두잉 셋업 → Phase 2 마이그레이션 규칙을 따른다. **PR 생성만, 자동 머지 금지.**
