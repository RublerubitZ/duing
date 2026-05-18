# FE-3: 멤버 관리 페이지 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** LEADER/OFFICER 가 자기 동아리의 멤버를 역할별로 조회하고, LEADER 는 승급/강등/강퇴/회장 인계/탈퇴를 할 수 있는 페이지 (`/manage/clubs/[clubId]/members`) 를 추가한다.

**Architecture:** App Router Client Page. 데이터는 5종 훅 + 단일 `useClubMembersQuery` 캐시.
- 권한 분기: `useMeQuery().id`(viewerUserId) + `useManagedClubsQuery()` 의 `myRole`(viewerRole) 조합으로 각 행의 액션 가시성 결정. ManageGuard 가 LEADER/OFFICER 만 통과시키므로 페이지 자체 분기 불필요.
- 승급/강등/탈퇴: 브라우저 `confirm()` (FE-2 패턴 유지).
- 강퇴: `RemoveMemberDialog` (얇은 inline 모달 — 대상 이름 + 되돌릴 수 없음 경고 + 확인).
- 회장 인계: `TransferLeaderDialog` 2단계 — (1) 대상 카드 + 경고, (2) 동아리명 타이핑 일치 시 "인계" 버튼 활성. 성공 시 `me()` + `managed()` 캐시 무효화로 viewerRole 이 OFFICER 로 자동 재계산.

**Tech Stack:** Next.js 15 App Router / React 19 / TanStack Query / ky (`@duing/api`). 신규 의존성 없음.

**Spec:** `docs/superpowers/specs/2026-05-18-phase-3-club-info-photos-members-design.md` §3.3~3.7, §8.C

---

## File Map

**Create**
- `frontend/apps/web/app/manage/clubs/[clubId]/members/page.tsx`
- `frontend/apps/web/app/manage/clubs/[clubId]/members/_components/MemberSection.tsx`
- `frontend/apps/web/app/manage/clubs/[clubId]/members/_components/MemberRow.tsx`
- `frontend/apps/web/app/manage/clubs/[clubId]/members/_components/RemoveMemberDialog.tsx`
- `frontend/apps/web/app/manage/clubs/[clubId]/members/_components/TransferLeaderDialog.tsx`

**Modify**
- `frontend/packages/types/src/clubmember.ts` — `ClubMember` 타입을 BE 응답에 맞춰 갈아끼우고 `UpdateMemberRolePayload`, `TransferLeaderResult` 추가
- `frontend/packages/api/src/client.ts` — `clubs.members / updateMemberRole / removeMember / leaveClub / transferLeader` 5개 메서드
- `frontend/packages/hooks/src/clubQueryKeys.ts` — `members(clubId)` 헬퍼 추가
- `frontend/packages/hooks/src/clubs.ts` — 1 query + 4 mutation 훅
- `frontend/packages/hooks/src/index.ts` — 신규 훅 5종 export
- `frontend/apps/web/app/manage/_components/ManageNav.tsx` — "멤버 관리" placeholder → active `<Link>`

**없음**
- 신규 라이브러리, 신규 ENV, 백엔드 변경 없음 (BE-3 #78, BE-4 #80 머지 완료).

---

## Task 1: 브랜치 + 타입 갱신

**Files:**
- Modify: `frontend/packages/types/src/clubmember.ts`

- [ ] **Step 1: develop 동기화 + 분기**

```bash
git checkout develop
git pull origin develop
git checkout -b feat/fe-3-club-members
```

- [ ] **Step 2: clubmember.ts 전체 교체**

`frontend/packages/types/src/clubmember.ts` 전체를 다음으로 교체한다.

```ts
// 동아리 단위 역할 (Club-scoped). 시스템 전역 역할은 UserRole 참조.
export type ClubMemberRole = 'MEMBER' | 'OFFICER' | 'LEADER';

export type ClubMember = {
  memberId: number;
  userId: number;
  name: string;
  studentId: string;
  role: ClubMemberRole;
  joinedAt: string;
};

// 승급/강등 페이로드. LEADER 는 받을 수 없음 (3.7 transferLeader 로만 변경).
export type UpdateMemberRolePayload = {
  role: 'OFFICER' | 'MEMBER';
};

export type TransferLeaderResult = {
  formerLeader: ClubMember;
  newLeader: ClubMember;
};
```

- [ ] **Step 3: 기존 `ClubMember` 사용처 확인 (없을 것)**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
grep -rn "ClubMember\b" frontend/packages frontend/apps --include="*.ts" --include="*.tsx" | grep -v "clubmember.ts\|node_modules"
```

Expected: 결과 없음 (현재 어디서도 import 하지 않음). 만약 결과가 있으면 STOP 하고 사용처 별로 `memberId`/`name`/`studentId` 필드 매칭하도록 보정.

- [ ] **Step 4: 타입체크 + 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm typecheck 2>&1 | tail -8
```

Expected: 모든 패키지 Done.

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add frontend/packages/types/src/clubmember.ts
git commit -m "feat(frontend): 멤버 타입을 BE 응답에 맞춰 갱신 + 역할 변경/회장 인계 타입 추가"
```

---

## Task 2: API 클라이언트 — 멤버 5종 메서드

**Files:**
- Modify: `frontend/packages/api/src/client.ts`

- [ ] **Step 1: imports 보강**

`@duing/types` import 블록(현재 30~40 줄 근처) 에 다음 4개를 추가한다 (위치는 알파벳 가까운 곳).

```ts
  ClubMember,
  UpdateMemberRolePayload,
  TransferLeaderResult,
```

(`ClubMember` 가 이미 있으면 중복 추가 금지. `useApiClient` 같은 export 는 건드리지 말 것.)

- [ ] **Step 2: `DuingApiClient` 의 `clubs` 그룹 type 시그니처 추가**

`clubs` 객체 type 안의 `deletePhoto(...)` 줄 바로 다음에 5줄 추가:

```ts
    members(clubId: number): Promise<ClubMember[]>;
    updateMemberRole(clubId: number, memberId: number, payload: UpdateMemberRolePayload): Promise<void>;
    removeMember(clubId: number, memberId: number): Promise<void>;
    leaveClub(clubId: number): Promise<void>;
    transferLeader(clubId: number, memberId: number): Promise<TransferLeaderResult>;
```

- [ ] **Step 3: 런타임 구현 추가**

`return { ... clubs: { ... } }` 블록의 `deletePhoto: (clubId, photoId) => ...` 바로 다음에 5개 메서드 추가. **`leaveClub` 의 path 가 `/me` 로 끝나는 점, `transferLeader` 가 POST 인 점에 주의.**

```ts
    members: (clubId) =>
      jsonOk<ClubMember[]>(http.get(`clubs/${clubId}/members`)),
    updateMemberRole: (clubId, memberId, payload) =>
      jsonVoid(http.patch(`clubs/${clubId}/members/${memberId}/role`, { json: payload })),
    removeMember: (clubId, memberId) =>
      jsonVoid(http.delete(`clubs/${clubId}/members/${memberId}`)),
    leaveClub: (clubId) =>
      jsonVoid(http.delete(`clubs/${clubId}/members/me`)),
    transferLeader: (clubId, memberId) =>
      jsonOk<TransferLeaderResult>(http.post(`clubs/${clubId}/members/${memberId}/transfer-leader`)),
```

- [ ] **Step 4: 타입체크 + 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm typecheck 2>&1 | tail -8
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add frontend/packages/api/src/client.ts
git commit -m "feat(frontend): 멤버 5종 API 클라이언트 메서드 (조회/역할변경/강퇴/탈퇴/회장인계)"
```

---

## Task 3: clubQueryKeys + 5개 훅

**Files:**
- Modify: `frontend/packages/hooks/src/clubQueryKeys.ts`
- Modify: `frontend/packages/hooks/src/clubs.ts`
- Modify: `frontend/packages/hooks/src/index.ts`

- [ ] **Step 1: clubQueryKeys 에 `members` 추가**

`frontend/packages/hooks/src/clubQueryKeys.ts` 의 `recruitments` 줄 바로 다음에 한 줄 추가.

```ts
  members: (clubId: number) => [...clubQueryKeys.all, clubId, 'members'] as const,
```

- [ ] **Step 2: 훅 5종 추가**

`frontend/packages/hooks/src/clubs.ts` 의 타입 import 블록(현재 `UpdateClubPhotoPayload` 같이 묶여 있음) 에 다음을 추가한다.

```ts
  TransferLeaderResult,
  UpdateMemberRolePayload,
```

(`ClubMember` 는 훅 안에서 명시적으로 안 써도 됨 — client.ts 의 반환 타입으로 추론된다.)

추가로 `userQueryKeys` 도 import 한다 (회장 인계 시 me() 캐시 무효화용). 파일 상단 import 영역에 추가:

```ts
import { userQueryKeys } from './userQueryKeys';
```

`useDeletePhotoMutation` 끝 (`}` 다음) 에 5개 훅을 이어 붙인다.

```ts
export function useClubMembersQuery(clubId: number | undefined) {
  const client = useApiClient();
  return useQuery({
    queryKey: clubId !== undefined ? clubQueryKeys.members(clubId) : ['clubs', undefined, 'members'],
    queryFn: () => {
      if (clubId === undefined) {
        throw new Error('clubId is required');
      }
      return client.clubs.members(clubId);
    },
    enabled: clubId !== undefined,
  });
}

export function useUpdateMemberRoleMutation(clubId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ memberId, payload }: { memberId: number; payload: UpdateMemberRolePayload }) =>
      client.clubs.updateMemberRole(clubId, memberId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clubQueryKeys.members(clubId) });
    },
  });
}

export function useRemoveMemberMutation(clubId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (memberId: number) => client.clubs.removeMember(clubId, memberId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clubQueryKeys.members(clubId) });
    },
  });
}

export function useLeaveClubMutation(clubId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => client.clubs.leaveClub(clubId),
    onSuccess: () => {
      // 떠난 동아리는 managed 목록에서 빠져야 한다.
      queryClient.invalidateQueries({ queryKey: clubQueryKeys.members(clubId) });
      queryClient.invalidateQueries({ queryKey: clubQueryKeys.managed() });
    },
  });
}

export function useTransferLeaderMutation(clubId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (memberId: number): Promise<TransferLeaderResult> =>
      client.clubs.transferLeader(clubId, memberId),
    onSuccess: () => {
      // 본인이 OFFICER 로 강등되었으므로 me() 와 managed() 도 무효화.
      queryClient.invalidateQueries({ queryKey: clubQueryKeys.members(clubId) });
      queryClient.invalidateQueries({ queryKey: clubQueryKeys.managed() });
      queryClient.invalidateQueries({ queryKey: userQueryKeys.me() });
    },
  });
}
```

- [ ] **Step 3: index.ts 에 export 추가**

`frontend/packages/hooks/src/index.ts` 의 clubs export 블록 (현재 `useDeletePhotoMutation,` 로 끝남) 에 5줄 추가.

```ts
  useClubMembersQuery,
  useUpdateMemberRoleMutation,
  useRemoveMemberMutation,
  useLeaveClubMutation,
  useTransferLeaderMutation,
```

- [ ] **Step 4: 타입체크 + 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm typecheck 2>&1 | tail -8
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add frontend/packages/hooks/src/clubQueryKeys.ts frontend/packages/hooks/src/clubs.ts frontend/packages/hooks/src/index.ts
git commit -m "feat(frontend): 멤버 조회/역할변경/강퇴/탈퇴/회장인계 훅 5종 추가"
```

---

## Task 4: 다이얼로그·행·섹션 컴포넌트

**Files:**
- Create: `frontend/apps/web/app/manage/clubs/[clubId]/members/_components/RemoveMemberDialog.tsx`
- Create: `frontend/apps/web/app/manage/clubs/[clubId]/members/_components/TransferLeaderDialog.tsx`
- Create: `frontend/apps/web/app/manage/clubs/[clubId]/members/_components/MemberRow.tsx`
- Create: `frontend/apps/web/app/manage/clubs/[clubId]/members/_components/MemberSection.tsx`

네 파일 모두 `'use client'`.

- [ ] **Step 1: RemoveMemberDialog.tsx**

`frontend/apps/web/app/manage/clubs/[clubId]/members/_components/RemoveMemberDialog.tsx`:

```tsx
'use client';

type RemoveMemberDialogProps = {
  targetName: string;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function RemoveMemberDialog({ targetName, isPending, onConfirm, onCancel }: RemoveMemberDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40">
      <div className="w-full max-w-sm space-y-4 rounded-lg bg-white p-6 shadow-xl">
        <h2 className="text-base font-semibold text-slate-900">멤버 강퇴</h2>
        <p className="text-sm text-slate-600">
          <span className="font-medium text-slate-900">{targetName}</span> 님을 동아리에서 강퇴할까요?
          되돌릴 수 없으며, 진행 중인 지원서는 그대로 유지됩니다.
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="rounded-md bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
          >
            {isPending ? '처리 중…' : '강퇴'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: TransferLeaderDialog.tsx**

`frontend/apps/web/app/manage/clubs/[clubId]/members/_components/TransferLeaderDialog.tsx`:

```tsx
'use client';

import { useState } from 'react';
import type { ClubMember } from '@duing/types';

type TransferLeaderDialogProps = {
  target: ClubMember;
  clubName: string;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function TransferLeaderDialog({
  target,
  clubName,
  isPending,
  onConfirm,
  onCancel,
}: TransferLeaderDialogProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [typed, setTyped] = useState('');
  const canConfirm = typed.trim() === clubName;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40">
      <div className="w-full max-w-md space-y-4 rounded-lg bg-white p-6 shadow-xl">
        <h2 className="text-base font-semibold text-slate-900">회장 인계</h2>

        {step === 1 ? (
          <>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm font-medium text-slate-900">{target.name}</p>
              <p className="text-xs text-slate-500">학번 {target.studentId} · {target.role}</p>
            </div>
            <p className="text-sm text-slate-600">
              회장을 인계하면 본인은 OFFICER 가 됩니다. 되돌릴 수 없습니다.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => setStep(2)}
                className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
              >
                다음
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-slate-600">
              확인을 위해 동아리명{' '}
              <span className="font-medium text-slate-900">{clubName}</span> 를 그대로 입력해주세요.
            </p>
            <input
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={clubName}
              disabled={isPending}
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setStep(1); setTyped(''); }}
                disabled={isPending}
                className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
              >
                이전
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={!canConfirm || isPending}
                className="rounded-md bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {isPending ? '인계 중…' : '인계'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: MemberRow.tsx**

`frontend/apps/web/app/manage/clubs/[clubId]/members/_components/MemberRow.tsx`:

```tsx
'use client';

import { useState } from 'react';
import type { ClubMember, ClubMemberRole } from '@duing/types';
import {
  useLeaveClubMutation,
  useRemoveMemberMutation,
  useUpdateMemberRoleMutation,
} from '@duing/hooks';
import { RemoveMemberDialog } from './RemoveMemberDialog';

type MemberRowProps = {
  clubId: number;
  member: ClubMember;
  viewerRole: ClubMemberRole;
  viewerUserId: number;
  // 회장 인계는 부모(page)에서 단일 다이얼로그를 띄운다. 행은 트리거만 전달.
  onTransferLeader: (target: ClubMember) => void;
};

export function MemberRow({
  clubId, member, viewerRole, viewerUserId, onTransferLeader,
}: MemberRowProps) {
  const updateRole = useUpdateMemberRoleMutation(clubId);
  const removeMember = useRemoveMemberMutation(clubId);
  const leaveClub = useLeaveClubMutation(clubId);

  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSelf = member.userId === viewerUserId;
  const isLeader = member.role === 'LEADER';
  const isLeaderViewer = viewerRole === 'LEADER';

  async function changeRole(nextRole: 'OFFICER' | 'MEMBER') {
    const verb = nextRole === 'OFFICER' ? 'OFFICER 로 승급' : 'MEMBER 로 강등';
    if (!confirm(`${member.name} 님을 ${verb}할까요?`)) return;
    setError(null);
    try {
      await updateRole.mutateAsync({ memberId: member.memberId, payload: { role: nextRole } });
    } catch (err) {
      setError(err instanceof Error ? err.message : '역할 변경 실패');
    }
  }

  async function doRemove() {
    setError(null);
    try {
      await removeMember.mutateAsync(member.memberId);
      setShowRemoveDialog(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '강퇴 실패');
    }
  }

  async function doLeave() {
    if (!confirm('정말 동아리를 탈퇴할까요?')) return;
    setError(null);
    try {
      await leaveClub.mutateAsync();
    } catch (err) {
      setError(err instanceof Error ? err.message : '탈퇴 실패');
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-slate-100 bg-white px-3 py-2">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-900">
          {member.name}
          {isSelf && <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">본인</span>}
        </p>
        <p className="text-xs text-slate-500">
          학번 {member.studentId} · 가입 {member.joinedAt.slice(0, 10)}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {/* LEADER viewer, 본인 LEADER 행 */}
        {isLeaderViewer && isSelf && isLeader && (
          <button
            type="button"
            disabled
            title="회장 인계 후 가능"
            className="rounded-md px-2 py-1 text-xs text-slate-300 cursor-not-allowed"
          >
            탈퇴
          </button>
        )}

        {/* LEADER viewer, 타인 OFFICER 행 */}
        {isLeaderViewer && !isSelf && member.role === 'OFFICER' && (
          <>
            <button
              type="button"
              onClick={() => changeRole('MEMBER')}
              className="rounded-md px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
            >
              MEMBER 로 강등
            </button>
            <button
              type="button"
              onClick={() => onTransferLeader(member)}
              className="rounded-md px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
            >
              회장 인계
            </button>
            <button
              type="button"
              onClick={() => setShowRemoveDialog(true)}
              className="rounded-md px-2 py-1 text-xs text-rose-600 hover:bg-rose-50"
            >
              강퇴
            </button>
          </>
        )}

        {/* LEADER viewer, 타인 MEMBER 행 */}
        {isLeaderViewer && !isSelf && member.role === 'MEMBER' && (
          <>
            <button
              type="button"
              onClick={() => changeRole('OFFICER')}
              className="rounded-md px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
            >
              OFFICER 로 승급
            </button>
            <button
              type="button"
              onClick={() => onTransferLeader(member)}
              className="rounded-md px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
            >
              회장 인계
            </button>
            <button
              type="button"
              onClick={() => setShowRemoveDialog(true)}
              className="rounded-md px-2 py-1 text-xs text-rose-600 hover:bg-rose-50"
            >
              강퇴
            </button>
          </>
        )}

        {/* OFFICER viewer, 본인 행: 탈퇴 가능 */}
        {viewerRole === 'OFFICER' && isSelf && (
          <button
            type="button"
            onClick={doLeave}
            className="rounded-md px-2 py-1 text-xs text-rose-600 hover:bg-rose-50"
          >
            탈퇴
          </button>
        )}

        {/* OFFICER viewer, 타인 행 → 액션 없음 (읽기 전용). 의도된 빈 상태. */}
      </div>

      {error && <p className="ml-3 text-xs text-rose-600">{error}</p>}

      {showRemoveDialog && (
        <RemoveMemberDialog
          targetName={member.name}
          isPending={removeMember.isPending}
          onConfirm={doRemove}
          onCancel={() => setShowRemoveDialog(false)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: MemberSection.tsx**

`frontend/apps/web/app/manage/clubs/[clubId]/members/_components/MemberSection.tsx`:

```tsx
'use client';

import type { ClubMember, ClubMemberRole } from '@duing/types';
import { MemberRow } from './MemberRow';

type MemberSectionProps = {
  title: string;
  members: ClubMember[];
  clubId: number;
  viewerRole: ClubMemberRole;
  viewerUserId: number;
  onTransferLeader: (target: ClubMember) => void;
};

export function MemberSection({
  title, members, clubId, viewerRole, viewerUserId, onTransferLeader,
}: MemberSectionProps) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-slate-700">
        {title} <span className="ml-1 text-xs font-normal text-slate-400">{members.length}명</span>
      </h2>
      {members.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-200 px-3 py-4 text-xs text-slate-400">
          해당 역할의 멤버가 없습니다.
        </p>
      ) : (
        <div className="space-y-1.5">
          {members.map((member) => (
            <MemberRow
              key={member.memberId}
              clubId={clubId}
              member={member}
              viewerRole={viewerRole}
              viewerUserId={viewerUserId}
              onTransferLeader={onTransferLeader}
            />
          ))}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 5: 타입체크 + 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm typecheck 2>&1 | tail -10
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add frontend/apps/web/app/manage/clubs/[clubId]/members/_components/
git commit -m "feat(frontend): 멤버 관리 컴포넌트 4종 (Section/Row/RemoveDialog/TransferDialog)"
```

---

## Task 5: Page 라우트 + ManageNav 활성화

**Files:**
- Create: `frontend/apps/web/app/manage/clubs/[clubId]/members/page.tsx`
- Modify: `frontend/apps/web/app/manage/_components/ManageNav.tsx`

- [ ] **Step 1: page.tsx**

`frontend/apps/web/app/manage/clubs/[clubId]/members/page.tsx`:

```tsx
'use client';

import { use, useState } from 'react';
import { notFound } from 'next/navigation';
import type { ClubMember } from '@duing/types';
import {
  useClubMembersQuery,
  useManagedClubsQuery,
  useMeQuery,
  useTransferLeaderMutation,
} from '@duing/hooks';
import { MemberSection } from './_components/MemberSection';
import { TransferLeaderDialog } from './_components/TransferLeaderDialog';

export default function ClubMembersPage({
  params,
}: {
  params: Promise<{ clubId: string }>;
}) {
  const { clubId: clubIdParam } = use(params);
  const currentClubId = Number(clubIdParam);
  const isValidId = !isNaN(currentClubId);

  const { data: me, isLoading: isMeLoading } = useMeQuery();
  const { data: managedClubs, isLoading: isManagedLoading } = useManagedClubsQuery();
  const { data: members, isLoading: isMembersLoading } = useClubMembersQuery(
    isValidId ? currentClubId : undefined,
  );
  const transferLeader = useTransferLeaderMutation(currentClubId);

  const [transferTarget, setTransferTarget] = useState<ClubMember | null>(null);
  const [transferError, setTransferError] = useState<string | null>(null);

  if (isMeLoading || isManagedLoading || isMembersLoading) {
    return <p className="p-6 text-sm text-slate-500">불러오는 중…</p>;
  }

  const managedClub = managedClubs?.find((club) => club.clubId === currentClubId);
  if (!managedClub || !me) {
    notFound();
  }

  const leaders = members?.filter((m) => m.role === 'LEADER') ?? [];
  const officers = members?.filter((m) => m.role === 'OFFICER') ?? [];
  const regulars = members?.filter((m) => m.role === 'MEMBER') ?? [];

  async function doTransfer() {
    if (!transferTarget) return;
    setTransferError(null);
    try {
      await transferLeader.mutateAsync(transferTarget.memberId);
      setTransferTarget(null);
    } catch (err) {
      setTransferError(err instanceof Error ? err.message : '회장 인계 실패');
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-6 py-10">
      <header>
        <h1 className="text-xl font-bold">멤버 관리</h1>
        <p className="mt-1 text-sm text-slate-500">
          역할별 멤버를 확인하고, 회장은 역할 변경·강퇴·인계를 할 수 있습니다.
        </p>
      </header>

      <MemberSection
        title="회장"
        members={leaders}
        clubId={currentClubId}
        viewerRole={managedClub.myRole}
        viewerUserId={me.id}
        onTransferLeader={setTransferTarget}
      />
      <MemberSection
        title="운영진"
        members={officers}
        clubId={currentClubId}
        viewerRole={managedClub.myRole}
        viewerUserId={me.id}
        onTransferLeader={setTransferTarget}
      />
      <MemberSection
        title="일반 멤버"
        members={regulars}
        clubId={currentClubId}
        viewerRole={managedClub.myRole}
        viewerUserId={me.id}
        onTransferLeader={setTransferTarget}
      />

      {transferError && <p className="text-sm text-rose-600">{transferError}</p>}

      {transferTarget && (
        <TransferLeaderDialog
          target={transferTarget}
          clubName={managedClub.clubName}
          isPending={transferLeader.isPending}
          onConfirm={doTransfer}
          onCancel={() => { setTransferTarget(null); setTransferError(null); }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: ManageNav 의 "멤버 관리" placeholder 를 active Link 로 교체**

`frontend/apps/web/app/manage/_components/ManageNav.tsx` 의 현재 멤버 관리 placeholder 블록(예: `<div ...>멤버 관리<span>(Phase 3)</span></div>`) 을 다음으로 교체. 그리고 `recruitmentsPath` 근처에 `membersPath` 상수도 추가한다.

`photosPath` 줄 다음에 추가:

```tsx
  const membersPath = toRoute(`/manage/clubs/${currentClubId}/members`);
  const isMembersActive = pathname.startsWith(membersPath);
```

기존 멤버 관리 placeholder `<div>` 블록 → 다음으로 교체:

```tsx
        <Link
          href={membersPath}
          className={cn(
            'block rounded-md px-3 py-2 text-sm font-medium',
            isMembersActive
              ? 'bg-slate-900 text-white'
              : 'text-slate-700 hover:bg-slate-100',
          )}
        >
          멤버 관리
        </Link>
```

- [ ] **Step 3: 타입체크 + 빌드**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm typecheck 2>&1 | tail -10
pnpm --filter web build 2>&1 | tail -15
```

Expected: 둘 다 통과. 실패 시 BLOCKED 보고.

- [ ] **Step 4: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add frontend/apps/web/app/manage/clubs/[clubId]/members/page.tsx \
        frontend/apps/web/app/manage/_components/ManageNav.tsx
git commit -m "feat(frontend): 멤버 관리 페이지 라우트 + 좌측 네비 활성화"
```

---

## Task 6: 수동 확인 + 푸시 + PR

- [ ] **Step 1: dev 시나리오 확인**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm --filter web dev
```

LEADER 계정으로 로그인 후 `/manage/clubs/{clubId}/members` 진입:

1. 세 섹션 (회장 / 운영진 / 일반 멤버) 가 카운트와 함께 표시. 본인 행에 "본인" 배지.
2. MEMBER 행에서 "OFFICER 로 승급" → confirm → 새로고침 없이 OFFICER 섹션으로 이동.
3. OFFICER 행에서 "MEMBER 로 강등" → confirm → MEMBER 섹션으로 이동.
4. MEMBER 행에서 "강퇴" → RemoveMemberDialog → 강퇴 확인 → 리스트에서 사라짐.
5. OFFICER 행에서 "회장 인계" → TransferLeaderDialog → "다음" → 동아리명 정확히 타이핑 → "인계" → 회장 변경 + 본인 행에서 액션 사라짐 (OFFICER 가 됨).
6. (별도 OFFICER 계정 로그인) → 본인 행에 "탈퇴" 보이고, 타인 행에는 액션 없음. "탈퇴" 누르면 confirm 후 페이지가 not-found 처리 (managed 목록에서 빠짐).
7. (LEADER 본인 행) → "탈퇴" 버튼 비활성 + "회장 인계 후 가능" 툴팁.

- [ ] **Step 2: 푸시**

```bash
git push -u origin feat/fe-3-club-members
```

- [ ] **Step 3: PR 생성**

```bash
gh pr create --base develop --title "feat(frontend): 멤버 관리 페이지 (/manage/clubs/[clubId]/members)" --body "$(cat <<'EOF'
## 🚀 작업 내용
LEADER/OFFICER 가 자기 동아리 멤버를 역할별로 확인하고, LEADER 는 승급·강등·강퇴·회장 인계·탈퇴 (인계 후) 까지 할 수 있는 `/manage/clubs/[clubId]/members` 페이지를 추가했다. BE-3 (#78), BE-4 (#80) 의 5개 엔드포인트와 짝이다.

세 섹션 (회장 / 운영진 / 일반 멤버) 으로 보여주고, 각 행의 액션 영역은 viewerRole × (본인 여부) 조합으로 분기한다. OFFICER 는 본인의 "탈퇴" 만 가능하다.

- 승급/강등/탈퇴: 브라우저 confirm() (FE-2 와 동일)
- 강퇴: RemoveMemberDialog 얇은 경고 모달
- 회장 인계: TransferLeaderDialog 2단계 (경고 → 동아리명 타이핑 일치 시 인계 버튼 활성)

좌측 네비 "멤버 관리" placeholder 도 활성 Link 로 교체했다.

## 🤔 고민했던 내용
회장 인계 성공 시 본인 role 이 OFFICER 로 바뀌므로, `useTransferLeaderMutation` 의 onSuccess 에서 `members` 외에 `managed()` 와 `me()` 캐시까지 무효화해 좌측 네비/페이지 가드가 자동 재계산되도록 했다. 별도 라우터 이동 없이 같은 페이지에서 액션 영역만 사라진다.

탈퇴(`useLeaveClubMutation`) 성공 시에는 managed 목록에서 빠지므로 페이지가 자연스럽게 not-found 로 떨어진다 (페이지에서 `managedClubs?.find(...)` 체크가 이미 있음). 별도 redirect 안 했음.

`packages/types/src/clubmember.ts` 의 `ClubMember` 가 BE 응답과 안 맞아서 (`id` vs `memberId`, `userName` vs `name`, `studentId` 누락) 이번에 BE 응답에 맞춰 갈아끼웠다. 다른 곳에서 import 하는 곳은 없었다.

## 💬 리뷰 중점사항
- viewer × 본인 × 대상 role 조합의 액션 가시성 매트릭스 (스펙 §8.C 와 일치)
- 회장 인계 후 캐시 무효화 순서로 화면이 깜빡임 없이 OFFICER 시점으로 전환되는지
- 회장 인계 다이얼로그의 동아리명 입력 검증 (정확히 일치할 때만 인계 활성)
EOF
)"
```

---

## 자체 점검 체크리스트 (PR 직전)

- [ ] BE-3, BE-4 의 5개 엔드포인트와 1:1 매칭 (GET/PATCH/DELETE/DELETE me/POST transfer)
- [ ] 권한 매트릭스(LEADER/OFFICER × 본인/타인 × LEADER/OFFICER/MEMBER 대상) 가 §8.C 와 동일
- [ ] LEADER 본인 행 "탈퇴" 비활성 + 툴팁
- [ ] 회장 인계 시 me() + managed() 캐시 무효화 — 본인 행에서 LEADER 액션이 사라지는지 수동 확인
- [ ] `'use client'` 가 4 컴포넌트 + page 에 모두 있음
- [ ] `any`, `as` 없음
- [ ] 신규 의존성 없음 — `pnpm-lock.yaml` 변경 없는지 확인
- [ ] 커밋 메시지 `feat(frontend): ...` 형식, Claude 어트리뷰션 없음

---

## Out of Scope (Spec §10 준수)

- 멤버 검색·필터 UI
- 가입일/이름 정렬 변경 (BE 가 role → joinedAt ASC 로 고정 반환)
- 학번/이름 클릭 시 프로필 모달
- 페이지네이션 (멤버 수가 적다는 전제)
- Toast 알림 (성공/실패는 inline 텍스트만)
- 단위/E2E 테스트 (apps/web 에 테스트 환경 미설정)
