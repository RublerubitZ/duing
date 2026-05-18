# FE-2: 활동사진 페이지 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** LEADER/OFFICER 가 자기 동아리의 활동사진을 업로드·캡션 수정·드래그 정렬·삭제할 수 있는 페이지(`/manage/clubs/[clubId]/photos`)를 추가한다.

**Architecture:** App Router Client Page. 데이터는 신규/기존 훅 5종으로 처리.
- 업로드: `PhotoUploader` → 멀티 파일 select → 각각 `POST /api/v1/files?purpose=PHOTO` (multipart) → 반환된 `storageKey` 로 `POST /api/v1/clubs/{clubId}/photos`. 파일별 순차 처리, 실패 시 해당 파일만 에러 표시.
- 정렬: dnd-kit 의 `SortableContext` + `useSortable`. 드래그 종료 시 로컬 state 즉시 업데이트, 1초 debounce 후 `PUT /api/v1/clubs/{clubId}/photos/order` 일괄 호출. 실패 시 직전 순서로 롤백 + 에러 표시.
- 캡션: 카드 내 inline edit → 포커스 아웃/Enter 시 `PATCH /clubs/{clubId}/photos/{photoId}`. 변경 없으면 호출 안 함.
- 삭제: confirm 모달 → `DELETE /clubs/{clubId}/photos/{photoId}` → 캐시 무효화.

권한 분기: ManageGuard 가 이미 LEADER/OFFICER 만 통과시키므로 페이지 내 추가 분기 불필요.

**Tech Stack:** Next.js 15 App Router / React 19 / TanStack Query / `@dnd-kit/core` + `@dnd-kit/sortable` (신규 의존성) / ky (`@duing/api`)

**Spec:** `docs/superpowers/specs/2026-05-18-phase-3-club-info-photos-members-design.md` §3.2 a~d, §8.B

---

## File Map

**Create**
- `frontend/apps/web/app/manage/clubs/[clubId]/photos/page.tsx`
- `frontend/apps/web/app/manage/clubs/[clubId]/photos/_components/PhotoUploader.tsx`
- `frontend/apps/web/app/manage/clubs/[clubId]/photos/_components/PhotoGrid.tsx`
- `frontend/apps/web/app/manage/clubs/[clubId]/photos/_components/PhotoCard.tsx`

**Modify**
- `frontend/packages/types/src/club.ts` — `CreateClubPhotoPayload`, `UpdateClubPhotoPayload`, `ReorderClubPhotosPayload`, `PhotoOrderItem`, `FileUploadResult`, `FilePurpose` 타입 추가
- `frontend/packages/api/src/client.ts` — `files.upload(file, purpose)` + `clubs.createPhoto / updatePhoto / reorderPhotos / deletePhoto` 4개 메서드
- `frontend/packages/hooks/src/clubs.ts` — `useCreatePhotoMutation` / `useUpdatePhotoMutation` / `useReorderPhotosMutation` / `useDeletePhotoMutation` 4개 훅 (+ index.ts export)
- `frontend/apps/web/app/manage/_components/ManageNav.tsx` — "활동사진" 링크 추가 (동아리 정보 아래)
- `frontend/apps/web/package.json` — `@dnd-kit/core` `@dnd-kit/sortable` 추가
- `frontend/pnpm-lock.yaml` — 자동 갱신

**없음**
- 신규 패키지 디렉터리 (`packages/*` 변경 X)
- 신규 ENV
- 백엔드 변경 (BE-2 #77 머지로 모든 API 준비됨)

---

## Task 1: 브랜치 생성 + dnd-kit 의존성 추가

- [ ] **Step 1: develop 동기화 + 분기**

```bash
git checkout develop
git pull origin develop
git checkout -b feat/fe-2-club-photos
```

- [ ] **Step 2: dnd-kit 설치**

```bash
cd frontend
pnpm --filter @duing/web add @dnd-kit/core @dnd-kit/sortable
```

- [ ] **Step 3: 잠금파일 변경 확인 + 커밋**

```bash
git status
git add frontend/apps/web/package.json frontend/pnpm-lock.yaml
git commit -m "chore(frontend): @dnd-kit/core, @dnd-kit/sortable 추가 (활동사진 드래그 정렬용)"
```

---

## Task 2: 타입 추가

**Files:**
- Modify: `frontend/packages/types/src/club.ts`

- [ ] **Step 1: 타입 record 추가**

파일 끝에:

```ts
export type FilePurpose = 'LOGO' | 'COVER' | 'PHOTO';

export type FileUploadResult = {
  storageKey: string;
  url: string;
};

export type CreateClubPhotoPayload = {
  storageKey: string;
  caption?: string | null;
  width?: number | null;
  height?: number | null;
};

export type UpdateClubPhotoPayload = {
  caption?: string | null;
};

export type PhotoOrderItem = {
  photoId: number;
  displayOrder: number;
};

export type ReorderClubPhotosPayload = {
  items: PhotoOrderItem[];
};
```

- [ ] **Step 2: 타입체크 + 커밋**

```bash
cd frontend && pnpm typecheck 2>&1 | tail -8
git add frontend/packages/types/src/club.ts
git commit -m "feat(frontend): 활동사진 CUD/업로드 타입 추가"
```

---

## Task 3: API 클라이언트 — files.upload + clubs photo CUD

**Files:**
- Modify: `frontend/packages/api/src/client.ts`

- [ ] **Step 1: import 보강 + `files` 그룹 신설 + clubs photo 메서드 4개 추가**

imports 추가:
```ts
  ClubPhoto,
  CreateClubPhotoPayload,
  UpdateClubPhotoPayload,
  ReorderClubPhotosPayload,
  FileUploadResult,
  FilePurpose,
```
(이미 `ClubPhoto` 가 있으면 중복 추가 금지)

`DuingApiClient` 타입(또는 ApiClient 라는 이름) 에 새 시그니처 추가:
```ts
  files: {
    upload: (file: File, purpose: FilePurpose) => Promise<FileUploadResult>;
  };
```
(다른 그룹과 동일 형식. clubs 그룹 안 또는 옆에 둠 — 기존 그룹 구분을 따른다.)

`clubs` 그룹 안에 4개 메서드 추가 (`photos: (clubId) => ...` 옆):
```ts
    createPhoto: (clubId: number, payload: CreateClubPhotoPayload) => Promise<ClubPhoto>;
    updatePhoto: (clubId: number, photoId: number, payload: UpdateClubPhotoPayload) => Promise<void>;
    reorderPhotos: (clubId: number, payload: ReorderClubPhotosPayload) => Promise<ClubPhoto[]>;
    deletePhoto: (clubId: number, photoId: number) => Promise<void>;
```

런타임 구현 (`return { ... clubs: { ... }, files: { ... }, ... }` 블록):

```ts
    createPhoto: (clubId, payload) =>
      jsonOk<ClubPhoto>(http.post(`clubs/${clubId}/photos`, { json: payload })),
    updatePhoto: (clubId, photoId, payload) =>
      jsonVoid(http.patch(`clubs/${clubId}/photos/${photoId}`, { json: payload })),
    reorderPhotos: (clubId, payload) =>
      jsonOk<ClubPhoto[]>(http.put(`clubs/${clubId}/photos/order`, { json: payload })),
    deletePhoto: (clubId, photoId) =>
      jsonVoid(http.delete(`clubs/${clubId}/photos/${photoId}`)),
```

`files` 그룹 (clubs 블록 바로 옆에 추가):
```ts
    files: {
      upload: (file, purpose) => {
        const body = new FormData();
        body.append('file', file);
        // ky 는 FormData 를 자동으로 multipart/form-data 로 처리한다.
        return jsonOk<FileUploadResult>(
          http.post('files', { body, searchParams: { purpose } }),
        );
      },
    },
```

- [ ] **Step 2: 타입체크 + 커밋**

```bash
cd frontend && pnpm typecheck 2>&1 | tail -8
git add frontend/packages/api/src/client.ts
git commit -m "feat(frontend): 활동사진 CUD + 파일 업로드 API 클라이언트 메서드 추가"
```

---

## Task 4: TanStack Query 훅 4개

**Files:**
- Modify: `frontend/packages/hooks/src/clubs.ts`
- Modify: `frontend/packages/hooks/src/index.ts`

- [ ] **Step 1: 훅 추가**

`packages/hooks/src/clubs.ts` 끝에:

```ts
import type {
  ClubSearchParams,
  CreateClubPhotoPayload,
  ReorderClubPhotosPayload,
  UpdateClubPayload,
  UpdateClubPhotoPayload,
} from '@duing/types';
```
(`UpdateClubPayload` 는 이미 있을 수 있음. import 묶음 보강.)

기존 export 뒤에:

```ts
export function useCreatePhotoMutation(clubId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateClubPhotoPayload) => client.clubs.createPhoto(clubId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clubQueryKeys.photos(clubId) });
    },
  });
}

export function useUpdatePhotoMutation(clubId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ photoId, payload }: { photoId: number; payload: UpdateClubPhotoPayload }) =>
      client.clubs.updatePhoto(clubId, photoId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clubQueryKeys.photos(clubId) });
    },
  });
}

export function useReorderPhotosMutation(clubId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ReorderClubPhotosPayload) => client.clubs.reorderPhotos(clubId, payload),
    onSuccess: (reordered) => {
      queryClient.setQueryData(clubQueryKeys.photos(clubId), reordered);
    },
  });
}

export function useDeletePhotoMutation(clubId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (photoId: number) => client.clubs.deletePhoto(clubId, photoId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clubQueryKeys.photos(clubId) });
    },
  });
}
```

- [ ] **Step 2: index.ts 에 export 확인**

`packages/hooks/src/index.ts` 가 `export * from './clubs'` 라면 자동 export. 명시 export 사용 중이면 4개 추가.

- [ ] **Step 3: 타입체크 + 커밋**

```bash
cd frontend && pnpm typecheck 2>&1 | tail -8
git add frontend/packages/hooks/src/clubs.ts frontend/packages/hooks/src/index.ts
git commit -m "feat(frontend): 활동사진 CUD 훅 4종 (create/update/reorder/delete) 추가"
```

---

## Task 5: PhotoUploader / PhotoGrid / PhotoCard 컴포넌트

**Files:**
- Create: 3개 컴포넌트

세 컴포넌트 모두 `'use client'`.

- [ ] **Step 1: PhotoUploader.tsx**

`frontend/apps/web/app/manage/clubs/[clubId]/photos/_components/PhotoUploader.tsx`:

```tsx
'use client';

import { useRef, useState } from 'react';
import { useApiClient } from '@duing/hooks';
import { useCreatePhotoMutation } from '@duing/hooks';

type PhotoUploaderProps = {
  clubId: number;
};

export function PhotoUploader({ clubId }: PhotoUploaderProps) {
  const client = useApiClient();
  const createPhoto = useCreatePhotoMutation(clubId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setBusy(true);
    setErrors([]);
    const failures: string[] = [];
    for (const file of Array.from(fileList)) {
      try {
        const uploaded = await client.files.upload(file, 'PHOTO');
        await createPhoto.mutateAsync({
          storageKey: uploaded.storageKey,
          caption: null,
          width: null,
          height: null,
        });
      } catch (err) {
        failures.push(`${file.name}: ${err instanceof Error ? err.message : '업로드 실패'}`);
      }
    }
    setErrors(failures);
    setBusy(false);
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        disabled={busy}
        onChange={(e) => handleFiles(e.target.files)}
        className="block text-sm"
      />
      {busy && <p className="text-sm text-slate-500">업로드 중…</p>}
      {errors.length > 0 && (
        <ul className="text-sm text-rose-600">
          {errors.map((message, idx) => <li key={idx}>{message}</li>)}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2: PhotoCard.tsx**

`frontend/apps/web/app/manage/clubs/[clubId]/photos/_components/PhotoCard.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ClubPhoto } from '@duing/types';
import { useDeletePhotoMutation, useUpdatePhotoMutation } from '@duing/hooks';

type PhotoCardProps = {
  clubId: number;
  photo: ClubPhoto;
};

export function PhotoCard({ clubId, photo }: PhotoCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: photo.id,
  });
  const updatePhoto = useUpdatePhotoMutation(clubId);
  const deletePhoto = useDeletePhotoMutation(clubId);

  const [caption, setCaption] = useState(photo.caption ?? '');
  const [error, setError] = useState<string | null>(null);

  async function commitCaption() {
    const next = caption.trim() || null;
    const prev = photo.caption ?? null;
    if (next === prev) return;
    try {
      await updatePhoto.mutateAsync({ photoId: photo.id, payload: { caption: next } });
    } catch (err) {
      setError(err instanceof Error ? err.message : '캡션 저장 실패');
      setCaption(prev ?? '');
    }
  }

  async function handleDelete() {
    if (!confirm('이 사진을 삭제할까요?')) return;
    try {
      await deletePhoto.mutateAsync(photo.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : '삭제 실패');
    }
  }

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}
      className="space-y-2 rounded-md border border-slate-200 bg-white p-2">
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="드래그하여 순서 변경"
        className="block w-full cursor-grab text-left active:cursor-grabbing"
      >
        <img src={photo.storageKey} alt={photo.caption ?? ''}
          className="aspect-square w-full rounded-sm object-cover" />
      </button>
      <input
        type="text"
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        onBlur={commitCaption}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        placeholder="캡션"
        maxLength={200}
        className="w-full rounded-sm border border-slate-200 px-1 py-0.5 text-xs"
      />
      <button
        type="button"
        onClick={handleDelete}
        className="text-xs text-slate-500 hover:text-rose-600"
      >
        삭제
      </button>
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 3: PhotoGrid.tsx**

`frontend/apps/web/app/manage/clubs/[clubId]/photos/_components/PhotoGrid.tsx`:

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import {
  DndContext, KeyboardSensor, PointerSensor,
  closestCenter, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import type { ClubPhoto } from '@duing/types';
import { useReorderPhotosMutation } from '@duing/hooks';
import { PhotoCard } from './PhotoCard';

type PhotoGridProps = {
  clubId: number;
  photos: ClubPhoto[];
};

const REORDER_DEBOUNCE_MS = 1000;

export function PhotoGrid({ clubId, photos }: PhotoGridProps) {
  // 드래그로 즉시 갱신되는 로컬 순서. server 갱신 성공 후 props 가 동기화될 때까지 사용.
  const [order, setOrder] = useState(photos);
  const reorder = useReorderPhotosMutation(clubId);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCommitted = useRef(photos);

  useEffect(() => {
    setOrder(photos);
    lastCommitted.current = photos;
  }, [photos]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = order.findIndex((p) => p.id === active.id);
    const newIndex = order.findIndex((p) => p.id === over.id);
    const next = arrayMove(order, oldIndex, newIndex);
    setOrder(next);
    scheduleReorder(next);
  }

  function scheduleReorder(next: ClubPhoto[]) {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(async () => {
      try {
        await reorder.mutateAsync({
          items: next.map((photo, idx) => ({ photoId: photo.id, displayOrder: idx })),
        });
        lastCommitted.current = next;
      } catch {
        // 실패 시 마지막으로 commit 된 순서로 롤백.
        setOrder(lastCommitted.current);
        alert('순서 저장에 실패했습니다. 다시 시도해주세요.');
      }
    }, REORDER_DEBOUNCE_MS);
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={order.map((p) => p.id)} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {order.map((photo) => (
            <PhotoCard key={photo.id} clubId={clubId} photo={photo} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
```

- [ ] **Step 4: 타입체크 + 커밋**

```bash
cd frontend && pnpm typecheck 2>&1 | tail -10
git add frontend/apps/web/app/manage/clubs/[clubId]/photos/_components/
git commit -m "feat(frontend): 활동사진 PhotoUploader/PhotoGrid/PhotoCard 컴포넌트 (dnd-kit 정렬)"
```

---

## Task 6: Page 라우트 + ManageNav 활성화

**Files:**
- Create: `frontend/apps/web/app/manage/clubs/[clubId]/photos/page.tsx`
- Modify: `frontend/apps/web/app/manage/_components/ManageNav.tsx`

- [ ] **Step 1: page.tsx**

```tsx
'use client';

import { use } from 'react';
import { notFound } from 'next/navigation';
import { useClubPhotosQuery, useManagedClubsQuery } from '@duing/hooks';
import { PhotoUploader } from './_components/PhotoUploader';
import { PhotoGrid } from './_components/PhotoGrid';

export default function ClubPhotosPage({
  params,
}: {
  params: Promise<{ clubId: string }>;
}) {
  const { clubId: clubIdParam } = use(params);
  const currentClubId = Number(clubIdParam);

  const { data: managedClubs, isLoading: isManagedClubsLoading } = useManagedClubsQuery();
  const { data: photos, isLoading: isPhotosLoading } = useClubPhotosQuery(
    isNaN(currentClubId) ? undefined : currentClubId,
  );

  if (isManagedClubsLoading || isPhotosLoading) {
    return <p className="p-6 text-sm text-slate-500">불러오는 중…</p>;
  }

  const managedClub = managedClubs?.find((club) => club.clubId === currentClubId);
  if (!managedClub) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-10">
      <header>
        <h1 className="text-xl font-bold">활동사진</h1>
        <p className="mt-1 text-sm text-slate-500">
          업로드 후 드래그로 순서를 바꿀 수 있습니다 (1초 후 자동 저장).
        </p>
      </header>

      <PhotoUploader clubId={currentClubId} />

      {photos && photos.length === 0 && (
        <p className="text-sm text-slate-500">아직 등록된 사진이 없습니다.</p>
      )}

      {photos && photos.length > 0 && (
        <PhotoGrid clubId={currentClubId} photos={photos} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: ManageNav 의 동아리 정보 블록에 "활동사진" 추가**

기존 "동아리 정보" 링크 아래에 활동사진 링크 추가 (멤버 관리 disabled 옆):

```tsx
        <Link
          href={toRoute(`/manage/clubs/${currentClubId}/photos`)}
          className={cn(
            'block rounded-md px-3 py-2 text-sm font-medium',
            pathname.startsWith(toRoute(`/manage/clubs/${currentClubId}/photos`))
              ? 'bg-slate-900 text-white'
              : 'text-slate-700 hover:bg-slate-100',
          )}
        >
          활동사진
        </Link>
```

(동아리 정보 링크 바로 아래에 둠. 멤버 관리 disabled placeholder 는 유지 — FE-3 에서 활성화.)

- [ ] **Step 3: 타입체크 + 빌드**

```bash
cd frontend && pnpm typecheck 2>&1 | tail -10
pnpm --filter web build 2>&1 | tail -15
```

Expected: 둘 다 통과.

- [ ] **Step 4: 커밋**

```bash
git add frontend/apps/web/app/manage/clubs/[clubId]/photos/page.tsx \
        frontend/apps/web/app/manage/_components/ManageNav.tsx
git commit -m "feat(frontend): 활동사진 페이지 라우트 + 좌측 네비 활성화"
```

---

## Task 7: 수동 확인 + 푸시 + PR

- [ ] **Step 1: dev 서버 가동 후 시나리오 확인**

```bash
cd frontend && pnpm --filter web dev
```

브라우저 (LEADER 또는 OFFICER 로그인) 에서:
1. `/manage/clubs/{clubId}/photos` 진입 → 빈 상태 메시지
2. 사진 2~3장 동시 업로드 → 카드가 displayOrder 순서대로 등장
3. 드래그로 순서 변경 → 1초 후 토스트 없이 조용히 저장 → 새로고침 시 순서 유지
4. 캡션 입력 후 Enter/blur → 저장 → 새로고침 시 유지
5. 삭제 confirm → 카드 제거 → 새로고침 시 안 보임
6. MEMBER 계정은 ManageGuard 단계에서 진입 차단 — 확인용으로 한 번만

- [ ] **Step 2: 푸시**

```bash
git push -u origin feat/fe-2-club-photos
```

- [ ] **Step 3: PR 생성**

```bash
gh pr create --base develop --title "feat(frontend): 활동사진 페이지 (/manage/clubs/[clubId]/photos)" --body "$(cat <<'EOF'
## 🚀 작업 내용
LEADER/OFFICER 가 자기 동아리의 활동사진을 업로드·캡션 수정·드래그 정렬·삭제할 수 있는 `/manage/clubs/[clubId]/photos` 페이지를 추가했다. BE-2 (#77) 의 4개 엔드포인트와 짝이 되는 화면이다.

- 업로드: 멀티 파일 select → 파일별 `POST /api/v1/files?purpose=PHOTO` → 반환된 `storageKey` 로 `POST /clubs/{clubId}/photos`. 일부 파일이 실패해도 나머지는 진행하고 실패 목록만 표시.
- 정렬: dnd-kit 의 `SortableContext` + 드래그 종료 시 로컬 state 즉시 갱신, 1초 debounce 후 `PUT /clubs/{clubId}/photos/order` 일괄 저장. 실패 시 직전 순서로 롤백.
- 캡션: 카드 내 inline `<input>` 의 blur/Enter 시 변경된 경우에만 `PATCH`.
- 삭제: confirm 모달 → `DELETE`.

좌측 네비의 "활동사진" 링크도 동아리 정보 아래에 추가했다.

## 🤔 고민했던 내용
드래그 정렬을 BE 의 일괄 `PUT /photos/order` 와 맞물리도록 1초 debounce 로 수렴시켰다. 사용자가 여러 카드를 연속으로 옮겨도 마지막 상태만 한 번에 저장되어 트랜잭션 횟수를 줄인다. 실패 시 마지막 commit 된 순서로 롤백해 UI 와 서버 상태의 불일치를 방지.

업로드는 파일별 직렬 처리로 단순화했다. 병렬 업로드는 `displayOrder` 자동 부여(`MAX+1`) 가 동시 등록 시 같은 값을 줄 수 있어 부담스러움 (BE-2 PR 본문에도 명시한 한계). 직렬이면 매 호출이 직전 결과를 본 뒤 다음 `MAX` 를 계산하므로 안전.

dnd-kit 은 React 19 호환 + 키보드 접근성도 지원하는 표준 라이브러리라 선택. 신규 의존성 2개(`@dnd-kit/core`, `@dnd-kit/sortable`).

## 💬 리뷰 중점사항
- 드래그 후 1초 debounce 중 추가 드래그가 들어오면 이전 타이머를 취소하고 최신 순서로 보내는 흐름
- 업로드 일부 실패 시 UX (성공한 파일은 그대로 반영, 실패한 파일만 메시지)
- `useEffect` 로 props 변경을 로컬 order 에 반영하는 패턴 (서버에서 캐시 갱신 시 동기화)
EOF
)"
```

---

## 자체 점검 체크리스트 (PR 직전)

- [ ] BE-2 스펙 §3.2 의 4개 엔드포인트와 짝이 맞는다 (POST/PATCH/PUT order/DELETE)
- [ ] 업로드 → 카드 등장 → 드래그 → 캡션 → 삭제 흐름이 한 페이지에서 모두 동작
- [ ] 신규 의존성 2개 외 추가 라이브러리 없음
- [ ] `'use client'` 가 4개 신규 컴포넌트 + page 에 모두 있음
- [ ] 변수명 명확, `any`/`as` 없음
- [ ] 빌드/타입체크 통과
- [ ] 커밋 메시지 `feat(frontend)/chore(frontend): ...` 형식, Claude 어트리뷰션 없음
- [ ] 파일 끝 newline

---

## Out of Scope

- 사진 미리보기 모달 (lightbox) — 현재 카드의 `<img>` 만 표시
- 캡션 글자수 카운터 UI (maxLength 만 강제)
- 업로드 진행률 표시 (부울 busy 만 표시)
- 사진별 width/height 자동 측정 후 payload 전송 (현재는 null 로 보냄 — BE 가 nullable 허용)
- 페이지네이션 / 무한 스크롤 (사진 수가 적다는 전제)
- 단위/E2E 테스트 (apps/web 에 테스트 환경 미설정)
