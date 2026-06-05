# 이미지 업로드 통합 리팩토링 — Frontend (PR2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `<ImageUploader>` / `<ImageWithFallback>` 공통 컴포넌트를 신설하고, 기존 3개 업로더 wrapper 와 사용자 콘텐츠 이미지 표시처의 `<img>` 직접 사용을 모두 치환한다. 파일 형식/용량 검증을 프론트에서 즉시 차단해 서버 왕복을 줄인다.

**Architecture:** 공통 컴포넌트는 `apps/web/app/_components/` 에 단일 앱 전용으로 위치한다 (spec §4.1). 정책 상수는 `imageUploadPolicy.ts` 로 분리하고 컴포넌트가 import 한다. `<ImageWithFallback>` 내부는 이번 PR 에서 `<img>` 를 유지하며, lucide-react 의 `ImageOff` 아이콘을 placeholder/error UI 에 사용한다. 서버 에러 메시지는 `ApiError.message` 를 그대로 노출 (PR1 의 한국어 메시지를 별도 매핑 없이 사용).

**Tech Stack:** Next.js 15 App Router, React 19, TanStack Query v5, ky, vitest + React Testing Library, lucide-react (신규).

**Spec Reference:** `docs/superpowers/specs/2026-06-05-image-upload-consolidation-design.md` §4, §6, §7

**Prerequisite:** PR1 (`feat/image-upload-backend-validation`) 이 develop 에 머지되어 있어야 한다.

---

## File Structure

**Create:**
- `frontend/apps/web/app/_components/imageUploadPolicy.ts` — 정책 상수, 검증 헬퍼
- `frontend/apps/web/app/_components/ImageUploader.tsx` — 단일 이미지 업로더
- `frontend/apps/web/app/_components/ImageWithFallback.tsx` — 깨진 이미지 대응 표시 컴포넌트
- `frontend/apps/web/test/_components/ImageUploader.test.tsx`
- `frontend/apps/web/test/_components/ImageWithFallback.test.tsx`

**Modify:**
- `frontend/apps/web/package.json` — lucide-react 의존성 추가
- `frontend/apps/web/app/admin/notices/_components/NoticeForm.tsx` — wrapper 호출 제거, `<ImageUploader>` 직접 사용
- `frontend/apps/web/app/admin/global-events/_components/AdminGlobalEventForm.tsx` — 동일
- `frontend/apps/web/app/admin/promotions/_components/AdminPromotionForm.tsx` — 동일
- `frontend/apps/web/app/calendar/_components/EventDetailModal.tsx` — `<img>` → `<ImageWithFallback>`
- `frontend/apps/web/app/notices/_components/NoticeCard.tsx` — `<img>` → `<ImageWithFallback>`
- `frontend/apps/web/app/notices/[noticeId]/page.tsx` — `<img>` → `<ImageWithFallback>`
- `frontend/apps/web/app/notices/_pages/NoticePage.tsx` — `<img>` 2곳 → `<ImageWithFallback>`
- `frontend/apps/web/app/admin/promotions/_components/AdminPromotionsTable.tsx` — `<img>` → `<ImageWithFallback>`
- `frontend/apps/web/test/admin/notices/notice-form.test.tsx` — `NoticeCoverUploader` mock 경로를 `ImageUploader` 로 갱신

**Delete:**
- `frontend/apps/web/app/admin/notices/_components/NoticeCoverUploader.tsx`
- `frontend/apps/web/app/admin/global-events/_components/GlobalEventCoverUploader.tsx`
- `frontend/apps/web/app/admin/promotions/_components/PromotionBannerUploader.tsx`

---

## Task 1: lucide-react 설치 + 정책 상수 파일

**Files:**
- Modify: `frontend/apps/web/package.json`
- Create: `frontend/apps/web/app/_components/imageUploadPolicy.ts`

- [ ] **Step 1: lucide-react 설치**

```bash
cd frontend && pnpm add lucide-react --filter @duing/web
```

Expected: `package.json` 의 dependencies 에 `"lucide-react": "^X.X.X"` 추가, `pnpm-lock.yaml` 갱신.

- [ ] **Step 2: 정책 상수 파일 작성**

`frontend/apps/web/app/_components/imageUploadPolicy.ts`:

```ts
export const IMAGE_UPLOAD_POLICY = {
  maxBytes: 5 * 1024 * 1024,
  acceptedMimes: ['image/jpeg', 'image/png', 'image/webp'] as const,
  acceptAttribute: 'image/jpeg,image/png,image/webp',
} as const;

export type AcceptedMime = (typeof IMAGE_UPLOAD_POLICY.acceptedMimes)[number];

export function validateImageFile(file: File): string | null {
  if (file.size > IMAGE_UPLOAD_POLICY.maxBytes) {
    return '이미지 크기는 5MB 이하여야 합니다.';
  }
  if (!IMAGE_UPLOAD_POLICY.acceptedMimes.includes(file.type as AcceptedMime)) {
    return 'JPG, PNG, WEBP만 업로드 가능합니다.';
  }
  return null;
}
```

- [ ] **Step 3: 타입체크**

```bash
cd frontend && pnpm --filter @duing/web typecheck
```

Expected: 에러 없음.

- [ ] **Step 4: 커밋**

```bash
git add frontend/apps/web/package.json frontend/pnpm-lock.yaml frontend/apps/web/app/_components/imageUploadPolicy.ts
git commit -m "feat(frontend): 이미지 업로드 정책 상수 + lucide-react 설치"
```

---

## Task 2: ImageWithFallback 컴포넌트 (테스트 먼저)

**Files:**
- Create: `frontend/apps/web/app/_components/ImageWithFallback.tsx`
- Create: `frontend/apps/web/test/_components/ImageWithFallback.test.tsx`

- [ ] **Step 1: 실패하는 테스트 작성**

`frontend/apps/web/test/_components/ImageWithFallback.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ImageWithFallback } from '../../app/_components/ImageWithFallback';

describe('ImageWithFallback', () => {
  it('src 가 null 이면 emptyMessage 를 표시한다', () => {
    render(<ImageWithFallback src={null} alt="표지" emptyMessage="대표 이미지 없음" />);
    expect(screen.getByText('대표 이미지 없음')).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('src 가 빈 문자열이면 emptyMessage 를 표시한다', () => {
    render(<ImageWithFallback src="" alt="표지" />);
    expect(screen.getByText('대표 이미지 없음')).toBeInTheDocument();
  });

  it('src 가 있으면 img 를 렌더한다', () => {
    render(<ImageWithFallback src="https://example.com/a.jpg" alt="표지" />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', 'https://example.com/a.jpg');
    expect(img).toHaveAttribute('alt', '표지');
  });

  it('img 의 onError 가 발생하면 errorMessage 로 교체된다', () => {
    render(<ImageWithFallback src="https://example.com/broken.jpg" alt="표지" />);
    const img = screen.getByRole('img');
    fireEvent.error(img);
    expect(screen.getByText('이미지를 불러올 수 없습니다')).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
cd frontend && pnpm --filter @duing/web test -- ImageWithFallback
```

Expected: `Cannot find module '../../app/_components/ImageWithFallback'` (컴포넌트 미생성).

- [ ] **Step 3: 컴포넌트 구현**

`frontend/apps/web/app/_components/ImageWithFallback.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { ImageOff } from 'lucide-react';

type Props = {
  src: string | null | undefined;
  alt: string;
  className?: string;
  emptyMessage?: string;
  errorMessage?: string;
};

type State = 'empty' | 'loaded' | 'error';

export function ImageWithFallback({
  src,
  alt,
  className,
  emptyMessage = '대표 이미지 없음',
  errorMessage = '이미지를 불러올 수 없습니다',
}: Props) {
  const initial: State = src ? 'loaded' : 'empty';
  const [state, setState] = useState<State>(initial);

  useEffect(() => {
    setState(src ? 'loaded' : 'empty');
  }, [src]);

  const containerClass = `relative bg-graysoft ${className ?? ''}`;

  if (state === 'loaded' && src) {
    return (
      <div className={containerClass}>
        {/* eslint-disable-next-line @next/next/no-img-element -- next/image 도메인 화이트리스트는 후속 PR. */}
        <img
          src={src}
          alt={alt}
          className="absolute inset-0 w-full h-full object-cover"
          onError={() => setState('error')}
        />
      </div>
    );
  }

  const message = state === 'empty' ? emptyMessage : errorMessage;
  return (
    <div className={containerClass} role="img" aria-label={message}>
      <div className="absolute inset-0 grid place-items-center text-charcoal-3 text-[13px] gap-1">
        <ImageOff className="w-6 h-6" aria-hidden />
        <span>{message}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd frontend && pnpm --filter @duing/web test -- ImageWithFallback
```

Expected: 4/4 PASS.

> 만약 `screen.queryByRole('img')` 이 fallback 상태(`role="img"` 가 부여된 div) 도 잡으면, 테스트의 `expect(screen.queryByRole('img')).toBeNull()` 가 실패한다. 그 경우 테스트를 `getByRole('img', { hidden: false })` 대신 `screen.queryByAltText('표지')` 로 변경. (이번 구현은 fallback 컨테이너에 `role="img"` 를 부여하므로 명시적으로 alt 로 구분.)

수정 버전 테스트 (필요 시 Step 1 의 4개 케이스 갱신):

```tsx
it('src 가 null 이면 emptyMessage 를 표시한다', () => {
  render(<ImageWithFallback src={null} alt="표지" emptyMessage="대표 이미지 없음" />);
  expect(screen.getByText('대표 이미지 없음')).toBeInTheDocument();
  expect(screen.queryByAltText('표지')).toBeNull();
});
// ...
it('img 의 onError 가 발생하면 errorMessage 로 교체된다', () => {
  render(<ImageWithFallback src="https://example.com/broken.jpg" alt="표지" />);
  const img = screen.getByAltText('표지');
  fireEvent.error(img);
  expect(screen.getByText('이미지를 불러올 수 없습니다')).toBeInTheDocument();
  expect(screen.queryByAltText('표지')).toBeNull();
});
```

- [ ] **Step 5: 커밋**

```bash
git add frontend/apps/web/app/_components/ImageWithFallback.tsx frontend/apps/web/test/_components/ImageWithFallback.test.tsx
git commit -m "feat(frontend): ImageWithFallback (placeholder/error 상태 통합)"
```

---

## Task 3: ImageUploader 컴포넌트 (테스트 먼저)

**Files:**
- Create: `frontend/apps/web/app/_components/ImageUploader.tsx`
- Create: `frontend/apps/web/test/_components/ImageUploader.test.tsx`

- [ ] **Step 1: 실패하는 테스트 작성**

`useFileUploadMutation` 은 `@duing/hooks` 의 export. 직접 mock 하지 않고 (`frontend/CLAUDE.md` 의 "TanStack Query 내부 모킹 금지" 규칙), `@duing/hooks` 모듈을 `vi.mock` 으로 가로채 `useFileUploadMutation` 만 모의화한다 — 이미 `notice-form.test.tsx` 에서 사용 중인 패턴.

`frontend/apps/web/test/_components/ImageUploader.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mockMutateAsync = vi.fn();
const mockUseFileUploadMutation = vi.fn();

vi.mock('@duing/hooks', () => ({
  useFileUploadMutation: () => mockUseFileUploadMutation(),
}));

import { ImageUploader } from '../../app/_components/ImageUploader';
import { IMAGE_UPLOAD_POLICY } from '../../app/_components/imageUploadPolicy';

function setMutationState(state: {
  isPending?: boolean;
  isError?: boolean;
  errorMessage?: string;
}) {
  mockUseFileUploadMutation.mockReturnValue({
    mutateAsync: mockMutateAsync,
    isPending: state.isPending ?? false,
    isError: state.isError ?? false,
    error: state.errorMessage ? new Error(state.errorMessage) : null,
  });
}

function makeFile(name: string, type: string, size: number): File {
  const blob = new Blob([new Uint8Array(size)], { type });
  return new File([blob], name, { type });
}

describe('ImageUploader', () => {
  beforeEach(() => {
    mockMutateAsync.mockReset();
    mockUseFileUploadMutation.mockReset();
    setMutationState({});
  });

  it('5MB + 1 byte 파일을 선택하면 inline 에러를 표시하고 서버 호출이 일어나지 않는다', async () => {
    const onChange = vi.fn();
    render(<ImageUploader value="" onChange={onChange} purpose="NOTICE_COVER" />);
    const input = screen.getByTestId('image-uploader-input') as HTMLInputElement;
    const oversize = makeFile('big.jpg', 'image/jpeg', IMAGE_UPLOAD_POLICY.maxBytes + 1);
    fireEvent.change(input, { target: { files: [oversize] } });
    expect(await screen.findByText(/5MB 이하여야 합니다/)).toBeInTheDocument();
    expect(mockMutateAsync).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('image/gif 파일을 선택하면 inline 에러를 표시한다', async () => {
    const onChange = vi.fn();
    render(<ImageUploader value="" onChange={onChange} purpose="NOTICE_COVER" />);
    const input = screen.getByTestId('image-uploader-input') as HTMLInputElement;
    const gif = makeFile('a.gif', 'image/gif', 1024);
    fireEvent.change(input, { target: { files: [gif] } });
    expect(await screen.findByText(/JPG, PNG, WEBP만/)).toBeInTheDocument();
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it('정상 JPG 를 선택하면 mutateAsync 호출 후 onChange 가 발생한다', async () => {
    const onChange = vi.fn();
    mockMutateAsync.mockResolvedValue({ url: 'https://cdn.example.com/uploaded.jpg' });
    render(<ImageUploader value="" onChange={onChange} purpose="NOTICE_COVER" />);
    const input = screen.getByTestId('image-uploader-input') as HTMLInputElement;
    const jpg = makeFile('a.jpg', 'image/jpeg', 1024);
    fireEvent.change(input, { target: { files: [jpg] } });
    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledWith({ file: jpg, purpose: 'NOTICE_COVER' }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('https://cdn.example.com/uploaded.jpg'));
  });

  it('서버 에러 메시지를 그대로 표시한다', () => {
    setMutationState({ isError: true, errorMessage: '이미지 크기는 5MB 이하여야 합니다.' });
    render(<ImageUploader value="" onChange={vi.fn()} purpose="NOTICE_COVER" />);
    expect(screen.getByText('이미지 크기는 5MB 이하여야 합니다.')).toBeInTheDocument();
  });

  it('value 가 있으면 제거 버튼을 노출하고 클릭 시 onChange("") 호출', () => {
    const onChange = vi.fn();
    render(<ImageUploader value="https://cdn.example.com/x.jpg" onChange={onChange} purpose="NOTICE_COVER" />);
    fireEvent.click(screen.getByRole('button', { name: '제거' }));
    expect(onChange).toHaveBeenCalledWith('');
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
cd frontend && pnpm --filter @duing/web test -- ImageUploader
```

Expected: `Cannot find module '.../ImageUploader'`.

- [ ] **Step 3: 컴포넌트 구현**

`frontend/apps/web/app/_components/ImageUploader.tsx`:

```tsx
'use client';

import { useRef, useState } from 'react';
import { useFileUploadMutation } from '@duing/hooks';
import type { FilePurpose } from '@duing/types';
import { IMAGE_UPLOAD_POLICY, validateImageFile } from './imageUploadPolicy';
import { ImageWithFallback } from './ImageWithFallback';

type Props = {
  value: string;
  onChange: (url: string) => void;
  purpose: FilePurpose;
  aspectRatio?: '16/9' | '4/3';
  placeholder?: string;
  altText?: string;
};

const ASPECT_CLASS: Record<NonNullable<Props['aspectRatio']>, string> = {
  '16/9': 'aspect-[16/9]',
  '4/3': 'aspect-[4/3]',
};

export function ImageUploader({
  value,
  onChange,
  purpose,
  aspectRatio = '16/9',
  placeholder = '이미지를 업로드하세요',
  altText = '대표 이미지',
}: Props) {
  const uploadMutation = useFileUploadMutation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSelect = async (file: File) => {
    const validationError = validateImageFile(file);
    if (validationError) {
      setLocalError(validationError);
      return;
    }
    setLocalError(null);
    const result = await uploadMutation.mutateAsync({ file, purpose });
    onChange(result.url);
  };

  const serverError =
    uploadMutation.isError && uploadMutation.error instanceof Error
      ? uploadMutation.error.message
      : null;
  const displayError = localError ?? serverError;

  return (
    <div className="space-y-2">
      <ImageWithFallback
        src={value}
        alt={altText}
        className={`${ASPECT_CLASS[aspectRatio]} rounded-xl overflow-hidden border border-line`}
        emptyMessage={placeholder}
      />
      <div className="flex gap-2">
        <input
          ref={fileInputRef}
          data-testid="image-uploader-input"
          type="file"
          accept={IMAGE_UPLOAD_POLICY.acceptAttribute}
          className="hidden"
          onChange={(changeEvent) => {
            const file = changeEvent.target.files?.[0];
            if (file) void handleSelect(file);
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadMutation.isPending}
          className="px-3 py-1.5 rounded-md bg-paper border border-line text-[13px] font-semibold hover:border-ink disabled:opacity-50"
        >
          {uploadMutation.isPending ? '업로드 중…' : value ? '교체' : '업로드'}
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="px-3 py-1.5 rounded-md text-[13px] text-charcoal-2 hover:bg-graysoft"
          >
            제거
          </button>
        )}
      </div>
      {displayError && (
        <p className="text-red-500 text-[12px]">{displayError}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd frontend && pnpm --filter @duing/web test -- ImageUploader
```

Expected: 5/5 PASS.

- [ ] **Step 5: 커밋**

```bash
git add frontend/apps/web/app/_components/ImageUploader.tsx frontend/apps/web/test/_components/ImageUploader.test.tsx
git commit -m "feat(frontend): ImageUploader (클라이언트 검증 + 통합 미리보기)"
```

---

## Task 4: NoticeForm 마이그레이션 + NoticeCoverUploader 삭제

**Files:**
- Modify: `frontend/apps/web/app/admin/notices/_components/NoticeForm.tsx`
- Modify: `frontend/apps/web/test/admin/notices/notice-form.test.tsx`
- Delete: `frontend/apps/web/app/admin/notices/_components/NoticeCoverUploader.tsx`

- [ ] **Step 1: NoticeForm 호출부 수정**

`frontend/apps/web/app/admin/notices/_components/NoticeForm.tsx` 의 두 곳을 수정:

`import` 블록 (기존 `import { NoticeCoverUploader } from './NoticeCoverUploader';` 한 줄):

```tsx
import { ImageUploader } from '../../../_components/ImageUploader';
```

`<NoticeCoverUploader ... />` (대략 line 56):

```tsx
<ImageUploader
  value={state.coverImageUrl}
  onChange={(url) => update('coverImageUrl', url)}
  purpose="NOTICE_COVER"
  placeholder="대표 이미지를 업로드하세요"
  altText="대표 이미지"
/>
```

- [ ] **Step 2: notice-form 테스트 mock 경로 갱신**

`frontend/apps/web/test/admin/notices/notice-form.test.tsx` 의 `vi.mock` 블록을 수정:

```tsx
vi.mock('../../../app/_components/ImageUploader', () => ({
  ImageUploader: ({ value, onChange }: { value: string; onChange: (url: string) => void }) => (
    <input
      data-testid="cover-uploader"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));
```

(기존 `NoticeCoverUploader` mock 블록을 통째 교체.)

- [ ] **Step 3: NoticeCoverUploader 삭제**

```bash
rm frontend/apps/web/app/admin/notices/_components/NoticeCoverUploader.tsx
```

- [ ] **Step 4: 타입체크 + 테스트**

```bash
cd frontend && pnpm --filter @duing/web typecheck && pnpm --filter @duing/web test -- notice-form
```

Expected: 타입 에러 없음, notice-form 테스트 모두 PASS.

- [ ] **Step 5: 커밋**

```bash
git add frontend/apps/web/app/admin/notices/_components/ frontend/apps/web/test/admin/notices/notice-form.test.tsx
git commit -m "refactor(frontend): NoticeForm 이 ImageUploader 를 직접 사용 + NoticeCoverUploader 삭제"
```

---

## Task 5: AdminGlobalEventForm 마이그레이션 + GlobalEventCoverUploader 삭제

**Files:**
- Modify: `frontend/apps/web/app/admin/global-events/_components/AdminGlobalEventForm.tsx`
- Delete: `frontend/apps/web/app/admin/global-events/_components/GlobalEventCoverUploader.tsx`

- [ ] **Step 1: 호출부 수정**

`AdminGlobalEventForm.tsx` 의 두 곳:

`import` 라인 (기존 `import { GlobalEventCoverUploader } from './GlobalEventCoverUploader';` 교체):

```tsx
import { ImageUploader } from '../../../_components/ImageUploader';
```

`<GlobalEventCoverUploader ... />` (대략 line 77):

```tsx
<ImageUploader
  value={state.coverImageUrl}
  onChange={(url) => update('coverImageUrl', url)}
  purpose="GLOBAL_EVENT_COVER"
  placeholder="표지 이미지를 업로드하세요 (선택)"
  altText="표지 이미지"
/>
```

- [ ] **Step 2: 파일 삭제**

```bash
rm frontend/apps/web/app/admin/global-events/_components/GlobalEventCoverUploader.tsx
```

- [ ] **Step 3: 타입체크 + 관련 테스트**

```bash
cd frontend && pnpm --filter @duing/web typecheck && pnpm --filter @duing/web test -- global-event
```

Expected: 타입 에러 없음, 관련 테스트 모두 PASS (해당 폼 테스트가 wrapper 를 mock 했다면 동일하게 경로 수정 필요 — `grep -rn 'GlobalEventCoverUploader' frontend/apps/web/test` 로 확인).

- [ ] **Step 4: 커밋**

```bash
git add frontend/apps/web/app/admin/global-events/_components/
git commit -m "refactor(frontend): AdminGlobalEventForm 이 ImageUploader 를 직접 사용 + GlobalEventCoverUploader 삭제"
```

---

## Task 6: AdminPromotionForm 마이그레이션 + PromotionBannerUploader 삭제

**Files:**
- Modify: `frontend/apps/web/app/admin/promotions/_components/AdminPromotionForm.tsx`
- Delete: `frontend/apps/web/app/admin/promotions/_components/PromotionBannerUploader.tsx`

- [ ] **Step 1: 호출부 수정**

`AdminPromotionForm.tsx` 의 두 곳:

`import` 라인 (기존 `import { PromotionBannerUploader } from './PromotionBannerUploader';` 교체):

```tsx
import { ImageUploader } from '../../../_components/ImageUploader';
```

`<PromotionBannerUploader ... />` (대략 line 239):

```tsx
<ImageUploader
  value={state.bannerImageUrl}
  onChange={(url) => update('bannerImageUrl', url)}
  purpose="PROMOTION_BANNER"
  placeholder="배너 이미지를 업로드하세요"
  altText="배너 이미지"
/>
```

- [ ] **Step 2: 파일 삭제**

```bash
rm frontend/apps/web/app/admin/promotions/_components/PromotionBannerUploader.tsx
```

- [ ] **Step 3: 타입체크 + 관련 테스트**

```bash
cd frontend && pnpm --filter @duing/web typecheck && pnpm --filter @duing/web test -- promotion
```

Expected: 타입 에러 없음, PASS. `grep -rn 'PromotionBannerUploader' frontend/apps/web/test` 로 mock 잔존 여부 확인.

- [ ] **Step 4: 커밋**

```bash
git add frontend/apps/web/app/admin/promotions/_components/
git commit -m "refactor(frontend): AdminPromotionForm 이 ImageUploader 를 직접 사용 + PromotionBannerUploader 삭제"
```

---

## Task 7: 표시 컴포넌트 5곳 마이그레이션

**Files:**
- Modify: `frontend/apps/web/app/calendar/_components/EventDetailModal.tsx` (line 107-115)
- Modify: `frontend/apps/web/app/notices/_components/NoticeCard.tsx` (line 17-25)
- Modify: `frontend/apps/web/app/notices/[noticeId]/page.tsx` (line 71-78)
- Modify: `frontend/apps/web/app/notices/_pages/NoticePage.tsx` (line 445-455, line 522-532)
- Modify: `frontend/apps/web/app/admin/promotions/_components/AdminPromotionsTable.tsx` (line 41-55)

각 파일에서 `<div>` + `eslint-disable @next/next/no-img-element` 주석 + `<img>` 패턴을 `<ImageWithFallback>` 으로 치환한다. 컨테이너 className (aspect-ratio, rounded, overflow) 은 그대로 유지하되 안쪽 `<img>` 를 제거하고 `<ImageWithFallback>` 한 줄로 교체.

- [ ] **Step 1: EventDetailModal 교체**

상단 import 추가:
```tsx
import { ImageWithFallback } from '../../_components/ImageWithFallback';
```

기존 (대략 line 107-115):
```tsx
{detail.coverImageUrl && (
  <div className="aspect-[16/9] rounded-lg overflow-hidden bg-graysoft">
    {/* eslint-disable-next-line @next/next/no-img-element -- Supabase Storage URL */}
    <img
      src={detail.coverImageUrl}
      alt={detail.title}
      className="w-full h-full object-cover"
    />
  </div>
)}
```

교체:
```tsx
{detail.coverImageUrl && (
  <ImageWithFallback
    src={detail.coverImageUrl}
    alt={detail.title}
    className="aspect-[16/9] rounded-lg overflow-hidden"
  />
)}
```

- [ ] **Step 2: NoticeCard 교체**

상단 import:
```tsx
import { ImageWithFallback } from '../../_components/ImageWithFallback';
```

기존 (대략 line 17-25):
```tsx
<div className="...">
  {/* eslint-disable-next-line @next/next/no-img-element -- 외부 URL (Supabase Storage). next/image 도메인 화이트리스트는 후속 PR. */}
  <img
    src={notice.coverImageUrl}
    alt={notice.title}
    className="..."
  />
</div>
```

`<ImageWithFallback src={notice.coverImageUrl} alt={notice.title} className="..." />` 로 교체. 기존 컨테이너 className 을 `ImageWithFallback` 의 className prop 으로 옮긴다.

- [ ] **Step 3: notices/[noticeId]/page.tsx 교체**

상단 import:
```tsx
import { ImageWithFallback } from '../../_components/ImageWithFallback';
```

(상대 경로 정확하게: 파일이 `app/notices/[noticeId]/page.tsx` 이므로 `../../_components/ImageWithFallback`.)

기존 (line 71-78):
```tsx
<div className="relative aspect-[16/9] rounded-2xl overflow-hidden bg-graysoft mb-6">
  {/* eslint-disable-next-line @next/next/no-img-element -- 외부 URL (Supabase Storage). next/image 도메인 화이트리스트는 후속 PR. */}
  <img
    src={notice.coverImageUrl}
    alt={notice.title}
    className="absolute inset-0 w-full h-full object-cover"
  />
</div>
```

교체:
```tsx
<ImageWithFallback
  src={notice.coverImageUrl}
  alt={notice.title}
  className="aspect-[16/9] rounded-2xl overflow-hidden mb-6"
/>
```

- [ ] **Step 4: NoticePage.tsx 의 두 곳 교체**

상단 import:
```tsx
import { ImageWithFallback } from '../../_components/ImageWithFallback';
```

두 곳 (대략 line 445-455 + line 522-532) 모두 inline style 기반 `<div>` + `<img>` 패턴이다. inline style 이 className 으로 옮기기 어렵다면 `<ImageWithFallback>` 의 `className` 에 빈 클래스를 두고 외부 wrapper `<div style={{...}}>` 안에서 사용하는 형태로 변형 — 단, 외부 wrapper 가 다른 children 도 포함하지 않는 경우에 한해. 다른 children 이 함께 있으면 안쪽 `<div style>` 내부의 `<img>` 만 `<ImageWithFallback>` 으로 바꾼다.

line 445-455 예시 (감싸는 wrapper 가 사진만 담당):
```tsx
// before
<div style={{ flex: '0 0 140px', alignSelf: 'stretch', borderRadius: 12, overflow: 'hidden', background: ... }}>
  {/* eslint-disable-next-line @next/next/no-img-element -- 사용자 업로드 스토리지 URL */}
  <img src={n.coverImageUrl} alt="" aria-hidden style={{...}} />
</div>

// after — inline style 컨테이너를 유지하면서 안쪽만 교체
<div style={{ flex: '0 0 140px', alignSelf: 'stretch', borderRadius: 12, overflow: 'hidden' }}>
  <ImageWithFallback src={n.coverImageUrl} alt={n.title} className="w-full h-full" emptyMessage="이미지 없음" />
</div>
```

> `n.coverImageUrl` 이 `null` 일 수 있으면 기존 코드는 항상 `<img>` 를 렌더했는데 (잠재적 깨진 이미지), `<ImageWithFallback>` 은 자동으로 placeholder 처리한다. 동작 변경에 해당하지만 의도된 개선이다.

line 522-532 도 동일 패턴으로 처리.

- [ ] **Step 5: AdminPromotionsTable.tsx 교체**

상단 import:
```tsx
import { ImageWithFallback } from '../../../_components/ImageWithFallback';
```

기존 (line 41-55):
```tsx
<div className="relative w-16 h-9 rounded overflow-hidden bg-graysoft">
  {promotion.bannerImageUrl ? (
    // eslint-disable-next-line @next/next/no-img-element ...
    <img src={promotion.bannerImageUrl} alt={promotion.title} className="absolute inset-0 w-full h-full object-cover" />
  ) : (
    <span className="absolute inset-0 grid place-items-center text-[9px] text-charcoal-3">이미지 없음</span>
  )}
</div>
```

교체:
```tsx
<ImageWithFallback
  src={promotion.bannerImageUrl}
  alt={promotion.title}
  className="w-16 h-9 rounded overflow-hidden"
  emptyMessage="이미지 없음"
/>
```

- [ ] **Step 6: 타입체크 + 전체 테스트**

```bash
cd frontend && pnpm --filter @duing/web typecheck && pnpm --filter @duing/web test
```

Expected: 타입 에러 없음, 전체 테스트 PASS.

- [ ] **Step 7: 커밋**

```bash
git add frontend/apps/web/app/calendar/_components/EventDetailModal.tsx \
        frontend/apps/web/app/notices/_components/NoticeCard.tsx \
        frontend/apps/web/app/notices/\[noticeId\]/page.tsx \
        frontend/apps/web/app/notices/_pages/NoticePage.tsx \
        frontend/apps/web/app/admin/promotions/_components/AdminPromotionsTable.tsx
git commit -m "refactor(frontend): 외부 Storage URL 표시처를 ImageWithFallback 으로 통합"
```

---

## Task 8: 빌드 검증 + dev 서버 수동 확인

**Files:** (수정 없음)

- [ ] **Step 1: 프로덕션 빌드**

```bash
cd frontend && pnpm --filter @duing/web build
```

Expected: 빌드 성공. 외부 이미지가 모두 `<img>` 또는 `<ImageWithFallback>` 내부 `<img>` 이므로 `next/image` 도메인 설정 변경 불필요.

- [ ] **Step 2: dev 서버 기동**

```bash
cd frontend && pnpm --filter @duing/web dev
```

브라우저에서 다음을 수동 확인:
1. `/admin/notices/new` — 대표 이미지 슬롯에 placeholder ("대표 이미지를 업로드하세요") 노출
2. JPG 1MB 업로드 → 미리보기 표시 + "교체"/"제거" 버튼 노출
3. GIF 업로드 시도 → "JPG, PNG, WEBP만 업로드 가능합니다." inline 에러
4. 6MB 파일 업로드 시도 → "이미지 크기는 5MB 이하여야 합니다." inline 에러
5. `/admin/global-events/new` 동일 검증
6. `/admin/promotions/new` 동일 검증
7. `/notices` 목록 + `/notices/{id}` 상세에서 깨진 src 시 fallback UI (개발자 도구 Network 탭에서 이미지 응답을 차단해 확인)
8. `/calendar` + GlobalEvent 이벤트 클릭 → 표지 이미지 정상 + 깨진 URL 시 fallback

- [ ] **Step 3: 변경 없음 — 다음 태스크로 이동**

빌드 실패나 수동 확인 실패 시 해당 태스크로 돌아가 수정. 모두 성공이면 다음 태스크.

---

## Task 9: PR 생성

**Files:** (수정 없음)

- [ ] **Step 1: 브랜치 push**

```bash
git push -u origin feat/image-upload-frontend-consolidation
```

(작업 시작 시 `develop` 에서 분기한 브랜치명. 미생성 상태라면 `git checkout -b feat/image-upload-frontend-consolidation develop` 후 push.)

- [ ] **Step 2: PR 생성**

```bash
gh pr create --base develop --title "feat(frontend): 이미지 업로더 통합 + ImageWithFallback 도입" --body "$(cat <<'EOF'
## 🚀 작업 내용

3개 도메인(Notice / GlobalEvent / Promotion) 에서 거의 동일했던 업로더 wrapper 세 파일을 삭제하고, `<ImageUploader purpose="..." />` 형태로 호출처가 직접 사용하도록 했다. 동시에 사용자 콘텐츠 이미지를 표시하던 모든 곳의 `<img>` 직접 사용을 `<ImageWithFallback>` 으로 치환해 깨진 이미지 노출을 차단했다.

업로드 검증은 PR1 (백엔드 5MB / JPG·PNG·WEBP) 과 동일 정책을 프론트에서 즉시 적용해 위반 시 서버 왕복 없이 inline 에러로 안내한다. 서버에서 다른 사유로 400 이 반환되면 `ApiError.message` 를 그대로 같은 자리에 노출하므로 검증 메시지가 양쪽에서 일관된다.

## 🤔 고민했던 내용

공통 컴포넌트를 `packages/ui` 신설로 올리지 않고 `apps/web/app/_components/` 에 두었다. 현재 `packages` 는 도메인 로직 패키지만 있고 React 컴포넌트 전용 패키지가 없는데, 새 패키지 신설은 번들러/types 빌드 파이프라인이 추가로 따라온다. 사용처가 `apps/web` 내부 3개 도메인 + 표시 5곳뿐이라 인프라 비용에 비해 이득이 없다고 판단했다. 향후 `apps/mobile` 등 추가 컨슈머가 생기면 그 시점에 승격한다.

\`next/image\` 전환은 이번 PR 에서 미루었다. \`<ImageWithFallback>\` 의 인터페이스 (\`src\`, \`alt\`, \`className\`, fallback messages) 가 \`next/image\` 와 호환되므로 후속 PR 에서 내부 구현만 교체하면 된다.

## 💬 리뷰 중점사항

- ImageUploader 의 `purpose` prop 만으로 도메인별 차이를 충분히 표현하는지
- ImageWithFallback 의 fallback UI (lucide ImageOff + 한국어 안내) 가 페이지마다 어색하지 않은지
- NoticePage.tsx 의 inline style 컨테이너 처리가 깔끔한지
- 미리보기 영역이 src=null 일 때 placeholder 가 자연스러운지

## Prerequisite

PR1 (백엔드 검증) 머지 완료 — 백엔드 한국어 에러 메시지를 그대로 노출한다.

## Spec / Out of Scope

- 설계: \`docs/superpowers/specs/2026-06-05-image-upload-consolidation-design.md\`
- Out of Scope: next/image 전환, Magic Number 검증, Storage orphan cleanup, PhotoUploader 통합
EOF
)"
```

- [ ] **Step 3: CI 통과 확인**

`frontend-ci.yml` 의 lint / typecheck / build / test 가 모두 PASS 인지 확인.

---

## Self-Review

**Spec 커버리지:**
- §4.1 (위치 결정) = Task 2/3 모두 `apps/web/app/_components/` 사용
- §4.2 (wrapper 제거) = Task 4/5/6
- §4.3 (MIME 한계) = 백엔드 PR1 에 해당, 프론트 영향 없음
- §4.4 (next/image 미포함) = ImageWithFallback 내부 `<img>` 유지
- §6.1 (정책 상수) = Task 1
- §6.2 (ImageUploader) = Task 3
- §6.3 (ImageWithFallback) = Task 2
- §6.4 (호출처 마이그레이션) = Task 4/5/6 (업로더), Task 7 (표시 컴포넌트)

**플레이스홀더:** 없음. 모든 단계에 전체 코드 또는 정확한 명령 포함.

**타입 일관성:**
- `ImageUploaderProps` 의 `purpose: FilePurpose` ↔ `useFileUploadMutation` 의 `purpose: FilePurpose` 일치
- `ImageWithFallback` 의 `src: string | null | undefined` ↔ 호출처(Notice/Promotion/GlobalEvent) 의 `coverImageUrl: string | null` 호환
- 정책 상수 `IMAGE_UPLOAD_POLICY.maxBytes` ↔ 백엔드 `FileUploadPolicy.MAX_BYTES` 값 동일 (5 _ 1024 _ 1024)

**잠재 위험:**
- `notice-form.test.tsx` 의 mock 경로 갱신을 누락하면 테스트가 실제 `ImageUploader` 를 렌더하고 `useFileUploadMutation` mock 부재로 실패한다 — Task 4 Step 2 에서 처리.
- 다른 폼 테스트가 `GlobalEventCoverUploader` / `PromotionBannerUploader` 를 mock 했는지 Task 5/6 Step 3 의 grep 으로 확인.
- `NoticePage.tsx` 의 inline style + 외부 wrapper 처리는 케이스별 판단 필요 — Task 7 Step 4 의 가이드 라인 참조.
