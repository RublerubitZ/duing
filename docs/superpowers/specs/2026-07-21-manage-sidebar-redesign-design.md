# 운영진 콘솔 사이드바 리디자인 — 설계

2026-07-21 · 대상: `/manage` 동아리 운영진 콘솔 사이드바

## 배경·목표

운영진 콘솔 사이드바를 새 디자인 목업(다크 그린 그라데이션 + 플로팅 카드형) 기준으로 교체한다.
총동연 콘솔(`/admin`, 라이트 플로팅 카드)과 시각적으로 구분되면서, 접기·localStorage 유지 같은
검증된 admin 패턴은 재사용한다. 기존 컴포넌트를 제자리에서 리스타일하는 최소 diff 접근.

## 범위 (파일)

| 파일 | 작업 |
|---|---|
| `apps/web/app/manage/_components/ManageShell.tsx` | 플로팅 카드·그라데이션·접기·헤더/푸터 재구성 |
| `apps/web/app/manage/_components/ManageNav.tsx` | 데이터 배열 + NavItem 통합, lucide 아이콘, 새 그룹 |
| `apps/web/app/manage/_components/ClubSelector.tsx` | 삭제 → `ClubSwitcher.tsx`(드롭다운)로 대체 |
| `apps/web/test/manage/manage-nav.test.tsx` | 기존 케이스 그대로 통과 (구조 불변 목표) |
| `apps/web/test/manage/` 신규 | ClubSwitcher·접기 테스트 추가 |

## 레이아웃 구조 (위→아래)

1. **상단 행** — BrandMark 로고(홈 `/` 링크, `light` 변형) + 접기 토글 버튼.
   로고와 아래 클럽 전환 블록은 **별도 행으로 클릭 영역 분리** — 각각 독립 hover 상태.
2. **클럽 전환 헤더** (펼침 시에만) — 클릭하면 드롭다운이 열리는 버튼 블록.
3. **내비게이션** — 그룹핑된 메뉴, 독립 스크롤 영역.
4. **푸터** — 프로필(이름) + 로그아웃.

## 시각 스펙

- **표면**: `linear-gradient(180deg, #34463E 0%, #2A382F 100%)` — aside·모바일 Sheet 공유 상수.
  모바일 상단바는 단색 `#34463E`.
- **카드**: `m-3 rounded-xl`(28px 토큰) + `shadow-4`, sticky·`max-h-dvh` 독립 스크롤(admin과 동일).
- **폭**: 펼침 **280px** / 접힘 **84px**. `motion-safe:transition-[width] duration-200`.
  (264 → 280 확대: 한글 클럽명 가용폭 ~171px 확보, 가독성 우선.)
- **nav 아이템**: `rounded-md`(14px), 세로 padding 10px, 13.5px, lucide 아이콘 19px.
  - 활성: `bg-white/10` + 흰 글자 + 아이콘 `text-sage` + 왼쪽 sage 액센트 바(5×26px, 카드 안쪽 모서리에 밀착).
  - 비활성: `text-white/60`, hover `bg-white/5 text-white`. 모두 `transition-colors 200ms`.
- **그룹 라벨**: 10.5px uppercase `text-white/35`, 접힘 시 라벨 대신 `white/10` 구분선.
- **구분선·보더**: `white/10`, 버튼류 보더 `white/15`.

## 클럽 전환 헤더 + 드롭다운 (ClubSwitcher)

- **트리거 버튼**: 아바타(40px, `rounded-[13px]`) + 클럽명 + 2줄 메타 + chevron.
  - 아바타: `logoUrl` 있으면 로고 이미지, 없으면 클럽명 첫 글자 (ink 그라데이션 배경).
  - 1줄: 클럽명 — `min-w-0` + truncate. 긴 이름도 배지·chevron을 밀지 않는다.
  - 2줄: 역할 배지(sage 배경 · ink-deep 글자, 회장/운영진 = `myRole` LEADER/OFFICER) +
    **모집 상태 칩(항상 표시)**: `activeRecruitmentCount > 0` → "모집중"(sage 톤) / 아니면 "모집종료"(무채색 톤).
  - chevron은 드롭다운 열림 시 180° 회전(`transition-transform 200ms`).
- **드롭다운**: shadcn `DropdownMenu` 재사용. 다크 표면(`#2A382F`, 보더 `white/12`).
  - 항목 구성(운영 동아리 수만큼): 아바타(30px) + 클럽명(truncate) + 서브라인 **"역할 · 모집중/모집종료"**.
  - **현재 클럽에 ✓ 체크(lucide `Check`, sage)** 표시.
  - 선택 시 `router.push(/manage/clubs/{clubId})`. 모바일 드로어에서는 선택 후 드로어도 닫는다 —
    Radix 드롭다운은 포털로 Sheet 밖에 렌더되므로 기존 anchor-click 감지로는 안 닫힘.
    `ClubSwitcher`가 `onNavigate?` 콜백을 받아 ManageShell 모바일 경로에서 `setDrawerOpen(false)` 전달.
- 운영 동아리가 1개여도 동일 구조(드롭다운에 1개) — 분기 없이 단순하게.

## 접힘 상태

- 로고(축소) + 토글 + 아이콘 nav + 로그아웃 아이콘만. **클럽 전환 헤더는 숨김**(목업 기준).
- **툴팁 일관 제공**: 로고("두잉 홈으로"), 토글("사이드바 펼치기"), nav 아이템(메뉴명),
  로그아웃("로그아웃") — 전부 `title` 속성.
- 지원자·통계 비활성 안내문("모집을 먼저 선택하세요")은 접힘 시 title로 대체.
- 접힘 상태는 `localStorage['duing:manage:sidebar-collapsed']` 유지 — admin과 동일한
  하이드레이션 안전 패턴(첫 페인트 펼침, 마운트 후 반영). 키 namespace 개편은 하지 않는다.
- 모바일 Sheet 드로어에는 접힘 없음 — 항상 펼침 구성 + 그라데이션 배경.

## 푸터

- 펼침: 이름 첫 글자 아바타(32px) + 이름(`useMeQuery`) + 로그아웃 아이콘 버튼.
  역할·학과는 표시하지 않는다(역할은 헤더 배지가 담당, 중복 제거).
- 접힘: 로그아웃 아이콘 버튼만(툴팁) — 접힘 상태에서도 로그아웃 가능해야 하므로 아바타 대신 유지.
- 로그아웃: admin `SidebarActions` 패턴 — `useLogout` + 실패 토스트 + 진행중 비활성.
- `useMeQuery` 로딩/실패 시 이름 영역 생략, 로그아웃 버튼만 (fail-soft).

## 내비게이션 구성

데이터 배열 + 단일 NavItem 컴포넌트로 통합(현재 9회 반복 마크업 제거). 그룹:

| 그룹 | 항목 (lucide) |
|---|---|
| (없음) | 대시보드 `LayoutDashboard` |
| 모집 | 모집 관리 `ClipboardList` · 지원자 `Users` · 통계 `BarChart3` |
| 운영 | 멤버 관리 `UsersRound` · 회비 관리 `Wallet` · 시설 예약 `CalendarCheck` · 활동사진 `Image` |
| 설정 | 동아리 정보 `Info` |

- 지원자·통계의 "모집 컨텍스트 조건부 활성" 로직(활성 판정 포함)은 현행 그대로 유지.
- 접근성 구조(링크 role/name, 비활성 안내 텍스트) 불변 — 기존 테스트가 그대로 통과해야 한다.

## 테스트·QA

- `manage-nav.test.tsx` 기존 케이스 전부 무수정 통과.
- 신규: ClubSwitcher — 목록 렌더(역할·모집 상태 서브라인), 현재 클럽 ✓, 선택 시 라우팅·`onNavigate` 호출.
- 신규: 접기 토글 — localStorage 반영, 접힘 시 title 툴팁 존재.
- 시각 QA: `:3000` 실브라우저(펼침/접힘/드롭다운/모바일 드로어), 종료 시 dev 서버 정리.

## Out of Scope

- 메뉴 배지 카운트(지원자 수 등 집계 배선)
- "동아리 추가" 플로우, 활동 피드·공지·일정 신규 메뉴
- 본문 레이아웃(MgrLayout)·대시보드 랜딩 개편
- admin 콘솔 사이드바 변경
- 기수·카테고리 등 ManagedClub에 없는 메타 표시
- localStorage 키 namespace 개편(`duing:ui:*`)
- "예약 모집" 등 세분화된 모집 상태(데이터 없음)
