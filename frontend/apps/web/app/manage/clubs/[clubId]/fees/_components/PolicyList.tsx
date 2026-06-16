'use client';

import { useState } from 'react';

import { ApiError } from '@duing/api';
import {
  useClubFeePoliciesQuery,
  useDeleteFeePolicyMutation,
  useUpdateFeePolicyMutation,
} from '@duing/hooks';
import type { FeePolicy } from '@duing/types';

import { cn } from '@/app/_lib/cn';
import { useToast } from '@/app/_components/toast/ToastProvider';

import { billingTypeLabel, formatWon } from '../_lib/feeLabels';
import { CreatePolicyDialog } from './CreatePolicyDialog';

type PolicyListProps = {
  clubId: number;
};

export function PolicyList({ clubId }: PolicyListProps) {
  const { data: policies, isLoading } = useClubFeePoliciesQuery(clubId);
  const [editTarget, setEditTarget] = useState<FeePolicy | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FeePolicy | null>(null);

  if (isLoading) {
    return <p className="p-6 text-sm text-charcoal-3">불러오는 중…</p>;
  }

  if (!policies || policies.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line px-6 py-12 text-center">
        <p className="text-sm text-charcoal-2">아직 등록된 회비 정책이 없습니다.</p>
        <p className="mt-1 text-xs text-charcoal-3">
          {'"정책 추가"'} 버튼으로 첫 회비 정책을 만들어 보세요.
        </p>
      </div>
    );
  }

  return (
    <>
      <ul className="space-y-2">
        {policies.map((policy) => (
          <PolicyRow
            key={policy.id}
            clubId={clubId}
            policy={policy}
            onEdit={() => setEditTarget(policy)}
            onDelete={() => setDeleteTarget(policy)}
          />
        ))}
      </ul>

      {editTarget && (
        <CreatePolicyDialog
          clubId={clubId}
          policy={editTarget}
          onClose={() => setEditTarget(null)}
        />
      )}

      {deleteTarget && (
        <DeletePolicyConfirm
          clubId={clubId}
          policy={deleteTarget}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </>
  );
}

type PolicyRowProps = {
  clubId: number;
  policy: FeePolicy;
  onEdit: () => void;
  onDelete: () => void;
};

function PolicyRow({ clubId, policy, onEdit, onDelete }: PolicyRowProps) {
  const updatePolicy = useUpdateFeePolicyMutation(clubId);
  const { addToast } = useToast();

  const toggleActive = () => {
    updatePolicy.mutate(
      { policyId: policy.id, payload: { active: !policy.active } },
      {
        onError: (error) => {
          addToast(
            error instanceof Error ? error.message : '활성 상태 변경에 실패했습니다.',
            { variant: 'error' },
          );
        },
      },
    );
  };

  return (
    <li className="flex items-center justify-between gap-4 rounded-xl border border-line px-4 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-ink">{policy.name}</p>
          <span
            className={cn(
              'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium',
              policy.active ? 'bg-sage/20 text-sage' : 'bg-graysoft text-charcoal-3',
            )}
          >
            {policy.active ? '활성' : '비활성'}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-charcoal-3">
          {billingTypeLabel(policy.billingType)} · {formatWon(policy.amount)}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          role="switch"
          aria-checked={policy.active}
          aria-label={`${policy.name} 활성 상태`}
          disabled={updatePolicy.isPending}
          onClick={toggleActive}
          className={cn(
            'relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50',
            policy.active ? 'bg-ink' : 'bg-line',
          )}
        >
          <span
            aria-hidden
            className={cn(
              'absolute top-0.5 h-5 w-5 rounded-full bg-paper transition-transform',
              policy.active ? 'translate-x-[22px]' : 'translate-x-0.5',
            )}
          />
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-charcoal-2 transition-colors hover:bg-graysoft"
        >
          수정
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-coral transition-colors hover:bg-coral/5"
        >
          삭제
        </button>
      </div>
    </li>
  );
}

type DeletePolicyConfirmProps = {
  clubId: number;
  policy: FeePolicy;
  onClose: () => void;
};

function DeletePolicyConfirm({ clubId, policy, onClose }: DeletePolicyConfirmProps) {
  const deletePolicy = useDeleteFeePolicyMutation(clubId);
  const { addToast } = useToast();

  const confirmDelete = () => {
    deletePolicy.mutate(policy.id, {
      onSuccess: () => {
        addToast('회비 정책을 삭제했습니다.');
        onClose();
      },
      onError: (error) => {
        // 409 DeleteForbidden: 청구 이력이 있어 삭제 불가 — 비활성화를 유도한다.
        if (error instanceof ApiError && error.status === 409) {
          addToast('이미 청구 이력이 있는 정책은 삭제할 수 없습니다. 대신 비활성화하세요.', {
            variant: 'error',
          });
        } else {
          addToast(error instanceof Error ? error.message : '정책 삭제에 실패했습니다.', {
            variant: 'error',
          });
        }
        onClose();
      },
    });
  };

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/40 px-4" role="presentation">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label="회비 정책 삭제 확인"
        className="w-full max-w-sm rounded-xl bg-paper p-5 shadow-3"
      >
        <h2 className="text-base font-bold text-ink">회비 정책 삭제</h2>
        <p className="mt-2 text-sm text-charcoal-2">
          <span className="font-medium text-ink">{policy.name}</span> 정책을 삭제할까요? 청구 이력이
          있는 정책은 삭제할 수 없습니다.
        </p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={deletePolicy.isPending}
            className="flex-1 rounded-md border border-line py-2.5 text-sm font-semibold text-charcoal-2 transition-colors hover:bg-graysoft disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={confirmDelete}
            disabled={deletePolicy.isPending}
            className="flex-1 rounded-md bg-coral py-2.5 text-sm font-semibold text-paper transition-colors hover:bg-[#c2603f] disabled:opacity-50"
          >
            {deletePolicy.isPending ? '삭제 중…' : '삭제'}
          </button>
        </div>
      </div>
    </div>
  );
}
