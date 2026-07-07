# 총동연 FAQ 프론트 (P1-PR4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** FAQ 공개 페이지(/faq, 딥링크 포함) + 홈 "자주 묻는 질문" 섹션 + admin FAQ 관리(/admin/faqs) + Pagination·Accordion 공용 승격 + sitemap/metadata. 스펙 `docs/superpowers/specs/2026-07-04-federation-qna-design.md` §2·§3·§6의 P1-PR4 범위. 백엔드 API는 PR1·PR2(#572·#573)로 develop에 존재.

**Architecture:** notice 도메인 프론트가 완전한 레퍼런스 — types(`notice.ts` 5분할 컨벤션) → `client.ts` 2곳(타입 선언+구현) → hooks(`noticeQueryKeys`+`notices.ts`) → 공개 페이지(NoticePage의 draft/확정 검색·칩/사이드바) → admin CRUD(`admin/notices`의 page↔_pages↔_components↔_lib). UI는 기존 introduce `Accordion`(접근성·reduced-motion 완비)을 승격 재사용.

**주의(전 태스크 공통):**
- 커밋 Conventional Commits 한국어(`feat(web): ...`) — AGENTS.md의 `[#이슈]` 형식은 무시(사용자 지정 규칙 우선). AI 서명·push·PR 금지.
- pnpm 명령은 `frontend/`에서. 검증: `pnpm lint && pnpm typecheck && pnpm build && pnpm test`(CI와 동일 4종).
- 코드 규칙: `type`만(interface 금지), `any`/`as` 금지, 컴포넌트 `function` 키워드, 서버 상태는 React Query만, HTTP는 `@duing/api`만, 조건부 className은 `cn()`, 최상위 래퍼 `duing` 클래스.
- **PR5 의존 링크**: 홈 섹션·/faq의 "1:1 문의하기" CTA는 `/me/inquiries/new`(PR5에서 생성)로 연결 — PR4 시점엔 404지만 릴리스 게이트(P1 전부 머지 후 main 반영)로 보호됨. PR 본문에 명시.

---

## File Structure

```
packages/types/src/federationFaq.ts                     [생성] + index.ts 재export 1줄
packages/api/src/client.ts                              [수정] 타입 선언+구현 각 2곳(공개/admin)
packages/hooks/src/federationFaqQueryKeys.ts            [생성]
packages/hooks/src/federationFaqs.ts                    [생성] + index.ts export
apps/web/components/Pagination.tsx                      [이동] notices/_components에서 승격(9개 admin import 갱신)
apps/web/components/Accordion.tsx                       [이동] introduce/_components에서 승격(introduce Faq import 갱신)
apps/web/app/faq/page.tsx                               [생성] metadata + 얇은 wrapper
apps/web/app/faq/_pages/FaqPage.tsx                     [생성] 'use client'
apps/web/app/faq/_components/FaqDeepLinkCard.tsx        [생성]
apps/web/app/sitemap.ts                                 [수정] /faq 1줄
apps/web/app/_lib/home-data.ts                          [수정] fetchFederationFaqHighlights
apps/web/app/_components/sections/HomeQnaSection.tsx    [생성] 서버
apps/web/app/_components/sections/HomeFaqAccordion.tsx  [생성] 'use client'
apps/web/app/page.tsx                                   [수정] 섹션 1줄 삽입
apps/web/app/admin/_lib/adminSections.ts                [수정] 항목 1개
apps/web/app/admin/faqs/{page.tsx, new/page.tsx, [faqId]/edit/page.tsx}   [생성]
apps/web/app/admin/faqs/_pages/{AdminFaqListPage, AdminFaqNewPage, AdminFaqEditPage}.tsx [생성]
apps/web/app/admin/faqs/_components/{FaqForm, FaqCategoryManager}.tsx     [생성]
apps/web/test/faq/faq-page.test.tsx                     [생성]
apps/web/test/admin/faqs/admin-faq-list.test.tsx        [생성]
apps/web/test/home/home-faq-accordion.test.tsx          [생성]
```

---

### Task 1: 브랜치 + 데이터 레이어 (types → client → hooks)

- [ ] **Step 1:** `git checkout develop && git pull origin develop && git checkout -b feat/federation-faq-web`

- [ ] **Step 2: `packages/types/src/federationFaq.ts`** (신규) + `index.ts`에 `export * from './federationFaq';` 추가

```ts
export type FederationFaqCategory = {
  id: number;
  name: string;
  sortOrder: number;
};

export type FederationFaqItem = {
  id: number;
  categoryId: number;
  categoryName: string | null;
  question: string;
  answer: string;
  pinned: boolean;
};

export type AdminFederationFaqSummary = {
  id: number;
  categoryId: number;
  categoryName: string | null;
  question: string;
  answer: string;
  pinned: boolean;
  published: boolean;
  sortOrder: number;
  viewCount: number;
  updatedAt: string;
};

export type CreateFederationFaqPayload = {
  categoryId: number;
  question: string;
  answer: string;
  pinned: boolean;
  published: boolean;
};

export type UpdateFederationFaqPayload = CreateFederationFaqPayload;

export type CreateFederationFaqCategoryPayload = { name: string };

export type UpdateFederationFaqCategoryPayload = { name: string; sortOrder: number };
```

- [ ] **Step 3: `packages/api/src/client.ts`** — 타입 선언(`DuingApiClient`)과 구현(`return {...}`) **양쪽**에 추가. 공개는 최상위 `notices` 옆, admin은 `admin.notices` 옆. (백엔드 계약: GET /federation/faqs?categoryId&keyword&page&size, GET /federation/faqs/{id}, GET /federation/faq-categories, admin은 /admin/federation/faqs CRUD + PUT /admin/federation/faqs/order {orderedIds} + /admin/federation/faq-categories POST·PATCH)

타입 선언:

```ts
  federationFaqs: {
    list(params: {
      categoryId?: number;
      keyword?: string;
      page: number;
      size: number;
    }): Promise<PageResponse<FederationFaqItem>>;
    detail(faqId: number): Promise<FederationFaqItem>;
  };
  federationFaqCategories: {
    list(): Promise<FederationFaqCategory[]>;
  };
```

admin 타입 선언(`admin: { ... }` 안):

```ts
    federationFaqs: {
      list(params: {
        published?: boolean;
        categoryId?: number;
        keyword?: string;
        page: number;
        size: number;
      }): Promise<PageResponse<AdminFederationFaqSummary>>;
      create(payload: CreateFederationFaqPayload): Promise<number>;
      update(faqId: number, payload: UpdateFederationFaqPayload): Promise<void>;
      remove(faqId: number): Promise<void>;
      reorder(orderedIds: number[]): Promise<void>;
    };
    federationFaqCategories: {
      create(payload: CreateFederationFaqCategoryPayload): Promise<number>;
      update(categoryId: number, payload: UpdateFederationFaqCategoryPayload): Promise<void>;
    };
```

구현:

```ts
    federationFaqs: {
      list: (params) =>
        jsonOk<PageResponse<FederationFaqItem>>(
          http.get('federation/faqs', { searchParams: cleanParams(params) }),
        ),
      detail: (faqId) => jsonOk<FederationFaqItem>(http.get(`federation/faqs/${faqId}`)),
    },
    federationFaqCategories: {
      list: () => jsonOk<FederationFaqCategory[]>(http.get('federation/faq-categories')),
    },
```

admin 구현:

```ts
      federationFaqs: {
        list: (params) =>
          jsonOk<PageResponse<AdminFederationFaqSummary>>(
            http.get('admin/federation/faqs', { searchParams: cleanParams(params) }),
          ),
        create: (payload) => jsonOk<number>(http.post('admin/federation/faqs', { json: payload })),
        update: (faqId, payload) =>
          jsonVoid(http.patch(`admin/federation/faqs/${faqId}`, { json: payload })),
        remove: (faqId) => jsonVoid(http.delete(`admin/federation/faqs/${faqId}`)),
        reorder: (orderedIds) =>
          jsonVoid(http.put('admin/federation/faqs/order', { json: { orderedIds } })),
      },
      federationFaqCategories: {
        create: (payload) =>
          jsonOk<number>(http.post('admin/federation/faq-categories', { json: payload })),
        update: (categoryId, payload) =>
          jsonVoid(http.patch(`admin/federation/faq-categories/${categoryId}`, { json: payload })),
      },
```

주의: `cleanParams`는 `published: false`를 **제거하지 않는지 확인** — 현재 구현이 `value === ''`/null/undefined만 걸러도 `false`는 `String(false)='false'`로 통과하는지 실제 코드를 읽고 검증하라(불리언이 걸러지면 params에서 문자열로 변환해 전달).

- [ ] **Step 4: `packages/hooks/src/federationFaqQueryKeys.ts`** (신규)

```ts
type ListFilters = { categoryId?: number; keyword?: string; page: number; size: number };
type AdminListFilters = {
  published?: boolean;
  categoryId?: number;
  keyword?: string;
  page: number;
  size: number;
};

export const federationFaqQueryKeys = {
  all: ['federation-faqs'] as const,
  list: (filters: ListFilters) => ['federation-faqs', 'list', filters] as const,
  detail: (faqId: number) => ['federation-faqs', 'detail', faqId] as const,
  categories: ['federation-faqs', 'categories'] as const,
  adminList: (filters: AdminListFilters) => ['federation-faqs', 'admin', 'list', filters] as const,
};
```

- [ ] **Step 5: `packages/hooks/src/federationFaqs.ts`** (신규) — notices.ts 패턴 그대로. 훅 목록(전부 `useApiClient()` + 위 키):
  - `useFederationFaqListQuery(params, enabled = true)` — staleTime 30_000
  - `useFederationFaqDetailQuery(faqId: number | null)` — `enabled: faqId !== null`, queryKey `detail(faqId ?? -1)`, queryFn 내 null 가드
  - `useFederationFaqCategoriesQuery()` — staleTime 300_000(카테고리는 저변동)
  - `useAdminFederationFaqListQuery(params)`
  - `useAdminFederationFaqCreateMutation()` / `useAdminFederationFaqUpdateMutation()`(`{faqId, payload}` 객체 인자) / `useAdminFederationFaqDeleteMutation()` / `useAdminFederationFaqReorderMutation()` — onSuccess 전부 `invalidateQueries({ queryKey: federationFaqQueryKeys.all })`
  - `useAdminFederationFaqCategoryCreateMutation()` / `useAdminFederationFaqCategoryUpdateMutation()` — 동일 invalidate
  
  `index.ts`에 훅 전부 + `federationFaqQueryKeys` named export 추가.

- [ ] **Step 6:** `cd frontend && pnpm typecheck && pnpm lint` → 통과
- [ ] **Step 7:** Commit — `feat(web): 총동연 FAQ 타입·API 클라이언트·훅 추가`

---

### Task 2: Pagination·Accordion 공용 승격

- [ ] **Step 1:** `apps/web/app/notices/_components/Pagination.tsx` → `apps/web/components/Pagination.tsx`로 **git mv**. `aria-label="공지 페이지"`를 prop으로 일반화: `ariaLabel?: string`(기본 `'페이지'`). admin 9개 페이지의 깊은 상대경로 import(`'../../../notices/_components/Pagination'` 등)를 전부 `'@/components/Pagination'`으로 갱신(grep으로 전수 확인, 누락 0).
- [ ] **Step 2:** `apps/web/app/introduce/_components/Accordion.tsx` → `apps/web/components/Accordion.tsx`로 git mv. `introduce/_components/sections/Faq.tsx`의 import 갱신. 시그니처(`AccordionItemData {question, answer}`, `Accordion({items})`)는 무변경.
- [ ] **Step 3:** `pnpm typecheck && pnpm test` → 기존 테스트 전부 통과(승격으로 인한 회귀 0 확인)
- [ ] **Step 4:** Commit — `refactor(web): Pagination·Accordion을 앱 공용 컴포넌트로 승격`

---

### Task 3: /faq 공개 페이지 + sitemap/metadata

- [ ] **Step 1: `app/faq/page.tsx`** (서버, 얇은 wrapper)

```tsx
import type { Metadata } from 'next';
import { FaqPage } from './_pages/FaqPage';

export const metadata: Metadata = {
  title: '자주 묻는 질문 | 두잉',
  description: '총동아리연합회에 자주 묻는 질문과 답변을 확인하세요.',
  alternates: { canonical: '/faq' },
};

export default function Page() {
  return <FaqPage />;
}
```

- [ ] **Step 2: `app/faq/_pages/FaqPage.tsx`** (`'use client'`) — 계약:
  - 골격: `<div className="duing min-h-dvh bg-cream">` + `<ExploreNav slimOnMobile />`(**active prop 전달 금지** — pathname 기반 전 링크 자연 비활성, 스펙 §3) + 본문 + `<HomeFooter />`
  - 헤더: h1 "자주 묻는 질문" + 서브카피 "총동아리연합회에 궁금한 점을 확인하세요"
  - 상태(NoticePage 패턴, 로컬 useState): `keywordInput`(draft)/`keyword`(확정, Enter·버튼으로 확정+page 0 리셋), `categoryId: number | 'ALL'`(칩 — 모바일 가로 스크롤, 데스크톱도 칩 유지로 단순화), `page`(PAGE_SIZE 20)
  - 데이터: `useFederationFaqCategoriesQuery()`(칩 목록), `useFederationFaqListQuery({categoryId: categoryId !== 'ALL' ? categoryId : undefined, keyword: keyword || undefined, page, size: 20})`
  - 목록: 승격된 `Accordion` 재사용이 기본이나 딥링크 항목 강조·카테고리 뱃지가 필요하므로 항목 렌더는 자체 `FaqAccordionList`(Accordion과 동일 접근성 구조 — `button + aria-expanded/aria-controls`) 또는 Accordion에 항목 커스텀이 가능하면 재사용. **어느 쪽이든 pinned 항목에 "고정" 뱃지(bg-ink text-paper), 카테고리명 캡션(text-charcoal-3) 표시**
  - **딥링크**: `useSearchParams()`로 `item` 파싱 → 숫자면 `useFederationFaqDetailQuery(itemId)` → 목록 **상단에** `FaqDeepLinkCard`(펼쳐진 카드, 닫기 버튼 → `router.replace(toRoute('/faq'), {scroll: false})`로 item 제거). 404/에러 시 카드 위치에 "해당 FAQ를 찾을 수 없어요" 인라인 안내. 필터·페이지 변경 핸들러에서도 item 제거
  - Empty: 검색 무결과 → "검색 결과가 없어요" + "원하는 답을 못 찾으셨나요? **1:1 문의하기**"(Link → `/me/inquiries/new`). 목록 하단에도 동일 CTA 상시 노출(coral 계열 주요 버튼)
  - Loading/Error: 기존 인라인 컨벤션("불러오는 중…" / "FAQ를 불러오지 못했습니다")
  - 페이지네이션: 승격된 `<Pagination page totalPages onChange={handlePageChange} ariaLabel="FAQ 페이지" />`
- [ ] **Step 3: `app/sitemap.ts`** — routes 배열에 `{ path: '/faq', changeFrequency: 'monthly', priority: 0.5 },` 추가 (/notices 아래)
- [ ] **Step 4:** `pnpm typecheck && pnpm lint` 통과. dev 서버 없이는 실화면 확인 불가 — Task 7 시각 QA에서 검증
- [ ] **Step 5:** Commit — `feat(web): 총동연 FAQ 공개 페이지(/faq) 추가`

---

### Task 4: 홈 "자주 묻는 질문" 섹션

- [ ] **Step 1: `app/_lib/home-data.ts`** — 기존 폴백 패턴 그대로:

```ts
export async function fetchFederationFaqHighlights(size: number): Promise<FederationFaqItem[]> {
  try {
    const page = await client().federationFaqs.list({ page: 0, size });
    return page.content;
  } catch (error) {
    logBackendUnavailable('fetchFederationFaqHighlights', error);
    return []; // BE 다운 시 홈 섹션 자체를 숨긴다(코드 버그로 오인 방지 — RecruitmentTicker 동일)
  }
}
```

- [ ] **Step 2: `app/_components/sections/HomeQnaSection.tsx`** (서버, RecruitmentTicker 패턴):

```tsx
import Link from 'next/link';
import { fetchFederationFaqHighlights } from '@/app/_lib/home-data';
import { HomeFaqAccordion } from './HomeFaqAccordion';

export async function HomeQnaSection() {
  const faqs = await fetchFederationFaqHighlights(4);
  if (faqs.length === 0) return null; // BE 폴백·데이터 없음 → 섹션 미렌더

  return (
    <section className="mx-auto w-full max-w-[1080px] px-5 py-12 md:px-8">
      <header className="mb-6">
        <h2 className="text-[22px] font-bold text-ink">자주 묻는 질문</h2>
        <p className="mt-1 text-[14px] text-charcoal-2">총동연에 궁금한 점을 물어보세요</p>
      </header>
      <HomeFaqAccordion items={faqs} />
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Link href="/me/inquiries/new"
          className="rounded-full bg-coral px-5 py-2.5 text-[14px] font-semibold text-paper">
          1:1 문의하기
        </Link>
        <Link href="/faq"
          className="rounded-full border border-line bg-paper px-5 py-2.5 text-[14px] font-semibold text-charcoal-2">
          FAQ 전체 보기
        </Link>
      </div>
    </section>
  );
}
```

(스타일 세부는 인접 섹션(FeaturedClubs)의 실제 컨테이너 폭·여백 클래스를 읽고 일치시킬 것 — 위 값은 초안)

- [ ] **Step 3: `HomeFaqAccordion.tsx`** (`'use client'`) — 승격된 `Accordion` 재사용이 기본. 각 항목 펼침 영역 하단에 "자세히 보기 →" Link(`/faq?item={id}`) 추가가 필요하므로, Accordion이 answer 문자열만 받는 구조면 항목별 커스텀이 가능한 얇은 자체 아코디언(button+aria-expanded, 첫 항목 defaultOpen 없음)으로 구현. 데스크톱 2열(`md:grid-cols-2`) 허용, 모바일 세로 스택.
- [ ] **Step 4: `app/page.tsx`** — `<FadeIn><FeaturedClubs /></FadeIn>` 다음 줄에 `<FadeIn><HomeQnaSection /></FadeIn>` 삽입(LeaderCta 앞, **hidden md:block 없이** — 모바일 노출이 핵심, 스펙 §3)
- [ ] **Step 5:** `pnpm typecheck && pnpm lint` → Commit — `feat(web): 홈 자주 묻는 질문 섹션 추가`

---

### Task 5: admin FAQ 관리 (/admin/faqs)

- [ ] **Step 1: `adminSections.ts`** — '커뮤니티 운영' 그룹, 공지 관리 다음에:

```ts
  { href: '/admin/faqs', title: 'FAQ 관리', description: '총동연 자주 묻는 질문 작성·정렬·공개 관리', group: '커뮤니티 운영' },
```

- [ ] **Step 2: 라우트 wrapper 3개** — admin/notices 패턴 그대로: `admin/faqs/page.tsx` → `_pages/AdminFaqListPage`, `new/page.tsx` → `AdminFaqNewPage`, `[faqId]/edit/page.tsx` → `AdminFaqEditPage`
- [ ] **Step 3: `AdminFaqListPage.tsx`** (`'use client'`) 계약 — AdminNoticesListPage 골격 준용:
  - 필터: published(전체/공개/비공개 세그먼트), categoryId(select — categories 쿼리), keywordInput/keyword(draft/확정)
  - 테이블 행: 질문(고정 뱃지)·카테고리·공개 여부 뱃지·조회수·수정일 + 행 액션: **위/아래 이동 버튼**(reorder — 현재 페이지가 전체 순서의 부분이므로, 이동은 **필터 없는 전체 목록**(size 500, published/카테고리/키워드 필터가 걸려 있으면 이동 버튼 비활성+툴팁 "필터를 해제하면 순서를 바꿀 수 있어요")에서 인접 항목과 스왑한 전체 orderedIds로 PUT), 수정(Link edit), 삭제(ConfirmDialog)
  - 고정/공개 인라인 토글: update mutation으로 해당 필드만 뒤집은 전체 payload 전송(폼과 동일 payload — 행의 기존 값 사용)
  - **카테고리 관리 카드**(`_components/FaqCategoryManager.tsx`): 목록 상단 접이식 카드 — 카테고리 나열(이름 인라인 수정 + 순서 위/아래(sortOrder ±1 스왑 update 2회 호출) + 신규 이름 입력→생성). 삭제 버튼 없음(P2 — 스펙 §8)
  - 실패 처리: 409(중복 이름 등)는 `extractErrorMessage`로 인라인 `text-coral` 문구
  - Pagination(승격본) 사용
- [ ] **Step 4: `FaqForm.tsx`** — 카테고리 select(필수)·질문 input(max 300)·답변 textarea(max 4000)·pinned/published 체크박스, `initialState`/`onSubmit(state)`/`isSubmitting`/`errorMessage` props(NoticeForm 패턴). `AdminFaqNewPage`(성공 시 `router.push('/admin/faqs')`)·`AdminFaqEditPage`(adminList 캐시에서 초기값을 얻지 말고 **admin 목록 쿼리를 faqId로 재조회하거나 목록 행에서 전달** — 상세 API가 없으므로 edit 진입은 목록에서 row 데이터를 `searchParams` 없이 전달할 수 없어, adminList를 `size 500`으로 불러 해당 id를 찾는 방식으로 시드. **부분 필드 시드 금지 원칙(메모리: 수정 모달 시드 함정)에 주의 — adminList 응답은 answer 포함 전체 필드라 안전함을 확인하고 사용**)
- [ ] **Step 5:** `pnpm typecheck && pnpm lint` → Commit — `feat(web): admin FAQ 관리 화면 추가`

---

### Task 6: 테스트 (vitest — 기존 admin-notices-list.test.tsx 패턴: `vi.mock('@duing/hooks')` 훅 모킹)

- [ ] **Step 1: `test/faq/faq-page.test.tsx`** — 시나리오: ① 목록 렌더(질문·고정 뱃지 노출) ② 검색 확정 시 훅이 keyword로 재호출(mock 인자 검증) ③ 빈 결과 시 empty 문구+문의 CTA 링크(/me/inquiries/new) ④ `item` 딥링크 파라미터 존재 시 상단 카드 렌더 + detail 훅 호출(next/navigation useSearchParams mock)
- [ ] **Step 2: `test/admin/faqs/admin-faq-list.test.tsx`** — ① 테이블 렌더(published 뱃지) ② 삭제 버튼 → ConfirmDialog 노출 → 확인 시 delete mutation 호출 ③ 필터 적용 중 이동 버튼 비활성
- [ ] **Step 3: `test/home/home-faq-accordion.test.tsx`** — 항목 펼침 토글(aria-expanded) + "자세히 보기" href가 `/faq?item={id}`
- [ ] **Step 4:** `pnpm test` → 신규 3파일 포함 전부 PASS → Commit — `test(web): FAQ 페이지·admin 관리·홈 아코디언 테스트 추가`

---

### Task 7: 검증 + 시각 QA + 리뷰 게이트

- [ ] **Step 1:** `cd frontend && pnpm lint && pnpm typecheck && pnpm build && pnpm test` → 전부 통과(CI 4종 동일)
- [ ] **Step 2: 시각 QA** — dev 서버는 **:3000 고정**(점유 시 기존 next-server 부모→워커→포트 순 kill 후 재기동, 로그의 `Local:` 포트 확인 — 메모리: dev 서버 좀비 함정). 로컬 백엔드 기동 상태에서 Playwright로: `/faq`(칩·검색·아코디언 펼침·딥링크 `?item=`·모바일 뷰포트 375px), 홈 섹션(모바일 노출·CTA), `/admin/faqs`(ADMIN 로그인 → 생성→토글→이동→삭제 왕복). **jsdom이 못 잡는 실브라우저 이슈**(아코디언 애니·모바일 칩 스크롤) 확인. QA 종료 후 dev 서버 종료(메모리 규칙).
- [ ] **Step 3:** 리뷰 — FE 컨벤션 리뷰(general-purpose, frontend/CLAUDE.md·AGENTS.md 기준) + codex 리뷰. 지적 반영 후 PR 준비(푸시·생성은 사용자 지시 후).

---

## Self-Review 결과

- 스펙 커버리지: §2(/faq 라우트·딥링크 ?item=), §3(ExploreNav 헤더 active 금지·HomeFooter·홈 섹션 위치/모바일 노출/CTA 2개/비밀문의 미노출), §6(작업 순서·client 평탄화 네임스페이스·쿼리 키·empty/loading 컨벤션·Pagination 승격·sitemap/metadata), §8 P1-④ 전부 태스크 매핑. BottomNav '/faq 미노출' 회귀 테스트·공지 사이드바 링크·Footer 재구성은 PR6 범위(스펙 §8 P1-⑥)로 의도적 제외.
- 데이터 레이어는 완전 코드, 페이지 레이어는 레퍼런스 파일 지정 + 행위 계약(구현자가 기존 패턴 전개) — NoticePage/AdminNoticesListPage가 리뷰 기준.
- reorder UX의 "필터 중 비활성" 결정: 부분 목록으로 전체 교체 PUT을 보내면 백엔드 집합 검증(400)에 걸리므로 필터 해제 상태에서만 허용 — 백엔드 계약과 정합.
- 함정 반영: cleanParams의 boolean 처리 검증, 수정 폼 시드는 전체 필드 응답(adminList) 사용, dev 서버 :3000·좀비 정리, PR5 의존 CTA 링크 문서화.
