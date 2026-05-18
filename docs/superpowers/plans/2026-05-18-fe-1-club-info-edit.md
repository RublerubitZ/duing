# FE-1: 동아리 정보 수정 페이지 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** LEADER 가 자기 동아리의 이름·카테고리·분류·소개·로고/커버 URL·태그·SNS 링크·FAQ 를 수정할 수 있는 페이지(`/manage/clubs/[clubId]/info`)를 추가한다. OFFICER 는 동일 페이지에서 읽기 전용으로 본다.

**Architecture:** App Router Client Page. 데이터는 `useClubDetailQuery` 로 가져와 `<ClubInfoForm>` 의 `defaultValues` 로 prefill. 저장은 신규 `useUpdateClubMutation` 으로 `PATCH /api/v1/clubs/{clubId}` 호출, 변경된 필드만 payload 에 포함. 권한 분기는 `useManagedClubsQuery` 의 `myRole` 로 판단해 LEADER 면 편집, OFFICER 면 form disabled. Tags / SNS / FAQ 는 각자 별도 컴포넌트로 분리해 책임 격리.

**Tech Stack:** Next.js 15 App Router / React 19 / TanStack Query / Zod / ky (`@duing/api`)

**Spec:** `docs/superpowers/specs/2026-05-18-phase-3-club-info-photos-members-design.md` §3.1, §8.A

---

## File Map

**Create**
- `frontend/packages/types/src/club.ts` (modify) — `UpdateClubPayload` 타입 추가
- `frontend/packages/schemas/src/index.ts` (modify) — `updateClubSchema` (BE 검증 미러링: name 1~100, tags ≤ 20 / 각 1~20, snsLinks ≤ 10, faqs ≤ 20)
- `frontend/packages/api/src/client.ts` (modify) — `clubs.update(clubId, payload)` 메서드
- `frontend/packages/hooks/src/clubs.ts` (modify) — `useUpdateClubMutation(clubId)` 추가
- `frontend/apps/web/app/manage/clubs/[clubId]/info/page.tsx` — Client Page, 데이터 로드 + 권한 분기 + Form 마운트
- `frontend/apps/web/app/manage/clubs/[clubId]/info/_components/ClubInfoForm.tsx` — 메인 폼
- `frontend/apps/web/app/manage/clubs/[clubId]/info/_components/TagsInput.tsx` — chip 입력 (Enter/쉼표로 추가, ✕ 로 삭제, 20개 제한)
- `frontend/apps/web/app/manage/clubs/[clubId]/info/_components/SnsLinksRepeater.tsx` — platform select + url input 반복, 10개 제한
- `frontend/apps/web/app/manage/clubs/[clubId]/info/_components/FaqsRepeater.tsx` — question/answer/order 반복, 20개 제한

**Modify**
- `frontend/apps/web/app/manage/_components/ManageNav.tsx` — "동아리 정보 (Phase 3)" disabled placeholder 를 활성 링크로 교체

**없음**
- 신규 패키지 / 신규 ENV / 신규 라이브러리
- 파일 업로드 UI (로고/커버 URL 은 텍스트 입력으로 우선 처리 — 업로더는 FE-2 활동사진에서 다룬다)

---

## Task 1: 브랜치 생성

- [ ] **Step 1: develop 동기화 + 분기**

```bash
git checkout develop
git pull origin develop
git checkout -b feat/fe-1-club-info-edit
```

---

## Task 2: 타입 + 스키마 + API 클라이언트 + 훅

**Files:**
- Modify: `frontend/packages/types/src/club.ts`
- Modify: `frontend/packages/schemas/src/index.ts`
- Modify: `frontend/packages/api/src/client.ts`
- Modify: `frontend/packages/hooks/src/clubs.ts`

- [ ] **Step 1: `UpdateClubPayload` 추가**

`frontend/packages/types/src/club.ts` 끝에:

```ts
export type UpdateClubPayload = {
  name?: string;
  category?: ClubCategory;
  division?: string | null;
  description?: string | null;
  logoUrl?: string | null;
  coverUrl?: string | null;
  tags?: string[];
  snsLinks?: ClubSnsLink[];
  faqs?: ClubFaq[];
};
```

- [ ] **Step 2: zod 스키마 추가**

`frontend/packages/schemas/src/index.ts` 끝에:

```ts
export const updateClubSchema = z.object({
  name: z.string().min(1, '동아리 이름은 1~100자여야 합니다.')
    .max(100, '동아리 이름은 1~100자여야 합니다.'),
  category: z.enum(['ACADEMIC', 'CULTURE', 'ART', 'SPORTS', 'VOLUNTEER', 'RELIGION', 'HOBBY', 'OTHER']),
  division: z.string().max(50, '분류는 50자 이하여야 합니다.').nullable(),
  description: z.string().nullable(),
  logoUrl: z.string().max(500, '로고 URL은 500자 이하여야 합니다.').nullable(),
  coverUrl: z.string().max(500, '커버 URL은 500자 이하여야 합니다.').nullable(),
  tags: z.array(
    z.string().min(1, '각 태그는 1~20자여야 합니다.').max(20, '각 태그는 1~20자여야 합니다.'),
  ).max(20, '태그는 최대 20개까지 가능합니다.'),
  snsLinks: z.array(
    z.object({
      platform: z.enum(['INSTAGRAM', 'FACEBOOK', 'X', 'YOUTUBE', 'KAKAO', 'WEB']),
      url: z.string().min(1, 'SNS URL은 1~500자여야 합니다.')
        .max(500, 'SNS URL은 1~500자여야 합니다.')
        .regex(/^https?:\/\/.+/, 'SNS URL은 http(s):// 로 시작해야 합니다.'),
    }),
  ).max(10, 'SNS 링크는 최대 10개까지 가능합니다.'),
  faqs: z.array(
    z.object({
      question: z.string().min(1, 'FAQ 질문은 1~200자여야 합니다.').max(200, 'FAQ 질문은 1~200자여야 합니다.'),
      answer: z.string().min(1, 'FAQ 답변은 1~2000자여야 합니다.').max(2000, 'FAQ 답변은 1~2000자여야 합니다.'),
      order: z.number().int().min(0, 'FAQ 순서는 0 이상이어야 합니다.'),
    }),
  ).max(20, 'FAQ는 최대 20개까지 가능합니다.'),
});

export type UpdateClubInput = z.infer<typeof updateClubSchema>;
```

- [ ] **Step 3: API 클라이언트에 `clubs.update` 추가**

`frontend/packages/api/src/client.ts`:

import 보강:
```ts
  UpdateClubPayload,
```
(다른 `UpdateXxxPayload` 들과 정렬)

`clubs:` 블록의 `updateStatus` 위/아래에 추가:
```ts
      update: (clubId, payload) =>
        jsonOk<ClubDetail>(http.patch(`clubs/${clubId}`, { json: payload })),
```

API 인터페이스(타입 선언부) 에 시그니처 추가:
```ts
    update: (clubId: number, payload: UpdateClubPayload) => Promise<ClubDetail>;
```
(파일 상단의 `type ApiClient = { clubs: { ... }, ... }` 정의에 함께 추가. 기존 `detail`/`create` 시그니처와 정렬.)

- [ ] **Step 4: `useUpdateClubMutation` 추가**

`frontend/packages/hooks/src/clubs.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ClubSearchParams, UpdateClubPayload } from '@duing/types';
import { useApiClient } from './api-context';
import { clubQueryKeys } from './clubQueryKeys';
```

기존 export 들 뒤에 추가:

```ts
export function useUpdateClubMutation(clubId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateClubPayload) => client.clubs.update(clubId, payload),
    onSuccess: (updated) => {
      queryClient.setQueryData(clubQueryKeys.detail(clubId), updated);
      queryClient.invalidateQueries({ queryKey: clubQueryKeys.managed() });
    },
  });
}
```

- [ ] **Step 5: `useUpdateClubMutation` 을 `@duing/hooks` 진입점에 export 했는지 확인**

`frontend/packages/hooks/src/index.ts` 가 `export * from './clubs'` 형태면 자동으로 export 됨. 그렇지 않으면 한 줄 추가.

- [ ] **Step 6: 타입체크**

```bash
cd frontend && pnpm typecheck 2>&1 | tail -20
```

Expected: 0 error.

- [ ] **Step 7: 커밋**

```bash
git add frontend/packages/types/src/club.ts \
        frontend/packages/schemas/src/index.ts \
        frontend/packages/api/src/client.ts \
        frontend/packages/hooks/src/clubs.ts \
        frontend/packages/hooks/src/index.ts
git commit -m "feat(frontend): 동아리 정보 수정 타입/스키마/API/훅 추가"
```

---

## Task 3: TagsInput / SnsLinksRepeater / FaqsRepeater 분리 컴포넌트

**Files:**
- Create: `frontend/apps/web/app/manage/clubs/[clubId]/info/_components/TagsInput.tsx`
- Create: `frontend/apps/web/app/manage/clubs/[clubId]/info/_components/SnsLinksRepeater.tsx`
- Create: `frontend/apps/web/app/manage/clubs/[clubId]/info/_components/FaqsRepeater.tsx`

세 컴포넌트 모두 `'use client'` + controlled (props: value, onChange, readOnly?, errorAt?).

- [ ] **Step 1: TagsInput.tsx**

```tsx
'use client';

import { useState } from 'react';

type TagsInputProps = {
  value: string[];
  onChange: (next: string[]) => void;
  readOnly?: boolean;
  maxTags?: number;
};

export function TagsInput({ value, onChange, readOnly = false, maxTags = 20 }: TagsInputProps) {
  const [draft, setDraft] = useState('');

  function add(token: string) {
    const trimmed = token.trim();
    if (!trimmed) return;
    if (value.includes(trimmed)) return;
    if (value.length >= maxTags) return;
    onChange([...value, trimmed]);
    setDraft('');
  }

  function remove(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }

  return (
    <div className="flex flex-wrap gap-2 rounded-md border border-slate-300 p-2">
      {value.map((tag, idx) => (
        <span
          key={`${tag}-${idx}`}
          className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs"
        >
          {tag}
          {!readOnly && (
            <button
              type="button"
              onClick={() => remove(idx)}
              className="text-slate-500 hover:text-slate-900"
              aria-label={`태그 ${tag} 삭제`}
            >
              ✕
            </button>
          )}
        </span>
      ))}
      {!readOnly && value.length < maxTags && (
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              add(draft);
            }
          }}
          onBlur={() => add(draft)}
          placeholder={value.length === 0 ? '엔터로 태그 추가' : ''}
          className="min-w-[8rem] flex-1 bg-transparent text-sm outline-none"
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: SnsLinksRepeater.tsx**

```tsx
'use client';

import type { ClubSnsLink } from '@duing/types';

const PLATFORMS = ['INSTAGRAM', 'FACEBOOK', 'X', 'YOUTUBE', 'KAKAO', 'WEB'] as const;

type SnsLinksRepeaterProps = {
  value: ClubSnsLink[];
  onChange: (next: ClubSnsLink[]) => void;
  readOnly?: boolean;
  maxLinks?: number;
};

export function SnsLinksRepeater({
  value, onChange, readOnly = false, maxLinks = 10,
}: SnsLinksRepeaterProps) {
  function update(idx: number, patch: Partial<ClubSnsLink>) {
    onChange(value.map((link, i) => (i === idx ? { ...link, ...patch } : link)));
  }

  function add() {
    if (value.length >= maxLinks) return;
    onChange([...value, { platform: 'INSTAGRAM', url: '' }]);
  }

  function remove(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }

  return (
    <div className="space-y-2">
      {value.map((link, idx) => (
        <div key={idx} className="flex gap-2">
          <select
            value={link.platform}
            onChange={(e) => update(idx, { platform: e.target.value })}
            disabled={readOnly}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
          >
            {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <input
            type="url"
            value={link.url}
            onChange={(e) => update(idx, { url: e.target.value })}
            placeholder="https://…"
            disabled={readOnly}
            className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm"
          />
          {!readOnly && (
            <button
              type="button"
              onClick={() => remove(idx)}
              className="text-sm text-slate-500 hover:text-rose-600"
            >
              삭제
            </button>
          )}
        </div>
      ))}
      {!readOnly && value.length < maxLinks && (
        <button
          type="button"
          onClick={add}
          className="text-sm text-slate-600 hover:text-slate-900"
        >
          + SNS 링크 추가
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: FaqsRepeater.tsx**

```tsx
'use client';

import type { ClubFaq } from '@duing/types';

type FaqsRepeaterProps = {
  value: ClubFaq[];
  onChange: (next: ClubFaq[]) => void;
  readOnly?: boolean;
  maxFaqs?: number;
};

export function FaqsRepeater({
  value, onChange, readOnly = false, maxFaqs = 20,
}: FaqsRepeaterProps) {
  function update(idx: number, patch: Partial<ClubFaq>) {
    onChange(value.map((faq, i) => (i === idx ? { ...faq, ...patch } : faq)));
  }

  function add() {
    if (value.length >= maxFaqs) return;
    onChange([...value, { question: '', answer: '', order: value.length }]);
  }

  function remove(idx: number) {
    // 삭제 후 order 재정렬 (0..N-1).
    onChange(value.filter((_, i) => i !== idx).map((faq, i) => ({ ...faq, order: i })));
  }

  return (
    <div className="space-y-3">
      {value.map((faq, idx) => (
        <div key={idx} className="space-y-2 rounded-md border border-slate-200 p-3">
          <input
            type="text"
            value={faq.question}
            onChange={(e) => update(idx, { question: e.target.value })}
            placeholder="질문"
            disabled={readOnly}
            className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
          />
          <textarea
            value={faq.answer}
            onChange={(e) => update(idx, { answer: e.target.value })}
            placeholder="답변"
            disabled={readOnly}
            rows={3}
            className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
          />
          {!readOnly && (
            <button
              type="button"
              onClick={() => remove(idx)}
              className="text-sm text-slate-500 hover:text-rose-600"
            >
              삭제
            </button>
          )}
        </div>
      ))}
      {!readOnly && value.length < maxFaqs && (
        <button
          type="button"
          onClick={add}
          className="text-sm text-slate-600 hover:text-slate-900"
        >
          + FAQ 추가
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: 컴파일 확인 + 커밋**

```bash
cd frontend && pnpm typecheck 2>&1 | tail -10
git add frontend/apps/web/app/manage/clubs/[clubId]/info/_components/TagsInput.tsx \
        frontend/apps/web/app/manage/clubs/[clubId]/info/_components/SnsLinksRepeater.tsx \
        frontend/apps/web/app/manage/clubs/[clubId]/info/_components/FaqsRepeater.tsx
git commit -m "feat(frontend): 동아리 정보 수정용 TagsInput/SnsLinksRepeater/FaqsRepeater 분리 컴포넌트"
```

---

## Task 4: ClubInfoForm 메인 폼

**Files:**
- Create: `frontend/apps/web/app/manage/clubs/[clubId]/info/_components/ClubInfoForm.tsx`

- [ ] **Step 1: 작성**

```tsx
'use client';

import { useState } from 'react';
import type { ClubDetail, UpdateClubPayload } from '@duing/types';
import { updateClubSchema } from '@duing/schemas';
import { useUpdateClubMutation } from '@duing/hooks';
import { TagsInput } from './TagsInput';
import { SnsLinksRepeater } from './SnsLinksRepeater';
import { FaqsRepeater } from './FaqsRepeater';

type ClubInfoFormProps = {
  clubId: number;
  detail: ClubDetail;
  readOnly: boolean;
};

const CATEGORIES = ['ACADEMIC', 'CULTURE', 'ART', 'SPORTS', 'VOLUNTEER', 'RELIGION', 'HOBBY', 'OTHER'] as const;

export function ClubInfoForm({ clubId, detail, readOnly }: ClubInfoFormProps) {
  const [name, setName] = useState(detail.name);
  const [category, setCategory] = useState(detail.category);
  const [division, setDivision] = useState(detail.division ?? '');
  const [description, setDescription] = useState(detail.description ?? '');
  const [logoUrl, setLogoUrl] = useState(detail.logoUrl ?? '');
  const [coverUrl, setCoverUrl] = useState(detail.coverUrl ?? '');
  const [tags, setTags] = useState(detail.tags);
  const [snsLinks, setSnsLinks] = useState(detail.snsLinks);
  const [faqs, setFaqs] = useState(detail.faqs);

  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const mutation = useUpdateClubMutation(clubId);

  function buildPayload(): UpdateClubPayload {
    const payload: UpdateClubPayload = {};
    if (name !== detail.name) payload.name = name;
    if (category !== detail.category) payload.category = category;
    if (division !== (detail.division ?? '')) payload.division = division || null;
    if (description !== (detail.description ?? '')) payload.description = description || null;
    if (logoUrl !== (detail.logoUrl ?? '')) payload.logoUrl = logoUrl || null;
    if (coverUrl !== (detail.coverUrl ?? '')) payload.coverUrl = coverUrl || null;
    if (JSON.stringify(tags) !== JSON.stringify(detail.tags)) payload.tags = tags;
    if (JSON.stringify(snsLinks) !== JSON.stringify(detail.snsLinks)) payload.snsLinks = snsLinks;
    if (JSON.stringify(faqs) !== JSON.stringify(detail.faqs)) payload.faqs = faqs;
    return payload;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const fullData = { name, category, division: division || null, description: description || null,
                       logoUrl: logoUrl || null, coverUrl: coverUrl || null, tags, snsLinks, faqs };
    const parsed = updateClubSchema.safeParse(fullData);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '입력값을 확인해주세요.');
      return;
    }

    const payload = buildPayload();
    if (Object.keys(payload).length === 0) {
      setError('변경된 내용이 없습니다.');
      return;
    }

    try {
      await mutation.mutateAsync(payload);
      setSavedAt(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장에 실패했습니다.');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-3xl space-y-6 px-6 py-10">
      <header className="flex items-baseline justify-between">
        <h1 className="text-xl font-bold">동아리 정보</h1>
        {readOnly && (
          <span className="text-xs text-slate-500">
            OFFICER 는 읽기만 가능합니다. 수정은 LEADER 만 할 수 있습니다.
          </span>
        )}
      </header>

      <fieldset disabled={readOnly} className="space-y-4">
        <label className="block">
          <span className="text-sm text-slate-600">이름</span>
          <input
            type="text" value={name} onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>

        <label className="block">
          <span className="text-sm text-slate-600">카테고리</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as typeof CATEGORIES[number])}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          >
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>

        <label className="block">
          <span className="text-sm text-slate-600">분류</span>
          <input
            type="text" value={division} onChange={(e) => setDivision(e.target.value)}
            placeholder="예: 중앙동아리"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>

        <label className="block">
          <span className="text-sm text-slate-600">소개</span>
          <textarea
            value={description} onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>

        <label className="block">
          <span className="text-sm text-slate-600">로고 URL</span>
          <input
            type="url" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)}
            placeholder="https://…"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>

        <label className="block">
          <span className="text-sm text-slate-600">커버 URL</span>
          <input
            type="url" value={coverUrl} onChange={(e) => setCoverUrl(e.target.value)}
            placeholder="https://…"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>

        <div>
          <p className="mb-1 text-sm text-slate-600">태그 (최대 20개)</p>
          <TagsInput value={tags} onChange={setTags} readOnly={readOnly} />
        </div>

        <div>
          <p className="mb-1 text-sm text-slate-600">SNS 링크 (최대 10개)</p>
          <SnsLinksRepeater value={snsLinks} onChange={setSnsLinks} readOnly={readOnly} />
        </div>

        <div>
          <p className="mb-1 text-sm text-slate-600">FAQ (최대 20개)</p>
          <FaqsRepeater value={faqs} onChange={setFaqs} readOnly={readOnly} />
        </div>
      </fieldset>

      {error && <p className="text-sm text-rose-600">{error}</p>}
      {savedAt && !error && (
        <p className="text-sm text-emerald-600">저장됨 ({savedAt.toLocaleTimeString()})</p>
      )}

      {!readOnly && (
        <button
          type="submit" disabled={mutation.isPending}
          className="rounded-md bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
        >
          {mutation.isPending ? '저장 중…' : '저장'}
        </button>
      )}
    </form>
  );
}
```

- [ ] **Step 2: 컴파일 + 커밋**

```bash
cd frontend && pnpm typecheck 2>&1 | tail -10
git add frontend/apps/web/app/manage/clubs/[clubId]/info/_components/ClubInfoForm.tsx
git commit -m "feat(frontend): ClubInfoForm 메인 폼 (부분 갱신 payload 빌더 + 권한 분기)"
```

---

## Task 5: Page 라우트 + ManageNav 활성화

**Files:**
- Create: `frontend/apps/web/app/manage/clubs/[clubId]/info/page.tsx`
- Modify: `frontend/apps/web/app/manage/_components/ManageNav.tsx`

- [ ] **Step 1: page.tsx**

```tsx
'use client';

import { use } from 'react';
import { notFound } from 'next/navigation';
import { useClubDetailQuery, useManagedClubsQuery } from '@duing/hooks';
import { ClubInfoForm } from './_components/ClubInfoForm';

export default function ClubInfoPage({
  params,
}: {
  params: Promise<{ clubId: string }>;
}) {
  const { clubId: clubIdParam } = use(params);
  const currentClubId = Number(clubIdParam);

  const { data: managedClubs, isLoading: isManagedClubsLoading } = useManagedClubsQuery();
  const { data: detail, isLoading: isDetailLoading } = useClubDetailQuery(
    isNaN(currentClubId) ? undefined : currentClubId,
  );

  if (isManagedClubsLoading || isDetailLoading) {
    return <p className="p-6 text-sm text-slate-500">불러오는 중…</p>;
  }

  const managedClub = managedClubs?.find((club) => club.clubId === currentClubId);
  if (!managedClub) {
    notFound();
  }

  if (!detail) {
    return <p className="p-6 text-sm text-slate-500">동아리 정보를 불러올 수 없습니다.</p>;
  }

  const readOnly = managedClub.myRole !== 'LEADER';

  return <ClubInfoForm clubId={currentClubId} detail={detail} readOnly={readOnly} />;
}
```

- [ ] **Step 2: ManageNav 의 "동아리 정보" 활성화**

`frontend/apps/web/app/manage/_components/ManageNav.tsx` 의 disabled placeholder 부분을 실제 링크로 교체:

```tsx
        <div className="mt-4 border-t border-slate-200 pt-4">
          <Link
            href={toRoute(`/manage/clubs/${currentClubId}/info`)}
            className={cn(
              'block rounded-md px-3 py-2 text-sm font-medium',
              pathname.startsWith(toRoute(`/manage/clubs/${currentClubId}/info`))
                ? 'bg-slate-900 text-white'
                : 'text-slate-700 hover:bg-slate-100',
            )}
          >
            동아리 정보
          </Link>
          <div className="rounded-md px-3 py-2 text-sm font-medium text-slate-300 cursor-not-allowed select-none">
            멤버 관리
            <span className="ml-1.5 text-xs font-normal text-slate-300">(Phase 3)</span>
          </div>
        </div>
```

- [ ] **Step 3: 타입체크 + 빌드**

```bash
cd frontend && pnpm typecheck 2>&1 | tail -10
pnpm --filter web build 2>&1 | tail -15
```

Expected: 둘 다 통과.

- [ ] **Step 4: 커밋**

```bash
git add frontend/apps/web/app/manage/clubs/[clubId]/info/page.tsx \
        frontend/apps/web/app/manage/_components/ManageNav.tsx
git commit -m "feat(frontend): 동아리 정보 수정 페이지 라우트 + 좌측 네비 활성화"
```

---

## Task 6: 수동 확인 + 푸시 + PR

- [ ] **Step 1: dev 서버 가동 후 시나리오 확인**

```bash
cd frontend && pnpm --filter web dev
```

브라우저에서:
1. LEADER 계정 로그인 → `/manage/clubs/{clubId}/info` 진입 → 폼이 prefill 됨
2. 이름·태그·SNS·FAQ 수정 후 저장 → 알림 "저장됨" + 페이지 새로고침 시 변경분 유지
3. 잘못된 이름(101자) 입력 시 zod 에러 표시
4. OFFICER 계정으로 같은 경로 진입 → fieldset disabled, 저장 버튼 미노출
5. 비밀번호 잘못된 사용자(비멤버) 가 임의로 URL 진입 → notFound (이미 ManageGuard 가 막음, 추가로 page 에서 한 번 더 검증)

- [ ] **Step 2: 푸시**

```bash
git push -u origin feat/fe-1-club-info-edit
```

- [ ] **Step 3: PR 생성**

```bash
gh pr create --base develop --title "feat(frontend): 동아리 정보 수정 페이지 (/manage/clubs/[clubId]/info)" --body "$(cat <<'EOF'
## 🚀 작업 내용
LEADER 가 자기 동아리의 이름·카테고리·분류·소개·로고/커버 URL·태그·SNS·FAQ 를 수정할 수 있는 `/manage/clubs/[clubId]/info` 페이지를 추가했다. OFFICER 는 동일 페이지에서 폼이 disabled 된 읽기 전용 모드로 본다.

BE-1 (#76 머지) 의 `PATCH /api/v1/clubs/{clubId}` 와 짝이 되는 화면이다. 변경된 필드만 골라 payload 에 포함해 의도된 부분 갱신 의미를 그대로 유지한다.

## 🤔 고민했던 내용
태그·SNS·FAQ 는 각자 별도 컴포넌트로 분리해 페이지 컴포넌트가 폼 조립에만 집중하도록 했다. 모든 입력 컴포넌트가 controlled (`value`/`onChange`) 라 readOnly 분기 한 군데서 일괄 처리된다.

로고·커버는 이번 PR 에선 URL 텍스트 입력만 받는다. 파일 업로드 UX 는 FE-2 (활동사진) 에서 본격 다루므로 동일 패턴을 그쪽에서 정립한 뒤 후속 PR 로 정보 페이지에도 끌어올 예정.

zod 스키마는 백엔드 Bean Validation 규칙을 1:1 미러링해 한국어 메시지까지 동일하게 맞췄다. 백엔드가 또 한 번 검증하므로 클라이언트는 즉시 피드백 용도.

## 💬 리뷰 중점사항
- 부분 갱신 payload 빌더(`buildPayload`) 가 변경된 필드만 보내는지 (특히 `null` vs `''` 구분)
- TagsInput 의 중복 제거·최대 20개 제한
- OFFICER 가 진입했을 때 모든 입력이 disabled 되고 저장 버튼이 안 보이는지
EOF
)"
```

---

## 자체 점검 체크리스트 (PR 직전)

- [ ] BE-1 스펙 §3.1 의 모든 필드가 UI 에 노출된다
- [ ] zod 스키마가 BE 검증 규칙(name 1~100, tags ≤ 20 / 각 1~20, snsLinks ≤ 10 + URL regex, faqs ≤ 20) 과 일치
- [ ] 부분 갱신 payload — null/미포함 구분, 변경 없으면 호출 안 함
- [ ] OFFICER read-only 모드: fieldset disabled + 저장 버튼 미노출
- [ ] LEADER 가 아닌 사용자 진입 차단 (ManageGuard + page 의 managedClub 체크)
- [ ] 좌측 네비 "동아리 정보" 가 활성 페이지일 때 강조
- [ ] 빌드/타입체크 통과
- [ ] 커밋 메시지 `feat(frontend): ...` 형식, Claude 어트리뷰션 없음

---

## Out of Scope

- 로고/커버 파일 업로드 (FE-2 에서 패턴 정립 후 후속 PR)
- 폼 검증을 react-hook-form 으로 마이그레이션 (단순 controlled state 로 충분)
- FAQ 드래그 정렬 UI (order 는 수동 입력 또는 추가/삭제 시 자동 부여)
- 자동 저장 (변경 사항이 많지 않으니 명시적 저장 버튼만)
- 단위/E2E 테스트 (apps/web 에 아직 테스트 환경 미설정)
