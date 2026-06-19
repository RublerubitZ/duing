# `/introduce` 전면 리뉴얼 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/introduce` 홍보 페이지를 두잉 디자인 시스템(DESIGN.md) 토큰 위로 재구축하고, 실제 구현 기능을 정확히 반영하며, 애플식 스크롤 모션을 입힌다.

**Architecture:** `page.tsx`(서버 컴포넌트)가 섹션 컴포넌트를 조립한다. 정적 마케팅 콘텐츠라 서버 컴포넌트가 기본이고, 스크롤 모션이 필요한 부분만 `'use client'` 래퍼(`FadeIn` 재사용 + Stagger/Parallax 헬퍼)로 감싼다. 색·타이포·섀도·라운드는 전부 `.duing` 스코프 토큰과 `.btn`/`.pill`/`.card` 클래스를 쓴다.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind v3(두잉 토큰), framer-motion 12.

**검증 방식 주의:** 이 페이지는 정적 마케팅 JSX 라 단위 TDD 대상이 아니다(레포에 introduce 테스트 없음). 각 태스크 검증은 **typecheck + lint + build** 통과 + 필요 시 시각 확인으로 한다. 마지막에 dev 서버 시각 QA 를 둔다.

---

## File Structure

```
apps/web/app/introduce/
  page.tsx                       (재작성: .duing min-h-dvh bg-cream + 새 섹션 조립, HomeFooter 사용)
  _data.ts                       (신규: 토큰 기반 데모 데이터 — clubs/applicants/interview/fees)
  _components/
    motion/
      Stagger.tsx                (신규: 'use client' — 자식 요소 시차 등장 컨테이너/아이템)
      HeroParallax.tsx           (신규: 'use client' — useScroll/useTransform 살짝 확대/이동)
    mockups/
      ExploreMockup.tsx          (신규: 토큰 기반 탐색 목업)
      ApplyMockup.tsx            (신규: 토큰 기반 지원서 목업)
      InterviewMockup.tsx        (신규: 면접 자동배정 목업)
      FeesMockup.tsx             (신규: 회비·은행매칭 목업)
      AdminMockup.tsx            (신규: 지원자 테이블·펀넬 목업)
    sections/
      Hero.tsx                   (재작성)
      Problem.tsx                (재작성)
      Solution.tsx               (재작성: 6카드 그리드)
      Features.tsx               (재작성: 4 좌우교차 블록)
      Audiences.tsx              (재작성: 운영진/부원 2블록)
      Faq.tsx                    (재작성)
      Cta.tsx                    (재작성)
```

**삭제 대상(미사용 또는 대체):**
- `_components/sections/HowItWorks.tsx`, `Testimonials.tsx`, `Stats.tsx`
- `_components/PromoNav.tsx`, `_components/PromoFooter.tsx`, `_components/FeatureSection.tsx`
- `_mocks.ts` (→ `_data.ts` 로 대체)

**재사용:** `@/components/motion/FadeIn`, `@/components/duing/Sparkle`(`Sparkle`/`SparkleFull`), `@/components/duing/BrandMark`, `@/app/_components/HomeNav`, `@/app/_components/HomeFooter`, `@/app/_lib/route`(`toRoute`), `.duing` 토큰·`.btn`/`.pill`/`.card`/`.bg-grid`.

**토큰 매핑 치트시트(현 하드코딩 → 토큰):** 헤딩/강조 텍스트 `#143025`→`text-ink-deep`(h1~h4 자동) · 본문 `#4a5247`→`text-charcoal-2` · 메타 `#8a8f83`→`text-charcoal-3` · primary 버튼 `#3e5b34`→`.btn .btn-primary`(ink) · 캔버스 `#f3efe4`→`bg-cream` · 카드 `#ffffff`→`bg-paper` + `border-line` + `shadow-2` · 틴트 배경 `#e7ebd9`→`bg-sage-mist` · 보더 `#d9d4c3`→`border-line` · 다크 띠 `#2c4124`→`bg-ink-deep`. 아이브로우는 `font-mono text-[11.5px] font-semibold uppercase tracking-[0.22em] text-ink`.

---

## Task 1: 모션 헬퍼 (Stagger, HeroParallax)

**Files:**
- Create: `apps/web/app/introduce/_components/motion/Stagger.tsx`
- Create: `apps/web/app/introduce/_components/motion/HeroParallax.tsx`

- [ ] **Step 1: Stagger 컨테이너/아이템 작성**

```tsx
'use client';

import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';

const EASE = [0.2, 0.7, 0.2, 1] as const;

type StaggerProps = { children: ReactNode; className?: string; gap?: number };

/** 자식 <StaggerItem> 들을 스크롤 진입 시 gap(초) 간격으로 시차 등장시킨다. */
export function Stagger({ children, className, gap = 0.06 }: StaggerProps) {
  const shouldReduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView={shouldReduce ? undefined : 'show'}
      animate={shouldReduce ? 'show' : undefined}
      viewport={{ once: true, margin: '0px 0px -10% 0px' }}
      variants={{ show: { transition: { staggerChildren: gap } } }}
    >
      {children}
    </motion.div>
  );
}

type StaggerItemProps = { children: ReactNode; className?: string; y?: number };

export function StaggerItem({ children, className, y = 18 }: StaggerItemProps) {
  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y },
        show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
      }}
    >
      {children}
    </motion.div>
  );
}
```

- [ ] **Step 2: HeroParallax 작성** — 스크롤에 따라 비주얼을 살짝 확대/상향 이동(과하지 않게). reduced-motion 이면 정적.

```tsx
'use client';

import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { useRef } from 'react';
import type { ReactNode } from 'react';

type HeroParallaxProps = { children: ReactNode; className?: string };

export function HeroParallax({ children, className }: HeroParallaxProps) {
  const ref = useRef<HTMLDivElement>(null);
  const shouldReduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], [0, -40]);
  const scale = useTransform(scrollYProgress, [0, 1], [1, 1.04]);

  return (
    <div ref={ref} className={className}>
      <motion.div style={shouldReduce ? undefined : { y, scale }}>{children}</motion.div>
    </div>
  );
}
```

- [ ] **Step 3: 검증** — `pnpm --filter web typecheck` (또는 루트 typecheck). Expected: PASS.
- [ ] **Step 4: Commit** — `git commit -m "feat(frontend): introduce 스크롤 모션 헬퍼(Stagger·HeroParallax) 추가"`

---

## Task 2: 데모 데이터 (`_data.ts`)

**Files:**
- Create: `apps/web/app/introduce/_data.ts`

- [ ] **Step 1:** 기존 `_mocks.ts` 의 `promoClubs`/`promoApplicants` 를 옮기고, 색은 DESIGN.md 액센트 토큰값으로 정리한다. 면접/회비 목업용 데이터 타입을 추가한다(아래는 형태 예시 — 실제 구현 시 각 목업이 필요한 최소 필드만).

```ts
export type PromoClub = {
  id: string; name: string;
  cat: '학술' | '운동' | '음악' | '공연' | '봉사' | '문화' | 'IT' | '창업' | '친목';
  members: number; accent: string; avatar: string;
};

export const promoClubs: ReadonlyArray<PromoClub> = [
  { id: 'code', name: '두잉코드', cat: 'IT', members: 64, accent: '#1F4A36', avatar: '{ }' },
  { id: 'stat', name: 'STAT 통계학회', cat: '학술', members: 48, accent: '#2E6149', avatar: '📊' },
  { id: 'trem', name: '트레몰로', cat: '음악', members: 32, accent: '#B65672', avatar: '🎸' },
  { id: 'rebd', name: '리바운드', cat: '운동', members: 56, accent: '#E8B968', avatar: '🏀' },
  // … 기존 항목 유지/정리
];

export type PromoApplicant = { id: string; name: string; dept: string; status: '검토중' | '면접확정' | '합격' };
export const promoApplicants: ReadonlyArray<PromoApplicant> = [ /* 기존 값 유지 */ ];
```

- [ ] **Step 2: 검증** — typecheck PASS.
- [ ] **Step 3: Commit** — `git commit -m "feat(frontend): introduce 데모 데이터 _data.ts 정리"`

---

## Task 3: 목업 컴포넌트 5종

**Files:**
- Create: `_components/mockups/{ExploreMockup,ApplyMockup,InterviewMockup,FeesMockup,AdminMockup}.tsx`

모두 서버 컴포넌트(정적). 공통 카드 셸: `rounded-lg border border-line bg-paper p-4 shadow-2` (DESIGN.md Default Card). 내부 요소는 토큰 클래스만 사용(인라인 hex 금지, 액센트는 `var(--xxx)` 혹은 토큰 클래스).

- [ ] **Step 1: ExploreMockup** — 필터 칩(`.pill` / 활성 `.pill-solid`) + 동아리 2×2 카드(아바타·`.pill`·이름·`{n}명`). `promoClubs` 사용.
- [ ] **Step 2: ApplyMockup** — STEP 2/3 자기소개, 본문 + `animate-blink-cursor` 커서 + "자동 저장됨 · 방금 전" 라이브 도트(`bg-sage`), 하단 이전/다음(`.btn`).
- [ ] **Step 3: InterviewMockup** — 면접 라운드: 지원자 가능시간 그리드(슬롯 칩) → "자동 배정 완료" 상태 + 배정 결과 한 줄(이름·요일·시간). ink 강조 배지.
- [ ] **Step 4: FeesMockup** — 회비 청구 현황(납부/미납 카운트) + 은행 거래 자동매칭 행(입금자명 → 매칭된 부원, `.pill` 상태). 금액은 `{n}원` 표기.
- [ ] **Step 5: AdminMockup** — 지원자 테이블(이름·학과·상태 `.pill`) + 펀넬 미니 통계(지원→서류→면접→합격 막대). `promoApplicants` 사용.
- [ ] **Step 6: 검증** — typecheck + lint PASS.
- [ ] **Step 7: Commit** — `git commit -m "feat(frontend): introduce 기능 목업 5종(탐색·지원·면접·회비·운영) 추가"`

---

## Task 4: Hero 섹션

**Files:**
- Modify(전면 재작성): `_components/sections/Hero.tsx`

- [ ] **Step 1:** 좌측 텍스트 / 우측 콜라주 2컬럼(`grid gap-10 md:grid-cols-[1.05fr_0.95fr]`, 컨테이너 `max-w-layout mx-auto px-4 sm:px-6 md:px-10`). 배경 `bg-grid`. 아이브로우(`font-mono … text-ink` + 라이브 도트 `bg-sage animate-pulse-ring`) → h1(자동 GmarketSans, `text-[clamp(40px,6vw,68px)] leading-none`, "동아리 운영, 이제\n두잉으로." 형광펜 밑줄 `<em class="border-b-2 border-sage …">두잉</em>`) → 서브카피(`text-lg text-charcoal-2`) → CTA 2개(`.btn .btn-primary`(둘러보기, `/clubs`) + `.btn .btn-secondary`(동아리 등록, `/signup`)) → 메타(이메일 인증 안내, 학생증 문구 제거).
- [ ] **Step 2:** 우측은 `HeroParallax` 로 감싼 콜라주 카드 스택 — 절대배치 카드(모집/회비/공지/대시보드 미니 카드)에 인라인 `transform: rotate(±deg)`. `SparkleFull` 1~2개 장식.
- [ ] **Step 3:** Hero 는 above-the-fold 이므로 `FadeIn` 으로 감싸지 않는다(즉시 노출). 패럴랙스만 적용.
- [ ] **Step 4: 검증** — typecheck + lint PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(frontend): introduce Hero 토큰 재구축·패럴랙스 적용"`

---

## Task 5: Problem · Solution 섹션

**Files:**
- Modify(재작성): `_components/sections/Problem.tsx`, `_components/sections/Solution.tsx`

- [ ] **Step 1: Problem** — 아이브로우 `PROBLEM · 이런 적 있죠?` + h2. `Stagger`+`StaggerItem` 으로 3카드(카톡 공지/엑셀 회비·구글폼 지원서/흩어진 자료) 시차 등장. 카드 `.card p-6 shadow-1`, 아이콘 칩 `bg-sage-mist`. 마무리 한 줄 "그래서 두잉이 모았어요."
- [ ] **Step 2: Solution** — 아이브로우 `SOLUTION · 두잉이 해결합니다` + h2. 6카드 그리드(`grid gap-4 sm:grid-cols-2 md:grid-cols-3`), `Stagger`. 카드: 모집 관리 / 공지사항 / 회비 관리 / 멤버·권한 관리 / 알림 / 동아리 프로필 — 각 제목 + 1~2줄 설명(실제 기능만). 배경은 `bg-cream` 또는 `bg-paper` 섹션 리듬 교차.
- [ ] **Step 3: 검증** — typecheck + lint PASS.
- [ ] **Step 4: Commit** — `git commit -m "feat(frontend): introduce 문제 제기·해결책 섹션 재구축"`

---

## Task 6: Features 섹션 (4 좌우교차)

**Files:**
- Modify(재작성): `_components/sections/Features.tsx`

- [ ] **Step 1:** 섹션 헤더(아이브로우 `FEATURES · 주요 기능` + h2 + 리드). 4개 블록을 `FadeIn` 으로 각각 감싸고 `grid items-center gap-10 md:gap-16 md:grid-cols-2`, 홀짝 블록은 `md:[&>*:first-child]:order-2` 로 좌우 교차.
  - F01 탐색·지원 ↔ `ExploreMockup`
  - F02 면접 운영(가능시간 수합→자동 배정→확정) ↔ `InterviewMockup`
  - F03 회비(정책·청구·납부 + 은행 자동매칭·금전출납부) ↔ `FeesMockup`
  - F04 운영 대시보드·통계(지원자 일괄 처리·펀넬) ↔ `AdminMockup`
  각 블록 텍스트: `FEATURE 0N` 모노 라벨 + h3 + 설명 + 체크리스트(`✓` 칩 `bg-ink text-paper`). 실제 기능만 기술.
- [ ] **Step 2: 검증** — typecheck + lint PASS.
- [ ] **Step 3: Commit** — `git commit -m "feat(frontend): introduce 실제 기능 좌우교차 섹션 재구축"`

---

## Task 7: Audiences · Faq · Cta 섹션

**Files:**
- Modify(재작성): `_components/sections/Audiences.tsx`, `Faq.tsx`, `Cta.tsx`

- [ ] **Step 1: Audiences** — 아이브로우 + h2. 2컬럼(`grid gap-6 md:grid-cols-2`), `Stagger`. 운영진 카드(지원자 관리·공지·회비 발급·멤버/권한 + "운영에 쓰는 시간은 줄이고, 활동에 집중해요") / 부원 카드(캘린더·지원 현황·공지·회비 내역·알림). 각 항목 체크/도트 리스트.
- [ ] **Step 2: Faq** — 네이티브 `<details>` 유지(접근성), 토큰화(`.card`, `border-line`). 항목: 누구나 사용?(이메일 인증) / 대구대 전용? / 회비 기능 동작?(정책·청구·납부·은행 매칭) / 비용?(무료, 회비는 동아리별). **학생증 부정확 문구 제거.** 첫 항목 `open`.
- [ ] **Step 3: Cta** — `bg-ink-deep` 풀블리드 띠(페이지 유일 다크 브레이크). h2 "동아리 운영을 더 쉽고 체계적으로." + 서브(이메일 인증으로 가입). 버튼 `지금 시작하기`(`/signup`, 반전 `bg-paper text-ink`) + `동아리 둘러보기`(`/clubs`, 아웃라인). `SparkleFull` 장식.
- [ ] **Step 4: 검증** — typecheck + lint PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(frontend): introduce 대상별·FAQ·최종 CTA 섹션 재구축"`

---

## Task 8: page 조립 + 죽은 컴포넌트 정리

**Files:**
- Modify: `apps/web/app/introduce/page.tsx`
- Delete: `_components/sections/{HowItWorks,Testimonials,Stats}.tsx`, `_components/{PromoNav,PromoFooter,FeatureSection}.tsx`, `_mocks.ts`

- [ ] **Step 1: page.tsx 재작성**

```tsx
import type { Metadata } from 'next';
import { HomeNav } from '../_components/HomeNav';
import { HomeFooter } from '../_components/HomeFooter';
import { Hero } from './_components/sections/Hero';
import { Problem } from './_components/sections/Problem';
import { Solution } from './_components/sections/Solution';
import { Features } from './_components/sections/Features';
import { Audiences } from './_components/sections/Audiences';
import { Faq } from './_components/sections/Faq';
import { Cta } from './_components/sections/Cta';

export const metadata: Metadata = {
  title: '두잉 | 대구대학교 동아리 플랫폼',
  description:
    '대구대학교 동아리 운영의 새로운 기준. 모집·공지·회비·멤버 관리까지 두잉 하나로.',
};

export default function IntroducePage() {
  return (
    <div className="duing min-h-dvh bg-cream">
      <HomeNav slimOnMobile />
      <Hero />
      <Problem />
      <Solution />
      <Features />
      <Audiences />
      <Faq />
      <Cta />
      <HomeFooter />
    </div>
  );
}
```

- [ ] **Step 2:** 삭제 대상 파일 제거 + import 잔여 확인(`grep -rn "PromoFooter\|PromoNav\|FeatureSection\|_mocks\|Stats\|HowItWorks\|Testimonials" apps/web/app/introduce`).
- [ ] **Step 3: 검증** — `pnpm --filter web typecheck && pnpm --filter web lint && pnpm --filter web build`. Expected: PASS, dead import 0.
- [ ] **Step 4: Commit** — `git commit -m "feat(frontend): introduce 페이지 조립·미사용 컴포넌트 정리"`

---

## Task 9: 시각 QA + 검증 마무리

- [ ] **Step 1:** dev 서버 `:3000` 기동 → `/introduce` 데스크탑·모바일(320/390) 캡처 확인. 섹션 등장/stagger/패럴랙스 동작, 레이아웃 깨짐·가로 overflow 없음.
- [ ] **Step 2:** reduced-motion 에뮬레이트 → 콘텐츠 정상 노출(빈 화면 없음) 확인.
- [ ] **Step 3:** QA 종료 후 dev 서버 종료.
- [ ] **Step 4:** 최종 `typecheck + lint + build + test` 그린 확인.

---

## Self-Review

- **Spec coverage:** 9 섹션 요구 → Hero(T4)·Problem(T5)·Solution(T5)·실제기능 좌우교차(T6)·운영진/부원(T7 Audiences)·FAQ(T7)·최종CTA(T7) 모두 매핑. 숫자 섹션은 스펙대로 의도적 제외(Out of Scope). 모션 요구(FadeIn·Stagger·Parallax·reduced-motion)→T1+각 섹션. 다크모드 제외 준수.
- **Placeholder scan:** 코드 스텝은 실제 코드/패턴 제시. 목업 내부 마크업은 DESIGN.md 카드 어휘로 구현 시 확정(토큰 클래스 고정) — TBD 없음.
- **Type consistency:** `PromoClub.accent`(색 필드명) 일관, `promoClubs`/`promoApplicants` 명칭 T2↔T3 일치, `Stagger`/`StaggerItem`/`HeroParallax`/`FadeIn` 명칭 T1↔T4~T7 일치.
- **정리 누락 점검:** `PromoFooter`→`HomeFooter` 교체 반영(T8). `Stats`/`HowItWorks`/`Testimonials`/`PromoNav`/`FeatureSection`/`_mocks` 삭제 반영.
