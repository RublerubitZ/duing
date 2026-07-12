# PR-2: 지원하기 버튼 사전 검증 가드 (FE) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** '지원하기' 클릭 시 PR-1 의 eligibility API 로 사전 검증해 통과 시에만 `/apply/{id}` 로 이동하고(실패 시 토스트), `/apply` 딥링크 진입도 같은 체크로 차단한다.

**Architecture:** 스펙 §1.3. 레이어 순서(types 불필요 → api client → hooks → UI) 준수. `useClubApply`(지원 버튼 2곳 공유 훅)에 `useCheckEligibilityMutation` 을 끼워 성공 시 push, `ApiError` 시 기존 `ToastProvider` 로 서버 메시지 표시. `/apply/[recruitmentId]/page.tsx` 는 `useApplicationEligibilityQuery`(retry 0)로 부적격 시 폼 대신 안내 패널을 렌더한다. EXTERNAL(외부폼 새 창)·비로그인(`/login?next=`) 분기는 기존 그대로 — eligibility 호출 없음.

**Tech Stack:** Next.js 15 App Router / React 19 / TanStack Query / ky / vitest + testing-library + MSW

**전제:** PR-1 (`feat/application-eligibility-api`) 이 develop 에 머지된 후 분기한다.

**사전 확인된 사실 (정찰):**
- `useClubApply` 전문은 `frontend/apps/web/app/clubs/[clubId]/_lib/useClubApply.ts` (40줄) — `canApply = displayStatus OPEN|ALWAYS_OPEN`, EXTERNAL 은 `safeExternalHref` + `window.open`, 비로그인은 `/login?next=` push
- 소비자 2곳: `app/clubs/[clubId]/_components/ClubRecruitmentCard.tsx`(데스크탑 카드), `ClubDetailApplyBar.tsx`(모바일 하단 바) — 반드시 둘 다 Read 후 pending 반영
- 토스트: `app/_components/toast/ToastProvider.tsx` — `useToast().addToast(message, { variant: 'error' })`, 전역 `providers.tsx` 마운트. **테스트에서 useClubApply 를 렌더하면 ToastProvider 랩이 필요** (없으면 useToast 가 throw)
- API 응답 envelope: `{ ok, data, message }`, 실패 시 `ApiError(status, message, payload, code)` — 클라이언트 헬퍼 `jsonVoid` 사용 (`frontend/packages/api/src/client.ts:900` drafts 참조)
- client.ts 는 상단(±L285)에 ApiClient 타입 선언, 하단(±L827)에 구현 — applications 양쪽 모두 수정
- 쿼리키 파일: `frontend/packages/hooks/src/applicationQueryKeys.ts` — Read 후 기존 네이밍 패턴으로 eligibility 키 추가
- apply 페이지 테스트: `frontend/apps/web/test/apply/apply-page.test.tsx` — 실제 `createApiClient` + MSW. **기존 테스트가 eligibility GET 을 모르면 unhandled request 로 깨질 수 있으니 기본 200 핸들러를 setup 에 추가**
- middleware 가 `/apply/:path*` 인증을 보장하므로 apply 페이지에서 auth 분기 불필요

**리뷰 파이프라인 (task 마다):** implementer → spec reviewer → duing-code-reviewer(프론트도 컨벤션 체크 가능) → codex:review.

**Out of Scope:** 버튼 로드 시점 사전 비활성화, 에러코드별 UI 분기(서버 메시지 그대로 표시), 질문 유형(PR-3/4).

---

## Task 0: 브랜치 생성

- [ ] `git checkout develop && git pull && git checkout -b feat/apply-eligibility-guard`

---

## Task 1: api client + hooks

**Files:**
- Modify: `frontend/packages/api/src/client.ts` (타입 선언부 applications ±L285 + 구현부 ±L827)
- Modify: `frontend/packages/hooks/src/applicationQueryKeys.ts`
- Modify: `frontend/packages/hooks/src/applications.ts`
- Modify: `frontend/packages/hooks/src/index.ts` (export 확인 — 파일 전체 re-export 면 변경 불필요)

- [ ] **Step 1: client 메서드 추가** — 구현부 `applications` 객체의 `submit` 아래:

```ts
      checkEligibility: (recruitmentId) =>
        jsonVoid(http.get(`recruitments/${recruitmentId}/applications/eligibility`)),
```

타입 선언부 applications 블록에도 동일 시그니처 추가 (기존 선언 스타일을 보고 맞춤):

```ts
    checkEligibility: (recruitmentId: number) => Promise<void>;
```

- [ ] **Step 2: 쿼리키 + 훅 추가** — `applicationQueryKeys.ts` 를 Read 하고 기존 패턴으로 추가:

```ts
  eligibility: (recruitmentId: number) => ['applications', 'eligibility', recruitmentId] as const,
```

(기존 키 접두 구조가 다르면 그 구조를 따른다.) `applications.ts` 에 훅 2개:

```ts
/** 지원하기 버튼 클릭 시점의 사전 확인 — pending 상태로 중복 클릭을 막는다. */
export function useCheckEligibilityMutation() {
  const client = useApiClient();
  return useMutation({
    mutationFn: (recruitmentId: number) => client.applications.checkEligibility(recruitmentId),
  });
}

/** /apply 딥링크 가드용 — 부적격(4xx)은 기대 결과이므로 재시도하지 않는다. */
export function useApplicationEligibilityQuery(recruitmentId: number, enabled: boolean) {
  const client = useApiClient();
  return useQuery({
    queryKey: applicationQueryKeys.eligibility(recruitmentId),
    queryFn: async () => {
      await client.applications.checkEligibility(recruitmentId);
      return true;
    },
    enabled,
    retry: false,
    staleTime: 0,
  });
}
```

- [ ] **Step 3: 컴파일 확인** — `cd frontend && pnpm typecheck` → 통과 (스크립트명이 다르면 package.json scripts 확인, 예: `pnpm -r typecheck`).

- [ ] **Step 4: 커밋** — `feat(web): 지원 가능 여부 사전 확인 API 클라이언트·훅 추가`

---

## Task 2: useClubApply 사전 검증 + 버튼 pending

**Files:**
- Modify: `frontend/apps/web/app/clubs/[clubId]/_lib/useClubApply.ts`
- Modify: `frontend/apps/web/app/clubs/[clubId]/_components/ClubRecruitmentCard.tsx`
- Modify: `frontend/apps/web/app/clubs/[clubId]/_components/ClubDetailApplyBar.tsx`
- Test: `frontend/apps/web/test/clubs/club-recruitment-card.test.tsx`, `frontend/apps/web/test/clubs/club-detail-apply-bar.test.tsx` (기존 파일 확장)

- [ ] **Step 1: 실패하는 테스트 작성** — 기존 두 테스트 파일을 Read 해 렌더 헬퍼를 파악하고 확장. 렌더에 `ToastProvider` + 실제 `ApiClientProvider`(MSW) 랩이 필요해지면 기존 테스트 유틸 구조에 맞춰 추가한다. 케이스:

```tsx
// 1. "지원 가능하면 사전 확인 후 지원서 페이지로 이동한다"
//    MSW: http.get('*/recruitments/:id/applications/eligibility', () =>
//      HttpResponse.json({ ok: true, data: null, message: null }))
//    → 버튼 클릭 → waitFor(() => expect(mockRouterPush).toHaveBeenCalledWith('/apply/77'))
// 2. "지원 불가 사유는 토스트로 표시하고 이동하지 않는다"
//    MSW 409: HttpResponse.json({ ok: false, data: null, message: '이미 지원한 모집 공고입니다.' }, { status: 409 })
//    → 클릭 → await screen.findByText('이미 지원한 모집 공고입니다.') (토스트 role="alert" 또는 실제 마크업 확인)
//    → expect(mockRouterPush).not.toHaveBeenCalled()
// 3. "사전 확인 중에는 버튼이 비활성화된다"
//    MSW 를 delay 응답으로 → 클릭 직후 expect(button).toBeDisabled()
// 4. (회귀) 비로그인 → /login?next=... push, EXTERNAL → window.open — 기존 케이스 유지 확인
```

- [ ] **Step 2: 실패 확인** — `cd frontend && pnpm test -- clubs` (필터 인자는 vitest 설정에 맞춤) → 신규 케이스 FAIL.

- [ ] **Step 3: 구현** — `useClubApply.ts` 전체를 다음으로 교체 (기존 import 유지 + 추가):

```ts
'use client';

import { useRouter } from 'next/navigation';
import { ApiError } from '@duing/api';
import { useCheckEligibilityMutation } from '@duing/hooks';
import { useAuthStore } from '@duing/stores';
import type { StudentRecruitmentProjection } from '@duing/types';
import { useToast } from '../../../_components/toast/ToastProvider';
import { safeExternalHref } from '../../../_lib/safeExternalHref';
import { toRoute } from '../../../_lib/route';

export function useClubApply(recruitment: StudentRecruitmentProjection | undefined) {
  const authStatus = useAuthStore((state) => state.status);
  const router = useRouter();
  const { addToast } = useToast();
  const eligibilityCheck = useCheckEligibilityMutation();

  const status = recruitment?.displayStatus;
  const canApply = status === 'OPEN' || status === 'ALWAYS_OPEN';
  const applyButtonLabel =
    recruitment?.applicationMode === 'EXTERNAL' ? '외부 폼으로 이동' : '지원하기';

  async function handleApply() {
    if (!recruitment || !canApply || eligibilityCheck.isPending) return;
    if (recruitment.applicationMode === 'EXTERNAL' && recruitment.externalFormUrl) {
      const externalUrl = safeExternalHref(recruitment.externalFormUrl);
      if (externalUrl) window.open(externalUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    const applyPath: `/${string}` = `/apply/${recruitment.id}`;
    if (authStatus !== 'authenticated') {
      router.push(toRoute(`/login?next=${encodeURIComponent(applyPath)}`));
      return;
    }
    try {
      // 지원서 작성 전에 제출과 동일한 정책으로 차단 사유를 미리 알려준다 (스펙 §1.3).
      await eligibilityCheck.mutateAsync(recruitment.id);
      router.push(toRoute(applyPath));
    } catch (checkError) {
      const message =
        checkError instanceof ApiError
          ? checkError.message
          : '지원 가능 여부를 확인하지 못했습니다. 잠시 후 다시 시도해주세요.';
      addToast(message, { variant: 'error' });
    }
  }

  return {
    canApply,
    handleApply,
    applyButtonLabel,
    isCheckingEligibility: eligibilityCheck.isPending,
  };
}
```

주의: 기존 파일의 실제 import 경로(`safeExternalHref`, `toRoute`)를 Read 로 확인해 그대로 사용 — 위 경로가 다르면 실제에 맞춘다. 반환 타입이 명시돼 있으면 `isCheckingEligibility` 를 추가.

두 버튼 컴포넌트: `useClubApply` 반환값에서 `isCheckingEligibility` 를 받아 기존 disabled 조건에 OR 로 추가하고, pending 중 라벨을 `'확인 중…'` 으로 (기존 disabled/label 렌더 방식을 따름).

- [ ] **Step 4: 통과 확인** — `pnpm test -- clubs` → PASS.

- [ ] **Step 5: 커밋** — `feat(web): 지원하기 클릭 시 지원 가능 여부 사전 검증`

---

## Task 3: /apply 딥링크 가드

**Files:**
- Modify: `frontend/apps/web/app/apply/[recruitmentId]/page.tsx`
- Test: `frontend/apps/web/test/apply/apply-page.test.tsx` (확장)

- [ ] **Step 1: 실패하는 테스트 작성** — 기존 파일의 MSW setup 에 eligibility 기본 200 핸들러를 추가해 기존 케이스를 보전하고, 신규 케이스:

```tsx
// 1. "부적격 딥링크 진입은 지원 폼 대신 안내 패널을 보여준다"
//    eligibility 를 409 '이미 지원한 모집 공고입니다.' 로 오버라이드
//    → render → await screen.findByText('이미 지원한 모집 공고입니다.')
//    → expect(screen.queryByRole('button', { name: '제출' })).not.toBeInTheDocument()
//    → '동아리 페이지로 돌아가기' 링크 존재 (href = /clubs/{clubId})
// 2. (회귀) 기본 200 이면 기존 폼 렌더·제출 케이스 전부 그대로 통과
```

- [ ] **Step 2: 실패 확인** — `pnpm test -- apply` → 신규 케이스 FAIL.

- [ ] **Step 3: 구현** — `page.tsx` 에 쿼리 추가·분기 (기존 로딩/외부폼 분기 구조 유지):

```tsx
import { ApiError } from '@duing/api';
import Link from 'next/link';
import {
  useRecruitmentDetailQuery,
  useApplicationDraftQuery,
  useApplicationEligibilityQuery,
} from '@duing/hooks';
// ...
  const eligibility = useApplicationEligibilityQuery(
    recruitmentId,
    Boolean(recruitment) && recruitment?.applicationMode === 'SELF',
  );
```

로딩 게이트에 `eligibility.isLoading` 추가 (`detail.isLoading || !recruitment || draftQuery.isLoading || (recruitment.applicationMode === 'SELF' && eligibility.isLoading)` — SELF 가 아닐 땐 기존 외부폼 리다이렉트가 처리). `isExternal` 분기 아래에 부적격 패널:

```tsx
  if (eligibility.isError) {
    const blockedMessage =
      eligibility.error instanceof ApiError
        ? eligibility.error.message
        : '지원 가능 여부를 확인하지 못했습니다. 잠시 후 다시 시도해주세요.';
    return (
      <div
        className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6"
        style={{ background: 'linear-gradient(180deg, #ece6d3 0%, #f3efe4 8%, #f3efe4 92%, #ece6d3 100%)' }}
      >
        <p role="alert" className="text-center text-sm text-coral">{blockedMessage}</p>
        <Link href={`/clubs/${recruitment.clubId}`} className="btn btn-secondary">
          동아리 페이지로 돌아가기
        </Link>
      </div>
    );
  }
```

주의: 이 프로젝트의 내부 링크가 `next-view-transitions` 의 `Link` 를 쓰는지 기존 apply/clubs 페이지 import 를 확인해 동일한 것을 사용한다. `Link href` 에 `toRoute` 가드가 쓰이는 패턴이면 따른다.

- [ ] **Step 4: 통과 확인** — `pnpm test -- apply` → PASS (기존 제출/409 케이스 회귀 포함).

- [ ] **Step 5: 커밋** — `feat(web): 지원서 딥링크 진입 시 지원 가능 여부 가드`

---

## Task 4: 품질 게이트 + PR

- [ ] `cd frontend && pnpm lint && pnpm test && pnpm build` → 전부 통과 (출력 직접 확인, `| tail` 금지)
- [ ] self-check 7항목
- [ ] push + PR 생성 (제목: `feat(web): 지원하기 사전 검증 가드 추가`, 본문 🚀/🤔/💬, **머지 금지 — 사용자 지시 대기**)
