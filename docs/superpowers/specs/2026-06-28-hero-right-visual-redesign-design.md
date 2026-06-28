# Hero 우측 비주얼 리디자인 — 일러스트 중심 + 활동 토스트(Phase A) 설계

- 날짜: 2026-06-28
- 범위: 1개 PR (프론트엔드 전용, 백엔드 무변경)
- 대상 화면: `/` 홈 Hero 우측 (`app/_components/sections/HomeHero.tsx`)
- 분해: 3-Phase 중 **Phase A** 만 다룬다 (아래 "배경 / 분해" 참조)

## 배경 / 분해

원 요청은 Hero 우측 목업 UI를 단순화해 **브랜드 일러스트 중심**으로 재구성하는 것. 진행 중 "최근 활동(Recent Activities) 토스트를 실데이터로" 요구가 추가됐는데, 이는 모집·공지·면접·행사·회비 **5개 도메인의 활동을 시간순으로 집계하는 신규 백엔드 기능**이다. 현재 백엔드엔 활동 피드 개념이 전혀 없고(=신규 구축), 홈의 `recruitingCount` 도 전용 API 가 아니라 `clubs.list({size:1})` 의 `totalElements` 파생값이다(`app/_lib/club-stats.ts`).

따라서 작업을 3단계로 분해한다. 본 스펙은 **Phase A** 만 구현 대상으로 한다.

| Phase | 내용 | 의존 |
|---|---|---|
| **A. FE 리디자인 (본 스펙)** | 우측 비주얼 재구성 + `HeroActivityToast`(variant) + 폴백 fill 로직 + 모집중 카드 null 처리 + `draggable=false` + 테스트. `recentActivities` 를 받는 seam 완성하되 이번 PR 은 **빈 입력 → 폴백 토스트 2개** | 없음 |
| B. Public Activity Feed API | 별도 브레인스토밍/스펙. 타입↔timestamp 매핑·집계 방식·공개 정책·엔드포인트 계약 | 없음(병행 가능) |
| C. FE 데이터 연동 | `HomeHero` 가 B 의 API 호출 → `HeroActivity[]` 매핑(Zod) → `const now = new Date()` 단일 생성 후 `resolveHeroToasts(activities, now)` 주입 | B 머지 후 |

핵심: 사용자가 정의한 **Fallback 정책**(실활동이 부족하면 그만큼 기본 토스트로 채움 → 항상 2개) 덕분에, 실데이터가 0개여도 Hero 는 완성된 모습이라 **Phase A 가 BE 없이 단독으로 완성·머지 가능**하다. Phase C 는 `resolveHeroToasts([], now)` 의 `[]` 자리에 실데이터를 꽂는 한 줄 교체로 끝난다.

## 목표

- 우측 목업 3카드(🎸 트레몰로 / `{ }` 두잉코드 / 📊 STAT)를 **모두 제거**한다.
- 실데이터 카드 **"이번 학기 모집중 N곳"** 는 유지하되, `absolute`+`rotate` 를 제거하고 **일반 flow 상단**에 둔다.
- `/public/duing-illustration.png` 를 `next/image` 로 우측 메인 비주얼화한다(`object-contain`, 비율 유지, drop-shadow 없음).
- 활동 토스트 2개를 좌하단·우중단에 `absolute` 로 배치한다(Phase A 는 폴백 카피).
- Apple/Notion/Linear 류의 여백 많은 미니멀 구성. "모집중 카드 1 + 일러스트 1 + 토스트 2" 이상은 추가하지 않는다.
- **Server Component 유지**, **CSS-only 애니메이션**, **기존 디자인 토큰만** 사용.

## 결정 사항

- **레이아웃은 추천안 1.** 모집중 카드(flow 상단) → 일러스트(중앙, 최대 시각 요소) → Toast1(좌하단) / Toast2(우중단).
- **Server Component 유지 → `framer-motion`(`FadeIn`) 사용 안 함.** `FadeIn` 은 코드 주석에 "above-the-fold 핵심 콘텐츠엔 쓰지 않는다" 고 명시돼 있고 `'use client'` 를 유발한다. 대신 `tailwindcss-animate`(`animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2` + `delay-*` + `motion-reduce:animate-none`)로 CSS 만으로 처리한다. 프로젝트 규칙(불필요한 `'use client'` 금지)과도 부합.
- **모집중 카드: 영역을 항상 예약**해 레이아웃을 고정한다. 숫자 분기:
  - `number`(0 포함) → `{n}곳`. **`0` 은 "정말 0곳" 일 때만** 나오는 정당한 값이라 그대로 표시.
  - `null`(조회 실패/값 없음) → **`—곳`**(중립 표기). `null` 을 `0곳` 으로 표기하지 않는다 — 0(데이터 있음, 0곳)과 null(데이터 없음)은 의미가 다르다. Server Component(`force-dynamic`)라 클라이언트 로딩 상태가 없어 Skeleton 은 부적합.
- **토스트는 정적이되 "실데이터 seam" 을 완성한다.** 순수 함수 `resolveHeroToasts(activities, now)` 가 실활동 최대 2개를 매핑하고 부족분을 폴백으로 채워 **항상 정확히 2개**를 반환한다. Phase A 는 `activities=[]` → 폴백 2개. (이 함수가 폴백 fill 테스트의 단위가 된다.)
- **`HeroActivityToast` props 는 `variant: 'light' | 'dark'` 중심.** 배경·글자색·도트색은 컴포넌트 내부에서 variant 로 결정한다(호출부는 색을 모른다).
- **상대 시간("3분 전")은 BE timestamp(ISO) → FE 포맷.** BE 가 문자열로 주지 않는다(캐시/staleness 로 시간이 틀어짐). 포맷터 `formatRelativeTime(iso, now)` 를 Phase A 에서 만들어 테스트해 두되, 실데이터가 없어 폴백은 `방금 전` 고정. `now` 를 인자로 주입해 테스트를 결정적으로 만든다(`Date.now()` 직접 호출 안 함).
- **일러스트 `draggable={false}`** — 정적 속성 한 줄. 최근 이미지 드래그 방지 정책(#559)과 일관. Hero 일러스트는 캐러셀/스와이프 영역이 아니므로 `dragstart` JS 차단까지는 불필요(`draggable=false` 로 충분).
- **CLS 0:** 우측 컨테이너에 고정 높이를 둬 영역을 예약하고, `next/image` 에 실치수(`width={1536} height={1024}`, 3:2)를 줘 종횡비 박스를 미리 확보한다. above-the-fold 메인 비주얼이라 `priority` + 명시적 `fetchPriority="high"` 로 우선 로드한다(`priority` 가 이미 `fetchpriority=high` 를 내보내지만 의도를 명시해 보강).
- **토스트 `absolute` offset 은 기준값(초기값).** 아래 `HeroRightVisual` 의 Toast 1/2 offset(`bottom-6`/`left-0`/`top-28`/`md:*` 등)은 모두 **초기 기준값**이며, 데스크탑·태블릿에서 일러스트의 캐릭터(얼굴/손)를 가리지 않는 **최종 위치는 실브라우저(:3000) 시각 QA 로 미세 조정**해 확정한다. jsdom 은 시각적 겹침을 잡지 못한다.

## Activity Type 매핑 (Phase A 에 정의, Phase B/C 가 준수)

| Activity Type | 표시 문구 | variant |
|---|---|---|
| `RECRUIT_OPEN` | 신규 모집 오픈 | light |
| `RECRUIT_CLOSE` | 모집 마감 | light |
| `NOTICE_CREATED` | 새 공지 등록 | light |
| `INTERVIEW_CREATED` | 면접 일정 등록 | dark |
| `INTERVIEW_RESULT` | 합격자 발표 | dark |
| `EVENT_CREATED` | 행사 등록 | light |
| `FEE_OPEN` | 회비 납부 시작 | dark |

폴백 토스트(실활동 부족분 채움, 슬롯 기준 — slot0=light, slot1=dark):

- **Fallback slot 0 (light):** 🟢 `캠퍼스 동아리` · `신규 모집 오픈` · `방금 전`
- **Fallback slot 1 (dark):** 🟡 `캠퍼스 동아리` · `합격자 발표` · `방금 전`

> 실제 동아리명이 아닌 일반 명칭("캠퍼스 동아리")을 써 초기 서비스에서도 어색하지 않게 한다.

## 컴포넌트 설계

### 1) 신규 — `app/_components/sections/hero-activity.ts` (순수 로직, `'use client'` 없음, DOM 미접근)

토스트 도메인 로직을 Server Component 와 분리해 단위 테스트 가능하게 둔다.

- **export 타입:**
  - `HeroActivityType` = 위 7개 리터럴 유니온.
  - `HeroActivity = { type: HeroActivityType; clubName: string; occurredAt: string /* ISO 8601 */ }` — Phase C 가 API 응답을 이 형태로 매핑한다. 필드명은 "생성 시각" 보다 **"이벤트 발생 시각"** 의미가 분명한 `occurredAt`.
  - `HeroToastVariant = 'light' | 'dark'`.
  - `HeroToast = { variant: HeroToastVariant; clubName: string; message: string; timeAgo: string }` — 프레젠테이션 모델.
- **상수(파일 내부):**
  - `ACTIVITY_PRESETS: Record<HeroActivityType, { message: string; variant: HeroToastVariant }>` — 위 매핑 표.
  - `FALLBACK_TOASTS: readonly HeroToast[]` — 위 폴백 2개(slot0 light, slot1 dark).
  - `MAX_TOASTS = 2`.
- **`formatRelativeTime(iso: string, now: Date): string`** — `방금 전`(<1분) / `N분 전`(<60분) / `N시간 전`(<24시간) / `N일 전`. 파싱 실패 시 `방금 전`.
- **`resolveHeroToasts(activities: HeroActivity[], now: Date): HeroToast[]`** — 슬롯 기준 채움. 슬롯 `i`(0,1)에 실활동 `activities[i]` 가 있으면 `ACTIVITY_PRESETS[type]` 로 매핑(+`formatRelativeTime(a.occurredAt, now)`), 없으면 `FALLBACK_TOASTS[i]`. **항상 길이 2**. `activities` 가 2개 초과면 앞 2개만 사용.

### 2) 수정 — `app/_components/sections/HomeHero.tsx` (Server Component 유지)

- 상단 import 추가: `Image from 'next/image'`, `{ cn } from '@/app/_lib/cn'`, `{ resolveHeroToasts, type HeroToast } from './hero-activity'`.
- `HomeHero` 본문: 기존대로 `const stats = await fetchClubStats();`. **Phase A 는 실활동을 조회하지 않는다** → `const now = new Date();` 를 **한 번만** 만든 뒤 `const toasts = resolveHeroToasts([], now);` (`now` 단일 생성으로 테스트·Phase C 연동과 일관. Phase C 가 `[]` 를 실데이터로 교체). 우측에 `<HeroRightVisual recruitingCount={stats?.recruitingCount ?? null} toasts={toasts} />` 렌더.
- 좌측 컬럼(배지·헤드라인·서브카피·검색폼·추천검색어)과 **모바일 통계 칩(`md:hidden`, 29~39행)은 무변경**.
- 기존 `HeroCardStack`(141~223행) **삭제**하고 아래 두 컴포넌트로 교체.

#### `HeroRightVisual`(동일 파일 내, 비-async 프레젠테이션 — 테스트 위해 `export`; 선언 위에 `// Test-only export` 주석 표기)

- props: `{ recruitingCount: number | null; toasts: HeroToast[] }`.
- 컨테이너: `relative hidden h-[540px] md:block lg:h-[560px]` (모바일 전체 숨김 + 높이 예약).
- **모집중 카드(flow 상단):** `border border-sage-soft bg-sage-mist rounded-md px-5 py-4` + 등장 `animate-in fade-in-0 slide-in-from-bottom-2 duration-500 delay-150 motion-reduce:animate-none`. 숫자 `font-display text-[36px] font-bold leading-none text-ink` → `{recruitingCount === null ? '—' : recruitingCount}` + `<span className="text-lg">곳</span>`. 라벨 `mt-1 text-[11.5px] text-ink/70`("이번 학기 모집중"). (기존 sage-mist 카드의 시각 정체성 유지, 회전·absolute 만 제거)
- **일러스트:** `<Image src="/duing-illustration.png" alt="두잉 — 캠퍼스 동아리 활동 일러스트레이션" width={1536} height={1024} priority fetchPriority="high" draggable={false} className="mx-auto mt-4 h-auto w-full max-w-[480px] object-contain md:max-w-[400px] lg:max-w-[480px] animate-in fade-in-0 zoom-in-95 duration-700 motion-reduce:animate-none" />`. (drop-shadow 없음. 태블릿 `max-w-[400px]` 로 ~15% 축소.)
- **Toast 1(좌하단):** 래퍼 `absolute bottom-6 left-0 md:bottom-4 md:left-2 animate-in fade-in-0 slide-in-from-bottom-2 duration-500 delay-300 motion-reduce:animate-none` 안에 `<HeroActivityToast {...toasts[0]} />`.
- **Toast 2(우중단):** 래퍼 `absolute right-0 top-28 md:right-2 md:top-20 animate-in fade-in-0 slide-in-from-bottom-2 duration-500 delay-500 motion-reduce:animate-none` 안에 `<HeroActivityToast {...toasts[1]} />`.
- 등장 순서(딜레이): 일러스트(0) → 모집중 카드(150) → Toast1(300) → Toast2(500), 각 150~200ms 시차. 딜레이는 전부 `tailwindcss-animate` 명명값(150/300/500)만 써 임의값 매핑 이슈를 피한다.

#### `HeroActivityToast`(동일 파일 내, 프레젠테이션 — 테스트 위해 `export`; 선언 위에 `// Test-only export` 주석 표기)

- props: `HeroToast`(= `{ variant, clubName, message, timeAgo }`).
- `const isDark = variant === 'dark';`
- 카드: `cn('w-[230px] rounded-md px-4 py-3 shadow-3 transition duration-250 ease-duing hover:-translate-y-0.5 hover:shadow-4 motion-reduce:transition-none', isDark ? 'bg-ink-deep text-cream' : 'border border-line bg-paper text-ink')`.
- 상단 줄: 도트 `<span aria-hidden className={cn('h-2 w-2 shrink-0 rounded-full', isDark ? 'bg-warm' : 'bg-sage')} />` + 동아리명 `text-[13px] font-bold`(dark: `text-cream` / light: `text-ink`) + 시간 `ml-auto text-[11px]`(dark: `text-cream/60` / light: `text-charcoal-3`).
- 하단 줄: 문구 `mt-1 text-[12.5px]`(dark: `text-cream/85` / light: `text-charcoal-2`).
- 도트 색은 variant 종속(light=🟢 `bg-sage`, dark=🟡 `bg-warm`#E8B968). **새 토큰 없음.**

## 사용 토큰 (전부 기존)

- 색: `ink`/`ink-deep`/`ink/70`, `sage`/`sage-soft`/`sage-mist`, `warm`(#E8B968), `cream`/`cream/60`/`cream/85`, `paper`, `line`, `charcoal-2`/`charcoal-3`.
- 그림자: `shadow-3`(기본), `shadow-4`(hover — tailwind.config 의 "플로팅 패널용").
- radius: `rounded-md`(14px). typography: `font-display`. 모션: `duration-250`/`ease-duing` + `tailwindcss-animate` 유틸.

## 변경 지점

- **신규** `apps/web/app/_components/sections/hero-activity.ts` — 타입·매핑·폴백·`resolveHeroToasts`·`formatRelativeTime`.
- **수정** `apps/web/app/_components/sections/HomeHero.tsx` — `HeroCardStack` 제거, `HeroRightVisual`/`HeroActivityToast` 추가, `next/image`·`cn` import, 우측 렌더 교체. 좌측 컬럼/모바일 칩 무변경.
- **신규** `apps/web/public/duing-illustration.png` — 이미 작업트리에 존재(추적 추가만).
- `app/page.tsx` 등 그 외 파일 무변경.

## 테스트

신규 `apps/web/test/home/home-hero.test.tsx` (+ 필요 시 `hero-activity` 순수 로직은 동일 파일 또는 `test/home/hero-activity.test.ts` 로 분리). `next/image`·`next/link` 는 기존 `test/home/categories-render.test.tsx` 의 mock 패턴을 그대로 따른다 — `vi.mock('next/image', () => ({ default: ({ alt }) => <img alt={alt} /> }))`. (`HomeHero` 자체는 async Server Component 이므로 렌더 테스트는 동기 프레젠테이션 컴포넌트 `HeroRightVisual` 을 직접 렌더한다.)

- **폴백 fill 로직(`resolveHeroToasts`, `now` 고정):**
  - 실활동 2개 → 실제 토스트 2개(문구·variant·`timeAgo` 가 매핑대로). 예: `RECRUIT_OPEN`(light, "신규 모집 오픈") + `INTERVIEW_RESULT`(dark, "합격자 발표").
  - 실활동 1개 → 실제 1개 + 폴백 1개(slot1 dark "캠퍼스 동아리/합격자 발표/방금 전"). 길이 2.
  - 실활동 0개 → 폴백 2개(slot0 light + slot1 dark). 길이 2.
  - `formatRelativeTime`: 30초 전→`방금 전`, 3분 전→`3분 전`, 2시간 전→`2시간 전`, 파싱 실패→`방금 전`.
- **렌더(`HeroRightVisual`):**
  - 목업 카피 **부재**: `트레몰로`·`두잉코드`·`면접 확정!` 텍스트가 없다.
  - 일러스트 존재: `alt="두잉 — 캠퍼스 동아리 활동 일러스트레이션"` 이미지 렌더.
  - `recruitingCount=5` → `5곳` / `=0` → `0곳` / `=null` → `—곳`.
  - 폴백 주입(`resolveHeroToasts([], now)`) 시 토스트 2개의 동아리명("캠퍼스 동아리")·문구가 렌더.
- **`HeroActivityToast`:** `variant='dark'` 면 `bg-ink-deep`, `variant='light'` 면 `bg-paper` 클래스를 갖는다(도트/배경이 variant 로 갈리는지).

## 리뷰 강도

FE 표현 계층 단독 변경(권한·상태전이·동시성·자동배정·데이터무결성·Migration·API contract 해당 없음) → 기본 리뷰(`duing-code-reviewer` + `codex:review`)로 충분. adversarial-review 불요.

## Out of Scope

- **Phase B**: Public Activity Feed API(백엔드 활동 집계·엔드포인트). 본 PR 무관.
- **Phase C**: `HomeHero` 의 실활동 조회/주입, 상대시간의 실 timestamp 연동(포맷터는 만들되 실데이터는 안 먹임).
- 좌측 컬럼(배지·헤드라인·서브카피·검색폼·추천검색어)과 **모바일 통계 칩**(`md:hidden`).
- 새 디자인 토큰(색/그림자/radius) 생성.
- 일러스트 이미지 자체 편집·포맷 변환(WebP 등)·R2 업로드.
- 일러스트 드래그의 JS 레벨 차단(`dragstart preventDefault`) — `draggable=false` 정적 속성만(캐러셀 아님).
- 다른 홈 섹션(Banner/Ticker/Categories/FeaturedClubs/LeaderCta) 및 소개 페이지(`/introduce`)의 `Hero`.
