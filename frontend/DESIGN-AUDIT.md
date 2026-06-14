# DESIGN.md Compliance Audit — Du-ing Frontend

> 작성일: 2026-06-14 · 대상: `frontend/apps/web` (`app/**`, `components/**`)
> 방법: `DESIGN.md`(366줄) = 단일 진실원(SoT). 인벤토리 + grep 전수 신호 스캔 → 7차원 병렬 정독(8 에이전트·225 tool 호출) → 적대적 거짓양성/중복 검증. **코드 수정 없음(조사 전용).**

---

## Executive Summary

### 검사 인벤토리 (준수율 분모)
- 라우트 `page.tsx` **62개**, 클라이언트 `_pages` **31개**, `app/**` 전체 `.tsx` **332개**, `components/**` **8개**
- 검증 깊이: grep 전수 신호 + 대표 파일 약 50+개 정독 (admin/manage/me/clubs/introduce/auth 표면 교차)

### 준수율 (분모 명시)
- **`.duing` 스코프 래퍼: 21 / 62 라우트 보유 (≈34%)** — 41개 라우트가 페이지 루트 래퍼 누락 (단, "미보유=전부 깨짐"은 과장 → 아래 보정 참조)
- **감사 카테고리: 10 / 10 검사, 위반 0건 카테고리 = 0개** → 모든 카테고리에서 ≥1건 발견, 활성 finding **46건**
- 정량 신호: 오프토큰 회색 text **433** · 표준 상태색 **242** · `bg-white` 101·`text-white` 92 · 뉴트럴 `shadow-xl` 모달 **23파일** · bare `rounded`(4px) **49** · `rounded-2xl` 15 · 임의 `shadow-[]` 9

### 카테고리별 finding 카운트

| 항목 | 영역 | P0 | P1 | P2 | 계 |
|---|---|---|---|---|---|
| 1 | 디자인 토큰·색상 | 2 | 6 | 3 | 11 |
| 2 | 타이포그래피 | – | 4 | 1 | 5 |
| 3 | 버튼 시스템 | 1 | 1 | – | 2 |
| 4 | 폼 컴포넌트 | – | 2 | – | 2 |
| 5 | 카드·레이아웃 | – | – | 1 | 1 |
| 6 | 카피라이팅 | – | 3 | 1 | 4 |
| 7 | 접근성 | – | – | 2 | 2 |
| 8 | 중복 구현 | – | 2 | 2 | 4 |
| 9 | 두잉 고유 규칙·스코프 | – | 8 | 4 | 12 |
| 10 | shadcn 정합성 | – | 1 | 2 | 3 |
| **계** | | **3** | **27** | **16** | **46** |

- **P0 = 3 / P1 = 27 / P2 = 16**
- **`[미정의]`(DESIGN.md 공백) = 6건** (P1 1 + P2 5) — 별도 집계, 코드 잘못 아님
- 제외: **거짓양성 1**(`403` 페이지 — `.btn`이 `.duing` 의존이란 전제가 틀림), **중복 8**

### 핵심 진단 — "두 개의 디자인 세계"
공개/마케팅 표면(`app/page.tsx`, `_components/sections/*`, `introduce`, `clubs`, `notices`, `me` 대부분)은 `.duing` 토큰·잉크틴트 `shadow-1~3`·형태 어휘를 **견고히 준수**한다. 무너진 곳은 정확히 **운영자/관리자 콘솔** — `app/admin`(25 라우트)·`app/manage/clubs/[clubId]`(13 라우트)·`apply`·`notifications`·`me/favorites`·`auth` — 이들이 Tailwind 표준 `slate/rose/emerald/amber` + `shadow-xl` 뉴트럴 섀도로 **평행 디자인 언어**를 형성했다. 그 정점이 `manage/.../info` 폼군의 사설 hex 팔레트(`border-[#cfcab8]`/`text-[#2a2f27]`/`focus-[#4a6b3f]`)다.

> **⚠️ 검증자 정직 보정 (심각도 근거):** "`.duing` 부재 → 모든 토큰/CSS변수/바디색 비활성"이라는 1차 전제는 **과장**이다. `bg-ink`·`text-charcoal`·`border-line`은 `tailwind.config`의 **고정 hex 유틸리티**라 스코프와 무관하게 작동한다. 실제 스코프 의존은 ① `var(--xxx)` 인라인 스타일, ② `.duing h1~h4` 자동 GmarketSans 헤딩 **둘뿐**. 그래서 스코프 래퍼 항목은 "line 9/236 **절차** 위반"은 맞지만 실손실은 자동헤딩·인라인 `var()` 한정 → **P0가 아닌 P1**이 정합하다.

---

## P0 — 핵심 규칙 위반 (DESIGN "Don't" line 244~251 직접 위반)

### P0-1 · BulkActionBar 임의 뉴트럴 섀도 `[위반]`
- **문제:** 고정 하단 액션 바가 순수 뉴트럴 `rgba(0,0,0,0.08)` 기반 **임의 `shadow-[]` + 뉴트럴 그레이 섀도** 이중 위반. 추가로 `border-slate-200` 오프토큰 보더.
- **위치:** `app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/_components/BulkActionBar.tsx:31`
- **근거:** `className="fixed inset-x-0 bottom-0 ... border-t border-slate-200 bg-white shadow-[0_-4px_12px_-4px_rgba(0,0,0,0.08)]"`
- **관련 규칙:** line 245(`임의 shadow-[...] 금지·테두리는 항상 1px border-line`), line 95(`뉴트럴 그레이 섀도 금지`)
- **영향도:** 높음 (Don't 직접 위반) · **수정 난이도:** 낮음
- **분류 태그:** `[위반]`

### P0-2 · 제출 버튼 섀도 + transform (3중 위반) `[위반]`
- **문제:** 제출 버튼이 (a) 섀도 보유(버튼=섀도 없음 위반), (b) 임의 `shadow-[]`에 `rgba(0,0,0,0.04)` 뉴트럴 혼입, (c) `active:translate-y-px` transform — 세 규칙 동시 위반. `ClubInfoForm` 저장 버튼도 인라인 `boxShadow` + 오프토큰 그린(`#3e5b34`) + `active:translate-y-px`로 동일 반복.
- **위치:** `app/apply/[recruitmentId]/_components/ApplyForm.tsx:146`, `app/manage/clubs/[clubId]/info/_components/ClubInfoForm.tsx:518`
- **근거:** `... bg-ink ... shadow-[0_1px_0_rgba(0,0,0,0.04),_0_6px_16px_rgba(31,74,54,0.20)] ... active:translate-y-px` / `... bg-[#3e5b34] ... hover:bg-[#4a6b3f] active:translate-y-px` + `style={{ boxShadow: '0 1px 0 rgba(0,0,0,.04), 0 6px 16px rgba(62,91,52,.18)' }}`
- **관련 규칙:** line 247(`버튼 transform hover·그림자 변화 금지`), line 268(`버튼: 섀도 없음`), line 115
- **영향도:** 높음 (핵심 전환 액션) · **수정 난이도:** 낮음
- **분류 태그:** `[위반]`

### P0-3 · 일반 버튼 `hover:-translate` `[위반]`
- **문제:** 마이페이지 "더 많은 알림 보기"·"설정 이동하기" 버튼이 `hover:-translate-y-px`로 들림. 버튼 hover는 색상 전환만. `SectionSettingsSummary`는 `var(--sage)` 배경까지 써서 **장식 전용 sage를 프라이머리 액션 면적에 사용**하는 2차 문제 동반.
- **위치:** `app/me/_components/SectionSettingsSummary.tsx:43`, `app/me/_components/SectionNotify.tsx:178`
- **근거:** `transition-[transform,background] ... hover:-translate-y-px" style={{ background: 'var(--sage)' }}`
- **관련 규칙:** line 247, line 115, line 246(sage 텍스트/면적 승격 금지)
- **영향도:** 중간 · **수정 난이도:** 낮음
- **분류 태그:** `[위반]`

---

## P1 — 일관성 문제 (27건)

### ① 스코프 래퍼 누락 — 절차 위반 (cat 9, 5건)
근본 원인. 한 줄 수정으로 다수 라우트 동시 복구 가능. 실손실은 자동 헤딩·인라인 `var()` 한정(위 보정).

| ID | 위치(근거) | 영향 라우트 | 규칙 | 난이도 |
|---|---|---|---|---|
| `admin-layout-no-duing` | `app/admin/layout.tsx:7` 〈`bg-cream min-h-screen` — duing 없음〉 | **admin 25개** | line 9·236 | 낮음(한 줄) |
| `manageshell-no-duing` | `app/manage/_components/ManageShell.tsx:20` 〈`flex min-h-screen` — duing 없음〉 | **manage 13개** | line 9·236 | 낮음(한 줄) |
| `applyform-root-no-duing` | `app/apply/[recruitmentId]/_components/ApplyForm.tsx:70` | 지원서 전체 | line 9·236 | 중간 |
| `me-favorites-no-duing` | `app/me/favorites/page.tsx:18` 〈`max-w-3xl px-6` + `bg-slate-900` 버튼〉 | 찜 목록 | line 9·236·250 | 낮음 |
| `notifications-no-duing` | `app/notifications/page.tsx:56` 〈`bg-slate-900/100` 전면〉 | 알림센터 | line 9·236·250 | 중간 |

모두 `[위반]`. → ManageShell·admin/layout 루트에 `duing` 한 단어 추가가 최고 비용효율.

### ② 색상 토큰 이탈 (cat 1, 6건)

- **`slate-grays-replace-tokens` `[위반]` (occ 433):** admin/manage가 `charcoal/line/graysoft` 대신 `text-slate-900/700/600/500`·`border-slate-200/300`·`bg-slate-50/100`. 한 컴포넌트 내 토큰+slate 혼용. 위치: `app/admin/clubs/_components/AdminClubsTable.tsx:34,56`. 규칙: line 27~31·285. 난이도: 중간.
- **`status-colors-bypass-pill-pairs` `[위반]` (occ 242):** 상태 배지/위험·성공 버튼이 액센트 4색 pill 페어 대신 `rose/emerald/amber/purple` 직접 사용. `app/admin/clubs/_lib/clubStatus.ts:11` 〈`PENDING: bg-amber-100 ... ACTIVE: bg-emerald-100 ... INACTIVE: bg-slate-200`〉, `AdminClubsTable.tsx:113` 〈`danger → border-rose-200`〉. **`coral` 위험 토큰이 정의돼 있는데도 `rose`로 대체.** 규칙: line 33·37·240·127~130. 난이도: 중간.
- **`raw-hex-shadow-palette` `[위반]` (occ 110):** info/apply 폼이 `border-[#cfcab8]`(≈line)·`text-[#2a2f27]`(≈charcoal)·`focus:border-[#4a6b3f]`(ink 아닌 별도 녹색)로 팔레트를 픽셀 모사. 위치: `ClubInfoForm.tsx:42,55`. 규칙: line 30·24·27·95. 난이도: 중간.
- **`modal-shadow-xl-neutral` `[위반]` (occ 23):** 전 모달·다이얼로그가 뉴트럴 `shadow-xl`(잉크틴트 `shadow-2/3` 대신). 위치: `AdminClubDeleteDialog.tsx:37`, `ClubEventFormModal.tsx:76`. 규칙: line 95·237·245. 난이도: 낮음.
- **`standard-neutral-shadow-scattered` `[위반]` (occ 11):** 드롭다운/콤보박스 `shadow-lg/sm/md`. `LeaderSearchCombobox.tsx:69`, `NotificationBell.tsx:69`. 드롭다운은 `shadow-3`이어야(line 160). 난이도: 낮음.
- **`authcard-neutral-shadow-ring` `[위반]`:** `app/(auth)/_components/AuthCard.tsx:10` 〈`shadow-sm ring-1 ring-slate-200`〉. 규칙: line 237·245. 난이도: 낮음.

### ③ 타이포그래피 (cat 2, 4건)
- **`mono-korean-no-wide-tracking` `[위반]` (occ 6):** JetBrains Mono를 **한글 본문**에 + 와이드 트래킹 미달(`tracking-wide`=0.025em). `ApplyForm.tsx:86,90`. 규칙: line 61(`+0.12~0.22em 필수`)·62(`영문 대문자로만`). 난이도: 낮음.
- **`brandmark-in-mono-not-display` `[위반]` (occ 3):** "Du·ing" 마크를 `.brand-mark`(GmarketSans) 아닌 `font-mono` + 음수 트래킹으로 구현. `PromoNav.tsx:31`, `PromoFooter.tsx:17`, `ManageShell.tsx:24`. 규칙: line 41·61. 난이도: 낮음.
- **`heading-forced-font-body` `[위반]` (occ 8):** `.duing` 스코프 안 h2/h3에 `font-body` 강제 → 자동 GmarketSans 헤딩 강등. `me/_components/SectionHeader.tsx:16`, `SectionNotify.tsx:136`. 규칙: line 47·55. 난이도: 중간.
- **`display-number-in-mono` `[위반]`:** 38px 스탯 숫자를 `font-mono`로(타 스탯은 `font-display`). `introduce/_components/sections/Stats.tsx:27`. 규칙: line 41·44·60. 난이도: 낮음.

### ④ 버튼·폼 (cat 3·4, 3건)
- **`card-transform-hover-me` `[위반]` (occ 6):** me의 일반 카드(Lift Card 아님)가 일괄 `hover:-translate-y-0.5 hover:shadow-2`. 표준 카드 hover=섀도만(line 134), translate는 카테고리 타일만(line 140). `SectionMyClubs.tsx:53`, `SectionApply.tsx:108`. 난이도: 중간.
- **`input-self-shadow` `[위반]` (occ 5):** 인풋/textarea가 자체 섀도(line 125 위반). `ApplyAnswersStep.tsx:44`, `SnsLinksRepeater.tsx:13` 〈`focus:shadow-[0_0_0_3px_rgba(74,107,63,.15)]`〉. 난이도: 중간.
- **`input-style-divergence` `[위반]` (occ 3):** 동일 인풋이 토큰형/hex형/`slate-300`형 3방언. signup 한 플로우 내 혼재(`SignupStepAccount.tsx:33`). 난이도: 높음.

### ⑤ 중복 구현 (cat 8, 2건)
- **`btn-no-component-reuse` `[위반]` (occ 163):** manage+admin `<button>` **165개 중 `.btn` 사용 2개**, 나머지는 인라인 재구현(`px-4 py-2` vs `px-5 py-2.5`, `rounded-md` vs `rounded-full`, `hover:opacity-90`=비-DESIGN hover). `AdminRecertificationRoundsListPage.tsx:46`, `NoticeForm.tsx:211`. 규칙: line 242·112~115. 난이도: 높음.
- **`info-parallel-palette-inputs` `[위반]` (occ 8):** info 7개 컴포넌트 + ApplyAnswersStep가 사설 hex 팔레트를 모듈 상수로 복붙(공유 Input 부재). `FaqsRepeater.tsx:6`, `ClubInfoForm.tsx:42`. 난이도: 중간.

### ⑥ 카피라이팅 (cat 6, 3건)
- **`emoji-in-copy-labels` `[위반]` (occ 7):** pill/badge 텍스트에 이모지 직접 삽입(그래픽 레이어 아님). `ClubDetailHero.tsx:68` 〈`pill pill-solid >🏛️ 중앙동아리`〉, `ClubCard.tsx:139`. 규칙: line 225·249·271~273. 난이도: 낮음.
- **`suggestive-form-plus-bang-body` `[위반]`:** 본문에 권유형+느낌표. `SectionNotify.tsx:139` 〈`...확인해보세요!`〉. 규칙: line 214·225·218. 난이도: 낮음.
- **`marketing-body-imperative-haseyo` `[위반]` (occ 5):** introduce 서브카피 권유형 종결(`~확인하세요/지원하세요`). `Hero.tsx:61`, `Audiences.tsx:40`. 규칙: line 214·218. 난이도: 낮음.

### ⑦ sage·형태·shadcn (cat 9·10, 4건)
- **`sage-promoted-to-text` `[위반]` (occ 6, 심각도조정):** sage를 eyebrow 라벨/대형 숫자 텍스트로 승격. `MyPageHeader.tsx:45`, `SettingsPage.tsx:241`, `HowItWorks.tsx:24`(56px). 규칙: line 20·246·29. **조정:** 4건 중 3건이 다크 배경 위 가독성 보정(예외 인접) → 라이트 배경 승격만 명백. 난이도: 낮음.
- **`rounded-2xl-offvocab` `[위반]` (occ 15):** 16px이 어휘(8/14/20/28) 밖. `ClubNoticeFormModal.tsx:81`, `NoticeCard.tsx:17`. 규칙: line 84~93·238. 난이도: 낮음.
- **`border-2-thick` `[위반]` (occ 2):** `AdminPromotionForm.tsx:433`(선택타일), `SectionNotify.tsx:39`(배지). 규칙: line 245. 난이도: 낮음.
- **`shadcn-stone-scaffold-debt` `[미정의]` (occ 3):** stone HSL 토큰 12종(`--background` 흰색, `--radius` 0.5rem=8px, `--border` stone-90%)이 두잉 토큰과 의미 충돌하는 값으로 공존(실사용 0%). `components.json:9`, `globals.css:42`. SoT 공백. 난이도: 중간. → Design Debt 참조.

---

## P2 — 개선 권장 (16건)

| ID | 태그 | 위치(대표) | 요지 | 규칙 |
|---|---|---|---|---|
| `bg-white-text-white-vs-paper` | 위반 | `AdminClubsTable.tsx:32` | `bg-white`(101)/`text-white`(92)가 `paper` 토큰 우회(시각 동일). 어두운 배경 반전 text-white는 정상 | line 26·258 |
| `bare-rounded-4px-offvocab` | 위반 | `ApplicantsFilterBar.tsx:26` | bare `rounded`(4px) **49건** off-vocab → `rounded-sm/md` | line 84~93 |
| `rounded-8px-arbitrary-notation` | 위반 | `ManageNav.tsx:32` | `rounded-[8px]` 20건(=sm 값이나 임의표기) → `rounded-sm` | line 91·356 |
| `border-1-5px-arbitrary` | 위반 | `ClubExplorePage.tsx:196` | `border-[1.5px]` 3건(+`rounded-[12px]/[5px]`) | line 245 |
| `container-formula-deviation` | 위반 | `AdminNoticeNewPage.tsx:16` | `max-w-layout px-10` 이탈 **40곳**(`max-w-[760px] px-6` 등) | line 105 |
| `categories-chip-neutral-shadow` | 위반 | `Categories.tsx:80` | 인덱스 칩 `rgba(0,0,0,.06)` 뉴트럴(본체 Lift는 정상) | line 95 |
| `mono-korean-column-titles` | 위반 | `PromoFooter.tsx:34` | h4 컬럼 제목 한글 mono(트래킹은 충족) | line 62·47 |
| `manage-redirect-transient-no-duing` | 위반 | `manage/page.tsx:45` | 리다이렉트 찰나 div만 duing 누락(형제는 보유) | line 9·236 |
| `config-darkmode-vs-light-fixed` | 위반 | `tailwind.config.ts:6` | `darkMode:['class']` vs 라이트 고정(런타임 영향 0) | line 4·251 |
| `cn-doc-off-token-example` | 위반 | `app/_lib/cn.ts:13` | 53파일 import하는 유틸 JSDoc 예시가 `bg-slate-900`(오프토큰 확산 진입점) | line 17·26·250 |
| `manageshell-border-black` | 위반 | `ManageShell.tsx:21` | `border-black/20` 다크 사이드바 구분선(토큰 외) | line 245 |
| `modal-overlay-scrim-undefined` | **미정의** | `RecertificationRequestModal.tsx:42` | 모달 스크림 `bg-black/40·/50`(22건) 색 토큰 미규정 → 불투명도 제각각 | (공백) |
| `section-empty-renders-cta-box` | **미정의** | `SectionApply.tsx:72` | 대시보드 슬롯 빈상태 정책(return null vs CTA 박스) 미규정 | line 230·231 |
| `design-no-shadcn-mention` | **미정의** | `DESIGN.md:8` | shadcn 위상(stone vs 두잉, `--radius` 충돌) 규정 부재 | line 8·306 |
| `focus-visible-absent` | **미정의** | `TagsInput.tsx:69` | `focus-visible` **0파일**, `outline-none` 36파일 → 키보드 포커스 전략 부재(WCAG 2.4.7) | (공백) |
| `focus-ring-color-fragmentation` | **미정의** | `Step2RoundForm.tsx:144` | focus 링 색 `ink` vs `slate-400` vs `sky-500` vs `rose-400` 파편화 | line 239·250 |

---

## Design Debt

### 1. 중복·평행 시스템 (공통화 대상)
- **버튼:** manage+admin `<button>` 165개가 `.btn` 미사용(2개만 사용) → **`.btn` 계열 강제 또는 공유 `<Button>` 도입**이 163건을 한 번에 정규화.
- **인풋:** `info/*` 폼군이 사설 hex 팔레트를 모듈 상수로 복붙 → **공유 `<Input>`/필드 클래스 부재**가 확산 원인. 공통화 시 raw-hex(110)·self-shadow(5)·`slate-300` 방언 동시 해소.
- **상태 배지:** `clubStatus.ts`의 `amber/emerald/rose` 하드코딩 → `.pill` 페어(`pill-warm/coral/sky` + sage 도트)로 단일화.

### 2. shadcn ↔ 두잉 토큰 통합 전략 (cat 10 집약)
- **현실:** shadcn은 **실사용 0%** (cva 0파일·`@radix-ui` 0·`components/ui` 없음). `components.json`(stone/new-york) + `globals.css :root` stone HSL 12종 + `tailwind.config` 시맨틱 키 + `darkMode:['class']`가 **스캐폴딩만** 존재. (※ 직전 셋업 작업 산출물)
- **함정:** 누구든 `npx shadcn add` 하면 stone 배경·**8px 단일 radius**(두잉 4값 어휘와 불일치)·뉴트럴 섀도 컴포넌트가 유입. `--radius`(0.5rem)는 두잉 카드 20px와 정면 충돌.
- **SoT 공백:** DESIGN.md가 shadcn을 일절 규정 안 함 + `darkMode` 모순이 동일 출처. `cn.ts` JSDoc의 `bg-slate-900` 예시가 오프토큰 문화의 교육적 진입점.
- **권장(택1):** ⓐ 스캐폴딩 제거(미사용이므로 안전) **또는** ⓑ DESIGN.md에 "두잉 토큰이 우선, shadcn 추가 시 stone→두잉 override 의무" 명문화.

### 3. 접근성 (DESIGN.md 보완 대상, 전부 `[미정의]`)
`focus-visible` 0파일 + 포커스 색 4분기 + 모달 스크림 색 미정의. DESIGN에 **`focus-visible:ring-ink` 토큰 유틸 + 오버레이 스크림 레벨**을 신설 권장.

---

## 최종 분류

### 1. 출시 전 수정 권장 (P0 + 고비용효율 P1)
- **P0 3건** (line 245·247 Don't 직접 위반): BulkActionBar 임의 섀도 / 제출버튼 섀도+transform / 버튼 hover-translate
- **스코프 래퍼 2줄 수정**: `ManageShell`·`admin/layout`에 `duing` 추가 → 38개 라우트 절차 동시 복구 (단, 자동 헤딩 시각 변화 동반 → QA)
- → 별도 문서: **`DESIGN-PRELAUNCH-FIXES.md`**

### 2. 출시 후 수정 가능 (나머지 P1 + 일부 P2)
- 색상 토큰 이탈(slate 433·status 242·raw-hex 110) — 영향 크나 광범위 리팩토링이라 단계적
- `shadow-xl` 모달 23개 → `shadow-2/3` 일괄 치환 / 버튼·인풋 공통화 / 타이포 4건 / 카피 3건
- 형태 어휘(`rounded-2xl`·bare `rounded`·`rounded-[8px]`) 정규화 / 컨테이너 공식 통일

### 3. 무시 가능 / DESIGN.md 보완으로 해소 (`[미정의]` 6건 + 무해 P2)
- 접근성(focus-visible/스크림)·빈상태 정책·shadcn 위상 → 코드 잘못 아님, SoT 보완 사항
- `config-darkmode`(런타임 영향 0)·`bg-white`(시각 동일)·`manage-redirect`(찰나) 등 무해 항목

---

## 부록 — 검증 방법 재현

```bash
# 인벤토리
find app -name "page.tsx" | wc -l        # 62
find app -path "*/_pages/*" -name "*.tsx" | wc -l   # 31

# 신호 스캔 (zsh: 변수 word-split 안 됨 → 리터럴 경로 필수)
rg -n 'text-(gray|slate|zinc|neutral|stone)-[0-9]' app components | wc -l   # 433
rg -n '(text|bg|border)-(red|green|blue|yellow|amber|emerald|rose|...)-[0-9]' app components | wc -l  # 242
rg -oN 'shadow-[a-z0-9\[]+' app components | sort | uniq -c | sort -rn       # shadow 분포
rg -l 'cva|class-variance-authority' app components | wc -l                  # 0 (shadcn 실사용 0%)
```
