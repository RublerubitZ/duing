'use client';

import type { AdminUserSearchResult } from '@duing/types';

import { ButtonSpinner } from '@/components/loading/Spinner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

type Props = {
  user: AdminUserSearchResult;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function AdminForceLogoutDialog({ user, isPending, onConfirm, onCancel }: Props) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isPending) onCancel();
      }}
    >
      <DialogContent
        onPointerDownOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => {
          if (isPending) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>강제 로그아웃</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-charcoal-2">{user.name}</span> ({user.studentId}) 회원을 강제
            로그아웃합니다.
          </DialogDescription>
        </DialogHeader>

        {/* 상세 Sheet 에서 정지 다이얼로그와 나란히 열리므로 경고 배색을 pill-coral(#fce2d9 배경 /
            #9a3f23 글자, 5.47:1)로 통일한다. bg-coral/5 위 text-coral 은 2.97:1 로 AA 에 못 미쳤다. */}
        <p className="pill-coral rounded-md px-3 py-2 text-sm">
          이 회원의 모든 기기에서 로그아웃되며, 다시 로그인할 때까지 접근이 차단됩니다.
        </p>

        <DialogFooter>
          <button type="button" onClick={onCancel} disabled={isPending} className="btn btn-ghost btn-sm">
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="btn btn-sm btn-danger"
          >
            {isPending && <ButtonSpinner />}강제 로그아웃
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
