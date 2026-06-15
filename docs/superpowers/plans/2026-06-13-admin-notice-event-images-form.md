# 단위 B — 어드민 공지 폼(행사정보 + 다중 본문 이미지) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 어드민 공지 작성/수정 폼에서 구조화된 행사정보(시작/종료 일시·장소·주최·대상)와 다중 본문 이미지를 입력하고, 생성·수정 API 페이로드로 전송한다.

**Architecture:** 프론트 타입(`packages/types`)에 행사·이미지 필드를 추가하고, 폼 상태(`NoticeFormState`)·페이로드 변환(`toCreatePayload`/신규 `toUpdatePayload`)에 배선. 다중 업로더는 기존 `useFileUploadMutation` + `validateImageFile`/`IMAGE_UPLOAD_POLICY` 를 재사용하는 신규 컴포넌트. 단위 A(백엔드)는 별도 PR이며, B는 프론트 자체 타입을 정의하므로 코드 의존이 없다(런타임은 A 배포 후 동작).

**Tech Stack:** Next.js 15 / React 19 / TypeScript / TanStack Query / vitest + Testing Library / pnpm workspaces.

**스펙:** `docs/superpowers/specs/2026-06-13-notice-detail-redesign-design.md` §4.

**검증 명령(프론트 루트 `frontend/`):**
- 타입체크: `pnpm --filter @duing/web typecheck` (+ 타입 패키지: `pnpm -r typecheck`)
- 린트: `pnpm --filter @duing/web lint`
- 단위 테스트: `pnpm --filter @duing/web test -- --run <경로>`

> **TDD 메모:** 타입 + 폼상태 + 페이로드 변환은 컴파일 의존이 묶인 수직 슬라이스라, 슬라이스를 먼저 만들고(typecheck green) 순수함수/폼 테스트를 뒤에 둔다. 각 커밋 시점마다 typecheck 통과.

---

## 파일 구조

| 파일 | 책임 | 작업 |
|------|------|------|
| `packages/types/src/notice.ts` | `NoticeEventInfo`, `NoticeDetail`·`CreateNoticePayload`·`UpdateNoticePayload` 확장 | Modify |
| `packages/types/src/club.ts` | `FilePurpose` 에 `'NOTICE_BODY'` 추가 | Modify |
| `apps/web/app/admin/notices/_lib/parseNoticeFormState.ts` | 폼상태·`toCreatePayload`·신규 `toUpdatePayload` | Modify |
| `apps/web/app/_components/ImageUploader.tsx` | `aspectRatio` 에 `'3/4'` 추가(대표 3:4 미리보기) | Modify |
| `apps/web/app/admin/notices/_components/NoticeBodyImagesUploader.tsx` | 다중 본문 이미지 업로더(추가·제거·순서) | Create |
| `apps/web/app/admin/notices/_components/NoticeForm.tsx` | 행사 정보 섹션 + 본문 이미지 섹션 + 대표 라벨/비율 | Modify |
| `apps/web/app/admin/notices/_pages/AdminNoticeEditPage.tsx` | `eventInfo`·`bodyImageUrls` → 초기 상태, `toUpdatePayload` 사용 | Modify |
| `apps/web/test/notices/notice-detail-page.test.tsx` | `makeDetail` 픽스처에 신규 필드 추가(typecheck) | Modify |
| `apps/web/test/admin/notices/parse-notice-form-state.test.ts` | 페이로드 변환 순수함수 테스트 | Create |
| `apps/web/test/admin/notices/notice-form.test.tsx` | 행사 입력 필드·본문 업로더 렌더 테스트 | Modify |

`AdminNoticeNewPage.tsx` 는 `toCreatePayload` 가 신규 필드를 자동 포함하므로 **변경 없음**. api client/hooks 도 페이로드 타입만 확장되므로 **변경 없음**.

---

## Task 0: 작업 브랜치
이미 `feat/admin-notice-event-images-form` 브랜치에서 작업 중이라고 가정한다(develop 분기). 아니라면:
```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing && git checkout develop && git pull --ff-only && git checkout -b feat/admin-notice-event-images-form
```

---

## Task 1: 타입 + 폼상태 + 페이로드 변환 (수직 슬라이스)

**Files:** `packages/types/src/notice.ts`, `packages/types/src/club.ts`, `apps/web/app/admin/notices/_lib/parseNoticeFormState.ts`, `apps/web/test/notices/notice-detail-page.test.tsx`

- [ ] **Step 1: `FilePurpose` 에 NOTICE_BODY 추가**

`packages/types/src/club.ts` 의 `FilePurpose` 를 교체:
```ts
export type FilePurpose = 'LOGO' | 'COVER' | 'PHOTO' | 'NOTICE_COVER' | 'NOTICE_BODY' | 'PROMOTION_BANNER' | 'GLOBAL_EVENT_COVER' | 'PROMOTION_REQUEST_BANNER';
```

- [ ] **Step 2: `notice.ts` 에 행사·이미지 타입 추가**

`packages/types/src/notice.ts` 상단(`NoticeCardItem` 위)에 추가:
```ts
export type NoticeEventInfo = {
  startAt: string;
  endAt: string | null;
  location: string | null;
  host: string | null;
  audience: string | null;
};
```
`NoticeDetail` 타입에 두 필드 추가(`updatedAt` 다음):
```ts
  updatedAt: string;
  bodyImageUrls: string[];
  eventInfo: NoticeEventInfo | null;
```
`CreateNoticePayload` 타입에 추가(`notifyOnPublish` 다음):
```ts
  notifyOnPublish: boolean;
  eventStartAt: string | null;
  eventEndAt: string | null;
  location: string | null;
  host: string | null;
  audience: string | null;
  bodyImageUrls: string[];
```
`UpdateNoticePayload` 를 교체(`clearEvent` 추가):
```ts
export type UpdateNoticePayload = Partial<Omit<CreateNoticePayload, 'targetClubIds'>> & {
  targetClubIds?: number[];
  clearExpiresAt?: boolean;
  clearEvent?: boolean;
};
```

- [ ] **Step 3: `parseNoticeFormState.ts` — 상태·EMPTY·변환 함수**

`apps/web/app/admin/notices/_lib/parseNoticeFormState.ts` 전체를 교체:
```ts
import type {
  CreateNoticePayload, NoticeCategory, NoticeClubScopeRole, NoticeVisibility, UpdateNoticePayload,
} from '@duing/types';

export type NoticeFormState = {
  title: string;
  summary: string;
  content: string;
  coverImageUrl: string;
  linkUrl: string;
  category: NoticeCategory;
  tags: string[];
  visibility: NoticeVisibility;
  clubScopeRole: NoticeClubScopeRole | null;
  targetClubIds: number[];
  pinned: boolean;
  expiresAt: string | null;
  notifyOnPublish: boolean;
  eventStartAt: string;
  eventEndAt: string;
  location: string;
  host: string;
  audience: string;
  bodyImageUrls: string[];
};

export const EMPTY_NOTICE_FORM: NoticeFormState = {
  title: '',
  summary: '',
  content: '',
  coverImageUrl: '',
  linkUrl: '',
  category: 'GENERAL',
  tags: [],
  visibility: 'PUBLIC',
  clubScopeRole: null,
  targetClubIds: [],
  pinned: false,
  expiresAt: null,
  notifyOnPublish: false,
  eventStartAt: '',
  eventEndAt: '',
  location: '',
  host: '',
  audience: '',
  bodyImageUrls: [],
};

function nullableTrimmed(value: string): string | null {
  return value.trim() === '' ? null : value.trim();
}

export function toCreatePayload(state: NoticeFormState): CreateNoticePayload {
  return {
    title: state.title.trim(),
    summary: state.summary.trim(),
    content: state.content,
    coverImageUrl: state.coverImageUrl,
    linkUrl: nullableTrimmed(state.linkUrl),
    category: state.category,
    tags: state.tags,
    visibility: state.visibility,
    clubScopeRole: state.visibility === 'CLUB_SCOPED' ? state.clubScopeRole : null,
    targetClubIds: state.visibility === 'CLUB_SCOPED' ? state.targetClubIds : [],
    pinned: state.pinned,
    expiresAt: state.expiresAt,
    notifyOnPublish: state.visibility === 'PUBLIC' ? state.notifyOnPublish : true,
    eventStartAt: state.eventStartAt === '' ? null : state.eventStartAt,
    eventEndAt: state.eventEndAt === '' ? null : state.eventEndAt,
    location: nullableTrimmed(state.location),
    host: nullableTrimmed(state.host),
    audience: nullableTrimmed(state.audience),
    bodyImageUrls: state.bodyImageUrls,
  };
}

export function toUpdatePayload(state: NoticeFormState): UpdateNoticePayload {
  const base = toCreatePayload(state);
  const allEventEmpty =
    state.eventStartAt === '' &&
    state.eventEndAt === '' &&
    state.location.trim() === '' &&
    state.host.trim() === '' &&
    state.audience.trim() === '';
  if (allEventEmpty) {
    return {
      ...base,
      eventStartAt: null,
      eventEndAt: null,
      location: null,
      host: null,
      audience: null,
      clearEvent: true,
    };
  }
  return base;
}
```

- [ ] **Step 4: `notice-detail-page.test.tsx` 픽스처에 신규 필드 추가**

`apps/web/test/notices/notice-detail-page.test.tsx` 의 `makeDetail` 기본 객체에서 `updatedAt: '2026-05-01T00:00:00Z',` 다음 줄에 추가:
```ts
    updatedAt: '2026-05-01T00:00:00Z',
    bodyImageUrls: [],
    eventInfo: null,
```

- [ ] **Step 5: typecheck**

Run: `cd frontend && pnpm -r typecheck`
Expected: 통과 (web + types 패키지).

- [ ] **Step 6: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add frontend/packages/types/src/notice.ts frontend/packages/types/src/club.ts frontend/apps/web/app/admin/notices/_lib/parseNoticeFormState.ts frontend/apps/web/test/notices/notice-detail-page.test.tsx
git commit -m "feat(web): 공지 행사정보·본문 이미지 타입·폼 페이로드 변환 추가"
```

---

## Task 2: 다중 본문 이미지 업로더 + 대표 3:4 미리보기

**Files:** `apps/web/app/_components/ImageUploader.tsx`, `apps/web/app/admin/notices/_components/NoticeBodyImagesUploader.tsx`

- [ ] **Step 1: `ImageUploader` 에 `'3/4'` 비율 추가**

`apps/web/app/_components/ImageUploader.tsx`:
(1) `aspectRatio?: '1/1' | '16/9' | '4/3';` → `aspectRatio?: '1/1' | '16/9' | '4/3' | '3/4';`
(2) `ASPECT_CLASS` 객체에 항목 추가:
```ts
const ASPECT_CLASS: Record<NonNullable<Props['aspectRatio']>, string> = {
  '1/1': 'aspect-square',
  '16/9': 'aspect-[16/9]',
  '4/3': 'aspect-[4/3]',
  '3/4': 'aspect-[3/4]',
};
```

- [ ] **Step 2: `NoticeBodyImagesUploader` 컴포넌트 작성**

`apps/web/app/admin/notices/_components/NoticeBodyImagesUploader.tsx` 생성:
```tsx
'use client';

import { useRef, useState } from 'react';
import { useFileUploadMutation } from '@duing/hooks';
import { IMAGE_UPLOAD_POLICY, validateImageFile } from '@/app/_components/imageUploadPolicy';
import { ImageWithFallback } from '@/app/_components/ImageWithFallback';

type Props = {
  value: string[];
  onChange: (urls: string[]) => void;
};

export function NoticeBodyImagesUploader({ value, onChange }: Props) {
  const uploadMutation = useFileUploadMutation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setErrors([]);
    const failures: string[] = [];
    const uploadedUrls: string[] = [];
    for (const file of Array.from(fileList)) {
      const validationError = validateImageFile(file);
      if (validationError) {
        failures.push(`${file.name}: ${validationError}`);
        continue;
      }
      try {
        const result = await uploadMutation.mutateAsync({ file, purpose: 'NOTICE_BODY' });
        uploadedUrls.push(result.url);
      } catch (uploadError) {
        failures.push(`${file.name}: ${uploadError instanceof Error ? uploadError.message : '업로드 실패'}`);
      }
    }
    if (uploadedUrls.length > 0) onChange([...value, ...uploadedUrls]);
    setErrors(failures);
    if (inputRef.current) inputRef.current.value = '';
  };

  const removeAt = (index: number) => onChange(value.filter((_, itemIndex) => itemIndex !== index));

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= value.length) return;
    const next = [...value];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <ul className="space-y-2">
          {value.map((url, index) => (
            <li key={`${url}-${index}`} className="flex items-center gap-3">
              <ImageWithFallback
                src={url}
                alt={`본문 이미지 ${index + 1}`}
                className="w-16 h-16 rounded-md overflow-hidden border border-line shrink-0"
              />
              <span className="flex-1 text-[12px] text-charcoal-2 truncate">{url}</span>
              <div className="flex gap-1">
                <button type="button" aria-label="위로 이동" onClick={() => move(index, -1)} disabled={index === 0}
                  className="px-2 py-1 rounded-md border border-line text-[12px] disabled:opacity-40">↑</button>
                <button type="button" aria-label="아래로 이동" onClick={() => move(index, 1)} disabled={index === value.length - 1}
                  className="px-2 py-1 rounded-md border border-line text-[12px] disabled:opacity-40">↓</button>
                <button type="button" aria-label="본문 이미지 제거" onClick={() => removeAt(index)}
                  className="px-2 py-1 rounded-md text-[12px] text-charcoal-2 hover:bg-graysoft">제거</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <input
        ref={inputRef}
        data-testid="body-images-input"
        type="file"
        multiple
        accept={IMAGE_UPLOAD_POLICY.acceptAttribute}
        className="hidden"
        onChange={(changeEvent) => { void handleFiles(changeEvent.target.files); }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploadMutation.isPending}
        className="px-3 py-1.5 rounded-md bg-paper border border-line text-[13px] font-semibold hover:border-ink disabled:opacity-50"
      >
        {uploadMutation.isPending ? '업로드 중…' : '본문 이미지 추가'}
      </button>
      <p className="text-[11.5px] text-charcoal-3">올린 비율 그대로 본문에 표시됩니다 · JPG · PNG · WEBP, 파일당 5MB</p>
      {errors.map((error) => (
        <p key={error} className="text-red-500 text-[12px]">{error}</p>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: typecheck + lint**

Run: `cd frontend && pnpm --filter @duing/web typecheck && pnpm --filter @duing/web lint`
Expected: 통과.

- [ ] **Step 4: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add frontend/apps/web/app/_components/ImageUploader.tsx frontend/apps/web/app/admin/notices/_components/NoticeBodyImagesUploader.tsx
git commit -m "feat(web): 공지 본문 다중 이미지 업로더·대표 3:4 미리보기 추가"
```

---

## Task 3: 폼·수정 페이지 배선

**Files:** `apps/web/app/admin/notices/_components/NoticeForm.tsx`, `apps/web/app/admin/notices/_pages/AdminNoticeEditPage.tsx`

- [ ] **Step 1: `NoticeForm` 에 import + 대표 라벨/비율 + 본문이미지·행사정보 섹션**

`NoticeForm.tsx`:
(1) import 추가(상단 import 블록):
```tsx
import { NoticeBodyImagesUploader } from './NoticeBodyImagesUploader';
```
(2) 대표 이미지 Field 를 교체(라벨 + 3:4 비율):
```tsx
      <Field label="대표 이미지 (3:4 세로형 권장)">
        <ImageUploader
          value={state.coverImageUrl}
          onChange={(url) => update('coverImageUrl', url)}
          purpose="NOTICE_COVER"
          aspectRatio="3/4"
          placeholder="대표 이미지를 업로드하세요"
          altText="대표 이미지"
        />
      </Field>
```
(3) "본문 (마크다운)" Field 바로 다음에 본문 이미지 섹션 추가:
```tsx
      <Field label="본문 이미지 (선택)">
        <NoticeBodyImagesUploader
          value={state.bodyImageUrls}
          onChange={(urls) => update('bodyImageUrls', urls)}
        />
      </Field>
```
(4) "외부 링크 (선택)" Field 바로 다음에 행사 정보 섹션 추가:
```tsx
      <fieldset className="space-y-3 rounded-md border border-line p-4">
        <legend className="px-1 text-[12.5px] font-semibold text-charcoal-2">행사 정보 (선택)</legend>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-[12px] text-charcoal-3 mb-1">시작 일시</span>
            <input
              type="datetime-local"
              value={state.eventStartAt}
              onChange={(event) => update('eventStartAt', event.target.value)}
              className="w-full px-3 py-2 rounded-md border border-line bg-paper text-[13.5px]"
            />
          </label>
          <label className="block">
            <span className="block text-[12px] text-charcoal-3 mb-1">종료 일시</span>
            <input
              type="datetime-local"
              value={state.eventEndAt}
              onChange={(event) => update('eventEndAt', event.target.value)}
              className="w-full px-3 py-2 rounded-md border border-line bg-paper text-[13.5px]"
            />
          </label>
        </div>
        <label className="block">
          <span className="block text-[12px] text-charcoal-3 mb-1">장소</span>
          <input
            type="text" maxLength={200}
            value={state.location}
            onChange={(event) => update('location', event.target.value)}
            className="w-full px-3.5 py-2 rounded-md border border-line bg-paper text-[14px]"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-[12px] text-charcoal-3 mb-1">주최</span>
            <input
              type="text" maxLength={200}
              value={state.host}
              onChange={(event) => update('host', event.target.value)}
              className="w-full px-3.5 py-2 rounded-md border border-line bg-paper text-[14px]"
            />
          </label>
          <label className="block">
            <span className="block text-[12px] text-charcoal-3 mb-1">대상</span>
            <input
              type="text" maxLength={200}
              value={state.audience}
              onChange={(event) => update('audience', event.target.value)}
              className="w-full px-3.5 py-2 rounded-md border border-line bg-paper text-[14px]"
            />
          </label>
        </div>
      </fieldset>
```

- [ ] **Step 2: `AdminNoticeEditPage` — 초기 상태 매핑 + `toUpdatePayload`**

`AdminNoticeEditPage.tsx`:
(1) import 변경:
```tsx
import {
  EMPTY_NOTICE_FORM,
  toUpdatePayload,
  type NoticeFormState,
} from '../_lib/parseNoticeFormState';
```
(2) `initialState` 객체에 필드 추가(`notifyOnPublish: notice.notifyOnPublish,` 다음):
```tsx
    notifyOnPublish: notice.notifyOnPublish,
    eventStartAt: notice.eventInfo?.startAt ? notice.eventInfo.startAt.slice(0, 16) : '',
    eventEndAt: notice.eventInfo?.endAt ? notice.eventInfo.endAt.slice(0, 16) : '',
    location: notice.eventInfo?.location ?? '',
    host: notice.eventInfo?.host ?? '',
    audience: notice.eventInfo?.audience ?? '',
    bodyImageUrls: notice.bodyImageUrls,
```
(3) onSubmit 안의 `const payload = toCreatePayload(state);` → `const payload = toUpdatePayload(state);`

- [ ] **Step 3: typecheck + lint**

Run: `cd frontend && pnpm --filter @duing/web typecheck && pnpm --filter @duing/web lint`
Expected: 통과.

- [ ] **Step 4: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add frontend/apps/web/app/admin/notices/_components/NoticeForm.tsx frontend/apps/web/app/admin/notices/_pages/AdminNoticeEditPage.tsx
git commit -m "feat(web): 어드민 공지 폼에 행사정보·본문 이미지 입력 연결"
```

---

## Task 4: 테스트

**Files:** `apps/web/test/admin/notices/parse-notice-form-state.test.ts`, `apps/web/test/admin/notices/notice-form.test.tsx`

- [ ] **Step 1: 페이로드 변환 순수함수 테스트 작성**

`apps/web/test/admin/notices/parse-notice-form-state.test.ts` 생성:
```ts
import { describe, expect, it } from 'vitest';
import {
  EMPTY_NOTICE_FORM,
  toCreatePayload,
  toUpdatePayload,
  type NoticeFormState,
} from '../../../app/admin/notices/_lib/parseNoticeFormState';

const filledEvent: NoticeFormState = {
  ...EMPTY_NOTICE_FORM,
  title: '박람회',
  summary: '요약',
  coverImageUrl: 'https://x/c.png',
  eventStartAt: '2026-09-25T10:00',
  eventEndAt: '2026-09-27T18:00',
  location: '중앙광장',
  host: '학생자치회',
  audience: '재학생',
  bodyImageUrls: ['https://x/b1.png', 'https://x/b2.png'],
};

describe('parseNoticeFormState', () => {
  it('toCreatePayload: 입력된 행사 필드와 본문 이미지가 그대로 담긴다', () => {
    const payload = toCreatePayload(filledEvent);
    expect(payload.eventStartAt).toBe('2026-09-25T10:00');
    expect(payload.eventEndAt).toBe('2026-09-27T18:00');
    expect(payload.location).toBe('중앙광장');
    expect(payload.bodyImageUrls).toEqual(['https://x/b1.png', 'https://x/b2.png']);
  });

  it('toCreatePayload: 비어 있는 행사 필드는 null 로 변환된다', () => {
    const payload = toCreatePayload({ ...EMPTY_NOTICE_FORM, coverImageUrl: 'https://x/c.png' });
    expect(payload.eventStartAt).toBeNull();
    expect(payload.eventEndAt).toBeNull();
    expect(payload.location).toBeNull();
    expect(payload.host).toBeNull();
    expect(payload.audience).toBeNull();
    expect(payload.bodyImageUrls).toEqual([]);
  });

  it('toUpdatePayload: 행사 필드가 모두 비면 clearEvent=true 를 보낸다', () => {
    const payload = toUpdatePayload({ ...EMPTY_NOTICE_FORM, coverImageUrl: 'https://x/c.png' });
    expect(payload.clearEvent).toBe(true);
    expect(payload.eventStartAt).toBeNull();
  });

  it('toUpdatePayload: 행사 필드가 하나라도 있으면 clearEvent 를 보내지 않는다', () => {
    const payload = toUpdatePayload(filledEvent);
    expect(payload.clearEvent).toBeUndefined();
    expect(payload.location).toBe('중앙광장');
  });
});
```

- [ ] **Step 2: `notice-form.test.tsx` — 행사 입력 필드·본문 업로더 모킹/렌더 테스트 추가**

`notice-form.test.tsx` 상단 모킹 블록(`NoticeMarkdownEditor` mock 다음)에 추가:
```tsx
vi.mock('../../../app/admin/notices/_components/NoticeBodyImagesUploader', () => ({
  NoticeBodyImagesUploader: ({ value }: { value: string[] }) => (
    <div data-testid="body-images-uploader">{value.length}</div>
  ),
}));
```
그리고 `describe('NoticeForm', ...)` 안 마지막 `it(...)` 다음에 테스트 추가:
```tsx
  it('행사 정보 입력 필드(시작/종료/장소/주최/대상)와 본문 이미지 업로더가 렌더링된다', () => {
    mockUseAdminClubsQuery.mockReturnValue(makeClubsResponse());

    render(
      <NoticeForm
        initialState={EMPTY_NOTICE_FORM}
        submitLabel="저장"
        isSubmitting={false}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByText('시작 일시')).toBeInTheDocument();
    expect(screen.getByText('종료 일시')).toBeInTheDocument();
    expect(screen.getByText('장소')).toBeInTheDocument();
    expect(screen.getByText('주최')).toBeInTheDocument();
    expect(screen.getByText('대상')).toBeInTheDocument();
    expect(screen.getByTestId('body-images-uploader')).toBeInTheDocument();
  });
```

- [ ] **Step 3: 테스트 실행**

Run: `cd frontend && pnpm --filter @duing/web test -- --run test/admin/notices/parse-notice-form-state.test.ts test/admin/notices/notice-form.test.tsx`
Expected: 모두 통과.

- [ ] **Step 4: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add frontend/apps/web/test/admin/notices/parse-notice-form-state.test.ts frontend/apps/web/test/admin/notices/notice-form.test.tsx
git commit -m "test(web): 공지 폼 행사정보·본문 이미지 페이로드 변환·렌더 테스트"
```

---

## Task 5: 프론트 전체 검증

- [ ] **Step 1: 타입체크·린트·테스트 전체**

Run: `cd frontend && pnpm -r typecheck && pnpm --filter @duing/web lint && pnpm --filter @duing/web test -- --run`
Expected: 전부 통과.

> 실패 시 systematic-debugging. PR 생성은 **사용자 지시 전까지 금지**.

---

## 완료 정의 (DoD)
- 어드민 작성/수정 폼에서 행사정보(시작·종료·장소·주최·대상)·다중 본문 이미지 입력 가능.
- 작성 시 빈 행사 필드는 null 로, 수정 시 행사 전체 비우면 `clearEvent` 전송.
- 본문 이미지는 `NOTICE_BODY` purpose 로 업로드되어 URL 배열로 전송(추가·제거·순서 이동).
- `pnpm -r typecheck` / lint / web test 전부 green. 커밋 4개, **푸시·PR 미수행**.
