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
| `apps/web/app/manage/_components/ClubSelector.tsx` | `ClubSwitcher.tsx`로 rename + 내부를 DropdownMenu 기반으로 재구현 |
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
- **레이아웃**: 좌측 도킹 카드 — 왼쪽은 화면에 붙이고(`ml-0`) 상하·우측 여백(`my-3 mr-3`) +
  오른쪽 라운딩(`rounded-r-xl`) + `shadow-4`로 플로팅 느낌 유지. 높이는 `calc(100dvh-1.5rem)` 고정.
  (플로팅 카드 → 풀블리드 → 좌측 도킹으로 사용자 피드백 반영하며 수렴.)
- **폭**: 펼침 **280px** / 접힘 **84px**. `motion-safe:transition-[width] duration-200`.
  (264 → 280 확대: 한글 클럽명 가용폭 ~171px 확보, 가독성 우선.)
  두 값은 `ManageShell` 상단의 단일 상수(예: `SIDEBAR_WIDTH = { expanded: 280, collapsed: 84 }`)로
  정의하고 aside가 이 상수만 참조한다 — 디자인 변경 시 수정 지점 1곳.
  사용처가 한 파일뿐이므로 CSS Variable 승격은 하지 않는다(필요해지면 그때).
- **nav 아이템**: `rounded-md`(14px), 세로 padding 10px, 13.5px, lucide 아이콘 19px.
  - 활성: `bg-white/10` + 흰 글자 + 아이콘 `text-sage` + 왼쪽 sage 액센트 바(5×26px, 카드 안쪽 모서리에 밀착).
  - 비활성: `text-white/60`, hover `bg-white/5 text-white`. 모두 `transition-colors 200ms`.
- **그룹 라벨**: 10.5px uppercase `text-white/35`, 접힘 시 라벨 대신 `white/10` 구분선.
- **구분선·보더**: `white/10`, 버튼류 보더 `white/15`.

## 클럽 전환 헤더 + 드롭다운 (ClubSwitcher)

`ClubSelector.tsx`를 **rename**한 컴포넌트다. 역할(운영 동아리 전환)·위치·ManageShell 연결부는
그대로 유지하고, 표현만 네이티브 select → shadcn DropdownMenu로 교체한다. 이름을 바꾸는 이유:
"Selector"(폼 컨트롤)에서 아바타·역할·모집 상태를 보여주는 "Switcher"(내비게이션 전환 허브)로
의미가 달라졌기 때문. 최소 diff 원칙과 충돌하지 않는다 — 새 파일 신설이 아니라 제자리 교체다.

- **트리거 버튼**: 아바타(40px, `rounded-[13px]`) + 클럽명 + 2줄 메타 + chevron.
  - 아바타: `logoUrl` 있으면 로고 이미지, 없으면 클럽명 첫 글자 (ink 그라데이션 배경).
  - 1줄: 클럽명 — `min-w-0` + truncate. 긴 이름도 배지·chevron을 밀지 않는다.
  - 2줄: 역할 배지(sage 배경 · ink-deep 글자, 회장/운영진 = `myRole` LEADER/OFFICER) +
    **모집 상태 칩(항상 표시)**: `activeRecruitmentCount > 0` → "모집중" / 아니면 "모집종료".
    - 모집중: `bg-sage/20 text-sage-soft` (다크 표면 위 sage 계열 토큰)
    - 모집종료: `bg-white/10 text-white/50` (중립 알파 토큰)
    - 공용 Badge 컴포넌트가 레포에 없으므로 팔레트 토큰 조합으로 정의한다. 드롭다운 서브라인의
      모집 상태 텍스트도 같은 색 규칙(sage-soft / white/50)을 따른다.
  - chevron은 드롭다운 열림 시 180° 회전(`transition-transform 200ms`).
- **드롭다운**: shadcn `DropdownMenu` 재사용. 다크 표면(`#2A382F`, 보더 `white/10`).
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
- **접근성 원칙**: `title`은 접힘 상태의 마우스 보조 수단일 뿐, 접근성 정보의 기준은
  `aria-label`(아이콘 전용 버튼·링크) 또는 sr-only 텍스트다. 접힘 여부와 무관하게 유지한다.
  - 토글: `aria-label` + `aria-pressed` (admin과 동일), 드롭다운 트리거: `aria-expanded`.
  - 모든 인터랙티브 요소는 네이티브 `<a>`/`<button>`으로 키보드 포커스 가능,
    `focus-visible` ring 스타일 제공(다크 표면에서는 sage ring).
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
- 아이콘 이름은 스펙 고정이 아니다 — 구현 중 동일한 의미를 더 잘 전달하는 lucide 아이콘이
  있으면 변경 가능(의미가 달라지는 교체만 금지).

## 성능 원칙

사이드바는 모든 관리 페이지에 공통 렌더되므로:

- **불필요한 re-render 방지**: hover 스타일은 state가 아닌 CSS(`hover:` 클래스)로 처리 —
  마우스 이동이 렌더를 유발하지 않는다. pathname 변경 시 재렌더 범위는 현행과 동일(ManageNav).
- **접힘 시 layout shift 최소화**: width 전환은 aside 자체의 `transition-[width]`만 사용,
  본문은 flex가 흡수. 텍스트는 접힘 시 언마운트(목업 방식)로 중간 찌그러짐 없음.
- **드롭다운 지연 렌더**: DropdownMenuContent는 Radix 기본 동작대로 열릴 때만 마운트
  (`forceMount` 사용 금지).
- **신규 네트워크 비용 없음**: `useMeQuery`·`useManagedClubsQuery` 등 기존 캐시 쿼리만 사용,
  사이드바 전용 API 호출을 추가하지 않는다.

## 테스트·QA

- `manage-nav.test.tsx` 기존 케이스 전부 무수정 통과.
- 신규: ClubSwitcher — 목록 렌더(역할·모집 상태 서브라인), 현재 클럽 ✓, 선택 시 라우팅·`onNavigate` 호출.
- 신규: 접기 토글 — localStorage 반영, 접힘 시 title 툴팁 존재.
- 시각 QA: `:3000` 실브라우저(펼침/접힘/드롭다운/모바일 드로어), 종료 시 dev 서버 정리.
- **QA 엣지 케이스 체크리스트**:
  - 매우 긴 클럽명(truncate, 배지·chevron 안 밀림) / 매우 긴 사용자 이름(푸터 truncate)
  - `logoUrl` 없음(첫 글자 폴백)
  - 운영 동아리 1개 / 여러 개(드롭다운 동작 동일)
  - 모집중 / 모집종료 칩 각각
  - 모바일 Sheet(드롭다운 선택 시 드로어 닫힘 포함)
  - 접힘 상태(툴팁·아이콘 정렬) + 새로고침 후 localStorage 접힘 유지

## 완료 조건 (Definition of Done)

- 최신 디자인 목업과 시각적으로 일치(그라데이션·플로팅 카드·간격·활성 스타일)
- 기존 `manage-nav.test.tsx` 전부 무수정 통과
- 신규 ClubSwitcher·접기 테스트 통과
- 접힘 상태가 새로고침 후에도 유지
- 모바일 Sheet와 데스크탑 펼침의 정보 구조 동일
- 접근성 유지: 링크/버튼 role·name 불변, 아이콘 전용 요소에 aria-label, 키보드 포커스 가능
- 신규 접근성 경고(콘솔·테스트) 0건
- lint / typecheck / build / test CI 통과

## Out of Scope

- 메뉴 배지 카운트(지원자 수 등 집계 배선)
- "동아리 추가" 플로우, 활동 피드·공지·일정 신규 메뉴
- 본문 레이아웃(MgrLayout)·대시보드 랜딩 개편
- admin 콘솔 사이드바 변경
- 기수·카테고리 등 ManagedClub에 없는 메타 표시
- localStorage 키 namespace 개편(`duing:ui:*`)
- "예약 모집" 등 세분화된 모집 상태(데이터 없음)
